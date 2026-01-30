import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

/**
 * Schema definition for AI response validation
 */
export interface AIResponseSchema {
    requiredKeys?: string[];
    allowedKeys?: string[];
    keyValidators?: Record<string, (value: unknown) => boolean>;
    arraySchema?: {
        requiredKeys?: string[];
        keyValidators?: Record<string, (value: unknown) => boolean>;
    };
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * Clean AI response text by removing markdown code blocks
 */
export function cleanAIResponseText(text: string): string {
    return text
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
}

/**
 * Validate an object against a schema
 */
export function validateAgainstSchema(obj: unknown, schema: AIResponseSchema): ValidationResult {
    const errors: string[] = [];

    if (obj === null || obj === undefined) {
        return { valid: false, errors: ['Response is null or undefined'] };
    }

    // Handle array validation
    if (Array.isArray(obj)) {
        if (schema.arraySchema) {
            obj.forEach((item, index) => {
                const itemResult = validateAgainstSchema(item, {
                    requiredKeys: schema.arraySchema!.requiredKeys,
                    keyValidators: schema.arraySchema!.keyValidators,
                });
                if (!itemResult.valid) {
                    errors.push(`Array item ${index}: ${itemResult.errors.join(', ')}`);
                }
            });
        }
        return { valid: errors.length === 0, errors };
    }

    // Must be an object for further validation
    if (typeof obj !== 'object') {
        return { valid: false, errors: ['Response is not an object'] };
    }

    const objRecord = obj as Record<string, unknown>;
    const objKeys = Object.keys(objRecord);

    // Check required keys
    if (schema.requiredKeys) {
        for (const key of schema.requiredKeys) {
            if (!(key in objRecord)) {
                errors.push(`Missing required key: ${key}`);
            }
        }
    }

    // Check for extra keys (if allowedKeys specified)
    if (schema.allowedKeys) {
        for (const key of objKeys) {
            if (!schema.allowedKeys.includes(key)) {
                errors.push(`Unexpected key: ${key}`);
            }
        }
    }

    // Run custom validators
    if (schema.keyValidators) {
        for (const [key, validator] of Object.entries(schema.keyValidators)) {
            if (key in objRecord) {
                if (!validator(objRecord[key])) {
                    errors.push(`Invalid value for key: ${key}`);
                }
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Parse and validate AI response with optional retry
 */
export function parseAIResponse<T>(
    text: string,
    schema?: AIResponseSchema
): { success: true; data: T } | { success: false; error: string } {
    try {
        const cleaned = cleanAIResponseText(text);
        const parsed = JSON.parse(cleaned);

        if (schema) {
            const validation = validateAgainstSchema(parsed, schema);
            if (!validation.valid) {
                return {
                    success: false,
                    error: `Schema validation failed: ${validation.errors.join('; ')}`
                };
            }
        }

        return { success: true, data: parsed as T };
    } catch (e) {
        return {
            success: false,
            error: `JSON parse failed: ${e instanceof Error ? e.message : 'Unknown error'}`
        };
    }
}

/**
 * Execute an AI call with retry logic on parse/validation failure
 */
export async function withAIRetry<T>(
    model: GenerativeModel,
    initialPrompt: string,
    schema?: AIResponseSchema,
    maxRetries: number = 1
): Promise<{ success: true; data: T } | { success: false; error: string }> {
    let lastError = '';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            let prompt = initialPrompt;

            // On retry, add error context
            if (attempt > 0 && lastError) {
                prompt = `${initialPrompt}\n\nIMPORTANT: Your previous response failed validation with error: "${lastError}". Please fix the issue and return valid JSON only.`;
            }

            const result = await model.generateContent(prompt);
            const text = result.response.text();

            const parseResult = parseAIResponse<T>(text, schema);

            if (parseResult.success) {
                return parseResult;
            }

            lastError = parseResult.error;
            console.warn(`AI response validation failed (attempt ${attempt + 1}/${maxRetries + 1}):`, lastError);

        } catch (e) {
            lastError = e instanceof Error ? e.message : 'Unknown error';
            console.error(`AI call failed (attempt ${attempt + 1}/${maxRetries + 1}):`, lastError);
        }
    }

    return { success: false, error: `All ${maxRetries + 1} attempts failed. Last error: ${lastError}` };
}

/**
 * Generate stable IDs for a list of items
 */
export function generateStableIds<T>(items: T[], prefix: string = 'id'): Array<T & { id: string }> {
    return items.map((item, index) => ({
        ...item,
        id: `${prefix}${index}`
    }));
}

/**
 * Create a lookup map from ID-tagged items
 */
export function createIdLookup<T extends { id: string }>(items: T[]): Map<string, T> {
    const map = new Map<string, T>();
    for (const item of items) {
        map.set(item.id, item);
    }
    return map;
}
