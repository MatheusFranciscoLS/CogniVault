// Regra comercial de precificação: o preço exibido no balcão sai acima do
// preço de consumidor sugerido pela própria Husqvarna.
//
// Confirmado com o proprietário em 2026-09 com print do Portal Parceiro
// Husqvarna (parceirohusqvarna.com): a coluna "PREÇO CONSUMIDOR" de lá é o
// que entra na planilha de lista de preços, e o preço de venda do balcão é
// esse valor ÷ 0.92 (~+8,7%). Exemplo real conferido: PREÇO CONSUMIDOR
// R$ 22,00 ÷ 0.92 = R$ 23,91.
//
// (Uma correção anterior mudou este valor para 0.952381, achando que a
// intenção era +5% sobre a planilha interna — era engano: a base de
// comparação é o preço de consumidor da Husqvarna, não um custo interno, e
// o valor combinado sempre foi 0.92. Não mexer sem o proprietário confirmar
// de novo com print do Portal Parceiro.)
//
// Compartilhado entre import-price-list.ts (aplica a regra nos preços) e
// import-price-list-with-history.ts (grava a regra usada em cada importação,
// para auditoria em CommercialImportRun.priceDivisor). Um único lugar evita
// que as duas cópias fiquem dessincronizadas.
export const COMMERCIAL_PRICE_DIVISOR = 0.92;

export function commercialPrice(input: number | null): number | null {
  if (input === null) return null;
  return Math.round((input / COMMERCIAL_PRICE_DIVISOR) * 100) / 100;
}
