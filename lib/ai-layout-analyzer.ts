import { GoogleGenerativeAI } from '@google/generative-ai';
import * as XLSX from 'xlsx';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

interface SheetBlock {
    month: number;
    year: number;
    headerRowIndex: number;  // The row containing 1, 2, 3...
    dataStartRowIndex: number; // First row of program data
    confidence: number;
}

export async function analyzeSheetLayout(sheetName: string, sheetData: XLSX.WorkSheet, modelName: string = 'gemini-3-flash-preview'): Promise<SheetBlock[]> {
    try {
        if (!process.env.GOOGLE_API_KEY) {
            console.warn('GOOGLE_API_KEY not set, skipping AI analysis');
            return [];
        }

        // 1. Convert sheet to a simplified CSV/Text representation for the LLM
        // We only need the first ~150 rows usually, or we can chunk it if it's huge.
        // For efficiency, let's take columns A-Z (0-25) and rows 0-3000.
        const rows: string[] = [];
        const range = XLSX.utils.decode_range(sheetData['!ref'] || 'A1:Z3000');
        const maxRow = Math.min(range.e.r, 3000); // Increased limit to 3000 rows to handle multi-table files

        for (let r = 0; r <= maxRow; r++) {
            const rowCells: string[] = [];
            let hasContent = false;
            for (let c = 0; c <= 25; c++) { // First 26 columns
                const cell = sheetData[XLSX.utils.encode_cell({ r, c })];
                const val = cell ? String(cell.v).trim().replace(/,/g, ' ') : '';
                rowCells.push(val);
                if (val) hasContent = true;
            }
            if (hasContent) {
                rows.push(`Row ${r}: ${rowCells.join(',')}`);
            }
        }

        const csvContext = rows.join('\n');
        const model = genAI.getGenerativeModel({ model: modelName });

        const prompt = `
        You are an expert data analyst parsing a TV Media Budget Excel file.
        I will provide a text representation of the first ${maxRow} rows of a sheet named "${sheetName}".
        
        Your task is to identify "Budget Blocks". A block consists of:
        1. A Month/Year Header (e.g., "Noviembre 2025", "Dic 2024", "Oct-25"). It might be anywhere in the few rows above the grid.
        2. A Day Grid Header Row: A row containing a sequence of numbers 1, 2, 3... representing days of the month.
        3. Data Rows: Rows following the header that contain program names (Col A usually) and quantities under the day columns.
        
        Analyze the provided data and return a JSON array of blocks found.
        Format:
        [
          {
            "month": <number 1-12>,
            "year": <number 4 digits>,
            "headerRowIndex": <number>, (the row index containing 1, 2, 3...)
            "dataStartRowIndex": <number> (the first row containing actual program data after the header),
            "confidence": <number 0-100>
          }
        ]
        
        Strictly return ONLY the JSON. No markdown formatting.
        
        Data:
        ${csvContext}
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Clean up markdown code blocks if present
        const jsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

        console.log(`AI Analysis for ${sheetName}:`, jsonStr);

        return JSON.parse(jsonStr) as SheetBlock[];

    } catch (error) {
        console.error('Error in analyzeSheetLayout:', error);
        return [];
    }
}
