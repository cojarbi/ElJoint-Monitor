'use client';

import { useState, useEffect, useMemo } from 'react';
import { InsertionLogUploader, InsertionLogRow, InsertionLogSummary } from '@/components/insertion-log/InsertionLogUploader';
import { InsertionLogTable } from '@/components/insertion-log/InsertionLogTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollText, FileSpreadsheet, AlertCircle, Search, Download, CheckCircle2, FileText } from 'lucide-react';
import { MonthFilter, DayFilter, MedioFilter } from '@/components/summary/DateFilter';
import { utils, writeFile } from 'xlsx';

export default function InsertionLogPage() {
    // Data State
    const [results, setResults] = useState<InsertionLogRow[] | null>(null);
    const [summary, setSummary] = useState<InsertionLogSummary | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Filter State
    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [selectedDays, setSelectedDays] = useState<number[]>([]);
    const [selectedMedios, setSelectedMedios] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    // Load Filters from localStorage
    useEffect(() => {
        try {
            const savedMonths = localStorage.getItem('insertion_log_date_filter');
            if (savedMonths) setSelectedMonths(JSON.parse(savedMonths));

            const savedDays = localStorage.getItem('insertion_log_day_filter');
            if (savedDays) {
                const parsed = JSON.parse(savedDays);
                if (Array.isArray(parsed)) setSelectedDays(parsed);
                else setSelectedDays([Number(parsed)]);
            }

            const savedMedios = localStorage.getItem('insertion_log_medio_filter');
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
            const saved = localStorage.getItem('insertion_log_data');
            if (saved) {
                const { data, summary, fileName } = JSON.parse(saved);
                if (data && summary) {
                    setResults(data);
                    setSummary(summary);
                    if (fileName) setFileName(fileName);
                }
            }
        } catch (e) {
            console.error('Failed to load data from localStorage', e);
        }
    }, []);

    // Handlers
    const handleUploadComplete = (data: InsertionLogRow[], summary: InsertionLogSummary, fileName: string) => {
        setResults(data);
        setSummary(summary);
        setFileName(fileName);
        setError(null);

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
        setFileName(null);
        setError(null);
        localStorage.removeItem('insertion_log_data');
    };

    // Filter Handlers
    const handleMonthChange = (months: string[]) => {
        setSelectedMonths(months);
        localStorage.setItem('insertion_log_date_filter', JSON.stringify(months));
    };

    const handleDayChange = (days: number[]) => {
        setSelectedDays(days);
        if (days.length > 0) localStorage.setItem('insertion_log_day_filter', JSON.stringify(days));
        else localStorage.removeItem('insertion_log_day_filter');
    };

    const handleMedioChange = (medios: string[]) => {
        setSelectedMedios(medios);
        if (medios.length > 0) localStorage.setItem('insertion_log_medio_filter', JSON.stringify(medios));
        else localStorage.removeItem('insertion_log_medio_filter');
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
                row.date.includes(term) ||
                row.medio.toLowerCase().includes(term) ||
                (row.originalTitle && row.originalTitle.toLowerCase().includes(term)) ||
                (row.genre && row.genre.toLowerCase().includes(term)) ||
                (row.franja && row.franja.toLowerCase().includes(term)) ||
                (row.timeRange && row.timeRange.toLowerCase().includes(term))
            );
        }

        return data;
    }, [results, selectedMonths, selectedDays, selectedMedios, searchTerm]);

    const stats = useMemo(() => {
        if (!filteredResults) return null;
        const totalRows = filteredResults.length;
        const totalInsertions = filteredResults.reduce((sum, row) => sum + row.insertions, 0);

        // Confidence Distribution
        // Confidence Distribution based on Insertions (Sum of quanity)
        const confidenceDistribution = {
            high: filteredResults.reduce((sum, row) => (row.confidence || 0) >= 90 ? sum + row.insertions : sum, 0),
            medium: filteredResults.reduce((sum, row) => (row.confidence || 0) >= 70 && (row.confidence || 0) < 90 ? sum + row.insertions : sum, 0),
            low: filteredResults.reduce((sum, row) => (row.confidence || 0) < 70 ? sum + row.insertions : sum, 0)
        };

        return { totalRows, totalInsertions, confidenceDistribution };
    }, [filteredResults]);

    const exportToExcel = () => {
        if (!filteredResults) return;
        const headers = ['Date', 'Medio', 'Original Title', 'Genre', 'Franja', 'Segmento', 'Duration', 'Insertions', 'Confidence'];
        const rows = filteredResults.map(row => ({
            'Date': row.date,
            'Medio': row.medio,
            'Original Title': row.originalTitle,
            'Genre': row.genre,
            'Franja': row.franja,
            'Segmento': row.timeRange || '',
            'Duration': row.duration || 0,
            'Insertions': row.insertions,
            'Confidence': row.confidence || 0
        }));

        const wb = utils.book_new();
        const ws = utils.json_to_sheet(rows, { header: headers });
        utils.book_append_sheet(wb, ws, "InsertionLog");
        writeFile(wb, "insertion_log_export.xlsx");
    };

    if (!results) {
        return (
            <div className="flex flex-1 flex-col gap-6 p-6">
                {/* Simple Header for Empty State */}
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
                                    <CardTitle className="text-[20px] font-bold text-muted-foreground uppercase tracking-widest">Spots</CardTitle>
                                </CardHeader>
                                <CardContent className="flex-1 flex flex-col items-center pt-2 px-2 pb-1">
                                    <div className="flex flex-col items-center gap-0.5">
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-4xl font-bold">{stats?.totalInsertions || 0}</span>
                                        </div>
                                        <div className="flex gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                                            <span>Total Spots</span>
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
                                        Insertion Log
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-2 flex flex-col h-full justify-between overflow-hidden">
                                    <div className="space-y-1 overflow-auto max-h-[60px] pr-1 custom-scrollbar">
                                        {(() => {
                                            const name = fileName;
                                            if (!name) return <span className="text-muted-foreground italic">-</span>;
                                            return (
                                                <div className="font-medium text-[10px] leading-tight break-all border-l-2 border-primary/40 pl-1.5 py-0.5" title={name}>
                                                    {name}
                                                </div>
                                            );
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
                                    <ScrollText className="w-3 h-3 mr-1.5" />
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
                            placeholder="Search insertion log..."
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
                            Log Entries ({filteredResults.length})
                        </h3>
                    </div>
                    {/* Pass filtered results to table */}
                    <InsertionLogTable
                        data={filteredResults}
                        summary={summary || { totalRows: 0, totalInsertions: 0, medios: [], insertionsByMedio: {}, insertionsByGenre: {}, insertionsByProgram: {}, dateRange: null, programs: 0 }}
                        hideControls={true}
                        hideSummary={true}
                    />
                </div>
            </div>
        </div>
    );
}
