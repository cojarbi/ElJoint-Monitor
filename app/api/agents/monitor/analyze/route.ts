import { NextRequest, NextResponse } from 'next/server';

const PYTHON_SERVICE_URL = process.env.PYTHON_ADK_SERVICE_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
    try {
        // Get the form data from the request
        const formData = await request.formData();

        // Validate files are present
        const planFile = formData.get('plan_file');
        const executionFile = formData.get('execution_file');

        if (!planFile || !executionFile) {
            return NextResponse.json(
                { error: 'Both plan_file and execution_file are required' },
                { status: 400 }
            );
        }

        // Forward to Python ADK service
        const response = await fetch(`${PYTHON_SERVICE_URL}/analyze`, {
            method: 'POST',
            body: formData,
        });

        const result = await response.json().catch(() => ({}));

        // Pass through the response from Python service
        // This includes AI availability errors with proper structure
        if (!response.ok) {
            return NextResponse.json(
                {
                    error: result.error || 'Analysis failed',
                    details: result.details || result.detail || response.statusText,
                    ai_required: result.ai_required || false,
                    status: result.status || 'error'
                },
                { status: response.status }
            );
        }

        return NextResponse.json(result);

    } catch (error) {
        console.error('Media monitor analysis error:', error);

        // Check if Python service is running
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed')) {
            return NextResponse.json(
                {
                    error: 'AI Service Unavailable',
                    details: 'The Python AI service is not running. Please start it with: npm run dev',
                    ai_required: true,
                    status: 'error'
                },
                { status: 503 }
            );
        }

        return NextResponse.json(
            { error: 'Analysis failed', details: errorMessage, status: 'error' },
            { status: 500 }
        );
    }
}
