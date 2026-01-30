'use client';

import { useState, useEffect } from 'react';

export interface AliasMapping {
    input: string;
    output: string;
}

export interface AliasMappings {
    medios: AliasMapping[];
}

const DEFAULT_MEDIO_ALIASES: AliasMapping[] = [
    { input: 'TM', output: 'MEDCOM' },
    { input: 'TVN-2', output: 'TVN' },
    { input: 'TVN 2', output: 'TVN' },
    { input: 'TELEMETRO', output: 'MEDCOM' },
];



export function useAliasMappings() {
    const [medios, setMedios] = useState<AliasMapping[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        // Load from localStorage or set defaults
        const storedMedios = localStorage.getItem('alias_mappings_medios');

        if (storedMedios) {
            setMedios(JSON.parse(storedMedios));
        } else {
            setMedios(DEFAULT_MEDIO_ALIASES);
            localStorage.setItem('alias_mappings_medios', JSON.stringify(DEFAULT_MEDIO_ALIASES));
        }



        setIsLoaded(true);
    }, []);

    const saveMedios = (newMedios: AliasMapping[]) => {
        setMedios(newMedios);
        localStorage.setItem('alias_mappings_medios', JSON.stringify(newMedios));
    };



    const addMedioAlias = (input: string, output: string) => {
        // normalize input
        const normalizedInput = input.trim().toUpperCase();
        const normalizedOutput = output.trim();

        // Remove existing if present to avoid dupes/conflicts
        const filtered = medios.filter(m => m.input !== normalizedInput);
        saveMedios([...filtered, { input: normalizedInput, output: normalizedOutput }]);
    };

    const removeMedioAlias = (input: string) => {
        saveMedios(medios.filter(m => m.input !== input));
    };



    // Helper to get simple object map for API usage
    const getMappingObject = (type: 'medios'): Record<string, string> => {
        const list = medios;
        return list.reduce((acc, curr) => {
            acc[curr.input] = curr.output;
            return acc;
        }, {} as Record<string, string>);
    };

    return {
        medios,
        addMedioAlias,
        removeMedioAlias,
        getMappingObject,
        isLoaded
    };
}
