'use client';

import { useState, useEffect } from 'react';

export interface AliasMapping {
    input: string;
    output: string;
}

export interface AliasMappings {
    medios: AliasMapping[];
    programs: AliasMapping[];
}

const DEFAULT_MEDIO_ALIASES: AliasMapping[] = [
    { input: 'TM', output: 'MEDCOM' },
    { input: 'TVN-2', output: 'TVN' },
    { input: 'TVN 2', output: 'TVN' },
    { input: 'TELEMETRO', output: 'MEDCOM' },
];

const DEFAULT_PROGRAM_ALIASES: AliasMapping[] = [
    { input: 'NOTICIAS', output: 'Noticiero' },
    { input: 'NOVELAS', output: 'Novela' },
    { input: 'DRAMATIZADOS', output: 'Novela' },
];

export function useAliasMappings() {
    const [medios, setMedios] = useState<AliasMapping[]>([]);
    const [programs, setPrograms] = useState<AliasMapping[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        // Load from localStorage or set defaults
        const storedMedios = localStorage.getItem('alias_mappings_medios');
        const storedPrograms = localStorage.getItem('alias_mappings_programs');

        if (storedMedios) {
            setMedios(JSON.parse(storedMedios));
        } else {
            setMedios(DEFAULT_MEDIO_ALIASES);
            localStorage.setItem('alias_mappings_medios', JSON.stringify(DEFAULT_MEDIO_ALIASES));
        }

        if (storedPrograms) {
            setPrograms(JSON.parse(storedPrograms));
        } else {
            setPrograms(DEFAULT_PROGRAM_ALIASES);
            localStorage.setItem('alias_mappings_programs', JSON.stringify(DEFAULT_PROGRAM_ALIASES));
        }

        setIsLoaded(true);
    }, []);

    const saveMedios = (newMedios: AliasMapping[]) => {
        setMedios(newMedios);
        localStorage.setItem('alias_mappings_medios', JSON.stringify(newMedios));
    };

    const savePrograms = (newPrograms: AliasMapping[]) => {
        setPrograms(newPrograms);
        localStorage.setItem('alias_mappings_programs', JSON.stringify(newPrograms));
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

    const addProgramAlias = (input: string, output: string) => {
        // normalize input
        const normalizedInput = input.trim().toUpperCase();
        const normalizedOutput = output.trim();

        const filtered = programs.filter(m => m.input !== normalizedInput);
        savePrograms([...filtered, { input: normalizedInput, output: normalizedOutput }]);
    };

    const removeProgramAlias = (input: string) => {
        savePrograms(programs.filter(m => m.input !== input));
    };

    // Helper to get simple object map for API usage
    const getMappingObject = (type: 'medios' | 'programs'): Record<string, string> => {
        const list = type === 'medios' ? medios : programs;
        return list.reduce((acc, curr) => {
            acc[curr.input] = curr.output;
            return acc;
        }, {} as Record<string, string>);
    };

    return {
        medios,
        programs,
        addMedioAlias,
        removeMedioAlias,
        addProgramAlias,
        removeProgramAlias,
        getMappingObject,
        isLoaded
    };
}
