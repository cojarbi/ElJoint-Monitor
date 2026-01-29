'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MetricValue {
    value: number;
    label: string;
    status?: 'excellent' | 'good' | 'warning' | 'critical' | 'info';
}

interface MetricsCardProps {
    metric: MetricValue;
    format?: 'percentage' | 'number';
    size?: 'sm' | 'md' | 'lg';
}

const statusColors = {
    excellent: 'text-green-600 bg-green-50 border-green-200',
    good: 'text-green-600 bg-green-50 border-green-200',
    warning: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    critical: 'text-red-600 bg-red-50 border-red-200',
    info: 'text-blue-600 bg-blue-50 border-blue-200',
};

const statusIcons = {
    excellent: '🟢',
    good: '🟢',
    warning: '🟡',
    critical: '🔴',
    info: '🔵',
};

export function MetricsCard({ metric, format = 'number', size = 'md' }: MetricsCardProps) {
    const status = metric.status || 'info';

    const textSizes = {
        sm: 'text-2xl',
        md: 'text-3xl',
        lg: 'text-4xl',
    };

    return (
        <Card className={cn('border', statusColors[status])}>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <span>{statusIcons[status]}</span>
                    {metric.label}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className={cn('font-bold', textSizes[size])}>
                    {format === 'percentage'
                        ? `${metric.value.toFixed(1)}%`
                        : metric.value.toLocaleString()}
                </div>
            </CardContent>
        </Card>
    );
}

export function MetricsGrid({ metrics }: { metrics: Record<string, MetricValue> }) {
    const mainMetrics = ['delivery_rate', 'total_planned', 'total_aired', 'matched'];
    const secondaryMetrics = ['over_delivered', 'under_delivered', 'program_accuracy', 'duration_accuracy'];

    return (
        <div className="space-y-4">
            {/* Main metrics row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {mainMetrics.map(key => {
                    const metric = metrics[key];
                    if (!metric) return null;
                    return (
                        <MetricsCard
                            key={key}
                            metric={metric}
                            format={key.includes('rate') || key.includes('accuracy') ? 'percentage' : 'number'}
                        />
                    );
                })}
            </div>

            {/* Secondary metrics row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {secondaryMetrics.map(key => {
                    const metric = metrics[key];
                    if (!metric) return null;
                    return (
                        <MetricsCard
                            key={key}
                            metric={metric}
                            format={key.includes('rate') || key.includes('accuracy') ? 'percentage' : 'number'}
                            size="sm"
                        />
                    );
                })}
            </div>
        </div>
    );
}

export default MetricsCard;
