'use client';

import { useState, useEffect } from 'react';
import { History, Trash2, ExternalLink, Loader2, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface AnalysisSummary {
    id: string;
    name: string;
    planFileName: string;
    execFileName: string;
    createdAt: string;
}

interface AnalysisHistoryProps {
    onLoadAnalysis: (analysis: unknown) => void;
    refreshTrigger?: number;
}

export function AnalysisHistory({ onLoadAnalysis, refreshTrigger }: AnalysisHistoryProps) {
    const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const fetchAnalyses = async () => {
        try {
            const response = await fetch('/api/agents/monitor/history');
            if (response.ok) {
                const data = await response.json();
                setAnalyses(data.analyses || []);
            }
        } catch (error) {
            console.error('Failed to fetch analyses:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAnalyses();
    }, [refreshTrigger]);

    const handleLoad = async (id: string) => {
        setLoadingId(id);
        try {
            const response = await fetch(`/api/agents/monitor/history/${id}`);
            if (response.ok) {
                const data = await response.json();
                onLoadAnalysis(data.analysis);
            }
        } catch (error) {
            console.error('Failed to load analysis:', error);
        } finally {
            setLoadingId(null);
        }
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            const response = await fetch(`/api/agents/monitor/history/${id}`, {
                method: 'DELETE',
            });
            if (response.ok) {
                setAnalyses(prev => prev.filter(a => a.id !== id));
            }
        } catch (error) {
            console.error('Failed to delete analysis:', error);
        } finally {
            setDeletingId(null);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    if (loading) {
        return (
            <Card>
                <CardContent className="py-6 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        );
    }

    if (analyses.length === 0) {
        return (
            <Card>
                <CardContent className="py-6 text-center text-muted-foreground">
                    <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No saved analyses yet</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Previous Analyses
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
                {analyses.map((analysis) => (
                    <div
                        key={analysis.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                        <div className="flex-1 min-w-0 mr-3">
                            <p className="font-medium text-sm truncate">{analysis.name}</p>
                            <p className="text-xs text-muted-foreground">
                                {formatDate(analysis.createdAt)}
                            </p>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleLoad(analysis.id)}
                                disabled={loadingId === analysis.id}
                            >
                                {loadingId === analysis.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <ExternalLink className="h-4 w-4" />
                                )}
                            </Button>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:text-destructive"
                                        disabled={deletingId === analysis.id}
                                    >
                                        {deletingId === analysis.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-4 w-4" />
                                        )}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Analysis?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This will permanently delete &quot;{analysis.name}&quot;. This action cannot be undone.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={() => handleDelete(analysis.id)}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                            Delete
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}

export default AnalysisHistory;
