'use client';

import { useState, useEffect, useMemo } from 'react';
import { NormalizedRow } from '@/components/budget/BudgetUploader';
import { InsertionLogRow } from '@/components/insertion-log/InsertionLogUploader';
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Play, Download, Search, CheckCircle2, AlertCircle, XCircle, ArrowUpDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAiModel } from '@/hooks/use-ai-settings';
import { useAliasMappings } from '@/hooks/use-alias-mappings';

interface ReconciledRow extends NormalizedRow {
    franja: string;
    originalTitle: string;
    totalInserted: number;
    difference: number;
    reconciliationConfidence: number;
    status: 'matched' | 'under' | 'over' | 'missing';
}

interface StoredBudgetData {
    data: NormalizedRow[];
    fileName?: string;
    fileNames?: string;
}

interface StoredInsertionData {
    data: InsertionLogRow[];
    fileName?: string;
}

// Interface for persisting the summary state
interface StoredSummaryState {
    reconciledData: ReconciledRow[];
    budgetFileName?: string;
    insertionFileName?: string;
}

type SortField = 'date' | 'medio' | 'program' | 'schedule' | 'originalTitle' | 'durationSeconds' | 'orderedQuantity' | 'totalInserted' | 'diff' | 'reconciliationConfidence';
type SortDirection = 'asc' | 'desc';

