'use client';

import { useState, useEffect } from 'react';
import { InsertionLogUploader, InsertionLogRow, InsertionLogSummary } from '@/components/insertion-log/InsertionLogUploader';
import { InsertionLogTable } from '@/components/insertion-log/InsertionLogTable';
import { ScrollText, AlertCircle } from 'lucide-react';

export default function InsertionLogPage() {
    const [results, setResults] = useState<InsertionLogRow[] | null>(null);
    const [summary, setSummary] = useState<InsertionLogSummary | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleUploadComplete = (data: InsertionLogRow[], summary: InsertionLogSummary, fileName: string) => {
        setResults(data);
        setSummary(summary);
        setError(null);

        // Persist to localStorage
        try {
            localStorage.setItem('insertion_log_data', JSON.stringify({ data, summary, fileName }));
        } catch (e) {
            console.error('Failed to save to localStorage', e);
        }
    };

    const handleUploadError = (errorMessage: string) => {
        setError(errorMessage);
        setResults(null);
        setSummary(null);
    };

    const handleReset = () => {
        setResults(null);
        setSummary(null);
        setError(null);

        // Clear from localStorage
        localStorage.removeItem('insertion_log_data');
    };

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem('insertion_log_data');
            if (saved) {
                const { data, summary } = JSON.parse(saved);
                if (data && summary) {
                    setResults(data);
                    setSummary(summary);
                }
            }
        } catch (e) {
            console.error('Failed to load from localStorage', e);
        }
    }, []);

    return (
        <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl shadow-lg">
                        <ScrollText className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">Insertion Log</h1>
                        <p className="text-sm text-muted-foreground">
                            Parse broadcast logs with fuzzy mapping to budget categories
                        </p>
                    </div>
                </div>
                {results && (
                    <button
                        onClick={handleReset}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Upload new file
                    </button>
                )}
            </div>

            {/* Error Alert */}
            {error && (
                <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-xl">
                    <AlertCircle className="w-5 h-5 text-destructive" />
                    <p className="text-sm text-destructive">{error}</p>
                </div>
            )}

            {/* Content */}
            {!results ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="w-full max-w-lg">
                        <InsertionLogUploader
                            onUploadComplete={handleUploadComplete}
                            onUploadError={handleUploadError}
                        />
                        <div className="mt-6 p-4 bg-muted/50 rounded-xl">
                            <h3 className="font-medium mb-2">How it works</h3>
                            <ul className="text-sm text-muted-foreground space-y-1">
                                <li>• Upload a monitoring/insertion log Excel file</li>
                                <li>• Broadcast titles are mapped to budget categories</li>
                                <li>• Mapping uses Genre + Franja fields (fuzzy matching)</li>
                                <li>• Output: Date, Medio, Mapped Program, Original Title, Insertions</li>
                            </ul>
                        </div>
                    </div>
                </div>
            ) : summary && (
                <InsertionLogTable data={results} summary={summary} />
            )}
        </div>
    );
}
