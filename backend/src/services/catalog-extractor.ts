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

const HUSQVARNA_ROW = /^(\d+)\s+([\d\s-]{10,15})\s+(.+?)\s+([A-Z0-9]{1,3})\s+(\d+)(?:\s+(.+))?$/i;
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
    // 1. Tenta descobrir o modelo pelo texto ou usa o que o usuário digitou
    const headerModel = text.match(/IPL,\s*([^,\n]+),\s*\d{4}-\d{2}/i)?.[1] || '';
    const model = clean(hints.model) || compactModel(clean(headerModel)) || 'Modelo-Generico';
    const manufacturer = clean(hints.manufacturer) || 'Husqvarna';
    const pnc = clean(hints.pnc);
    const parts: ExtractedPart[] = [];

    // 2. Transforma o PDF inteiro em linhas (ignorando sebras de página bagunçadas)
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    // 3. O Regex Força-Bruta: Posição | PartNumber | Descrição | Seção | Qtd
    // \s+ captura espaços ou TABs. Funciona para qualquer formatação!
    const ROW_REGEX = /^(\d{1,4})\s+([\d\s-]{10,15})\s+(.+?)\s+([A-Z0-9]{1,4})\s+(\d+)(?:\s+(.+))?$/i;

    let lastSection = 'A'; // Seção padrão de fallback

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = ROW_REGEX.exec(line);

        if (match) {
            const position = match[1];
            const partNumber = match[2].trim();
            const name = match[3].trim();
            const sectionCode = match[4].trim();
            const quantity = match[5];
            const notes = match[6] ? clean(match[6]) : '';

            lastSection = sectionCode; // Atualiza a seção atual

            parts.push({
                manufacturer,
                model,
                pnc,
                universalAcrossPnc: !pnc,
                section: sectionCode || lastSection,
                position: position,
                name: name,
                alternativeNames: [],
                partNumber: partNumber,
                page: 1,
                notes: [
                    `Quantidade: ${quantity}`,
                    notes ? `Info: ${notes}` : ''
                ].filter(Boolean).join('. ')
            });
        }
    }

    // 4. Se encontrou pelo menos 10 peças válidas, é um catálogo. Aceita e salva!
    if (parts.length < 10) {
        console.warn('⚠️ Extrator Rápido não achou peças suficientes. Passando para a IA...');
        return null;
    }

    console.log(`✅ Sucesso! Extrator Rápido encontrou ${parts.length} peças localmente!`);

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
