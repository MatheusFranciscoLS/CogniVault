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
    filename?: string | null;
}

export interface DeterministicExtraction {
    extraction: CatalogExtraction;
    method: 'HUSQVARNA_IPL_TEXT';
}

const SPACED_PART_NUMBER_PATTERN = '\\d{3}[\\s\\u00a0]+\\d{2}[\\s\\u00a0]+\\d{2}-\\d{2}';
const CONTIGUOUS_PART_NUMBER_PATTERN = '\\d{8,12}';
const PART_NUMBER_PATTERN = `(?:${SPACED_PART_NUMBER_PATTERN}|${CONTIGUOUS_PART_NUMBER_PATTERN})`;
const HUSQVARNA_ROW = new RegExp(`^(\\d{1,3})\\s+(${SPACED_PART_NUMBER_PATTERN})\\s+(.+?)\\s+([A-Z])\\s+(\\d+)(?:\\s+(.+))?$`, 'i');
const GENERIC_PART_ROW = new RegExp(`^(\\d{1,3})\\s+(${SPACED_PART_NUMBER_PATTERN})\\s+(.+?)\\s+(\\d+)(?:\\s+(.+))?$`, 'i');
const FLEXIBLE_ROW_START = new RegExp(`^(\\d{1,3})\\s+(${PART_NUMBER_PATTERN})\\s*(.*)$`, 'i');
const LEGACY_PAGE_MARKER = /--\s+(\d+)\s+of\s+\d+\s+--/g;
const PORTAL_PAGE_MARKER = /https?:\/\/[^\n]*?\s(\d{1,4})\/(\d{1,4})\s*$/gm;
const PNC_PATTERN = /\b(?:\d{11}|\d{9})\b/g;

