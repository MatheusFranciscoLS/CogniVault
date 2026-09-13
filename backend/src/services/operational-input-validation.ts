import { normalizeIdentifier } from '../utils/normalize';

// Mantém analytics operacionais alinhados aos limites de código/ID do restante da API.
export const MAX_OPERATIONAL_PART_CODE_LENGTH = 80;
export const MAX_OPERATIONAL_PART_ID_LENGTH = 100;

export interface QuoteUsageInput {
    partNumber: string;
    normalizedPartNumber: string;
    model: string | null;
}

export function parseOperationalText(value: unknown, maxLength: number): string | null {
    if (typeof value !== 'string') return null;
    const clean = value.trim();
    if (!clean || clean.length > maxLength) return null;
    return clean;
}

export function parseOptionalOperationalText(
    value: unknown,
    maxLength: number,
): { valid: boolean; value: string } {
    if (value === undefined || value === null || value === '') {
        return { valid: true, value: '' };
    }
    if (typeof value !== 'string') return { valid: false, value: '' };

    const clean = value.trim();
    if (clean.length > maxLength) return { valid: false, value: '' };
    return { valid: true, value: clean };
}

export function parseOperationalPartCode(value: unknown): string | null {
    if (typeof value !== 'string') return null;

    const raw = value.trim();
    if (!raw || raw.length > MAX_OPERATIONAL_PART_CODE_LENGTH) return null;

    const partNumber = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!partNumber || partNumber.length > MAX_OPERATIONAL_PART_CODE_LENGTH) return null;
    return partNumber;
}

export function parseOptionalOperationalPartId(value: unknown): { valid: boolean; value: string } {
    if (value === undefined || value === null || value === '') {
        return { valid: true, value: '' };
    }
    if (typeof value !== 'string') return { valid: false, value: '' };

    const clean = value.trim();
    if (!clean || clean.length > MAX_OPERATIONAL_PART_ID_LENGTH) {
        return { valid: false, value: '' };
    }
    return { valid: true, value: clean };
}

export function parseQuoteUsageItems(value: unknown): QuoteUsageInput[] | null {
    if (!Array.isArray(value)) return [];

    const items: QuoteUsageInput[] = [];
    for (const raw of value.slice(0, 60)) {
        if (!raw || typeof raw !== 'object') return null;
        const input = raw as { partNumber?: unknown; model?: unknown };
        const partNumber = parseOperationalPartCode(input.partNumber);
        if (!partNumber) return null;

        const normalizedPartNumber = normalizeIdentifier(partNumber);
        if (!normalizedPartNumber) return null;

        const parsedModel = parseOptionalOperationalText(input.model, 160);
        if (!parsedModel.valid) return null;

        items.push({
            partNumber,
            normalizedPartNumber,
            model: parsedModel.value || null,
        });
    }

    return items;
}
