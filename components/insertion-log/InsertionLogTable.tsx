'use client';

import { useState, useMemo } from 'react';
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Search, ArrowUpDown } from 'lucide-react';
import type { InsertionLogRow, InsertionLogSummary } from './InsertionLogUploader';

interface InsertionLogTableProps {
    data: InsertionLogRow[];
    summary: InsertionLogSummary;
}

type SortField = 'date' | 'medio' | 'mappedProgram' | 'originalTitle' | 'insertions' | 'duration' | 'confidence';
type SortDirection = 'asc' | 'desc';

export function InsertionLogTable({ data, summary }: InsertionLogTableProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    const filteredAndSortedData = useMemo(() => {
        let filtered = data;

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = data.filter(row =>
                row.date.includes(term) ||
                row.medio.toLowerCase().includes(term) ||
                row.mappedProgram.toLowerCase().includes(term) ||
                row.originalTitle.toLowerCase().includes(term) ||
                row.genre.toLowerCase().includes(term) ||
                row.franja.toLowerCase().includes(term)
            );
        }

        return [...filtered].sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'date':
                    comparison = a.date.localeCompare(b.date);
                    break;
                case 'medio':
                    comparison = a.medio.localeCompare(b.medio);
                    break;
                case 'mappedProgram':
                    comparison = a.mappedProgram.localeCompare(b.mappedProgram);
                    break;
                case 'originalTitle':
                    comparison = a.originalTitle.localeCompare(b.originalTitle);
                    break;
                case 'insertions':
                    comparison = a.insertions - b.insertions;
                    break;
                case 'duration':
                    comparison = a.duration - b.duration;
                    break;
                case 'confidence':
                    comparison = (a.confidence || 0) - (b.confidence || 0);
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }, [data, searchTerm, sortField, sortDirection]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const exportToCSV = () => {
        const headers = ['Date', 'Medio', 'Mapped Program', 'Original Title', 'Genre', 'Franja', 'Duration', 'Insertions'];
        const csvContent = [
            headers.join(','),
            ...filteredAndSortedData.map(row =>
                [row.date, `"${row.medio}"`, `"${row.mappedProgram}"`, `"${row.originalTitle}"`, `"${row.genre}"`, `"${row.franja}"`, row.duration, row.insertions].join(',')
            )
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'insertion_log_mapped.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
        <TableHead
            className="cursor-pointer hover:bg-muted/50 transition-colors bg-background"
            onClick={() => handleSort(field)}
        >
            <div className="flex items-center gap-2">
                {children}
                <ArrowUpDown className={`w-4 h-4 ${sortField === field ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
        </TableHead>
    );

    // Get top programs by insertions
    const topPrograms = useMemo(() => {
        return Object.entries(summary.insertionsByProgram)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
    }, [summary.insertionsByProgram]);

    return (
        <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-xl border border-blue-500/20">
                    <p className="text-sm text-muted-foreground">Total Rows</p>
                    <p className="text-2xl font-bold text-blue-600">{summary.totalRows}</p>
                </div>

                <div className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 rounded-xl border border-green-500/20">
                    <p className="text-sm text-muted-foreground">Insertions by Medio</p>
                    <div className="mt-1 space-y-1">
                        {summary.medios.map(medio => (
                            <div key={medio} className="flex justify-between items-center">
                                <span className="text-sm font-medium">{medio}</span>
                                <span className="text-sm font-bold text-green-600">{summary.insertionsByMedio[medio] || 0}</span>
                            </div>
                        ))}
                        <div className="flex justify-between items-center pt-1 border-t border-green-500/20">
                            <span className="text-sm font-semibold">Total</span>
                            <span className="text-lg font-bold text-green-600">{summary.totalInsertions}</span>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-gradient-to-br from-purple-500/10 to-purple-600/5 rounded-xl border border-purple-500/20">
                    <p className="text-sm text-muted-foreground">Top Mapped Programs</p>
                    <div className="mt-1 space-y-1">
                        {topPrograms.map(([program, count]) => (
                            <div key={program} className="flex justify-between items-center">
                                <span className="text-xs font-medium truncate max-w-[120px]">{program}</span>
                                <span className="text-xs font-bold text-purple-600">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-4 bg-gradient-to-br from-orange-500/10 to-orange-600/5 rounded-xl border border-orange-500/20">
                    <p className="text-sm text-muted-foreground">Date Range</p>
                    <p className="text-lg font-bold text-orange-600">
                        {summary.dateRange ? `${summary.dateRange.from} to ${summary.dateRange.to}` : 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        {summary.programs} unique program categories
                    </p>
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by date, medio, program, title..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <Button onClick={exportToCSV} variant="outline" className="gap-2">
                    <Download className="w-4 h-4" />
                    Export CSV
                </Button>
            </div>

            {/* Results count */}
            <p className="text-sm text-muted-foreground">
                Showing {filteredAndSortedData.length} of {data.length} rows
            </p>

            {/* Table */}
            <div className="rounded-xl border overflow-hidden">
                <div className="max-h-[500px] overflow-auto">
                    <table className="w-full caption-bottom text-sm">
                        <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
                            <TableRow className="hover:bg-background">
                                <SortableHeader field="date">Date</SortableHeader>
                                <SortableHeader field="medio">Medio</SortableHeader>
                                <SortableHeader field="mappedProgram">Mapped Program</SortableHeader>
                                <SortableHeader field="originalTitle">Original Title</SortableHeader>
                                <TableHead>Genre</TableHead>
                                <TableHead>Franja</TableHead>
                                <SortableHeader field="duration">Duration</SortableHeader>
                                <SortableHeader field="insertions">Insertions</SortableHeader>
                                <SortableHeader field="confidence">AI Confidence</SortableHeader>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredAndSortedData.length > 0 ? (
                                filteredAndSortedData.map((row, index) => (
                                    <TableRow key={`${row.date}-${row.medio}-${row.originalTitle}-${index}`}>
                                        <TableCell className="font-mono">{row.date}</TableCell>
                                        <TableCell>
                                            <span className="px-2 py-1 bg-primary/10 text-primary rounded-md text-sm font-medium">
                                                {row.medio}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="px-2 py-1 bg-purple-500/10 text-purple-600 rounded-md text-sm font-medium">
                                                {row.mappedProgram}
                                            </span>
                                        </TableCell>
                                        <TableCell className="max-w-[200px] truncate">{row.originalTitle}</TableCell>
                                        <TableCell className="text-muted-foreground text-sm">{row.genre}</TableCell>
                                        <TableCell className="text-muted-foreground text-sm">{row.franja}</TableCell>
                                        <TableCell>{row.duration}s</TableCell>
                                        <TableCell className="font-semibold">{row.insertions}</TableCell>
                                        <TableCell>
                                            <div className={`
                                                inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold
                                                ${(row.confidence || 0) >= 90 ? 'bg-green-100 text-green-700' :
                                                    (row.confidence || 0) >= 70 ? 'bg-yellow-100 text-yellow-700' :
                                                        'bg-red-100 text-red-700'}
                                            `}>
                                                {row.confidence || 0}%
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        No results found
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </table>
                </div>
            </div>
            {/* Confidence Summary Table */}
            {summary.confidenceDistribution && Object.keys(summary.confidenceDistribution).length > 0 && (
                <div className="mt-8 mb-4">
                    <h3 className="text-lg font-semibold mb-2 text-slate-700">AI Confidence Report</h3>
                    <div className="bg-white rounded-lg border shadow-sm p-4 w-full md:w-1/2">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left py-2 text-slate-500">Match Confidence</th>
                                    <th className="text-right py-2 text-slate-500">Records</th>
                                    <th className="text-right py-2 text-slate-500">% of Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(summary.confidenceDistribution)
                                    .sort((a, b) => b[0].localeCompare(a[0])) // Sort high to low labels roughly
                                    .map(([label, count]) => (
                                        <tr key={label} className="border-b last:border-0 hover:bg-slate-50">
                                            <td className="py-2 font-medium text-slate-700">{label}</td>
                                            <td className="py-2 text-right text-slate-600">{count}</td>
                                            <td className="py-2 text-right text-slate-400">
                                                {((count / summary.totalRows) * 100).toFixed(1)}%
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
