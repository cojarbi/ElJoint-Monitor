'use client';

import { useState } from 'react';
import { Loader2, Zap, Bot, Save, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FileUploadZone } from '@/components/media-monitor/FileUploadZone';
import { AnalysisResults } from '@/components/media-monitor/AnalysisResults';
import { AnalysisHistory } from '@/components/media-monitor/AnalysisHistory';
import { PipelineProgress, type PipelineStage } from '@/components/media-monitor/PipelineProgress';

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
    const [isAiError, setIsAiError] = useState(false);
    const [pipelineStage, setPipelineStage] = useState<PipelineStage>('idle');

    // History and save state
    const [historyRefresh, setHistoryRefresh] = useState(0);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [analysisName, setAnalysisName] = useState('');
    const [planFileName, setPlanFileName] = useState('');
    const [execFileName, setExecFileName] = useState('');

    const handleAnalyze = async () => {
        if (!planFile || !executionFile) return;

        setLoading(true);
        setError(null);
        setIsAiError(false);
        setAnalysis(null);
        setPipelineStage('idle');
        setSaved(false);
        setPlanFileName(planFile.name);
        setExecFileName(executionFile.name);

        try {
            const formData = new FormData();
            formData.append('plan_file', planFile);
            formData.append('execution_file', executionFile);

            const response = await fetch('/api/agents/monitor/analyze-stream', {
                method: 'POST',
                body: formData,
            });

            const contentType = response.headers.get('content-type') || '';
            if (!response.ok || !contentType.includes('text/event-stream')) {
                const result = await response.json();
                if (result.ai_required) {
                    setIsAiError(true);
                }
                throw new Error(result.details || result.error || 'Analysis failed');
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                throw new Error('Failed to initialize stream');
            }

            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const event = JSON.parse(line.slice(6));

                            if (event.stage && event.status === 'active') {
                                setPipelineStage(event.stage as PipelineStage);
                            } else if (event.stage === 'complete' && event.data) {
                                setPipelineStage('complete');
                                setAnalysis(event.data);
                            } else if (event.status === 'error') {
                                setPipelineStage('error');
                                const errorMsg = event.data?.error || 'Analysis failed';
                                if (errorMsg.includes('429') || errorMsg.includes('quota')) {
                                    setIsAiError(true);
                                }
                                throw new Error(errorMsg);
                            }
                        } catch (parseError) {
                            if (parseError instanceof Error && parseError.message !== 'Analysis failed') {
                                console.warn('Failed to parse SSE event:', line);
                            } else {
                                throw parseError;
                            }
                        }
                    }
                }
            }

        } catch (err) {
            setPipelineStage('error');
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveAnalysis = async () => {
        if (!analysis) return;

        setSaving(true);
        try {
            const response = await fetch('/api/agents/monitor/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: analysisName || undefined,
                    planFileName,
                    execFileName,
                    analysis: analysis.analysis,
                    metrics: analysis.metrics,
                    summary: analysis.summary,
                    discrepancies: analysis.discrepancies,
                    recommendations: analysis.recommendations,
                }),
            });

            if (response.ok) {
                setSaved(true);
                setHistoryRefresh(prev => prev + 1);
            }
        } catch (error) {
            console.error('Failed to save analysis:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleLoadFromHistory = (loadedAnalysis: unknown) => {
        const data = loadedAnalysis as {
            analysis: string;
            metrics: Record<string, { value: number; label: string; status?: string }>;
            summary: AnalysisData['summary'];
            discrepancies: AnalysisData['discrepancies'];
            recommendations: string[];
            name: string;
            planFileName: string;
            execFileName: string;
        };

        setAnalysis({
            status: 'success',
            analysis: data.analysis,
            metrics: data.metrics,
            summary: data.summary,
            discrepancies: data.discrepancies,
            recommendations: data.recommendations,
        });
        setPlanFileName(data.planFileName);
        setExecFileName(data.execFileName);
        setAnalysisName(data.name);
        setSaved(true);
        setPipelineStage('complete');
        setError(null);
    };

    const handleReset = () => {
        setPlanFile(null);
        setExecutionFile(null);
        setAnalysis(null);
        setError(null);
        setIsAiError(false);
        setPipelineStage('idle');
        setSaved(false);
        setAnalysisName('');
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
                {(analysis || error) && (
                    <Button variant="outline" onClick={handleReset}>
                        New Analysis
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Main Content */}
                <div className="lg:col-span-3 space-y-6">
                    {/* Pipeline Progress */}
                    {(loading || pipelineStage !== 'idle') && !analysis && (
                        <Card>
                            <CardContent className="pt-6">
                                <PipelineProgress currentStage={pipelineStage} error={error} />
                            </CardContent>
                        </Card>
                    )}

                    {/* Upload Section */}
                    {!analysis && !loading && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Upload Files</CardTitle>
                                <CardDescription>
                                    Upload your Plan (Presupuesto) and Execution (Monitoreo) Excel files
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FileUploadZone
                                        label="Plan File"
                                        description="Presupuesto Excel file"
                                        onFileSelect={setPlanFile}
                                        selectedFile={planFile}
                                    />
                                    <FileUploadZone
                                        label="Execution File"
                                        description="Monitoreo Excel file"
                                        onFileSelect={setExecutionFile}
                                        selectedFile={executionFile}
                                    />
                                </div>

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
                            </CardContent>
                        </Card>
                    )}

                    {/* Error Display */}
                    {error && !loading && (
                        <Card className={isAiError ? "border-yellow-500" : "border-destructive"}>
                            <CardContent className="pt-6">
                                <div className={`flex items-start gap-3 ${isAiError ? 'text-yellow-600' : 'text-destructive'}`}>
                                    <div className={`h-5 w-5 rounded-full ${isAiError ? 'bg-yellow-500/20' : 'bg-destructive/20'} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                                        {isAiError ? '⚠' : '!'}
                                    </div>
                                    <div>
                                        <p className="font-medium">
                                            {isAiError ? 'AI Service Required' : 'Analysis Error'}
                                        </p>
                                        <p className="text-sm mt-1">{error}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Results Display */}
                    {analysis && (
                        <>
                            {/* Save Bar */}
                            <Card>
                                <CardContent className="py-4">
                                    <div className="flex items-center gap-3">
                                        <Input
                                            placeholder="Analysis name (optional)"
                                            value={analysisName}
                                            onChange={(e) => setAnalysisName(e.target.value)}
                                            className="max-w-xs"
                                            disabled={saved}
                                        />
                                        <Button
                                            onClick={handleSaveAnalysis}
                                            disabled={saving || saved}
                                            variant={saved ? "secondary" : "default"}
                                        >
                                            {saving ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    Saving...
                                                </>
                                            ) : saved ? (
                                                <>
                                                    <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                                                    Saved
                                                </>
                                            ) : (
                                                <>
                                                    <Save className="mr-2 h-4 w-4" />
                                                    Save Analysis
                                                </>
                                            )}
                                        </Button>
                                        {saved && (
                                            <span className="text-sm text-muted-foreground">
                                                Analysis saved to history
                                            </span>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            <AnalysisResults data={analysis} />
                        </>
                    )}
                </div>

                {/* Sidebar - History */}
                <div className="lg:col-span-1">
                    <AnalysisHistory
                        onLoadAnalysis={handleLoadFromHistory}
                        refreshTrigger={historyRefresh}
                    />
                </div>
            </div>
        </div>
    );
}
