/**
 * Normalização Anti-Erro de Digitação para Códigos de Peças
 * 
 * Resolve os problemas mais comuns do balconista ao digitar códigos:
 * - Espaços e hífens em qualquer posição: "537 04 19-01" → "537041901"
 * - Pontos como separador: "537.04.19.01" → "537041901"
 * - Barras acidentais: "537/041901" → "537041901" 
 * - Zeros à esquerda: "0537041901" → "537041901"
 * - Trocas de teclas adjacentes no teclado numérico (fat-finger)
 * - Dígito duplicado acidental: "5370441901" → "537041901"
 * - Dígito faltando (engolido): "53704190" → tentativas com cada dígito inserido
 */

import { normalizeIdentifier } from './normalize';

// ─── Mapa de teclas adjacentes no teclado numérico ───
const adjacentKeys: Record<string, string[]> = {
    '0': ['9', '8'],
    '1': ['2', '4'],
    '2': ['1', '3', '5'],
    '3': ['2', '6'],
    '4': ['1', '5', '7'],
    '5': ['2', '4', '6', '8'],
    '6': ['3', '5', '9'],
    '7': ['4', '8'],
    '8': ['5', '7', '9', '0'],
    '9': ['6', '8', '0'],
};

/**
 * Strip tudo que não é alfanumérico — resolve espaços, hífens, pontos, barras.
 * É a camada mais básica e resolve ~70% dos erros de digitação de código.
 */
export function stripToAlphanumeric(input: string): string {
    return input.replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Remove zeros à esquerda de um código puramente numérico.
 * "0537041901" → "537041901"
 */
export function stripLeadingZeros(code: string): string {
    if (/^\d+$/.test(code) && code.length > 3) {
        return code.replace(/^0+/, '') || '0';
    }
    return code;
}

/**
 * Gera variações por troca de tecla adjacente (fat-finger).
 * Para cada dígito, substitui por vizinhos no teclado numérico.
 * Retorna no máximo ~20 variações para não explodir.
 */
export function generateAdjacentKeyVariations(code: string): string[] {
    const variations: string[] = [];
    const digits = code.split('');
    
    // Limitar a códigos numéricos com comprimento razoável
    if (!/^\d{5,15}$/.test(code)) return [];
    
    for (let i = 0; i < digits.length && variations.length < 25; i++) {
        const neighbors = adjacentKeys[digits[i]];
        if (!neighbors) continue;
        
        for (const neighbor of neighbors) {
            const variant = [...digits];
            variant[i] = neighbor;
            const result = variant.join('');
            if (result !== code) {
                variations.push(result);
            }
        }
    }
    
    return variations;
}

/**
 * Gera variações removendo um dígito duplicado.
 * "5370441901" → ["537041901", "537044901", ...]
 */
export function generateDeduplicationVariations(code: string): string[] {
    if (!/^\d{6,15}$/.test(code)) return [];
    
    const variations: string[] = [];
    const digits = code.split('');
    
    for (let i = 0; i < digits.length - 1; i++) {
        if (digits[i] === digits[i + 1]) {
            // Remove uma das duplicatas
            const variant = [...digits];
            variant.splice(i, 1);
            variations.push(variant.join(''));
        }
    }
    
    return variations;
}

/**
 * Gera variações inserindo um dígito em cada posição (para código "engolido").
 * Só usado quando o código parece ser um dígito a menos do que deveria.
 * Retorna muitas variações, usar com cautela.
 */
export function generateInsertionVariations(code: string): string[] {
    // Padrões de Husqvarna: 9 dígitos. Se tem 8 dígitos, talvez faltou 1.
    if (!/^\d{7,8}$/.test(code)) return [];
    
    const variations: string[] = [];
    
    for (let i = 0; i <= code.length; i++) {
        for (let d = 0; d <= 9; d++) {
            const variant = code.slice(0, i) + d + code.slice(i);
            if (variant !== code) {
                variations.push(variant);
            }
        }
    }
    
    return variations;
}

/**
 * Gera variações com transposição de dígitos adjacentes.
 * "537049101" → "537041901" (swapped 9 and 1)
 */
export function generateTranspositionVariations(code: string): string[] {
    if (!/^\d{5,15}$/.test(code)) return [];
    
    const variations: string[] = [];
    const digits = code.split('');
    
    for (let i = 0; i < digits.length - 1; i++) {
        if (digits[i] !== digits[i + 1]) {
            const variant = [...digits];
            [variant[i], variant[i + 1]] = [variant[i + 1], variant[i]];
            variations.push(variant.join(''));
        }
    }
    
    return variations;
}

export interface FuzzyCodeResult {
    /** O código principal normalizado (stripped, sem zeros à esquerda) */
    primary: string;
    /** Variações fuzzy para busca — podem ser usadas em OR no SQL */
    fuzzyVariations: string[];
    /** Se o input original continha separadores (espaços, hífens etc) */
    hadSeparators: boolean;
}

/**
 * Pipeline completo de normalização anti-erro.
 * Recebe qualquer input do balconista e retorna o código limpo + variações fuzzy.
 * 
 * Prioridade das variações:
 * 1. Código limpo (strippado) — sempre
 * 2. Sem zeros à esquerda
 * 3. Transposições de dígitos adjacentes (erro muito comum ao digitar rápido)
 * 4. Teclas vizinhas no teclado numérico
 * 5. Dígito duplicado removido  
 */
export function fuzzyNormalizePartCode(rawInput: string): FuzzyCodeResult {
    const hadSeparators = /[\s\-\.\/\\,]/.test(rawInput);
    const stripped = stripToAlphanumeric(rawInput);
    const primary = normalizeIdentifier(rawInput); // uppercase, alfanumérico
    const noLeadingZeros = stripLeadingZeros(stripped);
    
    const allVariations = new Set<string>();
    
    // Sempre incluir versão sem zeros à esquerda
    if (noLeadingZeros !== stripped) {
        allVariations.add(normalizeIdentifier(noLeadingZeros));
    }
    
    // Transposições (alta probabilidade de ocorrência)
    for (const v of generateTranspositionVariations(primary)) {
        allVariations.add(v);
    }
    
    // Teclas vizinhas 
    for (const v of generateAdjacentKeyVariations(primary)) {
        allVariations.add(v);
    }
    
    // Dígito duplicado acidental
    for (const v of generateDeduplicationVariations(primary)) {
        allVariations.add(v);
    }
    
    // Remover o próprio primary do set de variações
    allVariations.delete(primary);
    
    return {
        primary,
        fuzzyVariations: Array.from(allVariations).slice(0, 50), // cap de segurança
        hadSeparators,
    };
}
