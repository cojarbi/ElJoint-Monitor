'use client';

import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PipelineStage =
    | 'idle'
    | 'parsing_plan'
    | 'parsing_execution'
    | 'matching'
    | 'generating_insights'
    | 'complete'
    | 'error';

interface PipelineProgressProps {
    currentStage: PipelineStage;
    error?: string | null;
}

const stages = [
    { id: 'parsing_plan', label: 'Parse Plan', shortLabel: 'Plan' },
    { id: 'parsing_execution', label: 'Parse Execution', shortLabel: 'Execution' },
    { id: 'matching', label: 'Match & Compare', shortLabel: 'Match' },
    { id: 'generating_insights', label: 'Generate Insights', shortLabel: 'Insights' },
];

function getStageStatus(stageId: string, currentStage: PipelineStage): 'pending' | 'active' | 'complete' | 'error' {
    const stageOrder = stages.map(s => s.id);
    const currentIndex = stageOrder.indexOf(currentStage);
    const stageIndex = stageOrder.indexOf(stageId);

    if (currentStage === 'error') {
        if (stageIndex <= currentIndex || currentIndex === -1) {
            return stageIndex === currentIndex ? 'error' : 'complete';
        }
        return 'pending';
    }

    if (currentStage === 'complete') {
        return 'complete';
    }

    if (stageIndex < currentIndex) {
        return 'complete';
    }
    if (stageIndex === currentIndex) {
        return 'active';
    }
    return 'pending';
}

export function PipelineProgress({ currentStage, error }: PipelineProgressProps) {
    if (currentStage === 'idle') {
        return null;
    }

    return (
        <div className="w-full py-4">
            <div className="flex items-center justify-center gap-2 sm:gap-4">
                {stages.map((stage, index) => {
                    const status = getStageStatus(stage.id, currentStage);

                    return (
                        <div key={stage.id} className="flex items-center">
                            {/* Stage Pill */}
                            <div
                                className={cn(
                                    'flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all duration-300',
                                    status === 'pending' && 'bg-muted text-muted-foreground',
                                    status === 'active' && 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 animate-pulse',
                                    status === 'complete' && 'bg-green-500/20 text-green-600 dark:text-green-400',
                                    status === 'error' && 'bg-destructive/20 text-destructive'
                                )}
                            >
                                {/* Icon */}
                                {status === 'pending' && (
                                    <Circle className="h-4 w-4" />
                                )}
                                {status === 'active' && (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                )}
                                {status === 'complete' && (
                                    <CheckCircle2 className="h-4 w-4" />
                                )}
                                {status === 'error' && (
                                    <span className="h-4 w-4 flex items-center justify-center">!</span>
                                )}

                                {/* Label */}
                                <span className="hidden sm:inline">{stage.label}</span>
                                <span className="sm:hidden">{stage.shortLabel}</span>
                            </div>

                            {/* Connector Line */}
                            {index < stages.length - 1 && (
                                <div
                                    className={cn(
                                        'w-4 sm:w-8 h-0.5 mx-1 transition-all duration-300',
                                        status === 'complete' ? 'bg-green-500' : 'bg-muted'
                                    )}
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Success indicator */}
            {currentStage === 'complete' && (
                <div className="mt-3 text-center text-sm text-green-600 dark:text-green-400 font-medium">
                    ✓ Analysis complete
                </div>
            )}
        </div>
    );
}

export default PipelineProgress;
