import fs from 'node:fs';
import { PDFParse } from 'pdf-parse';

export interface ExtractedPart {
    manufacturer: string;
    model: string;
    pnc: string;
    universalAcrossPnc: boolean;
    section: string;
    position: string;
    name: string;
    alternativeNames: string[];
    partNumber: string;
    page: number;
    notes: string;
}

export interface CatalogExtraction {
    manufacturer: string;
    models: string[];
    pncs: string[];
    parts: ExtractedPart[];
}

export interface CatalogHints {
    manufacturer?: string | null;
    model?: string | null;
    pnc?: string | null;
}

export interface DeterministicExtraction {
    extraction: CatalogExtraction;
    method: 'HUSQVARNA_IPL_TEXT';
}

const PART_NUMBER_PATTERN = '(\\d{3}[\\s\\u00a0]+\\d{2}[\\s\\u00a0]+\\d{2}-\\d{2})';
const HUSQVARNA_ROW = new RegExp(`^(\\d{1,3})\\s+${PART_NUMBER_PATTERN}\\s+(.+?)\\s+([A-Z])\\s+(\\d+)(?:\\s+(.+))?$`, 'i');
const GENERIC_PART_ROW = new RegExp(`^(\\d{1,3})\\s+${PART_NUMBER_PATTERN}\\s+(.+?)\\s+(\\d+)(?:\\s+(.+))?$`, 'i');
const PAGE_MARKER = /--\s+(\d+)\s+of\s+\d+\s+--/g;

function clean(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function compactModel(value: string): string {
    return value.replace(/\s+/g, '');
}

function normalizedLine(value: string): string {
    return value.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

function isPartsHeader(value: string): boolean {
    const line = normalizedLine(value).toLowerCase();
    const hasPosition = /\bpos(?:ition)?\.?\b/.test(line);
    const hasPartNumber = /\bpart\s*(?:nr|no|number)\.?\b/.test(line);
    return hasPosition && hasPartNumber;
}

function cleanPartNumber(value: string): string {
    return normalizedLine(value);
}

function textPages(text: string): Array<{ page: number; text: string }> {
    const pages: Array<{ page: number; text: string }> = [];
    let cursor = 0;
    let match: RegExpExecArray | null;

    PAGE_MARKER.lastIndex = 0;
    while ((match = PAGE_MARKER.exec(text)) !== null) {
        pages.push({
            page: Number(match[1]),
            text: text.slice(cursor, match.index).trim(),
        });
        cursor = PAGE_MARKER.lastIndex;
    }

    return pages.filter((page) => Number.isInteger(page.page) && page.page > 0);
}

function sectionFromLines(lines: string[], lastRowIndex: number, fallback: string): string {
    for (let index = lines.length - 1; index > lastRowIndex; index -= 1) {
        const candidate = clean(lines[index]);
        if (candidate && !isPartsHeader(candidate)) {
            return candidate;
        }
    }

    return fallback;
}

export function parseHusqvarnaIplText(text: string, hints: CatalogHints = {}): CatalogExtraction | null {
    if (!text.split(/\r?\n/).some(isPartsHeader)) {
        return null;
    }

    const headerModel = text.match(/IPL,\s*([^,\n]+),\s*\d{4}-\d{2}/i)?.[1] || '';
    const model = clean(hints.model) || compactModel(clean(headerModel));
    if (!model) return null;

    const manufacturer = clean(hints.manufacturer) || 'Husqvarna';
    const pnc = clean(hints.pnc);
    const parts: ExtractedPart[] = [];

    for (const page of textPages(text)) {
        const lines = page.text.split(/\r?\n/).map(normalizedLine).filter(Boolean);
        if (!lines.some(isPartsHeader)) continue;

        const rows: Array<{
            index: number;
            position: string;
            partNumber: string;
            name: string;
            sectionCode: string;
            quantity: string;
            includedInKit: string;
        }> = [];

        lines.forEach((line, index) => {
            const fullMatch = HUSQVARNA_ROW.exec(line);
            const genericMatch = fullMatch ? null : GENERIC_PART_ROW.exec(line);
            const match = fullMatch || genericMatch;
            if (!match) return;
            const hasSectionCode = Boolean(fullMatch);
            rows.push({
                index,
                position: match[1],
                partNumber: cleanPartNumber(match[2]),
                name: match[3],
                sectionCode: hasSectionCode ? match[4].toUpperCase() : '',
                quantity: hasSectionCode ? match[5] : match[4],
                includedInKit: clean(hasSectionCode ? match[6] : match[5]),
            });
        });

        if (!rows.length) continue;
        const section = sectionFromLines(lines, rows[rows.length - 1].index, rows[0].sectionCode || 'Peças');

        for (const row of rows) {
            const notes = [
                `Quantidade: ${row.quantity}`,
                row.includedInKit ? `Incluída no kit: ${row.includedInKit}` : '',
                row.sectionCode ? `Seção do catálogo: ${row.sectionCode}` : '',
            ].filter(Boolean).join('. ');

            parts.push({
                manufacturer,
                model,
                pnc,
                universalAcrossPnc: !pnc,
                section,
                position: row.position,
                name: row.name,
                alternativeNames: [],
                partNumber: row.partNumber,
                page: page.page,
                notes,
            });
        }
    }

    // Evita aceitar por engano um PDF que apenas contenha uma tabela semelhante.
    if (parts.length < 10) return null;

    return {
        manufacturer,
        models: [model],
        pncs: pnc ? [pnc] : [],
        parts,
    };
}

export async function extractCatalogDeterministically(
    filePath: string,
    hints: CatalogHints = {},
): Promise<DeterministicExtraction | null> {
    const parser = new PDFParse({ data: fs.readFileSync(filePath) });

    try {
        const result = await parser.getText();
        const extraction = parseHusqvarnaIplText(result.text, hints);
        return extraction ? { extraction, method: 'HUSQVARNA_IPL_TEXT' } : null;
    } finally {
        await parser.destroy();
    }
}
