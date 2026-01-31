'use client';

import * as React from 'react';

interface MonthYearFilterProps {
    selectedMonths: string[];
    onChange: (months: string[]) => void;
}

export function MonthYearFilter({ selectedMonths, onChange }: MonthYearFilterProps) {
    return (
        <div className="border p-2 rounded text-xs bg-muted">
            Filter Placeholder (Imports Cleared)
            <button
                className="mt-2 text-blue-500 underline"
                onClick={() => onChange([])}
            >
                Clear Filter
            </button>
        </div>
    );
}
