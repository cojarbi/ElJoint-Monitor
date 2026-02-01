'use client';

import { useState, useEffect, useMemo } from 'react';
import { BudgetUploader, NormalizedRow, BudgetSummary as Summary } from '@/components/budget/BudgetUploader';
import { BudgetResultsTable } from '@/components/budget/BudgetResultsTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FileText, FileSpreadsheet, AlertCircle, Search, Download, CheckCircle2 } from 'lucide-react';
import { MonthFilter, DayFilter, MedioFilter } from '@/components/summary/DateFilter';
import { utils, writeFile } from 'xlsx';

// Interface for persisting the budget state
interface StoredBudgetData {
    data: NormalizedRow[];
    summary: Summary;
    fileNames: string;
}

export default function BudgetPage() {
    // Data State
    const [results, setResults] = useState<NormalizedRow[] | null>(null);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [fileNames, setFileNames] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Filter State
    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [selectedDays, setSelectedDays] = useState<number[]>([]);
    const [selectedMedios, setSelectedMedios] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    // Load Filters from localStorage
    useEffect(() => {
        try {
            const savedMonths = localStorage.getItem('budget_date_filter');
            if (savedMonths) setSelectedMonths(JSON.parse(savedMonths));

            const savedDays = localStorage.getItem('budget_day_filter');
            if (savedDays) {
                const parsed = JSON.parse(savedDays);
                if (Array.isArray(parsed)) setSelectedDays(parsed);
                else setSelectedDays([Number(parsed)]);
            }

            const savedMedios = localStorage.getItem('budget_medio_filter');
            if (savedMedios) {
                const parsed = JSON.parse(savedMedios);
                if (Array.isArray(parsed)) setSelectedMedios(parsed);
            }
        } catch (e) {
            console.error('Failed to load filters', e);
        }
    }, []);

    // Load Data from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem('budget_data');
            if (saved) {
                const { data, summary, fileNames } = JSON.parse(saved);
                if (data && summary) {
                    setResults(data);
                    setSummary(summary);
                    if (fileNames) setFileNames(fileNames);
                }
            }
        } catch (e) {
            console.error('Failed to load data from localStorage', e);
        }
    }, []);

    const handleUploadComplete = (data: NormalizedRow[], summary: Summary, fileNames: string) => {
        setResults(data);
        setSummary(summary);
        setFileNames(fileNames);
        setError(null);

        try {
            localStorage.setItem('budget_data', JSON.stringify({ data, summary, fileNames }));
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
        setFileNames(null);
        setError(null);
        localStorage.removeItem('budget_data');
    };

    // Filter Handlers
    const handleMonthChange = (months: string[]) => {
        setSelectedMonths(months);
        localStorage.setItem('budget_date_filter', JSON.stringify(months));
    };

    const handleDayChange = (days: number[]) => {
        setSelectedDays(days);
        if (days.length > 0) localStorage.setItem('budget_day_filter', JSON.stringify(days));
        else localStorage.removeItem('budget_day_filter');
    };

    const handleMedioChange = (medios: string[]) => {
        setSelectedMedios(medios);
        if (medios.length > 0) localStorage.setItem('budget_medio_filter', JSON.stringify(medios));
        else localStorage.removeItem('budget_medio_filter');
    };

    // Computed Values
    const availableMedios = useMemo(() => {
        if (!results) return [];
        const uniqueMedios = Array.from(new Set(results.map(row => row.medio).filter(Boolean)));
        return uniqueMedios.sort();
    }, [results]);

    const filteredResults = useMemo(() => {
        if (!results) return [];
        let data = [...results];

        // Apply Month Filter
        if (selectedMonths.length > 0) {
            data = data.filter(row => {
                const rowMonth = row.date.substring(0, 7);
                if (!selectedMonths.includes(rowMonth)) return false;
                if (selectedDays.length > 0) {
                    const dayPart = parseInt(row.date.split('-')[2], 10);
                    return selectedDays.includes(dayPart);
                }
                return true;
            });
        } else if (selectedDays.length > 0) {
            data = data.filter(row => {
                const dayPart = parseInt(row.date.split('-')[2], 10);
                return selectedDays.includes(dayPart);
            });
        }

        // Apply Medio Filter
        if (selectedMedios.length > 0) {
            data = data.filter(row => selectedMedios.includes(row.medio));
        }

        // Apply Search Term
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            data = data.filter(row =>
                row.medio.toLowerCase().includes(term) ||
                (row.program && row.program.toLowerCase().includes(term)) ||
                (row.originalTitle && row.originalTitle.toLowerCase().includes(term)) ||
                row.date.includes(term)
            );
        }

        return data;
    }, [results, selectedMonths, selectedDays, selectedMedios, searchTerm]);

    const stats = useMemo(() => {
        if (!filteredResults) return null;
        const totalRows = filteredResults.length;
        const totalOrdered = filteredResults.reduce((sum, row) => sum + row.orderedQuantity, 0);

        // Confidence Distribution based on Ordered Quantity
        const confidenceDistribution = {
            high: filteredResults.reduce((sum, row) => (Number(row.confidence) || 0) >= 90 ? sum + row.orderedQuantity : sum, 0),
            medium: filteredResults.reduce((sum, row) => (Number(row.confidence) || 0) >= 70 && (Number(row.confidence) || 0) < 90 ? sum + row.orderedQuantity : sum, 0),
            low: filteredResults.reduce((sum, row) => (Number(row.confidence) || 0) < 70 ? sum + row.orderedQuantity : sum, 0)
        };

        return { totalRows, totalOrdered, confidenceDistribution };
    }, [filteredResults]);

    const exportToExcel = () => {
        if (!filteredResults) return;
        const headers = ['Date', 'Medio', 'Program', 'Schedule', 'Original Title', 'Duration', 'Ordered Qty'];
        const rows = filteredResults.map(row => ({
            'Date': row.date,
            'Medio': row.medio,
            'Program': row.program,
            'Schedule': row.schedule || '',
            'Original Title': row.originalTitle || '',
            'Duration': row.durationSeconds || 0,
            'Ordered Qty': row.orderedQuantity
        }));

        const wb = utils.book_new();
        const ws = utils.json_to_sheet(rows, { header: headers });
        utils.book_append_sheet(wb, ws, "Budget");
        writeFile(wb, "budget_export.xlsx");
    };

    if (!results) {
        return (
            <div className="flex flex-1 flex-col gap-6 p-6">
                {/* Simple Header for Empty State */}
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
                </div>

                {/* Error Alert */}
                {error && (
                    <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-xl">
                        <AlertCircle className="w-5 h-5 text-destructive" />
                        <p className="text-sm text-destructive">{error}</p>
                    </div>
                )}

                {/* Content */}
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
            </div>
        );
    }

    return (
        <div className="flex flex-1 flex-col gap-6 p-6 pt-0">
            {/* Sticky Header */}
            <div className="sticky top-16 z-40 bg-background/80 backdrop-blur-md pb-1 pt-1 -mt-4 -mx-6 px-6 border-b shadow-sm">
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch xl:min-h-[90px]">
                    {/* Column 1: Metrics (Span 5) */}
                    <div className="w-full xl:col-span-5 h-full">
                        <div className="grid grid-cols-2 gap-2 h-full">
                            <Card className="h-full flex flex-col justify-center text-center shadow-sm">
                                <CardHeader className="py-1 px-1 bg-muted/10">
                                    <CardTitle className="text-[20px] font-bold text-muted-foreground uppercase tracking-widest">Orders</CardTitle>
                                </CardHeader>
                                <CardContent className="flex-1 flex flex-col items-center pt-2 px-2 pb-1">
                                    <div className="flex flex-col items-center gap-0.5">
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-4xl font-bold">{stats?.totalOrdered || 0}</span>
                                        </div>
                                        <div className="flex gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                                            <span>Total Quantity</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="h-full flex flex-col justify-center text-center shadow-sm">
                                <CardHeader className="py-1 px-1 bg-muted/10">
                                    <CardTitle className="text-[20px] font-bold text-muted-foreground uppercase tracking-widest">Confidence</CardTitle>
                                </CardHeader>
                                <CardContent className="flex-1 flex flex-col items-center pt-2 px-2 pb-1">
                                    <div className="flex flex-col items-center gap-1">
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-3xl font-bold">{stats?.confidenceDistribution?.high || 0}</span>
                                            <span className="text-base font-semibold text-muted-foreground/50">/</span>
                                            <span className="text-3xl font-bold">{stats?.confidenceDistribution?.medium || 0}</span>
                                            <span className="text-base font-semibold text-muted-foreground/50">/</span>
                                            <span className="text-3xl font-bold">{stats?.confidenceDistribution?.low || 0}</span>
                                        </div>
                                        <div className="flex gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                                            <span>High</span>
                                            <span>Med</span>
                                            <span>Low</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                    {/* Column 2: Filter (Span 4) */}
                    <div className="hidden xl:flex w-full xl:col-span-4 h-full flex-col gap-2">
                        <Card className="h-full flex flex-col text-center shadow-sm">
                            <CardHeader className="py-1 px-1 bg-muted/10">
                                <CardTitle className="text-[10px] font-bold text-muted-foreground text-center uppercase tracking-widest">
                                    Filter
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="px-2 pb-2 pt-1 flex-1">
                                <div className="flex flex-col gap-1.5">
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <MonthFilter
                                            selectedMonths={selectedMonths}
                                            onChange={handleMonthChange}
                                        />
                                        <DayFilter
                                            selectedDays={selectedDays}
                                            onDayChange={handleDayChange}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <MedioFilter
                                            medios={availableMedios}
                                            selectedMedios={selectedMedios}
                                            onMedioChange={handleMedioChange}
                                        />
                                        <div />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Column 3: Source & Actions (Span 3) */}
                    <div className="w-full xl:col-span-3 flex flex-col gap-2 h-full">
                        <div className="grid grid-cols-2 gap-2 flex-1 min-h-0">
                            <Card className="flex flex-col min-w-0 shadow-sm overflow-hidden text-[10px]">
                                <CardHeader className="py-2 px-1 text-center bg-muted/10">
                                    <CardTitle className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center justify-center gap-1">
                                        <FileText className="w-2.5 h-2.5" />
                                        Budget File
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-2 flex flex-col h-full justify-between overflow-hidden">
                                    <div className="space-y-1 overflow-auto max-h-[60px] pr-1 custom-scrollbar">
                                        {(() => {
                                            const names = fileNames;
                                            if (!names) return <span className="text-muted-foreground italic">-</span>;
                                            const nameList = names.split(',').map(s => s.trim());
                                            return nameList.map((name, i) => (
                                                <div key={i} className="font-medium text-[10px] leading-tight break-all border-l-2 border-primary/40 pl-1.5 py-0.5" title={name}>
                                                    {name}
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                    <div className="text-[8px] text-muted-foreground mt-1 text-right font-bold uppercase tracking-tighter opacity-70">
                                        {stats?.totalRows || 0} rows
                                    </div>
                                </CardContent>
                            </Card>
                            <div className="flex flex-col gap-2">
                                <Button
                                    variant="outline"
                                    onClick={handleReset}
                                    className="w-full flex-1 text-[10px] h-auto shadow-sm"
                                    size="sm"
                                >
                                    <FileSpreadsheet className="w-3 h-3 mr-1.5" />
                                    Reset
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Results Area */}
            <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search budget..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    <Button variant="outline" onClick={exportToExcel} className="gap-2">
                        <Download className="w-4 h-4" />
                        Export Excel
                    </Button>
                </div>

                <div className="rounded-xl border bg-card">
                    <div className="p-3 border-b bg-muted/30">
                        <h3 className="font-semibold text-sm flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            Budget Lines ({filteredResults.length})
                        </h3>
                    </div>
                    {/* Pass filtered results to table - Hide Controls and Hide Summary */}
                    <BudgetResultsTable
                        data={filteredResults}
                        summary={summary || { totalRows: 0, medios: [], programs: 0, dateRange: null }}
                        hideControls={true}
                        hideSummary={true}
                    />
                </div>
            </div>
        </div>
    );
}
