import { NextRequest } from 'next/server';

const PYTHON_SERVICE_URL = process.env.PYTHON_ADK_SERVICE_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
    try {
        // Get the form data from the request
        const formData = await request.formData();

        // Validate files are present
        const planFile = formData.get('plan_file');
        const executionFile = formData.get('execution_file');

        if (!planFile || !executionFile) {
            return new Response(
                JSON.stringify({ error: 'Both plan_file and execution_file are required' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // Forward to Python ADK service with streaming
        const response = await fetch(`${PYTHON_SERVICE_URL}/analyze-stream`, {
            method: 'POST',
            body: formData,
        });

        // Check for non-streaming error responses
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('text/event-stream')) {
            const result = await response.json().catch(() => ({}));
            return new Response(
                JSON.stringify({
                    error: result.error || 'Analysis failed',
                    details: result.details || result.detail || response.statusText,
                    ai_required: result.ai_required || false,
                    status: result.status || 'error'
                }),
                { status: response.status, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // Stream the SSE response
        return new Response(response.body, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } catch (error) {
        console.error('Media monitor stream error:', error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed')) {
            return new Response(
                JSON.stringify({
                    error: 'AI Service Unavailable',
                    details: 'The Python AI service is not running.',
                    ai_required: true,
                    status: 'error'
                }),
                { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({ error: 'Analysis failed', details: errorMessage, status: 'error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
