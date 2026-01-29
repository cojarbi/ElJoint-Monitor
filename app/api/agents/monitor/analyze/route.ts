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

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return NextResponse.json(
                {
                    error: 'Analysis failed',
                    details: errorData.detail || response.statusText
                },
                { status: response.status }
            );
        }

        const result = await response.json();
        return NextResponse.json(result);

    } catch (error) {
        console.error('Media monitor analysis error:', error);

        // Check if Python service is running
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed')) {
            return NextResponse.json(
                {
                    error: 'Python ADK service is not running',
                    details: 'Please start the Python service with: cd agents && uvicorn api_server:app --reload --port 8000'
                },
                { status: 503 }
            );
        }

        return NextResponse.json(
            { error: 'Analysis failed', details: errorMessage },
            { status: 500 }
        );
    }
}
