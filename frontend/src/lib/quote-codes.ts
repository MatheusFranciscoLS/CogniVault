/**
 * Lista de códigos do orçamento para COLAR NO CLIPP: um por linha, "código<TAB>quantidade".
 *
 * A venda acontece no sistema da loja, então depois de montar o orçamento o atendente precisa levar os itens para
 * lá. Isto é interno do balcão (por isso o código aparece): o que sai para o CLIENTE nunca leva código.
 *
 * - Código limpo como o Clipp guarda ("Referência" sem espaço nem traço): `587106701`, não `587 10 67-01`.
 * - O mesmo código em duas linhas (duas máquinas) vira uma linha só, com a quantidade somada.
 * - Serviço avulso (`SRV-…`, ex.: óleo) não tem código de peça e fica de fora.
 * - TAB entre código e quantidade: cola em planilha e em campo de texto sem trocar nada.
 */
export type QuoteCodeLine = { partNumber: string; effectiveCode?: string | null; quantity: number };

export function cleanCode(code: string | null | undefined): string {
  return (code ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function clipboardCodes(items: QuoteCodeLine[]): { text: string; count: number } {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (item.partNumber.toUpperCase().startsWith('SRV-')) continue;
    const code = cleanCode(item.effectiveCode || item.partNumber);
    if (!code) continue;
    totals.set(code, (totals.get(code) ?? 0) + Math.max(1, Math.floor(item.quantity) || 1));
  }
  const lines = [...totals].map(([code, quantity]) => `${code}\t${quantity}`);
  return { text: lines.join('\n'), count: lines.length };
}
