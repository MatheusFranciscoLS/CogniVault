// `normalizeText` e `normalizeIdentifier` rodam MILHARES de vezes por busca descritiva (o vocabulário e cada nome de
// peça candidata passam por aqui). Medido com perfil de CPU em 2026-10-07: 5,6 s de 15 s eram só esta normalização,
// e Node é um processo só — durante esse tempo o servidor inteiro (inclusive o /health) não respondia.
// São funções puras e os mesmos textos se repetem (nomes de peça, termos do vocabulário), então guardar o resultado é
// seguro. O teto evita crescer sem limite: ao encher, recomeça do zero.
const MAX_CACHED_TEXTS = 30_000;
const MAX_CACHED_LENGTH = 300;

function memoized(compute: (value: string) => string): (value?: string | null) => string {
    const cache = new Map<string, string>();
    return value => {
        if (!value) return '';
        if (value.length > MAX_CACHED_LENGTH) return compute(value);
        const hit = cache.get(value);
        if (hit !== undefined) return hit;
        const result = compute(value);
        if (cache.size >= MAX_CACHED_TEXTS) cache.clear();
        cache.set(value, result);
        return result;
    };
}

export const normalizeIdentifier: (value?: string | null) => string = memoized(value =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, ''),
);

export const normalizeText: (value?: string | null) => string = memoized(value =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim(),
);
