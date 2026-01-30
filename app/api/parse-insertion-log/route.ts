import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

interface InsertionLogRow {
    date: string;
    medio: string;
    mappedProgram: string;
    originalTitle: string;
    genre: string;
    franja: string;
    duration: number;
    insertions: number;
}

// Fuzzy mapping: Genre + Franja -> Budget Program Category
function mapToProgram(genre: string, franja: string): string {
    const g = genre?.toUpperCase().trim() || '';
    const f = franja?.toUpperCase().trim() || '';

    // NOVELAS mapping
    if (g === 'NOVELAS' || g === 'DRAMATIZADOS') {
        if (f === 'NOCTURNO') return 'Novela Estelar';
        if (f === 'TARDE') return 'Novela Vespertina';
        if (f === 'MANANA') return 'Novela Matutina';
        return 'Novela';
    }

    // NOTICIAS mapping
    if (g === 'NOTICIAS') {
        if (f === 'MANANA') return 'Noticiero Matutino';
        if (f === 'NOCTURNO') return 'Noticiero Estelar';
        if (f === 'TARDE') return 'Noticiero Vespertino';
        return 'Noticiero';
    }

    // VARIEDADES mapping
    if (g === 'VARIEDADES') {
        if (f === 'MANANA') return 'Variedades Mañana';
        if (f === 'TARDE') return 'Tarde Vespertina';
        if (f === 'NOCTURNO') return 'Variedades Nocturno';
        return 'Variedades';
    }

    // DEPORTES mapping
    if (g === 'DEPORTES') {
        return 'Deportes';
    }

    // JUEGOS DE AZAR
    if (g.includes('JUEGOS') || g.includes('AZAR') || g.includes('LOTERIA')) {
        return 'Loteria';
    }

    // Default: use genre as-is
    return genre || 'Sin Categoría';
}

// Parse date from YYYYMMDD format
function parseDate(dateVal: string | number): string {
    const dateStr = String(dateVal);
    if (dateStr.length === 8) {
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        return `${year}-${month}-${day}`;
    }
    return dateStr;
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Check file type
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

        // Look for the main data sheet
        const targetSheets = ['Consulta Infoanalisis', 'Consulta', 'Data'];
        let dataSheet: XLSX.WorkSheet | null = null;
        let sheetName = '';

        for (const name of workbook.SheetNames) {
            if (targetSheets.some(t => name.toLowerCase().includes(t.toLowerCase()))) {
                dataSheet = workbook.Sheets[name];
                sheetName = name;
                break;
            }
        }

        // Fallback to first sheet
        if (!dataSheet && workbook.SheetNames.length > 0) {
            sheetName = workbook.SheetNames[0];
            dataSheet = workbook.Sheets[sheetName];
        }

        if (!dataSheet) {
            return NextResponse.json({ error: 'No data sheet found' }, { status: 400 });
        }

        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(dataSheet, { header: 1 }) as unknown[][];

        if (jsonData.length < 2) {
            return NextResponse.json({ error: 'No data rows found' }, { status: 400 });
        }

        // Find column indices from header row
        const headers = (jsonData[0] as string[]).map(h => String(h || '').toLowerCase().trim());

        const colIndices = {
            vehiculo: headers.findIndex(h => h.includes('vehiculo')),
            genero: headers.findIndex(h => h.includes('genero')),
            franja: headers.findIndex(h => h.includes('franja')),
            soporte: headers.findIndex(h => h.includes('soporte')),
            fecha: headers.findIndex(h => h.includes('fecha')),
            duracion: headers.findIndex(h => h.includes('duracion') || h.includes('duración')),
            insercion: headers.findIndex(h => h.includes('insercion') || h.includes('inserción')),
        };

        const results: InsertionLogRow[] = [];

        // Process data rows
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i] as (string | number)[];
            if (!row || row.length === 0) continue;

            const vehiculo = String(row[colIndices.vehiculo] || '').trim();
            const genero = String(row[colIndices.genero] || '').trim();
            const franja = String(row[colIndices.franja] || '').trim();
            const soporte = String(row[colIndices.soporte] || '').trim();
            const fecha = row[colIndices.fecha];
            const duracion = Number(row[colIndices.duracion]) || 0;
            const insercion = Number(row[colIndices.insercion]) || 1;

            if (!vehiculo && !soporte) continue; // Skip empty rows

            results.push({
                date: parseDate(fecha as string | number),
                medio: vehiculo,
                mappedProgram: mapToProgram(genero, franja),
                originalTitle: soporte,
                genre: genero,
                franja: franja,
                duration: duracion,
                insertions: insercion,
            });
        }

        // Group rows and sum insertions
        const groupedResults = results.reduce((acc, curr) => {
            const key = `${curr.date}|${curr.medio}|${curr.mappedProgram}|${curr.originalTitle}|${curr.genre}|${curr.franja}|${curr.duration}`;

            if (!acc[key]) {
                acc[key] = { ...curr };
            } else {
                acc[key].insertions += curr.insertions;
            }

            return acc;
        }, {} as Record<string, InsertionLogRow>);

        const finalResults = Object.values(groupedResults);

        // Sort by date, medio, mapped program
        finalResults.sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            if (a.medio !== b.medio) return a.medio.localeCompare(b.medio);
            return a.mappedProgram.localeCompare(b.mappedProgram);
        });

        // Calculate summary
        const insertionsByMedio: Record<string, number> = {};
        const insertionsByProgram: Record<string, number> = {};
        let totalInsertions = 0;

        finalResults.forEach(r => {
            insertionsByMedio[r.medio] = (insertionsByMedio[r.medio] || 0) + r.insertions;
            insertionsByProgram[r.mappedProgram] = (insertionsByProgram[r.mappedProgram] || 0) + r.insertions;
            totalInsertions += r.insertions;
        });

        return NextResponse.json({
            success: true,
            data: finalResults,
            summary: {
                totalRows: finalResults.length,
                totalInsertions,
                insertionsByMedio,
                insertionsByProgram,
                medios: Object.keys(insertionsByMedio),
                programs: Object.keys(insertionsByProgram).length,
                dateRange: finalResults.length > 0
                    ? { from: finalResults[0].date, to: finalResults[finalResults.length - 1].date }
                    : null,
            },
        });

    } catch (error) {
        console.error('Error processing insertion log:', error);
        return NextResponse.json(
            { error: 'Failed to process file: ' + (error instanceof Error ? error.message : 'Unknown error') },
            { status: 500 }
        );
    }
}
