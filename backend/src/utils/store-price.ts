/**
 * Preço da loja que vale para o balcão: SÓ maior que zero. R$ 0,00 é "sem preço", nunca um valor (a lista da Husqvarna escreve zero quando falta o preço, e
 * a loja tem peças cadastradas com 0). Sem isso a tela mostrava "R$ 0,00" com o "+ Orçamento" ligado, e o orçamento podia sair para o cliente com a peça de
 * graça. Devolve `null` para zero, negativo, NaN, infinito e vazio; a tela já sabe o que fazer com `null` ("Consultar no Parceiro").
 */
export function storePrice(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
