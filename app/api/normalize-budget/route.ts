import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { analyzeSheetLayout } from '@/lib/ai-layout-analyzer';

interface NormalizedRow {
    date: string;
    medio: string;
    program: string;
    orderedQuantity: number;
    durationSeconds: number;
    confidence: number; // Added confidence field
}

// Helper to find month/year in a specific row
function findMonthYearInRow(sheet: XLSX.WorkSheet, rowIndex: number): { month: number; year: number } | null {
    const monthMap: Record<string, number> = {
        'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
        'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
        'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12,
        'ene': 1, 'feb': 2, 'mar': 3, 'abr': 4,
        'may': 5, 'jun': 6, 'jul': 7, 'ago': 8,
        'sep': 9, 'oct': 10, 'nov': 11, 'dic': 12
    };

    // Check first 20 columns
    for (let col = 0; col < 20; col++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: col })];
        if (cell && typeof cell.v === 'string') {
            const text = cell.v.toLowerCase().trim();
            // Match "noviembre 2025", "nov 2025", "oct-2025", "diciembre 2024", "dic. 2024"
            const match = text.match(/([a-z]+)[.\s-]*(\d{4})/);

            if (match) {
                const monthStr = match[1];
                const year = parseInt(match[2]);

                // Validate year range to avoid false positives
                if (year < 2020 || year > 2030) continue;

                for (const [name, num] of Object.entries(monthMap)) {
                    if (monthStr.startsWith(name) || name.startsWith(monthStr)) {
                        return { month: num, year };
                    }
                }
            }

            // Check for just month name if year might be in context (less reliable, sticking to month+year for now)
        }
    }
    return null;
}

// Helper to find day columns in a specific row
function findDayGridInRow(sheet: XLSX.WorkSheet, rowIndex: number): Map<number, number> | null {
    const dayToCol = new Map<number, number>();
    let foundSequence = 0;

    for (let col = 0; col < 50; col++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: col })];
        if (cell && typeof cell.v === 'number') {
            const val = Math.floor(cell.v);
            // Look for sequence 1, 2, 3...
            if (val >= 1 && val <= 31) {
                dayToCol.set(col, val);
                if (val === 1 || dayToCol.has(val - 1)) {
                    foundSequence++;
                }
            }
        }
    }

    // Return map only if we found a reasonable sequence (e.g., at least 5 days)
    return foundSequence >= 5 ? dayToCol : null;
}

function normalizeBudgetSheet(
    sheetData: XLSX.WorkSheet,
    medio: string,
    aiBlocks: any[] = [], // Blocks detected by AI
    enableFallback: boolean = true
): NormalizedRow[] {
    const results: NormalizedRow[] = [];
    const range = XLSX.utils.decode_range(sheetData['!ref'] || 'A1:A1');

    // Sort blocks by start row
    const sortedBlocks = aiBlocks.sort((a, b) => a.headerRowIndex - b.headerRowIndex);

    // Fallback: If no AI blocks or AI failed, use dynamic scanning
    if (sortedBlocks.length === 0) {
        if (!enableFallback) {
            console.warn("AI detected no blocks, and fallback is disabled. Skipping sheet.");
            return [];
        }
        return normalizeBudgetSheetDynamic(sheetData, medio);
    }

    // Process using AI Blocks
    for (const block of sortedBlocks) {
        const { month, year, headerRowIndex, dataStartRowIndex, confidence: blockConfidence } = block;

        // Find the Day Map for this specific block's header row
        const dayMap = findDayGridInRow(sheetData, headerRowIndex);
        if (!dayMap) {
            console.warn(`AI detected block at row ${headerRowIndex} but no day grid found.`);
            continue;
        }

        // Determine end row for this block (until next block or end of sheet)
        const nextBlock = sortedBlocks.find(b => b.headerRowIndex > headerRowIndex);
        const endRow = nextBlock ? nextBlock.headerRowIndex - 1 : range.e.r;

        console.log(`Processing Block: ${month}/${year} | Rows ${dataStartRowIndex}-${endRow}`);

        for (let rowIndex = dataStartRowIndex; rowIndex <= endRow; rowIndex++) {
            const programCell = sheetData[XLSX.utils.encode_cell({ r: rowIndex, c: 0 })];
            const program = programCell?.v?.toString().trim();

            if (!program) continue;

            const ignoredKeywords = ['prime time', 'day time', 'daytime', 'horario', 'total', 'bonificacion', 'version :', 'cliente:', 'campaña:', 'total de inversion', 'itbms'];
            if (ignoredKeywords.some(k => program.toLowerCase().includes(k))) continue;

            // Get duration
            const durationCell = sheetData[XLSX.utils.encode_cell({ r: rowIndex, c: 3 })];
            let durationSeconds = 0;
            if (durationCell?.v) {
                const durStr = String(durationCell.v).toLowerCase().replace(/[^0-9]/g, '');
                durationSeconds = parseInt(durStr) || 0;
            }

            // Extract Quantities using the dayMap for THIS block
            for (const [col, day] of dayMap.entries()) {
                const qtyCell = sheetData[XLSX.utils.encode_cell({ r: rowIndex, c: col })];
                if (qtyCell && typeof qtyCell.v === 'number' && qtyCell.v > 0) {
                    // Create date
                    const date = new Date(year, month - 1, day);
                    const dateStr = date.toISOString().split('T')[0];

                    results.push({
                        date: dateStr,
                        medio,
                        program,
                        orderedQuantity: qtyCell.v,
                        durationSeconds,
                        confidence: blockConfidence || 90 // Default AI confidence if missing is 90
                    });
                }
            }
        }
    }

    return results;
}

