import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { mapInsertionColumnsAI, categorizeProgramsAI, ColumnMapping, ProgramInput, ProgramCategory } from '@/lib/ai-insertion-mapper';

interface InsertionLogRow {
    date: string;
    medio: string;
    mappedProgram: string;
    originalTitle: string;
    genre: string;
    franja: string;
    duration: number;
    insertions: number;
    confidence: number; // Added confidence field
}

// Existing fallback logic
function mapToProgramFallback(genre: string, franja: string): string {
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
        const modelName = (formData.get('modelName') as string) || 'gemini-3-flash-preview';
        const enableFallback = formData.get('enableFallback') === 'true';

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

        for (const name of workbook.SheetNames) {
            if (targetSheets.some(t => name.toLowerCase().includes(t.toLowerCase()))) {
                dataSheet = workbook.Sheets[name];
                break;
            }
        }

        if (!dataSheet && workbook.SheetNames.length > 0) {
            dataSheet = workbook.Sheets[workbook.SheetNames[0]];
        }

        if (!dataSheet) {
            return NextResponse.json({ error: 'No data sheet found' }, { status: 400 });
        }

        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(dataSheet, { header: 1 }) as unknown[][];

        if (jsonData.length < 2) {
            return NextResponse.json({ error: 'No data rows found' }, { status: 400 });
        }

        // 1. Identify Columns (AI > Fallback)
        const headers = (jsonData[0] as string[]).map(h => String(h || '').trim());
        let colMap: Record<string, number> = {};

        // Attempt AI mapping
        let aiColMap: ColumnMapping | null = null;
        try {
            console.log("Attempting AI Column Mapping...");
            aiColMap = await mapInsertionColumnsAI(headers, modelName);
        } catch (err) {
            console.warn("AI Column mapping failed, using fallback.", err);
        }

        if (aiColMap && aiColMap.confidence > 70) {
            console.log("Using AI Column Map:", aiColMap);
            colMap = {
                vehiculo: headers.indexOf(aiColMap.vehiculo),
                genero: headers.indexOf(aiColMap.genero),
                franja: headers.indexOf(aiColMap.franja),
                soporte: headers.indexOf(aiColMap.soporte),
                fecha: headers.indexOf(aiColMap.fecha),
                duracion: headers.indexOf(aiColMap.duracion),
                insercion: headers.indexOf(aiColMap.insercion),
            };
        } else {
            // Fallback
            if (!enableFallback) {
                return NextResponse.json(
                    { error: 'AI Column Mapping failed and fallback is disabled.' },
                    { status: 400 }
                );
            }
            console.log("Using Fallback Column Map");
            const hLower = headers.map(h => h.toLowerCase());
            colMap = {
                vehiculo: hLower.findIndex(h => h.includes('vehiculo')),
                genero: hLower.findIndex(h => h.includes('genero')),
                franja: hLower.findIndex(h => h.includes('franja')),
                soporte: hLower.findIndex(h => h.includes('soporte')),
                fecha: hLower.findIndex(h => h.includes('fecha')),
                duracion: hLower.findIndex(h => h.includes('duracion') || h.includes('duración')),
                insercion: hLower.findIndex(h => h.includes('insercion') || h.includes('inserción')),
            };
        }

        const medioAliasesRaw = (formData.get('medioAliases') as string) || '{}';

        let medioAliases: Record<string, string> = {};

        try {
            medioAliases = JSON.parse(medioAliasesRaw);
        } catch (e) {
            console.warn("Failed to parse aliases", e);
        }

        // Helper to normalize and apply alias
        const applyAlias = (value: string, aliases: Record<string, string>) => {
            if (!value) return value;
            const normalized = value.trim().toUpperCase();
            // Check alias map
            if (aliases[normalized]) return aliases[normalized];
            return value.trim(); // Just trim if no alias
        };

        // 2. Extract Data & Identify Distinct Programs for AI Categorization
        const rawResults: any[] = [];
        const uniqueProgramsMap = new Map<string, { title: string, genre: string, franja: string }>();

        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i] as (string | number)[];
            if (!row || row.length === 0) continue;

            let vehiculo = String(row[colMap.vehiculo] || '').trim();
            const genero = String(row[colMap.genero] || '').trim();
            const franja = String(row[colMap.franja] || '').trim();
            const soporte = String(row[colMap.soporte] || '').trim();

            // Apply Mappings
            vehiculo = applyAlias(vehiculo, medioAliases);

            // Program Aliases removed. Using raw genre.
            const mappedGenre = genero;

            if (!vehiculo && !soporte) continue;

            // Generate key for unique program
            const progKey = `${soporte}|${mappedGenre}|${franja}`;
            if (!uniqueProgramsMap.has(progKey)) {
                uniqueProgramsMap.set(progKey, { title: soporte, genre: mappedGenre, franja: franja });
            }

            rawResults.push({
                row,
                vehiculo,
                genero: mappedGenre,
                franja,
                soporte,
                progKey
            });
        }

        // 3. AI Categorization for Distinct Programs with Stable IDs
        let programMappings: Record<string, { category: string, confidence: number }> = {};
        try {
            const uniqueProgramsList = Array.from(uniqueProgramsMap.entries());
            console.log(`Categorizing ${uniqueProgramsList.length} unique programs with AI...`);

            // Generate stable IDs for programs
            const programsWithIds: ProgramInput[] = uniqueProgramsList.slice(0, 100).map(([key, prog], index) => ({
                id: `p${index}`,
                title: prog.title,
                genre: prog.genre,
                franja: prog.franja
            }));

            // Create mapping from ID back to original key
            const idToKeyMap = new Map<string, string>();
            uniqueProgramsList.slice(0, 100).forEach(([key], index) => {
                idToKeyMap.set(`p${index}`, key);
            });

            const aiMappings: ProgramCategory[] = await categorizeProgramsAI(programsWithIds, modelName);

            // Map results back using IDs (guaranteed unique)
            aiMappings.forEach(m => {
                const originalKey = idToKeyMap.get(m.id);
                if (originalKey) {
                    programMappings[originalKey] = {
                        category: m.mappedCategory,
                        confidence: m.confidence || 90
                    };
                }
            });

        } catch (err) {
            console.warn("AI Categorization failed, using full fallback", err);
        }

        // 4. Build Final Results
        const results: InsertionLogRow[] = [];

        for (const item of rawResults) {
            const { row, vehiculo, genero, franja, soporte, progKey } = item;

            // Determine Category & Confidence
            let mappedProgram = '';
            let confidence = 0;

            if (programMappings[progKey]) {
                // AI Hit
                mappedProgram = programMappings[progKey].category;
                confidence = programMappings[progKey].confidence;
            } else if (enableFallback) {
                // Fallback Hit
                mappedProgram = mapToProgramFallback(genero, franja);
                if (mappedProgram === 'Sin Categoría') confidence = 0;
                else confidence = 85;
            } else {
                // No AI match and Fallback disabled
                mappedProgram = 'Sin Categoría';
                confidence = 0;
            }

            const fecha = row[colMap.fecha];
            const duracion = Number(row[colMap.duracion]) || 0;
            const insercion = Number(row[colMap.insercion]) || 1;

            results.push({
                date: parseDate(fecha as string | number),
                medio: vehiculo,
                mappedProgram,
                originalTitle: soporte,
                genre: genero,
                franja: franja,
                duration: duracion,
                insertions: insercion,
                confidence
            });
        }


        // Group rows and sum assertions
        const groupedResults = results.reduce((acc, curr) => {
            const key = `${curr.date}|${curr.medio}|${curr.mappedProgram}|${curr.originalTitle}|${curr.genre}|${curr.franja}|${curr.duration}`;

            if (!acc[key]) {
                acc[key] = { ...curr };
            } else {
                acc[key].insertions += curr.insertions;
                // Average confidence weighted? Or just keep first? Keep first is fine for now.
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
        const insertionsByGenre: Record<string, number> = {};
        let totalInsertions = 0;

        // Confidence Distribution
        const confidenceDistribution: Record<string, number> = {};

        finalResults.forEach(r => {
            insertionsByMedio[r.medio] = (insertionsByMedio[r.medio] || 0) + r.insertions;
            insertionsByProgram[r.mappedProgram] = (insertionsByProgram[r.mappedProgram] || 0) + r.insertions;
            insertionsByGenre[r.genre] = (insertionsByGenre[r.genre] || 0) + r.insertions;
            totalInsertions += r.insertions;

            // Bucket confidence
            const bucket = r.confidence >= 90 ? '90-100%' :
                r.confidence >= 70 ? '70-89%' :
                    r.confidence >= 50 ? '50-69%' : 'Low (<50%)';
            confidenceDistribution[bucket] = (confidenceDistribution[bucket] || 0) + 1; // Count rows
        });

        return NextResponse.json({
            success: true,
            data: finalResults,
            summary: {
                totalRows: finalResults.length,
                totalInsertions,
                insertionsByMedio,
                insertionsByProgram,
                insertionsByGenre,
                medios: Object.keys(insertionsByMedio),
                programs: Object.keys(insertionsByProgram).length,
                confidenceDistribution,
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
