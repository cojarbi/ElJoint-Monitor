'use client';

import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface BudgetUploaderProps {
    onUploadComplete: (data: NormalizedRow[], summary: BudgetSummary, fileNames: string) => void;
    onUploadError: (error: string) => void;
}

export interface NormalizedRow {
    date: string;
    medio: string;
    program: string;
    orderedQuantity: number;
    durationSeconds: number;
    confidence: number;
}

export interface BudgetSummary {
    totalRows: number;
    medios: string[];
    programs: number;
    dateRange: { from: string; to: string } | null;
    confidenceDistribution?: Record<string, number>;
}

export function BudgetUploader({ onUploadComplete, onUploadError }: BudgetUploaderProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, filename: '' });
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

    const validateFile = (file: File): boolean => {
        const validExtensions = ['.xls', '.xlsx'];
        const fileName = file.name.toLowerCase();
        return validExtensions.some(ext => fileName.endsWith(ext));
    };

    const processFiles = async (files: File[]) => {
        setIsProcessing(true);
        const allData: NormalizedRow[] = [];
        const errors: string[] = [];
        const processedFiles: string[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setProgress({ current: i + 1, total: files.length, filename: file.name });

            if (!validateFile(file)) {
                errors.push(`${file.name}: Invalid file type`);
                continue;
            }

            try {
                const formData = new FormData();
                formData.append('file', file);

                const response = await fetch('/api/normalize-budget', {
                    method: 'POST',
                    body: formData,
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Failed to process file');
                }

                if (result.data) {
                    allData.push(...result.data);
                    processedFiles.push(file.name);
                }
            } catch (error) {
                console.error(`Error processing ${file.name}:`, error);
                errors.push(`${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        setIsProcessing(false);
        setProgress({ current: 0, total: 0, filename: '' });
        setSelectedFiles([]);

        if (allData.length > 0) {
            // Recalculate summary based on all data
            const uniqueMedios = [...new Set(allData.map(r => r.medio))];
            const uniquePrograms = [...new Set(allData.map(r => r.program))];
            const dates = allData.map(r => r.date).sort();

            // Recalculate confidence distribution
            const confidenceDist: Record<string, number> = {};
            allData.forEach(r => {
                const bucket = r.confidence >= 90 ? '90-100%' :
                    r.confidence >= 70 ? '70-89%' :
                        r.confidence >= 50 ? '50-69%' : 'Low (<50%)';
                confidenceDist[bucket] = (confidenceDist[bucket] || 0) + 1;
            });

            const combinedSummary: BudgetSummary = {
                totalRows: allData.length,
                medios: uniqueMedios,
                programs: uniquePrograms.length,
                dateRange: dates.length > 0 ? { from: dates[0], to: dates[dates.length - 1] } : null,
                confidenceDistribution: confidenceDist
            };

            onUploadComplete(allData, combinedSummary, processedFiles.join(', '));
        }

        if (errors.length > 0) {
            onUploadError(`Errors occurred: ${errors.join('; ')}`);
        }
    };

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            processFiles(files);
        }
    }, []);

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            processFiles(Array.from(files));
        }
    };

    return (
        <div className="w-full">
            <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`
          relative border-2 border-dashed rounded-xl p-8
          transition-all duration-200 ease-in-out
          ${isDragging
                        ? 'border-primary bg-primary/5 scale-[1.02]'
                        : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
                    }
          ${isProcessing ? 'pointer-events-none opacity-90' : 'cursor-pointer'}
        `}
            >
                <input
                    type="file"
                    accept=".xls,.xlsx"
                    multiple // Allow multiple files
                    onChange={handleFileSelect}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isProcessing}
                />

                <div className="flex flex-col items-center justify-center gap-4">
                    {isProcessing ? (
                        <div className="w-full max-w-xs space-y-4">
                            <div className="flex items-center justify-center gap-3">
                                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                                <div className="text-center">
                                    <p className="font-medium">Processing File {progress.current} of {progress.total}</p>
                                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">{progress.filename}</p>
                                </div>
                            </div>
                            <Progress value={(progress.current / progress.total) * 100} className="h-2" />
                        </div>
                    ) : (
                        <>
                            <div className="p-4 bg-primary/10 rounded-full">
                                {isDragging ? (
                                    <Upload className="w-8 h-8 text-primary animate-bounce" />
                                ) : (
                                    <FileSpreadsheet className="w-8 h-8 text-primary" />
                                )}
                            </div>
                            <div className="text-center space-y-1">
                                <p className="text-lg font-medium">
                                    {isDragging ? 'Drop files now' : 'Drop budget files here'}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    or click to browse (.xls, .xlsx)
                                </p>
                                <p className="text-xs text-primary/70 font-medium pt-2">
                                    Supports multiple files
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
