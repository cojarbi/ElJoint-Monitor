'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, Legend, LabelList } from 'recharts';
import { Download, FileText, Calendar, TrendingUp, AlertTriangle, Lightbulb, Loader2 } from 'lucide-react';
import { useState, useRef } from 'react';
import jsPDF from 'jspdf';
import { toPng } from 'html-to-image';

interface AnalysisData {
    executiveSummary: string;
    keyFindings: string[];
    concerns: string[];
    recommendations: string[];
}

interface Stats {
    totalOrdered: number;
    totalInserted: number;
    underDelivered: number;
    overDelivered: number;
    missing: number;
    overflowCount: number;
    nonStandardCount: number;
    confidenceDistribution: { high: number; medium: number; low: number };
    deliveryByMedio: Record<string, { missing: number; under: number; over: number }>;
}

interface AnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    analysis: AnalysisData | null;
    stats: Stats | null;
    dateRange: {
        months: string[];
        days: number[];
    };
    files: {
        budget: string;
        insertion: string;
    };
    generatedAt?: string;
}

// Blue color palette
const COLORS = {
    blue900: '#1e3a8a',
    blue700: '#1d4ed8',
    blue500: '#3b82f6',
    blue300: '#93c5fd',
    blue100: '#dbeafe',
    white: '#ffffff',
};