function clean(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function compactModel(value: string): string {
    return value.replace(/\s+/g, '');
}

function normalizedLine(value: string): string {
    return value
        .replace(/\u00a0/g, ' ')
        .replace(/[\u00ad\ufffe\ufffd]/g, '-')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

function isPartsHeader(value: string): boolean {
    const line = normalizedLine(value).toLowerCase();
    const hasPosition = /\bpos(?:ition)?\.?\b/.test(line) || /\bkey\s+part\b/.test(line);
    const hasPartNumber = /\bpart\s*(?:nr|no|number)\.?\b/.test(line) || /\bn[uú]mero\s+do\s+artigo\b/.test(line);
    return hasPosition && hasPartNumber;
}

function hasCatalogSignature(text: string): boolean {
    return /\bIPL,\s*/i.test(text)
        || /ILLUSTRATED\s+PARTS\s+LIST/i.test(text)
        || /HUSQVARNA\s+PORTAL/i.test(text)
        || /HUSQVARNA.+MODEL\s+NUMBER/i.test(text);
}

function cleanPartNumber(value: string): string {
    return normalizedLine(value);
}

function unique(values: string[]): string[] {
    return [...new Set(values.map(clean).filter(Boolean))];
}

function legacyTextPages(text: string): Array<{ page: number; text: string }> {
    const pages: Array<{ page: number; text: string }> = [];
    let cursor = 0;
    let match: RegExpExecArray | null;

    LEGACY_PAGE_MARKER.lastIndex = 0;
    while ((match = LEGACY_PAGE_MARKER.exec(text)) !== null) {
        pages.push({
            page: Number(match[1]),
            text: text.slice(cursor, match.index).trim(),
        });
        cursor = LEGACY_PAGE_MARKER.lastIndex;
    }

    return pages.filter((page) => Number.isInteger(page.page) && page.page > 0);
}

function portalTextPages(text: string): Array<{ page: number; text: string }> {
    const pages: Array<{ page: number; text: string }> = [];
    let cursor = 0;
    let match: RegExpExecArray | null;

    PORTAL_PAGE_MARKER.lastIndex = 0;
    while ((match = PORTAL_PAGE_MARKER.exec(text)) !== null) {
        pages.push({
            page: Number(match[1]),
            text: text.slice(cursor, match.index).trim(),
        });
        cursor = PORTAL_PAGE_MARKER.lastIndex;
    }

    return pages.filter((page) => Number.isInteger(page.page) && page.page > 0);
}

function textPages(text: string): Array<{ page: number; text: string }> {
    const portalPages = portalTextPages(text);
    if (portalPages.length) return portalPages;

    const legacyPages = legacyTextPages(text);
    if (legacyPages.length) return legacyPages;

    return [{ page: 1, text: text.trim() }];
}

function sectionFromLines(lines: string[], lastRowIndex: number, fallback: string): string {
    for (let index = lines.length - 1; index > lastRowIndex; index -= 1) {
        const candidate = clean(lines[index]);
        if (candidate && !isPartsHeader(candidate) && !isNoiseLine(candidate)) {
            return candidate;
        }
    }

    return fallback;
}

function isNoiseLine(value: string): boolean {
    const line = normalizedLine(value);
    if (!line) return true;
    if (/^https?:\/\//i.test(line)) return true;
    if (/Husqvarna\s+Portal\s+BR/i.test(line)) return true;
    if (/^\d{1,2}\/\d{1,2}\/\d{4},?\s+\d{1,2}:\d{2}/.test(line)) return true;
    if (/^(?:Refer[eê]|ncia$|N[uú]mero do$|artigo$|Nome do artigo|Quanti$|dade$|Coment[aá]rio$)/i.test(line)) return true;
    if (/^(?:KEY\s+PART|NO\.\s+NO\.\s+DESCRIPTION)/i.test(line)) return true;
    return isPartsHeader(line);
}

function hasQuantityColumn(lines: string[]): boolean {
    const joined = lines.join(' ').toLowerCase();
    return /\bqty\b|\bquantity\b|quanti\s*dade/.test(joined);
}

function filenameModel(filename: string): string {
    const base = filename.replace(/\.pdf$/i, '').replace(/\s+/g, ' ').trim();
    const afterBrand = base.match(/Husqvarna\s+(.+)$/i)?.[1];
    return clean(afterBrand || '');
}

function detectModel(text: string, hints: CatalogHints): string {
    const hinted = clean(hints.model);
    if (hinted) return hinted;

    const iplModel = text.match(/IPL,\s*([^,\n]+),\s*\d{4}-\d{2}/i)?.[1];
    if (iplModel) return compactModel(clean(iplModel));

    const modelNumber = text.match(/MODEL\s+NUMBER\s*:?\s*([A-Z0-9][A-Z0-9 .®_-]*?)(?=\s*\(|\s+MFG\.|\r?\n|$)/i)?.[1];
    if (modelNumber) return clean(modelNumber);

    const productLine = text.match(/^\s*([A-Z0-9]{1,8}(?:\s+[A-Z0-9®.-]{1,10}){0,2})\s+(?:LAWN\s+MOWER|CHAIN\s+SAW|CHAINSAW|TRACTOR|BLOWER|TRIMMER|BRUSHCUTTER|ENGINE|SPRAYER|POLE\s+SAW|HEDGE\s+TRIMMER)\b/im)?.[1];
    if (productLine) return clean(productLine);

    return filenameModel(clean(hints.filename));
}

function detectManufacturer(_text: string, hints: CatalogHints): string {
    return clean(hints.manufacturer) || 'Husqvarna';
}

function collectPncs(text: string, hints: CatalogHints): string[] {
    const values: string[] = [];
    const hinted = clean(hints.pnc);
    if (hinted) values.push(hinted);

    for (const match of text.matchAll(/MFG\.\s*ID\.\s*NUMBER\s*:?\s*(\d{11}|\d{9})\b/gi)) {
        values.push(match[1]);
    }
    for (const match of text.matchAll(/(?:PNC|PRODUCT\s+(?:NO|NUMBER|NUMBER\s+CODE))\s*:?\s*(\d{11}|\d{9})\b/gi)) {
        values.push(match[1]);
    }
    for (const match of text.matchAll(/\bFor(?:\s+all\s+EXCEPT)?\s+([^\n.]+)/gi)) {
        values.push(...(match[1].match(PNC_PATTERN) || []));
    }

    return unique(values);
}

function applicationForBlock(blockText: string, knownPncs: string[], hintedPnc: string): { pncs: string[]; universal: boolean } {
    const exceptMatch = blockText.match(/\bFor\s+all\s+EXCEPT\s+([^\n.]+)/i);
    if (exceptMatch) {
        const excluded = new Set(exceptMatch[1].match(PNC_PATTERN) || []);
        const allowed = knownPncs.filter((pnc) => !excluded.has(pnc));
        return { pncs: unique(allowed), universal: false };
    }

    const directMatch = blockText.match(/\bFor\s+([^\n.]+)/i);
    if (directMatch) {
        const direct = unique(directMatch[1].match(PNC_PATTERN) || []);
        if (direct.length) return { pncs: direct, universal: false };
    }

    if (hintedPnc) return { pncs: [hintedPnc], universal: false };
    if (knownPncs.length) return { pncs: knownPncs, universal: false };
    return { pncs: [], universal: true };
}

function splitInlineQuantity(value: string): { description: string; quantity: string; trailing: string } | null {
    const match = normalizedLine(value).match(/^(.*\S)\s+(\d{1,3})(?:\s+(.+))?$/);
    if (!match) return null;
    return {
        description: clean(match[1]),
        quantity: match[2],
        trailing: clean(match[3]),
    };
}

function parseFlexibleBlock(lines: string[], expectsQuantity: boolean): { name: string; quantity: string; comments: string } {
    if (!expectsQuantity) {
        return {
            name: normalizedLine(lines.filter((line) => !isNoiseLine(line)).join(' ')),
            quantity: '',
            comments: '',
        };
    }

    const description: string[] = [];
    const comments: string[] = [];
    let quantity = '';
    let afterQuantity = false;

    for (const raw of lines) {
        const line = normalizedLine(raw);
        if (!line || isNoiseLine(line)) continue;

        if (afterQuantity) {
            comments.push(line);
            continue;
        }

        const quantityOnly = line.match(/^(\d{1,3})(?:\s+(.+))?$/);
        if (quantityOnly) {
            quantity = quantityOnly[1];
            if (quantityOnly[2]) comments.push(quantityOnly[2]);
            afterQuantity = true;
            continue;
        }

        const inline = splitInlineQuantity(line);
        if (inline) {
            if (inline.description) description.push(inline.description);
            quantity = inline.quantity;
            if (inline.trailing) comments.push(inline.trailing);
            afterQuantity = true;
            continue;
        }

        description.push(line);
    }

    return {
        name: normalizedLine(description.join(' ')),
        quantity,
        comments: normalizedLine(comments.join(' ')),
    };
}

type ParsedRow = {
    position: string;
    partNumber: string;
    name: string;
    quantity: string;
    comments: string;
    sectionCode: string;
};

function parseLegacyPage(lines: string[]): { rows: ParsedRow[]; section: string } | null {
    if (!lines.some(isPartsHeader)) return null;

    const rows: Array<ParsedRow & { index: number }> = [];
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
            name: clean(match[3]),
            sectionCode: hasSectionCode ? match[4].toUpperCase() : '',
            quantity: hasSectionCode ? match[5] : match[4],
            comments: clean(hasSectionCode ? match[6] : match[5]),
        });
    });

    if (!rows.length) return null;
    const section = sectionFromLines(lines, rows[rows.length - 1].index, rows[0].sectionCode || 'Peças');
    return { rows, section };
}

