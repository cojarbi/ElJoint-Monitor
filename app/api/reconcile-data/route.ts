import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

export async function POST(request: NextRequest) {
    try {
        const { budgetPrograms, insertionPrograms, budgetMedios = [], insertionMedios = [], modelName = 'gemini-3-flash-preview' } = await request.json();

        const model = genAI.getGenerativeModel({ model: modelName });

        if (!budgetPrograms || !insertionPrograms) {
            return NextResponse.json({ error: 'Missing programs data' }, { status: 400 });
        }

        const prompt = `
        I have lists of TV programs and Medios (Channels/Braodcasters).
        
        Task 1: Map "Insertion Programs" to "Budget Programs".
        Task 2: Map "Insertion Medios" to "Budget Medios".

        Rules:
        1. Programs: Match identical, fuzzy, or logical name variations.
        2. Medios: Map variations (e.g., "TM" -> "MEDCOM", "TVN-2" -> "TVN").
        3. If no reasonable match found, map to null.
        
        Budget Programs:
        ${JSON.stringify(budgetPrograms)}
        
        Budget Medios:
        ${JSON.stringify(budgetMedios)}

        Insertion Programs:
        ${JSON.stringify(insertionPrograms)}
        
        Insertion Medios:
        ${JSON.stringify(insertionMedios)}

        Output JSON format:
        {
            "programs": {
                "Insertion Program A": "Budget Program Match X",
                "Insertion Program B": null
            },
            "medios": {
                "Insertion Medio A": "Budget Medio Match Y",
                "Insertion Medio B": null
            }
        }
        Strictly JSON only.
        `;

        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(text);

        return NextResponse.json({
            programMapping: parsed.programs || {},
            medioMapping: parsed.medios || {}
        });

    } catch (error) {
        console.error('AI Reconciliation failed:', error);
        return NextResponse.json(
            { error: 'Failed to reconcile data' },
            { status: 500 }
        );
    }
}
