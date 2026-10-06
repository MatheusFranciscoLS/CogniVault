import { SESSION_TTL_SECONDS } from './session-cookie';

/**
 * Renovação deslizante da sessão do balcão.
 *
 * **O problema.** A sessão durava 8 h fixas desde o login e não renovava (não
 * existe rota de renovação). Quem entrava de manhã era deslogado à tarde, no meio
 * do atendimento, com o cliente esperando — e a loja trabalha mais que 8 h por dia.
 *
 * **O desenho, e por que cada número.**
 *
 * - **Sem atividade, tudo como antes: 8 h (`SESSION_TTL_SECONDS`).** Uma sessão nunca
 *   fica mais curta do que era.
 * - **Com atividade, a sessão vai até o teto de 12 h desde o login ORIGINAL.** Na
 *   primeira requisição depois que restarem menos de 4 h (ou seja, a partir da hora 4
 *   do dia), o cookie é reemitido valendo até `login + 12 h`. Como o teto é contado
 *   do login, **a renovação é sempre cortada nele**: na prática há UMA renovação por
 *   sessão, não uma a cada 4 h. Exemplo: login às 08:00. Se a pessoa fizer qualquer
 *   requisição entre 12:00 e 16:00, a sessão passa a valer até 20:00. Se ficar sem
 *   usar o sistema de 12:00 a 16:00, expira às 16:00 como hoje.
 * - **O teto de 12 h existe porque, sem ele, um PC compartilhado com uso contínuo
 *   manteria a mesma sessão para sempre.** 12 h cobre um dia de loja inteiro com
 *   folga e depois pede senha de novo. É o único ponto em que o pior caso piora (de
 *   8 h para 12 h num cookie roubado); o ganho é não deslogar atendente em plena
 *   venda.
 *
 * O `authAt` (momento do login original) viaja DENTRO do JWT assinado, então não
 * dá para adulterar. Tokens emitidos antes desta mudança não têm `authAt` e usam o
 * `iat`, que é o mesmo instante.
 */
export const SESSION_RENEW_WHEN_LEFT_SECONDS = 4 * 60 * 60;
export const SESSION_ABSOLUTE_MAX_SECONDS = 12 * 60 * 60;

/** Renovar para ganhar menos que isto não compensa um novo cookie. */
const MIN_GAIN_SECONDS = 60;

export type SessionRenewalPlan = {
  /** Instante (epoch, segundos) do login original: é preservado em toda renovação. */
  authAt: number;
  /** Validade do NOVO token, em segundos a partir de agora. */
  expiresInSeconds: number;
};

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Decide se a sessão deve ser renovada agora, e por quanto tempo.
 * Função pura: recebe as claims JÁ VERIFICADAS e o relógio, devolve o plano ou
 * `null`. Na dúvida, `null` — não renovar é sempre o lado seguro.
 */
export function planSessionRenewal(
  claims: Record<string, unknown>,
  nowSeconds: number,
): SessionRenewalPlan | null {
  const exp = claims.exp;
  if (!finiteNumber(exp)) return null;

  const authAt = finiteNumber(claims.authAt)
    ? claims.authAt
    : finiteNumber(claims.iat)
      ? claims.iat
      : null;
  // Sem origem conhecida não há como aplicar o teto; um login "do futuro" é lixo.
  if (authAt === null || authAt > nowSeconds) return null;

  // Ainda sobra bastante: nada a fazer.
  if (exp - nowSeconds >= SESSION_RENEW_WHEN_LEFT_SECONDS) return null;

  const hardLimit = authAt + SESSION_ABSOLUTE_MAX_SECONDS;
  const newExp = Math.min(nowSeconds + SESSION_TTL_SECONDS, hardLimit);

  // No teto, ou perto dele, não há o que ganhar.
  if (newExp - exp < MIN_GAIN_SECONDS) return null;

  return { authAt, expiresInSeconds: Math.floor(newExp - nowSeconds) };
}