function parseFlexiblePage(lines: string[]): { rows: ParsedRow[]; section: string } | null {
    const starts: Array<{ index: number; position: string; partNumber: string; remainder: string }> = [];
    lines.forEach((line, index) => {
        const match = FLEXIBLE_ROW_START.exec(line);
        if (!match) return;
        starts.push({
            index,
            position: match[1],
            partNumber: cleanPartNumber(match[2]),
            remainder: clean(match[3]),
        });
    });

    if (!starts.length) return null;
    const expectsQuantity = hasQuantityColumn(lines);
    const rows: ParsedRow[] = [];
    for (let index = 0; index < starts.length; index += 1) {
        const current = starts[index];
        const nextIndex = starts[index + 1]?.index ?? lines.length;
        const block = [current.remainder, ...lines.slice(current.index + 1, nextIndex)];
        const parsed = parseFlexibleBlock(block, expectsQuantity);
        if (!parsed.name) continue;
        rows.push({
            position: current.position,
            partNumber: current.partNumber,
            name: parsed.name,
            quantity: parsed.quantity,
            comments: parsed.comments,
            sectionCode: '',
        });
    }

    return rows.length ? { rows, section: 'Peças' } : null;
}

export function parseHusqvarnaIplText(text: string, hints: CatalogHints = {}): CatalogExtraction | null {
    if (!hasCatalogSignature(text)) return null;

    const model = detectModel(text, hints);
    const manufacturer = detectManufacturer(text, hints);
    if (!model || !manufacturer) return null;

    const hintedPnc = clean(hints.pnc);
    const knownPncs = collectPncs(text, hints);
    const parts: ExtractedPart[] = [];

    for (const page of textPages(text)) {
        const lines = page.text.split(/\r?\n/).map(normalizedLine).filter(Boolean);
        const parsedPage = parseLegacyPage(lines) || parseFlexiblePage(lines);
        if (!parsedPage) continue;

        for (const row of parsedPage.rows) {
            const application = applicationForBlock(row.comments, knownPncs, hintedPnc);
            const notes = [
                row.quantity ? `Quantidade: ${row.quantity}` : '',
                row.comments,
                row.sectionCode ? `Seção do catálogo: ${row.sectionCode}` : '',
            ].filter(Boolean).join('. ');

            if (application.pncs.length) {
                for (const pnc of application.pncs) {
                    parts.push({
                        manufacturer,
                        model,
                        pnc,
                        universalAcrossPnc: false,
                        section: parsedPage.section,
                        position: row.position,
                        name: row.name,
                        alternativeNames: [],
                        partNumber: row.partNumber,
                        page: page.page,
                        notes,
                    });
                }
            } else {
                parts.push({
                    manufacturer,
                    model,
                    pnc: '',
                    universalAcrossPnc: application.universal,
                    section: parsedPage.section,
                    position: row.position,
                    name: row.name,
                    alternativeNames: [],
                    partNumber: row.partNumber,
                    page: page.page,
                    notes,
                });
            }
        }
    }

    const deduped = [...new Map(parts.map((part) => [
        [part.model, part.pnc, part.page, part.section, part.position, part.partNumber].join('|'),
        part,
    ])).values()];
    const sourceOccurrences = new Set(deduped.map((part) => [part.page, part.position, part.partNumber].join('|'))).size;

    if (sourceOccurrences < 10) return null;

    return {
        manufacturer,
        models: [model],
        pncs: knownPncs,
        parts: deduped,
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
