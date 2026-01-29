'use client';

import { useState } from 'react';
import { BudgetUploader, NormalizedRow, Summary } from '@/components/budget/BudgetUploader';
import { BudgetResultsTable } from '@/components/budget/BudgetResultsTable';
import { FileSpreadsheet, AlertCircle } from 'lucide-react';

export default function BudgetPage() {
    const [results, setResults] = useState<NormalizedRow[] | null>(null);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleUploadComplete = (data: NormalizedRow[], summary: Summary) => {
        setResults(data);
        setSummary(summary);
        setError(null);
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
    };

    return (
        <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg">
                        <FileSpreadsheet className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">Budget Normalizer</h1>
                        <p className="text-sm text-muted-foreground">
                            Transform budget calendar grids into normalized data
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
                        <BudgetUploader
                            onUploadComplete={handleUploadComplete}
                            onUploadError={handleUploadError}
                        />
                        <div className="mt-6 p-4 bg-muted/50 rounded-xl">
                            <h3 className="font-medium mb-2">How it works</h3>
                            <ul className="text-sm text-muted-foreground space-y-1">
                                <li>• Upload a budget Excel file (.xls or .xlsx)</li>
                                <li>• Each tab (except &quot;Resumen&quot;) becomes the Medio</li>
                                <li>• The 31-day calendar grid is converted to vertical rows</li>
                                <li>• Output: Date, Medio, Program, Ordered Quantity</li>
                            </ul>
                        </div>
                    </div>
                </div>
            ) : summary && (
                <BudgetResultsTable data={results} summary={summary} />
            )}
        </div>
    );
}
