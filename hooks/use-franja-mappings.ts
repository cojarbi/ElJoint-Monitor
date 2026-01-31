import { useState, useEffect } from 'react';

export interface FranjaMapping {
    label: string; // e.g. "Manana", "Tarde"
    startTime: string; // "06:00"
    endTime: string;   // "11:30"
}

export const DEFAULT_FRANJA_MAPPINGS: FranjaMapping[] = [
    { label: 'Manana', startTime: '6:00 AM', endTime: '11:30 AM' },
    { label: 'Tarde', startTime: '1:00 PM', endTime: '5:00 PM' },
    { label: 'Nocturno', startTime: '6:00 PM', endTime: '10:00 PM' },
    { label: 'Madrugada', startTime: '11:00 PM', endTime: '5:59 AM' },
];

export function useFranjaMappings() {
    const [mappings, setMappings] = useState<FranjaMapping[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem('franja_mappings');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setMappings(parsed);
                } else {
                    // Fallback if stored is empty array (temporary fix for development)
                    console.log("Empty mappings found in storage, restoring defaults.");
                    setMappings(DEFAULT_FRANJA_MAPPINGS);
                    localStorage.setItem('franja_mappings', JSON.stringify(DEFAULT_FRANJA_MAPPINGS));
                }
            } catch (e) {
                console.error("Failed to parse stored franja mappings", e);
                setMappings(DEFAULT_FRANJA_MAPPINGS);
            }
        } else {
            setMappings(DEFAULT_FRANJA_MAPPINGS);
            localStorage.setItem('franja_mappings', JSON.stringify(DEFAULT_FRANJA_MAPPINGS));
        }
        setIsLoaded(true);
    }, []);

    const saveMappings = (newMappings: FranjaMapping[]) => {
        setMappings(newMappings);
        localStorage.setItem('franja_mappings', JSON.stringify(newMappings));
    };

    const updateMapping = (label: string, field: 'startTime' | 'endTime', value: string) => {
        const newMappings = mappings.map(m => {
            if (m.label === label) {
                return { ...m, [field]: value };
            }
            return m;
        });
        saveMappings(newMappings);
    };

    const addMapping = (label: string, startTime: string, endTime: string) => {
        // Prevent duplicates
        if (mappings.some(m => m.label.toLowerCase() === label.toLowerCase())) {
            return;
        }
        const newMappings = [...mappings, { label, startTime, endTime }];
        saveMappings(newMappings);
    };

    const removeMapping = (label: string) => {
        const newMappings = mappings.filter(m => m.label !== label);
        saveMappings(newMappings);
    };

    const resetToDefaults = () => {
        saveMappings(DEFAULT_FRANJA_MAPPINGS);
    };

    return {
        mappings,
        updateMapping,
        addMapping,
        removeMapping,
        resetToDefaults,
        isLoaded
    };
}
