import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { withAIRetry, AIResponseSchema, generateStableIds, createIdLookup } from '@/lib/ai-json-utils';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

interface ReconciliationResult {
    programs: Record<string, string | null>;  // insertion ID -> budget ID or null
    medios: Record<string, string | null>;    // insertion ID -> budget ID or null
}

export async function POST(request: NextRequest) {
    try {
        const { budgetPrograms, insertionPrograms, budgetMedios = [], insertionMedios = [], modelName = 'gemini-3-flash-preview' } = await request.json();

        const model = genAI.getGenerativeModel({ model: modelName });

        if (!budgetPrograms || !insertionPrograms) {
            return NextResponse.json({ error: 'Missing programs data' }, { status: 400 });
        }

        // Generate stable IDs for all items
        const budgetProgramsWithIds = generateStableIds(
            (budgetPrograms as string[]).map(name => ({ name })),
            'bp'
        );
        const insertionProgramsWithIds = generateStableIds(
            (insertionPrograms as string[]).map(name => ({ name })),
            'ip'
        );
        const budgetMediosWithIds = generateStableIds(
            (budgetMedios as string[]).map(name => ({ name })),
            'bm'
        );
        const insertionMediosWithIds = generateStableIds(
            (insertionMedios as string[]).map(name => ({ name })),
            'im'
        );

        // Create lookup maps for response processing
        const budgetProgramLookup = createIdLookup(budgetProgramsWithIds);
        const insertionProgramLookup = createIdLookup(insertionProgramsWithIds);
        const budgetMedioLookup = createIdLookup(budgetMediosWithIds);
        const insertionMedioLookup = createIdLookup(insertionMediosWithIds);

        // Build validation schema
        const insertionProgramIds = new Set(insertionProgramsWithIds.map(p => p.id));
        const budgetProgramIds = new Set(budgetProgramsWithIds.map(p => p.id));
        const insertionMedioIds = new Set(insertionMediosWithIds.map(m => m.id));
        const budgetMedioIds = new Set(budgetMediosWithIds.map(m => m.id));

        const reconciliationSchema: AIResponseSchema = {
            requiredKeys: ['programs', 'medios'],
            allowedKeys: ['programs', 'medios'],
            keyValidators: {
                programs: (v) => {
                    if (typeof v !== 'object' || v === null) return false;
                    const obj = v as Record<string, unknown>;
                    for (const [key, val] of Object.entries(obj)) {
                        if (!insertionProgramIds.has(key)) return false;
                        if (val !== null && !budgetProgramIds.has(val as string)) return false;
                    }
                    return true;
                },
                medios: (v) => {
                    if (typeof v !== 'object' || v === null) return false;
                    const obj = v as Record<string, unknown>;
                    for (const [key, val] of Object.entries(obj)) {
                        if (!insertionMedioIds.has(key)) return false;
                        if (val !== null && !budgetMedioIds.has(val as string)) return false;
                    }
                    return true;
                }
            }
        };

        const prompt = `
        I have lists of TV programs and Medios (Channels/Broadcasters) with unique IDs.
        
        Task 1: Map each "Insertion Program" ID to a matching "Budget Program" ID.
        Task 2: Map each "Insertion Medio" ID to a matching "Budget Medio" ID.

        Rules:
        1. Programs: Match identical, fuzzy, or logical name variations.
        2. Medios: Map variations (e.g., "TM" -> "MEDCOM", "TVN-2" -> "TVN").
        3. If no reasonable match found, map to null.
        4. Use ONLY the IDs provided - do not invent new IDs.
        
        Budget Programs (with IDs):
        ${JSON.stringify(budgetProgramsWithIds)}
        
        Budget Medios (with IDs):
        ${JSON.stringify(budgetMediosWithIds)}

        Insertion Programs (with IDs - these are the KEYS in your output):
        ${JSON.stringify(insertionProgramsWithIds)}
        
        Insertion Medios (with IDs - these are the KEYS in your output):
        ${JSON.stringify(insertionMediosWithIds)}

        Output JSON format (use IDs only):
        {
            "programs": {
                "ip0": "bp3",
                "ip1": null
            },
            "medios": {
                "im0": "bm1",
                "im1": null
            }
        }
        
        IMPORTANT: Every insertion ID must appear as a key in the output.
        Strictly JSON only. No markdown formatting.
        `;

        const result = await withAIRetry<ReconciliationResult>(model, prompt, reconciliationSchema, 1);

        if (!result.success) {
            console.error('AI Reconciliation failed after retries:', result.error);
            return NextResponse.json(
                { error: 'Failed to reconcile data: ' + result.error },
                { status: 500 }
            );
        }

        // Convert ID-based mappings back to name-based mappings for compatibility
        const programMapping: Record<string, string | null> = {};
        const medioMapping: Record<string, string | null> = {};

        for (const [insertionId, budgetId] of Object.entries(result.data.programs)) {
            const insertionItem = insertionProgramLookup.get(insertionId);
            const budgetItem = budgetId ? budgetProgramLookup.get(budgetId) : null;
            if (insertionItem) {
                programMapping[insertionItem.name] = budgetItem?.name || null;
            }
        }

        for (const [insertionId, budgetId] of Object.entries(result.data.medios)) {
            const insertionItem = insertionMedioLookup.get(insertionId);
            const budgetItem = budgetId ? budgetMedioLookup.get(budgetId) : null;
            if (insertionItem) {
                medioMapping[insertionItem.name] = budgetItem?.name || null;
            }
        }

        return NextResponse.json({
            programMapping,
            medioMapping
        });

    } catch (error) {
        console.error('AI Reconciliation failed:', error);
        return NextResponse.json(
            { error: 'Failed to reconcile data' },
            { status: 500 }
        );
    }
}
