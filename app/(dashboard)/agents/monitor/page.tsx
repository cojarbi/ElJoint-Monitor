'use client';

import { useState } from 'react';
import { Loader2, Zap, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileUploadZone } from '@/components/media-monitor/FileUploadZone';
import { AnalysisResults } from '@/components/media-monitor/AnalysisResults';

interface AnalysisData {
    status: string;
    analysis: string;
    metrics: Record<string, { value: number; label: string; status?: string }>;
    summary: {
        total_planned: number;
        total_aired: number;
        matched: number;
        unmatched_planned: number;
        unmatched_aired: number;
    };
    discrepancies: Array<{
        type: string;
        severity: string;
        channel: string;
        program: string;
        expected: string | null;
        actual: string | null;
        explanation: string;
    }>;
    recommendations: string[];
}

export default function MonitorPage() {
    const [planFile, setPlanFile] = useState<File | null>(null);
    const [executionFile, setExecutionFile] = useState<File | null>(null);
    const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAnalyze = async () => {
        if (!planFile || !executionFile) return;

        setLoading(true);
        setError(null);
        setAnalysis(null);

        try {
            const formData = new FormData();
            formData.append('plan_file', planFile);
            formData.append('execution_file', executionFile);

            const response = await fetch('/api/agents/monitor/analyze', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.details || result.error || 'Analysis failed');
            }

            setAnalysis(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setPlanFile(null);
        setExecutionFile(null);
        setAnalysis(null);
        setError(null);
    };

    return (
        <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <Bot className="h-8 w-8 text-primary" />
                        Media Monitor Agent
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        AI-powered analysis of media execution vs. planned buys
                    </p>
                </div>
                {analysis && (
                    <Button variant="outline" onClick={handleReset}>
                        New Analysis
                    </Button>
                )}
            </div>

            {/* Upload Section */}
            {!analysis && (
                <Card>
                    <CardHeader>
                        <CardTitle>Upload Files</CardTitle>
                        <CardDescription>
                            Upload your Plan (Presupuesto) and Execution (Monitoreo) Excel files to begin analysis
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FileUploadZone
                                label="Plan File"
                                description="Presupuesto Excel file with MEDCOM and TVN tabs"
                                onFileSelect={setPlanFile}
                                selectedFile={planFile}
                            />
                            <FileUploadZone
                                label="Execution File"
                                description="Monitoreo Excel file from Kantar Ibope Media"
                                onFileSelect={setExecutionFile}
                                selectedFile={executionFile}
                            />
                        </div>

                        {/* Analyze Button */}
                        <div className="flex justify-center">
                            <Button
                                onClick={handleAnalyze}
                                disabled={!planFile || !executionFile || loading}
                                size="lg"
                                className="min-w-[200px]"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Analyzing...
                                    </>
                                ) : (
                                    <>
                                        <Zap className="mr-2 h-4 w-4" />
                                        Analyze Media Execution
                                    </>
                                )}
                            </Button>
                        </div>

                        {/* Info Box */}
                        <div className="p-4 bg-muted rounded-lg text-sm">
                            <h4 className="font-semibold mb-2">What this agent analyzes:</h4>
                            <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                                <li>Matches planned spots with aired spots using intelligent fuzzy matching</li>
                                <li>Calculates delivery rate, over/under-delivery, and accuracy metrics</li>
                                <li>Identifies discrepancies (missing spots, wrong program, wrong duration)</li>
                                <li>Provides AI-powered insights and actionable recommendations</li>
                            </ul>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Error Display */}
            {error && (
                <Card className="border-destructive">
                    <CardContent className="pt-6">
                        <div className="flex items-start gap-3 text-destructive">
                            <div className="h-5 w-5 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                !
                            </div>
                            <div>
                                <p className="font-medium">Analysis Error</p>
                                <p className="text-sm mt-1">{error}</p>
                                {error.includes('service is not running') && (
                                    <div className="mt-3 p-3 bg-muted rounded text-muted-foreground font-mono text-xs">
                                        cd agents && uvicorn api_server:app --reload --port 8000
                                    </div>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Results Display */}
            {analysis && <AnalysisResults data={analysis} />}
        </div>
    );
}
