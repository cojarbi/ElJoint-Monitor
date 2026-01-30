import { GoogleGenerativeAI } from '@google/generative-ai';
import { withAIRetry, AIResponseSchema } from './ai-json-utils';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

export interface ColumnMapping {
    vehiculo: string; // Header name for Media/Channel
    genero: string;   // Header name for Genre
    franja: string;   // Header name for Time Slot
    soporte: string;  // Header name for Program Title
    fecha: string;    // Header name for Date
    duracion: string; // Header name for Duration
    insercion: string;// Header name for Spots Count
    confidence: number;
}

export interface ProgramCategory {
    id: string;       // Stable ID for mapping
    originalTitle: string;
    genre: string;
    franja: string;
    mappedCategory: string; // The standard category (e.g., "Novela Estelar")
    confidence: number;
    reasoning: string;
}

// Input type for categorization (with ID)
export interface ProgramInput {
    id: string;
    title: string;
    genre: string;
    franja: string;
}

// Column mapping schema validation
const columnMappingSchema: AIResponseSchema = {
    requiredKeys: ['vehiculo', 'genero', 'franja', 'soporte', 'fecha', 'duracion', 'insercion', 'confidence'],
    allowedKeys: ['vehiculo', 'genero', 'franja', 'soporte', 'fecha', 'duracion', 'insercion', 'confidence'],
    keyValidators: {
        confidence: (v) => typeof v === 'number' && v >= 0 && v <= 100,
        vehiculo: (v) => v === null || typeof v === 'string',
        genero: (v) => v === null || typeof v === 'string',
        franja: (v) => v === null || typeof v === 'string',
        soporte: (v) => v === null || typeof v === 'string',
        fecha: (v) => v === null || typeof v === 'string',
        duracion: (v) => v === null || typeof v === 'string',
        insercion: (v) => v === null || typeof v === 'string',
    }
};

// 1. AI Column Mapper with validation and retry
export async function mapInsertionColumnsAI(headers: string[], modelName: string = 'gemini-3-flash-preview'): Promise<ColumnMapping | null> {
    try {
        if (!process.env.GOOGLE_API_KEY) return null;

        const model = genAI.getGenerativeModel({ model: modelName });

        const prompt = `
        You are an expert data analyst. I have a list of column headers from a TV Media Insertion Log.
        Your task is to identify which header corresponds to my required standard fields.

        Standard Fields:
        - "vehiculo": The TV Channel or Media name (e.g., Canal, Vehicle, Medio).
        - "genero": The program genre (e.g., Tipo, Content, Cat).
        - "franja": The time slot (e.g., Time, Band, Horario).
        - "soporte": The specific program title (e.g., Program, Description, Material).
        - "fecha": The date of airing.
        - "duracion": The length of the spot (seconds).
        - "insercion": The number of spots or quantity.

        Input Headers:
        ${JSON.stringify(headers)}

        Return a JSON object leveraging the exact header names from the input.
        Format:
        {
            "vehiculo": "exact_header_name_found",
            "genero": "exact_header_name_found",
            "franja": "exact_header_name_found",
            "soporte": "exact_header_name_found",
            "fecha": "exact_header_name_found",
            "duracion": "exact_header_name_found",
            "insercion": "exact_header_name_found",
            "confidence": <number 0-100>
        }
        
        If a field is not found, use null.
        Strictly JSON only. No markdown formatting.
        `;

        const result = await withAIRetry<ColumnMapping>(model, prompt, columnMappingSchema, 1);

        if (result.success) {
            return result.data;
        } else {
            console.error("AI Column Mapping Failed after retries:", result.error);
            return null;
        }
    } catch (e) {
        console.error("AI Column Mapping Failed", e);
        return null;
    }
}

// Standard categories for validation
const STANDARD_CATEGORIES = [
    'Novela Estelar', 'Novela Vespertina', 'Novela Matutina', 'Novela',
    'Noticiero Matutino', 'Noticiero Estelar', 'Noticiero Vespertino',
    'Variedades Mañana', 'Variedades Nocturno', 'Tarde Vespertina',
    'Deportes', 'Loteria', 'Infantil', 'Pelicula', 'Other'
];

// 2. AI Program Categorizer with ID-based mapping
export async function categorizeProgramsAI(
    uniquePrograms: ProgramInput[],
    modelName: string = 'gemini-3-flash-preview'
): Promise<ProgramCategory[]> {
    try {
        if (!process.env.GOOGLE_API_KEY) return [];
        if (uniquePrograms.length === 0) return [];

        const model = genAI.getGenerativeModel({ model: modelName });

        // Build schema that validates IDs exist and are from input
        const inputIds = new Set(uniquePrograms.map(p => p.id));
        const categorizationSchema: AIResponseSchema = {
            arraySchema: {
                requiredKeys: ['id', 'mappedCategory', 'confidence'],
                keyValidators: {
                    id: (v) => typeof v === 'string' && inputIds.has(v),
                    mappedCategory: (v) => typeof v === 'string' && STANDARD_CATEGORIES.includes(v as string),
                    confidence: (v) => typeof v === 'number' && v >= 0 && v <= 100,
                }
            }
        };

        const prompt = `
        I have a list of TV programs with their raw Genre and Time Slot (Franja).
        Map each of them to one of my Standard Budget Categories.
        
        Standard Categories (use EXACTLY one of these):
        ${STANDARD_CATEGORIES.map(c => `- ${c}`).join('\n')}
        
        Input Programs (each has a unique "id" you MUST include in your response):
        ${JSON.stringify(uniquePrograms.slice(0, 100))} 
        (Note: Processing batches of 100 max for efficiency)

        IMPORTANT: Return the SAME "id" from the input for each program. This is critical for mapping.

        Return a JSON array:
        [
            {
                "id": "p0",
                "mappedCategory": "Standard Category",
                "confidence": <number 0-100>,
                "reasoning": "brief reason"
            }
        ]
        Strictly JSON only. No markdown formatting.
        `;

        const result = await withAIRetry<Array<{ id: string; mappedCategory: string; confidence: number; reasoning?: string }>>(
            model, prompt, categorizationSchema, 1
        );

        if (!result.success) {
            console.error("AI Categorization Failed after retries:", result.error);
            return [];
        }

        // Map results back using IDs (guaranteed unique match)
        const inputMap = new Map(uniquePrograms.map(p => [p.id, p]));

        return result.data.map(m => {
            const original = inputMap.get(m.id);
            return {
                id: m.id,
                originalTitle: original?.title || '',
                genre: original?.genre || '',
                franja: original?.franja || '',
                mappedCategory: m.mappedCategory,
                confidence: m.confidence,
                reasoning: m.reasoning || ''
            };
        });

    } catch (e) {
        console.error("AI Categorization Failed", e);
        return [];
    }
}
