'use client';

import { useState, useMemo } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Search, ArrowUpDown } from 'lucide-react';
import type { NormalizedRow, Summary } from './BudgetUploader';

interface BudgetResultsTableProps {
    data: NormalizedRow[];
    summary: Summary;
}

type SortField = 'date' | 'medio' | 'program' | 'orderedQuantity';
type SortDirection = 'asc' | 'desc';

export function BudgetResultsTable({ data, summary }: BudgetResultsTableProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    // Calculate spots per medio
    const spotsByMedio = useMemo(() => {
        const spots: Record<string, number> = {};
        data.forEach(row => {
            spots[row.medio] = (spots[row.medio] || 0) + row.orderedQuantity;
        });
        return spots;
    }, [data]);

    const totalSpots = useMemo(() => {
        return Object.values(spotsByMedio).reduce((sum, val) => sum + val, 0);
    }, [spotsByMedio]);

    const filteredAndSortedData = useMemo(() => {
        let filtered = data;

        // Apply search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = data.filter(row =>
                row.date.includes(term) ||
                row.medio.toLowerCase().includes(term) ||
                row.program.toLowerCase().includes(term) ||
                row.orderedQuantity.toString().includes(term)
            );
        }

        // Apply sorting
        return [...filtered].sort((a, b) => {
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
                case 'orderedQuantity':
                    comparison = a.orderedQuantity - b.orderedQuantity;
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
        const headers = ['Date', 'Medio', 'Program', 'Ordered Quantity'];
        const csvContent = [
            headers.join(','),
            ...filteredAndSortedData.map(row =>
                [row.date, `"${row.medio}"`, `"${row.program}"`, row.orderedQuantity].join(',')
            )
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'normalized_budget.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const SortableHeader = ({ field, children, center }: { field: SortField; children: React.ReactNode; center?: boolean }) => (
        <TableHead
            className="cursor-pointer hover:bg-muted/50 transition-colors bg-background"
            onClick={() => handleSort(field)}
        >
            <div className={`flex items-center gap-2 ${center ? 'justify-center' : ''}`}>
                {children}
                <ArrowUpDown className={`w-4 h-4 ${sortField === field ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
        </TableHead>
    );

    return (
        <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-xl border border-blue-500/20">
                    <p className="text-sm text-muted-foreground">Total Rows</p>
                    <p className="text-2xl font-bold text-blue-600">{summary.totalRows}</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 rounded-xl border border-green-500/20">
                    <p className="text-sm text-muted-foreground">Medios</p>
                    <div className="mt-1 space-y-1">
                        {summary.medios.map(medio => (
                            <div key={medio} className="flex justify-between items-center">
                                <span className="text-sm font-medium">{medio}</span>
                                <span className="text-sm font-bold text-green-600">{spotsByMedio[medio] || 0}</span>
                            </div>
                        ))}
                        <div className="flex justify-between items-center pt-1 border-t border-green-500/20">
                            <span className="text-sm font-semibold">Total</span>
                            <span className="text-lg font-bold text-green-600">{totalSpots}</span>
                        </div>
                    </div>
                </div>
                <div className="p-4 bg-gradient-to-br from-purple-500/10 to-purple-600/5 rounded-xl border border-purple-500/20">
                    <p className="text-sm text-muted-foreground">Programs</p>
                    <p className="text-2xl font-bold text-purple-600">{summary.programs}</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-orange-500/10 to-orange-600/5 rounded-xl border border-orange-500/20">
                    <p className="text-sm text-muted-foreground">Date Range</p>
                    <p className="text-lg font-bold text-orange-600">
                        {summary.dateRange ? `${summary.dateRange.from} to ${summary.dateRange.to}` : 'N/A'}
                    </p>
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by date, medio, program..."
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
                    <Table>
                        <TableHeader className="sticky top-0 bg-background z-10">
                            <TableRow>
                                <SortableHeader field="date">Date</SortableHeader>
                                <SortableHeader field="medio">Medio</SortableHeader>
                                <SortableHeader field="program">Program</SortableHeader>
                                <SortableHeader field="orderedQuantity">Ordered Qty</SortableHeader>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredAndSortedData.length > 0 ? (
                                filteredAndSortedData.map((row, index) => (
                                    <TableRow key={`${row.date}-${row.medio}-${row.program}-${index}`}>
                                        <TableCell className="font-mono">{row.date}</TableCell>
                                        <TableCell>
                                            <span className="px-2 py-1 bg-primary/10 text-primary rounded-md text-sm font-medium">
                                                {row.medio}
                                            </span>
                                        </TableCell>
                                        <TableCell>{row.program}</TableCell>
                                        <TableCell className="font-semibold">{row.orderedQuantity}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                        No results found
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
}