export default function SummaryPage() {
    const { model } = useAiModel();
    const { getMappingObject } = useAliasMappings();
    const [budgetData, setBudgetData] = useState<StoredBudgetData | null>(null);
    const [insertionData, setInsertionData] = useState<StoredInsertionData | null>(null);
    const [reconciledData, setReconciledData] = useState<ReconciledRow[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    useEffect(() => {
        // Load source data from localStorage
        try {
            const budgetStored = localStorage.getItem('budget_data');
            const insertionStored = localStorage.getItem('insertion_log_data');
            const summaryStored = localStorage.getItem('summary_reconciliation_data');

            let parsedBudget: StoredBudgetData | null = null;
            let parsedInsertion: StoredInsertionData | null = null;

            if (budgetStored) {
                parsedBudget = JSON.parse(budgetStored);
                setBudgetData(parsedBudget);
            }
            if (insertionStored) {
                parsedInsertion = JSON.parse(insertionStored);
                setInsertionData(parsedInsertion);
            }

            // Load persisted summary if it matches the current files
            if (summaryStored && parsedBudget && parsedInsertion) {
                const parsedSummary: StoredSummaryState = JSON.parse(summaryStored);

                // Check if files match
                const budgetMatch = parsedSummary.budgetFileName === parsedBudget.fileName;
                const insertionMatch = parsedSummary.insertionFileName === parsedInsertion.fileName;

                if (budgetMatch && insertionMatch) {
                    setReconciledData(parsedSummary.reconciledData);
                } else {
                    localStorage.removeItem('summary_reconciliation_data');
                }
            }
        } catch (e) {
            console.error('Failed to load data from localStorage', e);
        }
    }, []);

    const [statusMessage, setStatusMessage] = useState('Processing...');



    // Helper to parse "HH:MM - HH:MM" or "HH:MM-HH:MM"
    // Returns { start: minutes, end: minutes } or null
    const parseTimeRange = (timeStr: string | undefined): { start: number, end: number } | null => {
        if (!timeStr) return null;
        const normalized = timeStr.toLowerCase().replace(/\s+/g, '');
        // Matches "6:00am-8:00am", "18:00-20:00", "06:00-11:30"
        const match = normalized.match(/(\d{1,2}:\d{2})(?:[a-z]{2})?-(\d{1,2}:\d{2})(?:[a-z]{2})?/);
        if (!match) return null;

        const parseMinutes = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };

        return { start: parseMinutes(match[1]), end: parseMinutes(match[2]) };
    };

    // Check if range1 (budget) overlaps with range2 (insertion)
    const checkOverlap = (sched: string | undefined, actual: string | undefined): boolean => {
        if (!sched || !actual) return true; // Lazy match if either is missing, though unlikely for insertion

        const s = parseTimeRange(sched); // Budget schedule
        const a = parseTimeRange(actual); // Insertion timeRange

        if (!s || !a) return true; // Fallback to permissive if parsing fails

        // Standard overlap: StartA < EndB && EndA > StartB
        return s.start < a.end && s.end > a.start;
    };


    const reconcileData = async () => {
        if (!budgetData?.data || !insertionData?.data) return;

        setIsLoading(true);
        setStatusMessage('Preparing data...');
        setReconciledData(null); // Clear current data

        try {
            const budgetRows = budgetData.data;
            const insertionRows = insertionData.data;

            // 1. Prepare lists for AI (Only Medios now)
            const budgetMedios = Array.from(new Set(budgetRows.map(r => r.medio).filter(Boolean)));
            const insertionMedios = Array.from(new Set(insertionRows.map(r => r.medio).filter(Boolean)));

            // 2. Call AI API for Medio Mapping only
            let medioMap: Record<string, string | null> = {};
            setStatusMessage('Mapping Channels...');

            try {
                const response = await fetch('/api/reconcile-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        budgetMedios,
                        insertionMedios,
                        modelName: model,
                        medioAliases: getMappingObject('medios')
                    })
                });
                const result = await response.json();

                if (result.medioMapping) medioMap = result.medioMapping;
            } catch (error) {
                console.error("AI Reconciliation API failed, falling back to direct match", error);
            }

            // 3. Reconcile - New Logic (Date -> Medio -> Duration -> Time)
            setStatusMessage('Reconciling Matches...');

            // Optimization: Index insertion rows by Date to avoid full scan per budget row
            const insertionByDate: Record<string, InsertionLogRow[]> = {};
            insertionRows.forEach(row => {
                if (!insertionByDate[row.date]) insertionByDate[row.date] = [];
                insertionByDate[row.date].push(row);
            });

            const reconciled = budgetRows.map((budgetRow, idx) => {
                // Get potential matches by date (CRITERIA 1: DATE)
                const candidateMatches = insertionByDate[budgetRow.date] || [];

                const matches = candidateMatches.filter((log) => {
                    // CRITERIA 2: MEDIO Check
                    const budgetMedioLower = budgetRow.medio?.toLowerCase();
                    const directMedioMatch = log.medio?.toLowerCase() === budgetMedioLower;
                    const mappedMedio = medioMap[log.medio];
                    const aiMedioMatch = mappedMedio && mappedMedio.toLowerCase() === budgetMedioLower;
                    const medioMatch = directMedioMatch || aiMedioMatch;

                    if (!medioMatch) return false;

                    // CRITERIA 3: DURATION Check
                    // Allow small variance? Ideally exact, let's say strict for now.
                    if (budgetRow.durationSeconds !== log.duration) return false;

                    // CRITERIA 4: TIME/SEGMENT Check
                    const timeMatch = checkOverlap(budgetRow.schedule, log.timeRange);
                    if (!timeMatch) return false;

                    return true;
                });

                const totalInserted = matches.reduce((sum, row) => sum + row.insertions, 0);
                const uniqueFranjas = Array.from(new Set(matches.map((m) => m.franja).filter(Boolean))).join(', ');
                const uniqueTitles = Array.from(new Set(matches.map((m) => m.originalTitle).filter(Boolean))).join(', ');

                const avgConfidence = matches.length > 0
                    ? matches.reduce((sum, row) => sum + (row.confidence || 0), 0) / matches.length
                    : 0;

                const difference = budgetRow.orderedQuantity - totalInserted;

                let status: ReconciledRow['status'] = 'matched';
                if (totalInserted === 0) status = 'missing';
                else if (difference > 0) status = 'under';
                else if (difference < 0) status = 'over';

                return {
                    ...budgetRow,
                    franja: uniqueFranjas || '-',
                    originalTitle: uniqueTitles || '-',
                    totalInserted,
                    difference,
                    reconciliationConfidence: Math.round(avgConfidence),
                    status
                };
            });

            setReconciledData(reconciled);

            // Persist results
            const stateToSave: StoredSummaryState = {
                reconciledData: reconciled,
                budgetFileName: budgetData.fileName,
                insertionFileName: insertionData.fileName
            };
            localStorage.setItem('summary_reconciliation_data', JSON.stringify(stateToSave));

        } catch (e) {
            console.error('Reconciliation failed', e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const filteredAndSortedData = useMemo(() => {
        if (!reconciledData) return [];
        let data = [...reconciledData];

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            data = data.filter(row =>
                row.medio.toLowerCase().includes(term) ||
                row.program.toLowerCase().includes(term) ||
                row.originalTitle.toLowerCase().includes(term) ||
                row.date.includes(term)
            );
        }

        return data.sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'date':
                    comparison = a.date.localeCompare(b.date);
                    break;
                case 'medio':
                    comparison = a.medio.localeCompare(b.medio);
                    break;
                case 'program':
                    comparison = a.program.localeCompare(b.program);
                    break;
                case 'schedule':
                    comparison = (a.schedule || '').localeCompare(b.schedule || '');
                    break;
                case 'originalTitle':
                    comparison = a.originalTitle.localeCompare(b.originalTitle);
                    break;
                case 'durationSeconds':
                    comparison = (a.durationSeconds || 0) - (b.durationSeconds || 0);
                    break;
                case 'orderedQuantity':
                    comparison = a.orderedQuantity - b.orderedQuantity;
                    break;
                case 'totalInserted':
                    comparison = a.totalInserted - b.totalInserted;
                    break;
                case 'diff':
                    const diffA = (a.totalInserted || 0) - a.orderedQuantity;
                    const diffB = (b.totalInserted || 0) - b.orderedQuantity;
                    comparison = diffA - diffB;
                    break;
                case 'reconciliationConfidence':
                    comparison = a.reconciliationConfidence - b.reconciliationConfidence;
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });

    }, [reconciledData, searchTerm, sortField, sortDirection]);

    const stats = useMemo(() => {
        if (!reconciledData) return null;

        const totalOrdered = reconciledData.reduce((sum, row) => sum + row.orderedQuantity, 0);
        // Use insertionData directly to get the true total of insertions, regardless of matches
        const totalInserted = insertionData?.data?.reduce((sum, row) => sum + (row.insertions || 0), 0) || 0;

        const underDelivered = reconciledData.filter(row => row.status === 'under' || row.status === 'missing').length;
        const overDelivered = reconciledData.filter(row => row.status === 'over').length;
        const missing = reconciledData.filter(row => row.status === 'missing').length;

        const confidenceDistribution = {
            high: reconciledData.filter(row => row.reconciliationConfidence >= 90).length,
            medium: reconciledData.filter(row => row.reconciliationConfidence >= 70 && row.reconciliationConfidence < 90).length,
            low: reconciledData.filter(row => row.reconciliationConfidence < 70).length
        };

        return {
            totalOrdered,
            totalInserted,
            underDelivered,
            overDelivered,
            missing,
            confidenceDistribution
        };
    }, [reconciledData, insertionData]);

    const exportToCSV = () => {
        if (!reconciledData) return;

        const headers = ['Date', 'Medio', 'Program', 'Schedule', 'Original Title', 'Duration', 'Ordered Qty', 'Insertion', 'Diff', 'Confidence'];
        const csvContent = [
            headers.join(','),
            ...filteredAndSortedData.map(row =>
                [
                    row.date,
                    `"${row.medio}"`,
                    `"${row.program}"`,
                    `"${row.schedule || ''}"`,
                    `"${row.originalTitle}"`,
                    row.durationSeconds || 0,
                    row.orderedQuantity,
                    row.totalInserted,
                    (row.totalInserted || 0) - row.orderedQuantity,
                    row.reconciliationConfidence,
                ].join(',')
            )
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'reconciliation_summary.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const SortableHeader = ({ field, children, center }: { field: SortField; children: React.ReactNode; center?: boolean }) => (
        <TableHead
            className="cursor-pointer hover:bg-muted/50 transition-colors bg-card"
            onClick={() => handleSort(field)}
        >
            <div className={`flex items-center gap-2 ${center ? 'justify-center' : ''}`}>
                {children}
                <ArrowUpDown className={`w-4 h-4 ${sortField === field ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
        </TableHead>
    );

    if (!budgetData && !insertionData) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                <FileText className="w-12 h-12 mb-4 opacity-50" />
                <h3 className="text-lg font-medium">No Data Available</h3>
                <p>Please upload files in the Budget and Insertion Log pages first.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Header Area */}
            <div className="grid gap-6 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Budget Source
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-emerald-500" />
                            <span className="font-medium truncate">
                                {budgetData?.fileNames || budgetData?.fileName || 'No file uploaded'}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {budgetData?.data?.length || 0} rows loaded
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Insertion Log Source
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-purple-500" />
                            <span className="font-medium truncate">
                                {insertionData?.fileName || 'No file uploaded'}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {insertionData?.data?.length || 0} rows loaded
                        </p>
                    </CardContent>
                </Card>

                <Card className="flex flex-col justify-center items-center bg-muted/50 border-dashed">
                    <Button
                        size="lg"
                        onClick={reconcileData}
                        disabled={isLoading || !budgetData || !insertionData}
                        className="w-full h-full bg-white hover:bg-white text-primary border-2 border-primary hover:border-primary/80 transition-colors"
                    >
                        {isLoading ? (
                            <span className="animate-pulse flex items-center gap-2">
                                <span className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                                {statusMessage}
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <Play className="w-5 h-5 fill-current" />
                                Reconcile
                            </span>
                        )}
                    </Button>
                </Card>
            </div>

            {/* Summary Metrics Cards */}
            {stats && (
                <div className="grid grid-cols-3 gap-4 w-full">
                    <div className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-xl border border-blue-500/20">
                        <p className="text-sm text-muted-foreground">Total Ordered vs Inserted</p>
                        <div className="flex items-end gap-2 mt-1">
                            <span className="text-2xl font-bold text-blue-600">{stats.totalOrdered}</span>
                            <span className="text-sm text-muted-foreground mb-1">ordered</span>
                            <span className="text-lg font-semibold text-blue-500 mx-1">/</span>
                            <span className="text-2xl font-bold text-blue-600">{stats.totalInserted}</span>
                            <span className="text-sm text-muted-foreground mb-1">inserted</span>
                        </div>
                    </div>
                    <div className="p-4 bg-gradient-to-br from-orange-500/10 to-orange-600/5 rounded-xl border border-orange-500/20">
                        <p className="text-sm text-muted-foreground">Delivery Status</p>
                        <div className="mt-2 space-y-1 text-sm">
                            <div className="flex justify-between">
                                <span>Under Delivered:</span>
                                <span className="font-bold text-orange-600">{stats.underDelivered}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Over Delivered:</span>
                                <span className="font-bold text-blue-600">{stats.overDelivered}</span>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-gradient-to-br from-teal-500/10 to-teal-600/5 rounded-xl border border-teal-500/20">
                        <p className="text-sm text-muted-foreground">Confidence Range</p>
                        <div className="mt-2 space-y-1 text-sm">
                            <div className="flex justify-between">
                                <span>High ({'>'}90%):</span>
                                <span className="font-bold text-green-600">{stats.confidenceDistribution.high}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Medium (70-90%):</span>
                                <span className="font-bold text-yellow-600">{stats.confidenceDistribution.medium}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Low ({'<'}70%):</span>
                                <span className="font-bold text-red-600">{stats.confidenceDistribution.low}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Results Area */}
            {reconciledData && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Search results..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Button variant="outline" onClick={exportToCSV} className="gap-2">
                            <Download className="w-4 h-4" />
                            Export CSV
                        </Button>
                    </div>

                    <div className="rounded-xl border bg-card">
                        <div className="max-h-[600px] overflow-auto">
                            <table className="w-full caption-bottom text-sm">
                                <TableHeader className="sticky top-0 z-20 bg-card shadow-sm">
                                    <TableRow>
                                        <SortableHeader field="date">Date</SortableHeader>
                                        <SortableHeader field="medio">Medio</SortableHeader>
                                        <SortableHeader field="program">Program</SortableHeader>
                                        <SortableHeader field="schedule">Schedule</SortableHeader>
                                        <SortableHeader field="originalTitle">Original Title</SortableHeader>
                                        <SortableHeader field="durationSeconds" center>Duration</SortableHeader>
                                        <SortableHeader field="orderedQuantity" center>Ordered Qty</SortableHeader>
                                        <SortableHeader field="totalInserted" center>Insertion</SortableHeader>
                                        <SortableHeader field="diff" center>Diff</SortableHeader>
                                        <SortableHeader field="reconciliationConfidence" center>Confidence</SortableHeader>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredAndSortedData.map((row, idx) => (
                                        <TableRow key={idx} className="hover:bg-muted/50">
                                            <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                                                {row.date}
                                            </TableCell>
                                            <TableCell className="font-medium text-xs">
                                                {row.medio}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {row.program}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {row.schedule || '-'}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={row.originalTitle}>
                                                {row.originalTitle}
                                            </TableCell>
                                            <TableCell className="text-center text-xs">
                                                {row.durationSeconds || '-'}s
                                            </TableCell>
                                            <TableCell className="text-center font-bold">
                                                {row.orderedQuantity}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <span className={`font-medium ${row.status === 'missing' ? 'text-red-500' : row.status === 'over' ? 'text-blue-500' : row.status === 'under' ? 'text-orange-500' : 'text-green-600'}`}>
                                                    {row.totalInserted}
                                                </span>
                                            </TableCell>
                                            <TableCell className={`text-center font-bold ${(row.totalInserted - row.orderedQuantity) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {row.totalInserted - row.orderedQuantity}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {row.reconciliationConfidence > 0 ? (
                                                    <div className={`
                                                        inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium
                                                        ${row.reconciliationConfidence >= 90 ? 'bg-green-100 text-green-700' :
                                                            row.reconciliationConfidence >= 70 ? 'bg-yellow-100 text-yellow-700' :
                                                                'bg-red-100 text-red-700'}
                                                    `}>
                                                        {row.reconciliationConfidence}%
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