export function AnalysisModal({
    isOpen,
    onClose,
    analysis,
    stats,
    dateRange,
    files,
    generatedAt,
}: AnalysisModalProps) {
    const [isExporting, setIsExporting] = useState(false);
    const reportRef = useRef<HTMLDivElement>(null);

    const handleExportPdf = async () => {
        if (!reportRef.current) return;

        setIsExporting(true);
        try {
            const element = reportRef.current;
            const textSection = element.querySelector('#analysis-text-section') as HTMLElement;

            const fullDataUrl = await toPng(element, {
                quality: 0.95,
                backgroundColor: '#ffffff',
            });

            const img = new Image();
            img.src = fullDataUrl;
            await new Promise((resolve) => { img.onload = resolve; });

            const fullWidth = img.width;
            const fullHeight = img.height;

            let splitY = fullHeight;

            if (textSection) {
                const elementRect = element.getBoundingClientRect();
                const textRect = textSection.getBoundingClientRect();
                const splitOffset = textRect.top - elementRect.top;
                const scaleFactor = fullHeight / element.scrollHeight;
                splitY = splitOffset * scaleFactor;
            }

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas context not available');

            canvas.width = fullWidth;
            canvas.height = splitY;
            ctx.drawImage(img, 0, 0, fullWidth, splitY, 0, 0, fullWidth, splitY);
            const topImgData = canvas.toDataURL('image/png');

            const bottomHeight = fullHeight - splitY;
            const safeBottomHeight = Math.max(1, bottomHeight);

            canvas.width = fullWidth;
            canvas.height = safeBottomHeight;
            ctx.clearRect(0, 0, fullWidth, safeBottomHeight);

            if (bottomHeight > 0) {
                ctx.drawImage(img, 0, splitY, fullWidth, bottomHeight, 0, 0, fullWidth, bottomHeight);
            }
            const bottomImgData = canvas.toDataURL('image/png');

            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'letter',
            });

            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 10;
            const availableWidth = pageWidth - (margin * 2);
            const availableHeight = pageHeight - (margin * 2);

            const addImageToPage = (imgData: string) => {
                const imgProps = pdf.getImageProperties(imgData);
                if (imgProps.width === 0 || imgProps.height === 0) return;

                const ratio = Math.min(availableWidth / imgProps.width, availableHeight / imgProps.height);
                const w = imgProps.width * ratio;
                const h = imgProps.height * ratio;
                const x = (pageWidth - w) / 2;

                pdf.addImage(imgData, 'PNG', x, margin, w, h);
            };

            addImageToPage(topImgData);

            if (bottomHeight > 0) {
                pdf.addPage();
                addImageToPage(bottomImgData);
            }

            const timestamp = new Date().toISOString().split('T')[0];
            pdf.save(`reconciliation-analysis_${timestamp}.pdf`);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('PDF export failed:', error);
            alert('PDF export failed. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    if (!stats || !analysis) return null;

    const matchedValue =
        stats.totalInserted -
        stats.underDelivered -
        stats.overDelivered -
        stats.missing;

    const deliveryStatusData = [
        { name: 'Matched', value: matchedValue, fill: COLORS.blue900 },
        { name: 'Missing', value: stats.missing, fill: COLORS.blue700 },
        { name: 'Under', value: stats.underDelivered, fill: COLORS.blue500 },
        { name: 'Over', value: stats.overDelivered, fill: COLORS.blue300 },
    ].filter((d) => d.value > 0);

    const medioComparisonData = Object.entries(stats.deliveryByMedio).map(
        ([medio, counts]) => ({
            medio,
            missing: counts.missing,
            under: counts.under,
            over: counts.over,
        }),
    );

    const confidenceData = [
        {
            name: 'High',
            value: stats.confidenceDistribution.high,
            fill: COLORS.blue900,
        },
        {
            name: 'Medium',
            value: stats.confidenceDistribution.medium,
            fill: COLORS.blue500,
        },
        {
            name: 'Low',
            value: stats.confidenceDistribution.low,
            fill: COLORS.blue300,
        },
    ].filter((d) => d.value > 0);

    const chartConfig: ChartConfig = {
        matched: { label: 'Matched', color: COLORS.blue900 },
        missing: { label: 'Missing', color: COLORS.blue700 },
        under: { label: 'Under-delivered', color: COLORS.blue500 },
        over: { label: 'Over-delivered', color: COLORS.blue300 },
    };

    const barChartConfig: ChartConfig = {
        missing: { label: 'Missing', color: COLORS.blue700 },
        under: { label: 'Under', color: COLORS.blue500 },
        over: { label: 'Over', color: COLORS.blue300 },
    };

    const formatDate = (monthStr: string) => {
        const [year, month] = monthStr.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return date.toLocaleString('default', { month: 'short', year: 'numeric' });
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="!max-w-7xl !w-[90vw] max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0">
                <div
                    ref={reportRef}
                    id="analysis-report-content"
                    className="bg-white p-6 w-full max-w-full min-w-0 overflow-x-hidden"
                >
                    {/* Header */}
                    <DialogHeader className="mb-6 min-w-0">
                        <DialogTitle className="text-2xl font-bold flex items-center gap-2 min-w-0">
                            <TrendingUp className="w-6 h-6" />
                            Reconciliation Analysis Report
                        </DialogTitle>
                        <DialogDescription className="text-sm text-muted-foreground">
                            Generated on{' '}
                            {generatedAt
                                ? new Date(generatedAt).toLocaleString()
                                : new Date().toLocaleString()}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Report Info Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 min-w-0">
                        <Card className="bg-neutral-50 border-neutral-200 min-w-0">
                            <CardHeader className="py-2 px-3">
                                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5" />
                                    Report Period
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="px-3 pb-2 min-w-0">
                                <p className="text-sm font-medium">
                                    {dateRange.months.length > 0
                                        ? dateRange.months.map(formatDate).join(', ')
                                        : 'All months'}
                                </p>
                                <p className="text-xs text-neutral-500">
                                    Days:{' '}
                                    {dateRange.days.length === 31
                                        ? 'All days'
                                        : dateRange.days.sort((a, b) => a - b).join(', ')}
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="bg-neutral-50 border-neutral-200 min-w-0">
                            <CardHeader className="py-2 px-3">
                                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                                    <FileText className="w-3.5 h-3.5" />
                                    Source Files
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="px-3 pb-2 min-w-0">
                                <ul className="list-disc list-inside text-xs space-y-1 min-w-0">
                                    <li className="truncate">
                                        <span className="font-semibold">Budget:</span> {files.budget || 'N/A'}
                                    </li>
                                    <li className="truncate">
                                        <span className="font-semibold">Log:</span> {files.insertion || 'N/A'}
                                    </li>
                                </ul>
                            </CardContent>
                        </Card>

                        <Card className="bg-neutral-50 border-neutral-200 min-w-0">
                            <CardHeader className="py-2 px-3">
                                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                                    Summary Stats
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="px-3 pb-2 min-w-0">
                                <div className="grid grid-cols-2 gap-x-4 text-xs min-w-0">
                                    <div>
                                        <span className="font-semibold">{stats.totalOrdered}</span>{' '}
                                        Ordered
                                    </div>
                                    <div>
                                        <span className="font-semibold">{stats.totalInserted}</span>{' '}
                                        Inserted
                                    </div>
                                    <div>
                                        <span className="font-semibold">{stats.overflowCount}</span>{' '}
                                        Overflow
                                    </div>
                                    <div>
                                        <span className="font-semibold">
                                            {stats.nonStandardCount}
                                        </span>{' '}
                                        Non-Std
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Metrics Cards */}
                    {/* Metrics Cards */}
                    <div className="grid grid-cols-4 gap-3 mb-6 min-w-0">
                        <Card className="border-neutral-200 min-w-0">
                            <CardHeader className="py-2 px-3 bg-neutral-100">
                                <CardTitle className="text-xs font-bold text-neutral-600 uppercase">
                                    Total Orders
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="py-4 px-3 text-center min-w-0">
                                <div className="text-3xl font-bold text-neutral-900">
                                    {stats.totalOrdered}
                                </div>
                                <div className="text-xs text-neutral-500 mt-1">
                                    {stats.totalInserted} inserted
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-neutral-200 min-w-0">
                            <CardHeader className="py-2 px-3 bg-neutral-100">
                                <CardTitle className="text-xs font-bold text-neutral-600 uppercase">
                                    Delivery Status
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="py-4 px-3 text-center min-w-0">
                                <div className="flex justify-center gap-2 text-xl font-bold min-w-0">
                                    <span className="text-neutral-900">{stats.missing}</span>
                                    <span className="text-neutral-400">/</span>
                                    <span className="text-neutral-600">
                                        {stats.underDelivered}
                                    </span>
                                    <span className="text-neutral-400">/</span>
                                    <span className="text-neutral-400">{stats.overDelivered}</span>
                                </div>
                                <div className="text-[10px] text-neutral-500 mt-1">
                                    Missing / Under / Over
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-neutral-200 min-w-0">
                            <CardHeader className="py-2 px-3 bg-neutral-100">
                                <CardTitle className="text-xs font-bold text-neutral-600 uppercase">
                                    Confidence
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="py-4 px-3 text-center min-w-0">
                                <div className="flex justify-center gap-2 text-xl font-bold min-w-0">
                                    <span className="text-neutral-900">
                                        {stats.confidenceDistribution.high}
                                    </span>
                                    <span className="text-neutral-400">/</span>
                                    <span className="text-neutral-600">
                                        {stats.confidenceDistribution.medium}
                                    </span>
                                    <span className="text-neutral-400">/</span>
                                    <span className="text-neutral-400">
                                        {stats.confidenceDistribution.low}
                                    </span>
                                </div>
                                <div className="text-[10px] text-neutral-500 mt-1">
                                    High / Med / Low
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-neutral-200 min-w-0">
                            <CardHeader className="py-2 px-3 bg-neutral-100">
                                <CardTitle className="text-xs font-bold text-neutral-600 uppercase">
                                    Unreconciled
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="py-4 px-3 text-center min-w-0">
                                <div className="flex justify-center gap-2 text-xl font-bold min-w-0">
                                    <span className="text-neutral-700">{stats.overflowCount}</span>
                                    <span className="text-neutral-400">/</span>
                                    <span className="text-neutral-500">
                                        {stats.nonStandardCount}
                                    </span>
                                </div>
                                <div className="text-[10px] text-neutral-500 mt-1">
                                    Overflow / Non-Standard
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Charts Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 min-w-0">
                        {/* Delivery Status Horizontal Bar Chart */}
                        <Card className="border-neutral-200 min-w-0">
                            <CardHeader className="py-2 px-3 border-b border-neutral-100">
                                <CardTitle className="text-sm font-semibold text-neutral-700">
                                    Delivery Distribution
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="h-[250px] pt-4 min-w-0 overflow-hidden">
                                <ChartContainer
                                    config={chartConfig}
                                    className="h-full w-full min-w-0 overflow-hidden [&_.recharts-wrapper]:!w-full [&_.recharts-wrapper]:!h-full [&_.recharts-surface]:!overflow-hidden"
                                >
                                    <BarChart
                                        data={deliveryStatusData}
                                        layout="vertical"
                                        margin={{ left: 0, right: 30 }}
                                    >
                                        <CartesianGrid
                                            horizontal={false}
                                            strokeDasharray="3 3"
                                            stroke="#e5e5e5"
                                        />
                                        <XAxis
                                            type="number"
                                            tick={{ fontSize: 10 }}
                                            stroke="#737373"
                                        />
                                        <YAxis
                                            type="category"
                                            dataKey="name"
                                            tick={{ fontSize: 10 }}
                                            width={60}
                                            stroke="#737373"
                                        />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                            {deliveryStatusData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.fill} />
                                            ))}
                                            <LabelList
                                                dataKey="value"
                                                position="right"
                                                className="fill-neutral-600 text-[10px]"
                                            />
                                        </Bar>
                                    </BarChart>
                                </ChartContainer>
                            </CardContent>
                        </Card>

                        {/* Confidence Pie Chart */}
                        <Card className="border-neutral-200 min-w-0">
                            <CardHeader className="py-2 px-3 border-b border-neutral-100">
                                <CardTitle className="text-sm font-semibold text-neutral-700">
                                    Confidence Breakdown
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="h-[250px] pt-2 min-w-0 overflow-hidden">
                                <ChartContainer
                                    config={chartConfig}
                                    className="h-full w-full min-w-0 overflow-hidden [&_.recharts-wrapper]:!w-full [&_.recharts-wrapper]:!h-full [&_.recharts-surface]:!overflow-hidden"
                                >
                                    <PieChart>
                                        <Pie
                                            data={confidenceData}
                                            dataKey="value"
                                            nameKey="name"
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={50}
                                            outerRadius={80}
                                            strokeWidth={2}
                                            stroke="#fff"
                                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                            labelLine={false}
                                        >
                                            {confidenceData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.fill} />
                                            ))}
                                        </Pie>
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                    </PieChart>
                                </ChartContainer>
                            </CardContent>
                        </Card>

                        {/* Medio Stacked Bar Chart - Spans 2 columns if present */}
                        {medioComparisonData.length > 0 && (
                            <Card className="border-neutral-200 min-w-0">
                                <CardHeader className="py-2 px-3 border-b border-neutral-100">
                                    <CardTitle className="text-sm font-semibold text-neutral-700">
                                        Issues by Channel
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="h-[250px] pt-4 min-w-0 overflow-hidden">
                                    <ChartContainer
                                        config={barChartConfig}
                                        className="h-full w-full min-w-0 overflow-hidden [&_.recharts-wrapper]:!w-full [&_.recharts-wrapper]:!h-full [&_.recharts-surface]:!overflow-hidden"
                                    >
                                        <BarChart data={medioComparisonData} margin={{ left: 0, right: 0 }}>
                                            <CartesianGrid
                                                strokeDasharray="3 3"
                                                vertical={false}
                                                stroke="#e5e5e5"
                                            />
                                            <XAxis
                                                dataKey="medio"
                                                tick={{ fontSize: 9 }}
                                                stroke="#737373"
                                                tickFormatter={(v) => String(v).slice(0, 14)}
                                            />
                                            <YAxis tick={{ fontSize: 10 }} stroke="#737373" />
                                            <ChartTooltip content={<ChartTooltipContent />} />
                                            <Bar
                                                dataKey="missing"
                                                stackId="a"
                                                fill={COLORS.blue700}
                                                radius={[0, 0, 0, 0]}
                                                name="Missing"
                                            />
                                            <Bar
                                                dataKey="under"
                                                stackId="a"
                                                fill={COLORS.blue500}
                                                radius={[0, 0, 0, 0]}
                                                name="Under-delivered"
                                            />
                                            <Bar
                                                dataKey="over"
                                                stackId="a"
                                                fill={COLORS.blue300}
                                                radius={[4, 4, 0, 0]}
                                                name="Over-delivered"
                                            />
                                            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                        </BarChart>
                                    </ChartContainer>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* AI Analysis Section */}
                    <div id="analysis-text-section" className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
                        {/* Left Column */}
                        <div className="space-y-4 min-w-0">
                            <Card className="border-l-4 border-l-neutral-900 border-neutral-200 min-w-0">
                                <CardHeader className="py-2 px-3">
                                    <CardTitle className="text-sm font-semibold flex items-center gap-2 text-neutral-800">
                                        <TrendingUp className="w-4 h-4" />
                                        Executive Summary
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="px-3 pb-3 min-w-0">
                                    <p className="text-sm leading-relaxed text-neutral-700">
                                        {analysis.executiveSummary}
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="border-neutral-200 min-w-0">
                                <CardHeader className="py-2 px-3">
                                    <CardTitle className="text-sm font-semibold flex items-center gap-2 text-neutral-800">
                                        <Lightbulb className="w-4 h-4" />
                                        Key Findings
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="px-3 pb-3 min-w-0">
                                    <ul className="list-disc list-inside space-y-1 min-w-0">
                                        {analysis.keyFindings.map((finding, idx) => (
                                            <li key={idx} className="text-sm text-neutral-700">
                                                {finding}
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Right Column */}
                        <div className="space-y-4 min-w-0">
                            {analysis.concerns.length > 0 && (
                                <Card className="border-l-4 border-l-neutral-500 border-neutral-200 min-w-0">
                                    <CardHeader className="py-2 px-3">
                                        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-neutral-800">
                                            <AlertTriangle className="w-4 h-4" />
                                            Areas of Concern
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="px-3 pb-3 min-w-0">
                                        <ul className="list-disc list-inside space-y-1 min-w-0">
                                            {analysis.concerns.map((concern, idx) => (
                                                <li key={idx} className="text-sm text-neutral-600">
                                                    {concern}
                                                </li>
                                            ))}
                                        </ul>
                                    </CardContent>
                                </Card>
                            )}

                            {analysis.recommendations.length > 0 && (
                                <Card className="border-l-4 border-l-neutral-400 border-neutral-200 min-w-0">
                                    <CardHeader className="py-2 px-3">
                                        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-neutral-800">
                                            <Lightbulb className="w-4 h-4" />
                                            Recommendations
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="px-3 pb-3 min-w-0">
                                        <ul className="list-disc list-inside space-y-1 min-w-0">
                                            {analysis.recommendations.map((rec, idx) => (
                                                <li key={idx} className="text-sm text-neutral-600">
                                                    {rec}
                                                </li>
                                            ))}
                                        </ul>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <DialogFooter className="mt-4 border-t pt-4">
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                    <Button
                        onClick={handleExportPdf}
                        disabled={isExporting}
                        className="bg-neutral-900 hover:bg-neutral-800 text-white"
                    >
                        {isExporting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Exporting...
                            </>
                        ) : (
                            <>
                                <Download className="w-4 h-4 mr-2" />
                                Download PDF
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}