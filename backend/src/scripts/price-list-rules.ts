// Regra comercial de precificação: o preço exibido no balcão sai acima do
// valor da planilha de lista de preços. Definido pelo proprietário em
// 2026-09; o valor anterior (COMMERCIAL_PRICE_DIVISOR = 0.92) resultava em
// +8,7% em vez dos +5% pretendidos — 1 / 0.92 ≈ 1.087, não 1.05.
//
// Compartilhado entre import-price-list.ts (aplica a regra nos preços) e
// import-price-list-with-history.ts (grava a regra usada em cada importação,
// para auditoria em CommercialImportRun.priceDivisor). Um único lugar evita
// que as duas cópias fiquem dessincronizadas como aconteceu antes.
export const COMMERCIAL_MARKUP_PERCENT = 5;

// Mantido como "divisor" porque é assim que o schema (CommercialImportRun.
// priceDivisor) e o restante do código já tratam o valor: preço da planilha
// dividido por isto dá o preço de venda.
export const COMMERCIAL_PRICE_DIVISOR = 1 / (1 + COMMERCIAL_MARKUP_PERCENT / 100);

export function commercialPrice(input: number | null): number | null {
  if (input === null) return null;
  return Math.round((input / COMMERCIAL_PRICE_DIVISOR) * 100) / 100;
}
