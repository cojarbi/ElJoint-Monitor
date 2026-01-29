'use client';

import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface FileUploadZoneProps {
    label: string;
    description?: string;
    accept?: string;
    onFileSelect: (file: File | null) => void;
    selectedFile: File | null;
}

export function FileUploadZone({
    label,
    description,
    accept = '.xls,.xlsx',
    onFileSelect,
    selectedFile
}: FileUploadZoneProps) {
    const [isDragOver, setIsDragOver] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const validateFile = (file: File): boolean => {
        const validExtensions = accept.split(',').map(ext => ext.trim().toLowerCase());
        const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

        if (!validExtensions.includes(fileExtension)) {
            setError(`Invalid file type. Please upload ${accept} files only.`);
            return false;
        }

        // Max 10MB
        if (file.size > 10 * 1024 * 1024) {
            setError('File size must be less than 10MB');
            return false;
        }

        setError(null);
        return true;
    };

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        const file = e.dataTransfer.files[0];
        if (file && validateFile(file)) {
            onFileSelect(file);
        }
    }, [onFileSelect]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && validateFile(file)) {
            onFileSelect(file);
        }
    };

    const handleRemove = () => {
        onFileSelect(null);
        setError(null);
    };

    return (
        <Card className={`transition-all duration-200 ${isDragOver ? 'border-primary bg-primary/5' : ''}`}>
            <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-primary" />
                    {label}
                </CardTitle>
                {description && (
                    <CardDescription>{description}</CardDescription>
                )}
            </CardHeader>
            <CardContent>
                {selectedFile ? (
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                        <div className="flex items-center gap-3">
                            <FileSpreadsheet className="h-8 w-8 text-green-600" />
                            <div>
                                <p className="font-medium text-sm">{selectedFile.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    {(selectedFile.size / 1024).toFixed(1)} KB
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleRemove}
                            className="h-8 w-8"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                ) : (
                    <div
                        className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
              transition-colors duration-200 
              ${isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
            `}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => document.getElementById(`file-input-${label}`)?.click()}
                    >
                        <input
                            id={`file-input-${label}`}
                            type="file"
                            accept={accept}
                            onChange={handleFileChange}
                            className="hidden"
                        />
                        <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                        <p className="text-sm font-medium">
                            Drop file here or click to browse
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Supports {accept}
                        </p>
                    </div>
                )}

                {error && (
                    <div className="flex items-center gap-2 mt-3 text-destructive text-sm">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default FileUploadZone;
