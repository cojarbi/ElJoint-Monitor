'use client';

import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAiModel } from '@/hooks/use-ai-settings';

interface InsertionLogUploaderProps {
    onUploadComplete: (data: InsertionLogRow[], summary: InsertionLogSummary, fileName: string) => void;
    onUploadError: (error: string) => void;
}

export interface InsertionLogRow {
    date: string;
    medio: string;
    mappedProgram: string;
    originalTitle: string;
    genre: string;
    franja: string;
    duration: number;
    insertions: number;
    confidence: number;
}

export interface InsertionLogSummary {
    totalRows: number;
    totalInsertions: number;
    insertionsByMedio: Record<string, number>;
    insertionsByProgram: Record<string, number>;
    medios: string[];
    programs: number;
    dateRange: { from: string; to: string } | null;
    confidenceDistribution?: Record<string, number>;
}

export function InsertionLogUploader({ onUploadComplete, onUploadError }: InsertionLogUploaderProps) {
    const { model, enableFallback } = useAiModel();
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const validateFile = (file: File): boolean => {
        const validExtensions = ['.xls', '.xlsx'];
        const fileName = file.name.toLowerCase();
        return validExtensions.some(ext => fileName.endsWith(ext));
    };

    const handleUpload = useCallback(async (file: File) => {
        if (!validateFile(file)) {
            onUploadError('Please upload a valid Excel file (.xls or .xlsx)');
            return;
        }

        setSelectedFile(file);
        setIsLoading(true);

        // ... inside handleUpload

        // ...
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('modelName', model);
            formData.append('enableFallback', String(enableFallback));

            const response = await fetch('/api/parse-insertion-log', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to process file');
            }

            onUploadComplete(result.data, result.summary, file.name);
        } catch (error) {
            onUploadError(error instanceof Error ? error.message : 'Unknown error occurred');
            setSelectedFile(null);
        } finally {
            setIsLoading(false);
        }
    }, [onUploadComplete, onUploadError]);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleUpload(files[0]);
        }
    }, [handleUpload]);

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
            handleUpload(files[0]);
        }
    };

    const clearFile = () => {
        setSelectedFile(null);
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
          ${isLoading ? 'pointer-events-none opacity-60' : 'cursor-pointer'}
        `}
            >
                <input
                    type="file"
                    accept=".xls,.xlsx"
                    onChange={handleFileSelect}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isLoading}
                />

                <div className="flex flex-col items-center justify-center gap-4">
                    {isLoading ? (
                        <>
                            <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                            <div className="text-center">
                                <p className="text-lg font-medium">Processing...</p>
                                <p className="text-sm text-muted-foreground">Parsing insertion log and applying fuzzy mapping</p>
                            </div>
                        </>
                    ) : selectedFile ? (
                        <>
                            <div className="flex items-center gap-3 px-4 py-3 bg-primary/10 rounded-lg">
                                <FileSpreadsheet className="w-8 h-8 text-primary" />
                                <div>
                                    <p className="font-medium">{selectedFile.name}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {(selectedFile.size / 1024).toFixed(1)} KB
                                    </p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="ml-2 h-8 w-8"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        clearFile();
                                    }}
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="p-4 bg-primary/10 rounded-full">
                                <Upload className="w-8 h-8 text-primary" />
                            </div>
                            <div className="text-center">
                                <p className="text-lg font-medium">
                                    Drop your insertion log file here
                                </p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    or click to browse (.xls, .xlsx)
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
