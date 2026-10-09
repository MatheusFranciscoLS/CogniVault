import type { jsPDF as JsPdf } from 'jspdf';

// Texto que o PDF do cliente aguenta (2026-10-09, rodada 2 de auditoria). As fontes padrão do PDF (Helvetica) só têm Latin-1 e a pontuação do Windows-1252:
// qualquer outra coisa (emoji colado do WhatsApp, árabe, japonês) vira lixo ("Ø=Þ", "eåg,Šž0n") e, pior, **estraga o espaçamento da frase inteira**
// ("I t e m  1  ç ã o"), então o cliente recebia um orçamento feio por causa de um emoji no nome. Aqui o emoji e os caracteres invisíveis SAEM, símbolos
// comuns viram o equivalente em letras, e o que não tem equivalente vira "?" (o leitor vê que faltou algo, em vez de o nome sumir sem aviso).
// Os caracteres especiais são escritos por CÓDIGO (não literais) para o arquivo continuar legível e sem caractere invisível no meio do código.

/** Pontuação e letras do Windows-1252 que a fonte do PDF desenha (fora do bloco Latin-1). */
const CP1252_EXTRAS = new Set([...'–—‘’‚“”„•…‰‹›€™†‡ˆ˜ŠšŒœŽžŸƒ']);

const SPACES = [0x2002, 0x2003, 0x2007, 0x2009, 0x202f, 0x2028, 0x2029];
const EQUIVALENTS = new Map<number, string>([
  [0x2192, '->'], [0x2190, '<-'], [0x2194, '<->'], [0x2265, '>='], [0x2264, '<='], [0x2248, '~'], [0x2260, '!='], [0x2212, '-'], [0x2219, '·'],
  [0x2713, ''], [0x2714, ''], [0x2717, 'x'], [0x2718, 'x'], [0x2605, '*'], [0x2606, '*'],
  ...SPACES.map(code => [code, ' '] as [number, string]),
]);

/** Variação de emoji, junção, marcas de direção, espaços de largura zero, hífen suave, BOM e "keycap": não desenham nada e atrapalham a medida do texto. */
function isInvisible(code: number): boolean {
  return (code >= 0xfe00 && code <= 0xfe0f) || (code >= 0x200b && code <= 0x200f) || (code >= 0x2060 && code <= 0x2064)
    || code === 0xfeff || code === 0x20e3 || code === 0x00ad;
}

const EMOJI = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}/u;

export function pdfSafeText(value: string): string {
  let out = '';
  let removed = false;
  for (const char of String(value ?? '').normalize('NFC')) {
    const code = char.codePointAt(0) as number;
    if (char === '\n' || char === '\t') out += char;
    else if (code < 0x20 || (code >= 0x7f && code < 0xa0) || isInvisible(code)) { removed = true; continue; }
    else if (code <= 0x7e || (code >= 0xa0 && code <= 0xff) || CP1252_EXTRAS.has(char)) out += char;
    else if (EQUIVALENTS.has(code)) out += EQUIVALENTS.get(code);
    else if (EMOJI.test(char)) removed = true;
    else out += '?';
  }
  // Tirar o emoji de "Item 😀 ção" deixaria dois espaços seguidos.
  return removed ? out.replace(/ {2,}/g, ' ').trim() : out;
}

const clean = (input: unknown): unknown => (typeof input === 'string' ? pdfSafeText(input) : Array.isArray(input) ? input.map(clean) : input);

/**
 * Faz a instância do jsPDF limpar TODO texto que passa por ela (escrever, medir, quebrar linha), inclusive o que o autoTable desenha por dentro.
 * Idempotente: chamar duas vezes não empilha a limpeza.
 */
export function makePdfSafe<T extends JsPdf>(doc: T): T {
  const tagged = doc as T & { __pdfSafe?: boolean };
  if (tagged.__pdfSafe) return doc;
  tagged.__pdfSafe = true;
  const target = doc as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const name of ['text', 'splitTextToSize', 'getTextWidth', 'getStringUnitWidth', 'getTextDimensions']) {
    const original = target[name];
    if (typeof original !== 'function') continue;
    target[name] = function patched(first: unknown, ...rest: unknown[]) {
      return original.call(doc, clean(first), ...rest);
    };
  }
  return doc;
}
