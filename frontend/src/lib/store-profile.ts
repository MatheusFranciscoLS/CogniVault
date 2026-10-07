// Dados cadastrais da loja que saem no cabeçalho e no rodapé do que o cliente recebe (PDF do orçamento e ficha da
// máquina). Vêm do modelo de orçamento em Word da própria loja (`ORÇAMENTO TIMBRE PEÇAS.doc`, 2026-10-07).
//
// São dados PÚBLICOS de pessoa jurídica (CNPJ, inscrição, endereço, telefone e e-mail comerciais, os mesmos que a
// loja imprime em toda nota e orçamento), por isso moram no código. Dado de CLIENTE, preço de custo ou qualquer
// coisa da planilha da Husqvarna NÃO entra aqui: o repositório é público.
export const STORE_PROFILE = {
  /** Razão social, como está no cadastro do CNPJ (o dono confirmou em 2026-10-07; o cabeçalho do modelo em Word estava abreviado). */
  legalName: 'VARDÃO MÁQUINAS E EQUIPAMENTOS DE JARDINAGEM LTDA',
  cnpj: '38.493.315/0001-90',
  stateRegistration: '417.617.710.115',
  street: 'Avenida Major José Levy Sobrinho, 1257',
  neighborhood: 'Jardim Nereide',
  zip: '13486-190',
  city: 'Limeira',
  state: 'SP',
  stateName: 'São Paulo',
  phones: ['(19) 3441-2229', '(19) 3451-9637'],
  email: 'vendas@vardaojardinagem.com.br',
} as const;

/** Cidade onde o orçamento é emitido ("Limeira, 07 de outubro de 2026"). */
export const STORE_CITY = STORE_PROFILE.city;

/** Padrões do modelo da loja; o orçamento pode sobrescrever cada um. */
export const QUOTE_DEFAULTS = {
  reference: 'Estimativa de Preço Peças de Reposição',
  /** Sem escolha, o orçamento sai SEM prazo (dono, 2026-10-07); estes são os dois textos das opções. */
  leadTimeNow: 'Imediato',
  leadTimeOrder: '7 a 10 dias',
  shipping: 'Retira',
  paymentTerms: 'A combinar',
  validityDays: 20,
  observations: [
    'Preços para produto a serem faturados no estado de São Paulo',
    'Impostos inclusos',
    'Estoque rotativo sujeito a venda diária',
  ],
} as const;

/** "matheus.francisco@loja.com" → "Matheus Francisco" (o usuário da sessão só tem e-mail). */
export function attendantNameFromEmail(email: string | null | undefined): string {
  const local = (email ?? '').split('@')[0] ?? '';
  const words = local.split(/[._\-+\d]+/).filter(word => word.length > 1);
  return words.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}
