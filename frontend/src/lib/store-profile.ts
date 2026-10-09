import { apiJson } from '../lib';
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
  /** "Ref." do orçamento de conserto (editável na prévia). */
  repairReference: 'Orçamento de Conserto',
  /** Sem escolha, o orçamento sai SEM prazo (dono, 2026-10-07); estes são os dois textos das opções. */
  leadTimeNow: 'Pronta entrega',
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

/**
 * Reserva para quem ainda não tem nome cadastrado: "matheus.francisco@loja.com" → "Matheus Francisco". Só vale com DUAS palavras de
 * 3 letras ou mais; e-mail que não segue esse formato ("matheusfran.ls", "balcao2") devolve vazio e a linha "ATT." some, porque um nome
 * inventado ("Matheusf Ls") na frente do cliente é pior que nenhum (dono, 2026-10-07).
 */
export function attendantNameFromEmail(email: string | null | undefined): string {
  const local = (email ?? '').split('@')[0] ?? '';
  const words = local.split(/[._-]+/);
  if (words.length < 2 || words.some(word => !/^\p{L}{3,}$/u.test(word))) return '';
  return words.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

/** Guarda o nome cadastrado do usuário deste navegador (sem nome, apaga o do anterior). Chamado no login e a cada abertura do painel. */
export function rememberUserName(name: string | null | undefined): void {
  try {
    if (name && name.trim()) localStorage.setItem('cognivault_name', name.trim());
    else localStorage.removeItem('cognivault_name');
  } catch { /* sem armazenamento: o PDF sai sem o ATT. */ }
}

/**
 * O nome do "ATT." na hora de gerar o PDF: pergunta ao servidor (rápido, 4 s no máximo) e guarda, porque o nome guardado no
 * navegador pode estar velho ou nunca ter sido gravado (sessão aberta antes de o nome existir). Se a consulta falha, usa o guardado.
 */
export async function resolveAttendantName(): Promise<string> {
  try {
    const { user } = await apiJson<{ user: { name?: string | null } }>('/api/me', { timeoutMs: 4_000 });
    rememberUserName(user.name);
  } catch { /* sem rede: vale o nome guardado */ }
  return attendantDisplayName();
}

/** O nome de quem atende, para o "ATT.": o cadastrado pelo administrador; sem ele, a reserva do e-mail; sem nenhum, vazio. */
export function attendantDisplayName(): string {
  try {
    const name = localStorage.getItem('cognivault_name')?.trim();
    if (name) return name;
    return attendantNameFromEmail(localStorage.getItem('cognivault_email'));
  } catch {
    return '';
  }
}
