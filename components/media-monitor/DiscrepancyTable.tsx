'use client';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '../ui/badge';

interface Discrepancy {
    type: string;
    severity: string;
    channel: string;
    program: string;
    expected: string | null;
    actual: string | null;
    explanation: string;
}

interface DiscrepancyTableProps {
    discrepancies: Discrepancy[];
}

const severityColors: Record<string, string> = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    low: 'bg-blue-100 text-blue-800 border-blue-200',
};

const typeLabels: Record<string, string> = {
    missing_spot: 'Missing',
    extra_spot: 'Extra',
    wrong_program: 'Wrong Program',
    wrong_duration: 'Wrong Duration',
    wrong_channel: 'Wrong Channel',
    wrong_date: 'Wrong Date',
};

export function DiscrepancyTable({ discrepancies }: DiscrepancyTableProps) {
    if (!discrepancies || discrepancies.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                No discrepancies found. All spots matched correctly! 🎉
            </div>
        );
    }

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[120px]">Type</TableHead>
                        <TableHead className="w-[80px]">Severity</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Program</TableHead>
                        <TableHead>Expected</TableHead>
                        <TableHead>Actual</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {discrepancies.map((discrepancy, index) => (
                        <TableRow key={index}>
                            <TableCell>
                                <Badge variant="outline" className="font-medium">
                                    {typeLabels[discrepancy.type] || discrepancy.type}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <Badge className={severityColors[discrepancy.severity] || ''}>
                                    {discrepancy.severity}
                                </Badge>
                            </TableCell>
                            <TableCell className="font-medium">{discrepancy.channel}</TableCell>
                            <TableCell>{discrepancy.program}</TableCell>
                            <TableCell className="text-muted-foreground">
                                {discrepancy.expected || '-'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                                {discrepancy.actual || '-'}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

export default DiscrepancyTable;
