import { normalizePartCode } from '../PartVerificationDialog';

/**
 * Uma linha por CÓDIGO.
 *
 * A mesma peça aparece no catálogo de vários modelos e PNCs (a "CHAVE COMBINADA (VELA)"
 * 501691702 vinha 3 vezes seguidas, só mudando posição e PNC). Para o balcão é uma peça
 * só: o atendente sabe a máquina que tem na frente, e a linha de cima já é a melhor para
 * ela (a busca põe o modelo informado primeiro). As demais aplicações viram um "também em".
 *
 * Só a ORDEM e o agrupamento mudam: nada é descartado, e a primeira ocorrência (a que a
 * busca ranqueou melhor) continua sendo a que abre os detalhes e entra no orçamento.
 */
export type PartGroup<T> = { main: T; others: T[] };

export function groupPartsByCode<T extends { partNumber: string }>(parts: T[]): PartGroup<T>[] {
  const groups = new Map<string, PartGroup<T>>();
  for (const part of parts) {
    const key = normalizePartCode(part.partNumber);
    const group = groups.get(key);
    if (group) group.others.push(part);
    else groups.set(key, { main: part, others: [] });
  }
  return [...groups.values()];
}

/** "531RS, 545F" ou "531RS, 545F +2": modelos das outras aplicações, sem repetir o principal. */
export function alsoInLabel(mainModel: string, others: Array<{ model: string }>, limit = 2): string {
  const models = [...new Set(others.map(item => item.model).filter(model => model && model !== mainModel))];
  if (models.length === 0) return '';
  const shown = models.slice(0, limit).join(', ');
  return models.length > limit ? `${shown} +${models.length - limit}` : shown;
}

/** Minúsculas e sem acento, para comparar o que foi digitado com o nome da peça. */
export function plainText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * O nome da peça contém a frase que o atendente digitou? ("vela de ignição" → "VELA DE
 * IGNICAO HQT-7": sim.) Decide qual grupo de resultados vem primeiro: quem tem o NOME que
 * o cliente falou vem na frente, não o grupo que por acaso vem primeiro.
 */
export function nameContainsPhrase(name: string, phrase: string): boolean {
  const wanted = plainText(phrase);
  return wanted.length >= 3 && plainText(name).includes(wanted);
}
