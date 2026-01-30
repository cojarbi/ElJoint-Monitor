import { GoogleGenerativeAI } from '@google/generative-ai';

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
    originalTitle: string;
    genre: string;
    franja: string;
    mappedCategory: string; // The standard category (e.g., "Novela Estelar")
    confidence: number;
    reasoning: string;
}

// 1. AI Column Mapper
export async function mapInsertionColumnsAI(headers: string[], modelName: string = 'gemini-3-flash-preview'): Promise<ColumnMapping | null> {
    const model = genAI.getGenerativeModel({ model: modelName });
    try {
        if (!process.env.GOOGLE_API_KEY) return null;

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
        Strictly JSON only.
        `;

        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(text) as ColumnMapping;
    } catch (e) {
        console.error("AI Column Mapping Failed", e);
        return null;
    }
}

// 2. AI Program Categorizer (Fuzzy Matcher)
export async function categorizeProgramsAI(
    uniquePrograms: { title: string; genre: string; franja: string }[],
    modelName: string = 'gemini-3-flash-preview'
): Promise<ProgramCategory[]> {
    const model = genAI.getGenerativeModel({ model: modelName });
    try {
        if (!process.env.GOOGLE_API_KEY) return [];

        const prompt = `
        I have a list of TV programs with their raw Genre and Time Slot (Franja).
        Map each of them to one of my Standard Budget Categories.
        
        Standard Categories:
        - Novela Estelar
        - Novela Vespertina
        - Novela Matutina
        - Novela
        - Noticiero Matutino
        - Noticiero Estelar
        - Noticiero Vespertino
        - Variedades Mañana
        - Variedades Nocturno
        - Tarde Vespertina
        - Deportes
        - Loteria
        - Infantil
        - Pelicula
        - Other (if it doesn't fit)

        Input Programs:
        ${JSON.stringify(uniquePrograms.slice(0, 100))} 
        (Note: Processing batches of 100 max for efficiency)

        Return a JSON array:
        [
            {
                "originalTitle": "...",
                "mappedCategory": "Standard Category",
                "confidence": <number 0-100>,
                "reasoning": "brief reason"
            }
        ]
        Strictly JSON only.
        `;

        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const mappings = JSON.parse(text) as any[];

        // Merge back with inputs to ensure alignment
        return mappings.map(m => {
            const original = uniquePrograms.find(p => p.title === m.originalTitle);
            return {
                originalTitle: m.originalTitle,
                genre: original?.genre || '',
                franja: original?.franja || '',
                mappedCategory: m.mappedCategory,
                confidence: m.confidence,
                reasoning: m.reasoning
            };
        });

    } catch (e) {
        console.error("AI Categorization Failed", e);
        return [];
    }
}
