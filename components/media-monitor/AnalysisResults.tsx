'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricsGrid } from './MetricsCard';
import { DiscrepancyTable } from './DiscrepancyTable';
import { Bot, BarChart3, AlertTriangle, List } from 'lucide-react';

interface AnalysisResultsProps {
    data: {
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
    };
}

export function AnalysisResults({ data }: AnalysisResultsProps) {
    const { analysis, metrics, summary, discrepancies, recommendations } = data;

    return (
        <div className="space-y-6">
            <Tabs defaultValue="insights" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="insights" className="flex items-center gap-2">
                        <Bot className="h-4 w-4" />
                        AI Insights
                    </TabsTrigger>
                    <TabsTrigger value="summary" className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" />
                        Summary
                    </TabsTrigger>
                    <TabsTrigger value="discrepancies" className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Discrepancies ({discrepancies?.length || 0})
                    </TabsTrigger>
                    <TabsTrigger value="recommendations" className="flex items-center gap-2">
                        <List className="h-4 w-4" />
                        Actions
                    </TabsTrigger>
                </TabsList>

                {/* AI Insights Tab */}
                <TabsContent value="insights" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Bot className="h-5 w-5 text-primary" />
                                AI Analysis Insights
                            </CardTitle>
                            <CardDescription>
                                Intelligent analysis of your media execution data
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div
                                className="prose prose-sm max-w-none dark:prose-invert"
                                dangerouslySetInnerHTML={{
                                    __html: analysis
                                        ?.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                        .replace(/\n/g, '<br />')
                                        .replace(/• /g, '&bull; ')
                                        || 'No analysis available'
                                }}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Summary Tab */}
                <TabsContent value="summary" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <BarChart3 className="h-5 w-5 text-primary" />
                                Performance Metrics
                            </CardTitle>
                            <CardDescription>
                                Key performance indicators for your media campaign
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <MetricsGrid metrics={metrics} />

                            <div className="mt-6 p-4 bg-muted rounded-lg">
                                <h4 className="font-semibold mb-2">Quick Stats</h4>
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                    <div>
                                        <span className="text-muted-foreground">Total Planned:</span>
                                        <span className="ml-2 font-medium">{summary?.total_planned || 0}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">Total Aired:</span>
                                        <span className="ml-2 font-medium">{summary?.total_aired || 0}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">Successfully Matched:</span>
                                        <span className="ml-2 font-medium text-green-600">{summary?.matched || 0}</span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Discrepancies Tab */}
                <TabsContent value="discrepancies" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                                Discrepancies
                            </CardTitle>
                            <CardDescription>
                                Issues found between planned and aired spots
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <DiscrepancyTable discrepancies={discrepancies || []} />
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Recommendations Tab */}
                <TabsContent value="recommendations" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <List className="h-5 w-5 text-primary" />
                                Recommended Actions
                            </CardTitle>
                            <CardDescription>
                                Next steps based on the analysis
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {recommendations && recommendations.length > 0 ? (
                                <ul className="space-y-3">
                                    {recommendations.map((rec, index) => (
                                        <li key={index} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                                            <span className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                                                {index + 1}
                                            </span>
                                            <span className="text-sm">{rec}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-muted-foreground">No specific recommendations at this time.</p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

export default AnalysisResults;
