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

const HUSQVARNA_ROW = /^(\d+)\s+\t(\d{3}\s+\d{2}\s+\d{2}-\d{2})\s+\t(.+?)\s+\t([A-Z])\s+\t(\d+)(?:\s+\t(.+))?$/;
const PAGE_MARKER = /--\s+(\d+)\s+of\s+\d+\s+--/g;

function clean(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function compactModel(value: string): string {
    return value.replace(/\s+/g, '');
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
        if (candidate && !candidate.startsWith('Pos. Nr.')) {
            return candidate;
        }
    }

    return fallback;
}

export function parseHusqvarnaIplText(text: string, hints: CatalogHints = {}): CatalogExtraction | null {
    if (!text.includes('Pos. Nr.') || !text.includes('Part nr.') || !text.includes('Qty (on this page)')) {
        return null;
    }

    const headerModel = text.match(/IPL,\s*([^,\n]+),\s*\d{4}-\d{2}/i)?.[1] || '';
    const model = clean(hints.model) || compactModel(clean(headerModel));
    if (!model) return null;

    const manufacturer = clean(hints.manufacturer) || 'Husqvarna';
    const pnc = clean(hints.pnc);
    const parts: ExtractedPart[] = [];

    for (const page of textPages(text)) {
        const lines = page.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        if (!lines.some((line) => line.startsWith('Pos. Nr.'))) continue;

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
            const match = HUSQVARNA_ROW.exec(line);
            if (!match) return;
            rows.push({
                index,
                position: match[1],
                partNumber: match[2],
                name: match[3],
                sectionCode: match[4],
                quantity: match[5],
                includedInKit: clean(match[6]),
            });
        });

        if (!rows.length) continue;
        const section = sectionFromLines(lines, rows[rows.length - 1].index, rows[0].sectionCode);

        for (const row of rows) {
            const notes = [
                `Quantidade: ${row.quantity}`,
                row.includedInKit ? `Incluída no kit: ${row.includedInKit}` : '',
                `Seção do catálogo: ${row.sectionCode}`,
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