function normalizeBudgetSheetDynamic(
    sheetData: XLSX.WorkSheet,
    medio: string
): NormalizedRow[] {
    const results: NormalizedRow[] = [];
    const range = XLSX.utils.decode_range(sheetData['!ref'] || 'A1:A1');

    let currentMonthYear: { month: number; year: number } | null = null;
    let currentDayMap: Map<number, number> | null = null;

    for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex++) {
        // 1. Try to find Month/Year Header
        const monthYear = findMonthYearInRow(sheetData, rowIndex);
        if (monthYear) {
            currentMonthYear = monthYear;
            currentDayMap = null; // Reset grid when new month is found
            continue;
        }

        // 2. Try to find Day Grid (Overview 1..31)
        const dayMap = findDayGridInRow(sheetData, rowIndex);
        if (dayMap) {
            currentDayMap = dayMap;
            continue;
        }

        // 3. Process Data Rows (only if we have both context bits)
        if (currentMonthYear && currentDayMap) {
            const programCell = sheetData[XLSX.utils.encode_cell({ r: rowIndex, c: 0 })];
            const program = programCell?.v?.toString().trim();

            if (!program) continue;

            // Skip header-like rows or summaries
            const ignoredKeywords = ['prime time', 'day time', 'daytime', 'horario', 'total', 'bonificacion', 'version :', 'cliente:', 'campaña:'];
            if (ignoredKeywords.some(k => program.toLowerCase().includes(k))) continue;

            // Get duration
            const durationCell = sheetData[XLSX.utils.encode_cell({ r: rowIndex, c: 3 })]; // Assuming Col 3 is duration
            let durationSeconds = 0;
            if (durationCell?.v) {
                const durStr = String(durationCell.v).toLowerCase().replace(/[^0-9]/g, '');
                durationSeconds = parseInt(durStr) || 0;
            }

            // Extract Quantities
            let hasData = false;
            for (const [col, day] of currentDayMap.entries()) {
                const qtyCell = sheetData[XLSX.utils.encode_cell({ r: rowIndex, c: col })];
                if (qtyCell && typeof qtyCell.v === 'number' && qtyCell.v > 0) {
                    // Create date
                    const date = new Date(currentMonthYear.year, currentMonthYear.month - 1, day);
                    const dateStr = date.toISOString().split('T')[0];

                    results.push({
                        date: dateStr,
                        medio,
                        program,
                        orderedQuantity: qtyCell.v,
                        durationSeconds,
                        confidence: 85 // Fallback logic confidence
                    });
                    hasData = true;
                }
            }
        }
    }

    return results;
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const modelName = (formData.get('modelName') as string) || 'gemini-3-flash-preview';
        const enableFallback = formData.get('enableFallback') === 'true';

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
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

        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });

        const allResults: NormalizedRow[] = [];

        // Process each sheet
        // TODO: Bring this values as a user config
        const allowedSheets = ['medcom', 'tvn'];

        for (const sheetName of workbook.SheetNames) {
            if (!allowedSheets.includes(sheetName.toLowerCase())) continue;

            const sheet = workbook.Sheets[sheetName];

            // 1. Try AI Analysis
            let aiBlocks: any[] = [];
            try {
                console.log(`Analyzing layout for sheet: ${sheetName}...`);
                aiBlocks = await analyzeSheetLayout(sheetName, sheet, modelName);
                console.log(`AI identified ${aiBlocks.length} blocks for ${sheetName}`);
            } catch (err) {
                console.error(`AI Analysis failed for ${sheetName}, using dynamic fallback`, err);
            }

            // 2. Normalize using AI blocks (or fallback to scanning if empty)
            const normalized = normalizeBudgetSheet(sheet, sheetName, aiBlocks, enableFallback);
            allResults.push(...normalized);
        }

        // Sort by date, then medio, then program
        allResults.sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            if (a.medio !== b.medio) return a.medio.localeCompare(b.medio);
            return a.program.localeCompare(b.program);
        });

        // Calculate confidence distribution
        const confidenceDistribution: Record<string, number> = {};
        allResults.forEach(r => {
            const bucket = r.confidence >= 90 ? '90-100%' :
                r.confidence >= 70 ? '70-89%' :
                    r.confidence >= 50 ? '50-69%' : 'Low (<50%)';
            confidenceDistribution[bucket] = (confidenceDistribution[bucket] || 0) + 1;
        });


        return NextResponse.json({
            success: true,
            data: allResults,
            summary: {
                totalRows: allResults.length,
                medios: [...new Set(allResults.map(r => r.medio))],
                programs: [...new Set(allResults.map(r => r.program))].length,
                confidenceDistribution,
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
