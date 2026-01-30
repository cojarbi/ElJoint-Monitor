'use client';

import { useState, useEffect } from 'react';

export const AI_MODELS = {
    FLASH: 'gemini-3-flash-preview',
    PRO: 'gemini-3-pro-preview',
} as const;

export type AiModel = typeof AI_MODELS[keyof typeof AI_MODELS];

export function useAiModel() {
    const [model, setModel] = useState<AiModel>(AI_MODELS.FLASH);
    const [isLoaded, setIsLoaded] = useState(false);


    const [enableFallback, setEnableFallbackState] = useState(true);

    useEffect(() => {
        const storedModel = localStorage.getItem('ai_model_preference');
        if (storedModel && Object.values(AI_MODELS).includes(storedModel as AiModel)) {
            setModel(storedModel as AiModel);
        }

        const storedFallback = localStorage.getItem('ai_enable_fallback');
        if (storedFallback !== null) {
            setEnableFallbackState(storedFallback === 'true');
        }

        setIsLoaded(true);
    }, []);

    const setModelPreference = (newModel: AiModel) => {
        setModel(newModel);
        localStorage.setItem('ai_model_preference', newModel);
    };

    const setEnableFallback = (enabled: boolean) => {
        setEnableFallbackState(enabled);
        localStorage.setItem('ai_enable_fallback', String(enabled));
    };

    return {
        model,
        setModel: setModelPreference,
        enableFallback,
        setEnableFallback,
        isLoaded
    };
}
