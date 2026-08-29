function looksLikeUtf8DecodedAsLatin1(value: string): boolean {
    // Exemplos reais de multipart mal decodificado:
    // NBSP UTF-8 C2 A0 -> "Â " e ® UTF-8 C2 AE -> "Â®".
    // Não casa com um Â legítimo em palavras como "LÂMINA".
    return /(?:Ã[\u0080-\u00bf]|Â[\u0080-\u00bf\u00a0-\u00ff])/.test(value);
}

/**
 * Corrige somente sinais típicos de UTF-8 interpretado como Latin-1 no multipart.
 * Se a conversão produzir caractere de substituição, preserva o valor original.
 * NBSP é normalizado para espaço comum para evitar nomes visualmente iguais,
 * porém byte-a-byte diferentes.
 */
export function repairMultipartText(value: string): string {
    let repaired = value;

    if (looksLikeUtf8DecodedAsLatin1(value)) {
        const candidate = Buffer.from(value, 'latin1').toString('utf8');
        if (!candidate.includes('\uFFFD')) repaired = candidate;
    }

    return repaired.replace(/\u00a0/g, ' ').normalize('NFC');
}
