import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

interface NormalizedRow {
    date: string;
    medio: string;
    program: string;
    orderedQuantity: number;
}

function parseMonthYear(sheetData: XLSX.WorkSheet): { month: number; year: number } | null {
    // Look for month/year in the header area (rows 0-5)
    const monthMap: Record<string, number> = {
        'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
        'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
        'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
    };

    // Try to find month/year string in first few rows
    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 20; col++) {
            const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
            const cell = sheetData[cellRef];
            if (cell && typeof cell.v === 'string') {
                const text = cell.v.toLowerCase().trim();
                // Match patterns like "noviembre 2025" or "nov 2025"
                const match = text.match(/(\w+)\s+(\d{4})/);
                if (match) {
                    const monthStr = match[1];
                    const year = parseInt(match[2]);
                    for (const [name, num] of Object.entries(monthMap)) {
                        if (name.startsWith(monthStr.substring(0, 3))) {
                            return { month: num, year };
                        }
                    }
                }
            }
        }
    }
    return null;
}

function findDayColumns(sheetData: XLSX.WorkSheet): Map<number, number> {
    // Find the row with day numbers (1, 2, 3, ... 31)
    // Usually in row 4 or 5, starting from column 5
    const dayToCol = new Map<number, number>();

    for (let row = 3; row <= 5; row++) {
        let foundDays = false;
        for (let col = 5; col < 40; col++) {
            const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
            const cell = sheetData[cellRef];
            if (cell && typeof cell.v === 'number' && cell.v >= 1 && cell.v <= 31) {
                dayToCol.set(col, Math.floor(cell.v));
                foundDays = true;
            }
        }
        if (foundDays && dayToCol.size > 0) break;
    }

    return dayToCol;
}

function normalizeBudgetSheet(
    sheetData: XLSX.WorkSheet,
    medio: string,
    monthYear: { month: number; year: number }
): NormalizedRow[] {
    const results: NormalizedRow[] = [];
    const dayToCol = findDayColumns(sheetData);

    if (dayToCol.size === 0) {
        console.log(`No day columns found for sheet: ${medio}`);
        return results;
    }

    const range = XLSX.utils.decode_range(sheetData['!ref'] || 'A1:A1');

    // Program rows typically start around row 7
    for (let row = 6; row <= range.e.r; row++) {
        const programCell = sheetData[XLSX.utils.encode_cell({ r: row, c: 0 })];
        const program = programCell?.v?.toString().trim();

        if (!program) continue;

        // Skip header-like rows
        if (['prime time', 'day time', 'daytime'].includes(program.toLowerCase())) continue;

        // Check each day column for quantities
        for (const [col, day] of dayToCol.entries()) {
            const qtyCell = sheetData[XLSX.utils.encode_cell({ r: row, c: col })];
            if (qtyCell && typeof qtyCell.v === 'number' && qtyCell.v > 0) {
                // Format date as YYYY-MM-DD
                const date = new Date(monthYear.year, monthYear.month - 1, day);
                const dateStr = date.toISOString().split('T')[0];

                results.push({
                    date: dateStr,
                    medio,
                    program,
                    orderedQuantity: qtyCell.v
                });
            }
        }
    }

    return results;
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Check file type
        const validTypes = [
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.xls') && !fileName.endsWith('.xlsx')) {
            return NextResponse.json(
                { error: 'Invalid file type. Please upload an XLS or XLSX file.' },
                { status: 400 }
            );
        }

        // Read file buffer
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });

        const allResults: NormalizedRow[] = [];

        // Process each sheet (excluding Resumen)
        for (const sheetName of workbook.SheetNames) {
            if (sheetName.toLowerCase() === 'resumen') continue;

            const sheet = workbook.Sheets[sheetName];
            const monthYear = parseMonthYear(sheet);

            if (!monthYear) {
                console.log(`Could not parse month/year for sheet: ${sheetName}`);
                continue;
            }

            const normalized = normalizeBudgetSheet(sheet, sheetName, monthYear);
            allResults.push(...normalized);
        }

        // Sort by date, then medio, then program
        allResults.sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            if (a.medio !== b.medio) return a.medio.localeCompare(b.medio);
            return a.program.localeCompare(b.program);
        });

        return NextResponse.json({
            success: true,
            data: allResults,
            summary: {
                totalRows: allResults.length,
                medios: [...new Set(allResults.map(r => r.medio))],
                programs: [...new Set(allResults.map(r => r.program))].length,
                dateRange: allResults.length > 0
                    ? { from: allResults[0].date, to: allResults[allResults.length - 1].date }
                    : null
            }
        });

    } catch (error) {
        console.error('Error processing budget file:', error);
        return NextResponse.json(
            { error: 'Failed to process file: ' + (error instanceof Error ? error.message : 'Unknown error') },
            { status: 500 }
        );
    }
}
