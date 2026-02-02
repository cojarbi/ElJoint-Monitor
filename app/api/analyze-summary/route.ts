import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

interface AnalysisRequest {
    stats: {
        totalOrdered: number;
        totalInserted: number;
        underDelivered: number;
        overDelivered: number;
        missing: number;
        overflowCount: number;
        nonStandardCount: number;
        confidenceDistribution: { high: number; medium: number; low: number };
        deliveryByMedio: Record<string, { missing: number; under: number; over: number }>;
    };
    dateRange: {
        months: string[];
        days: number[];
    };
    files: {
        budget: string;
        insertion: string;
    };
    medios: string[];
    modelName?: string;
}

export async function POST(request: NextRequest) {
    try {
        const { stats, dateRange, files, medios, modelName = 'gemini-2.0-flash' } = await request.json() as AnalysisRequest;

        const model = genAI.getGenerativeModel({ model: modelName });

        const deliveryRate = stats.totalOrdered > 0
            ? ((stats.totalInserted / stats.totalOrdered) * 100).toFixed(1)
            : '0';

        const matchRate = stats.totalInserted > 0
            ? ((stats.confidenceDistribution.high / stats.totalInserted) * 100).toFixed(1)
            : '0';

        const prompt = `
You are a media advertising reconciliation analyst. Analyze the following reconciliation data and provide a professional summary.

**Report Period:**
- Months: ${dateRange.months.length > 0 ? dateRange.months.join(', ') : 'All months'}
- Days: ${dateRange.days.length === 31 ? 'All days' : dateRange.days.join(', ')}

**Source Files:**
- Budget: ${files.budget}
- Insertion Log: ${files.insertion}

**Key Metrics:**
- Total Orders: ${stats.totalOrdered}
- Total Insertions: ${stats.totalInserted}
- Delivery Rate: ${deliveryRate}%
- Missing (No Insertions): ${stats.missing}
- Under-delivered: ${stats.underDelivered}
- Over-delivered: ${stats.overDelivered}
- Overflow/Unmatched Items: ${stats.overflowCount}
- Non-Standard Durations: ${stats.nonStandardCount}

**Confidence Distribution:**
- High Confidence (≥90%): ${stats.confidenceDistribution.high}
- Medium Confidence (70-89%): ${stats.confidenceDistribution.medium}
- Low Confidence (<70%): ${stats.confidenceDistribution.low}

**Delivery by Medio (Channel):**
${Object.entries(stats.deliveryByMedio).map(([medio, counts]) =>
            `- ${medio}: Missing=${counts.missing}, Under=${counts.under}, Over=${counts.over}`
        ).join('\n')}

**Medios Analyzed:** ${medios.join(', ')}

Please provide:
1. A 2-3 sentence executive summary of the overall reconciliation status
2. Key findings (3-5 bullet points highlighting the most important observations)
3. Areas of concern (if any discrepancies or issues were identified)
4. Recommendations for improvement (1-3 actionable suggestions)

Format your response as JSON with these keys:
{
    "executiveSummary": "...",
    "keyFindings": ["...", "..."],
    "concerns": ["...", "..."],
    "recommendations": ["...", "..."]
}

Return ONLY valid JSON, no markdown formatting.
`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Parse the JSON response
        let analysis;
        try {
            // Remove any markdown code block markers if present
            const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            analysis = JSON.parse(cleanedText);
        } catch {
            // If parsing fails, create a structured response from the text
            analysis = {
                executiveSummary: responseText.slice(0, 500),
                keyFindings: ['Analysis completed. Please review the data manually for detailed insights.'],
                concerns: [],
                recommendations: ['Review the reconciliation data for accuracy.']
            };
        }

        return NextResponse.json({
            success: true,
            analysis,
            generatedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Analysis generation failed:', error);
        return NextResponse.json(
            { error: 'Failed to generate analysis', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
