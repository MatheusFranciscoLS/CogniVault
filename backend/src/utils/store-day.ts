/**
 * Conversão de "dia" para instante, no fuso da loja.
 *
 * O painel e a exportação recebem data sem hora (`2026-09-18`) de um `<input
 * type="date">`. Interpretar isso com `new Date('2026-09-18')` seguido de
 * `setHours(23,59,59,999)` está errado de duas formas ao mesmo tempo: a string
 * é parseada como meia-noite **UTC**, e `setHours` aplica o fuso **do
 * servidor**. Em servidor UTC-3 o resultado foi um período terminando às
 * 23:59:59 do dia *anterior* — o dono filtrava "até hoje" e não via o que o
 * balcão tinha acabado de cotar.
 *
 * Aqui o dia é sempre o dia comercial da loja (America/Sao_Paulo), independente
 * do fuso onde o processo roda: o Render roda em UTC, a loja não.
 */

export const STORE_TIME_ZONE = 'America/Sao_Paulo';

/**
 * Deslocamento da loja em minutos no instante dado. Lê do próprio ICU em vez
 * de fixar -180 para o horário de verão continuar correto se voltar a existir.
 */
function storeOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: STORE_TIME_ZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(at);

  const label = parts.find(part => part.type === 'timeZoneName')?.value ?? '';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(label);
  if (!match) return -180;

  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

function boundary(year: number, month: number, day: number, end: boolean): Date {
  const guess = Date.UTC(
    year,
    month - 1,
    day,
    end ? 23 : 0,
    end ? 59 : 0,
    end ? 59 : 0,
    end ? 999 : 0,
  );
  // O deslocamento é avaliado no próprio dia pedido, então uma virada de
  // horário de verão não desloca a borda para o dia vizinho.
  return new Date(guess - storeOffsetMinutes(new Date(guess)) * 60_000);
}

/** `YYYY-MM-DD` (ou ISO completo) -> início daquele dia na loja. */
export function startOfStoreDay(value: unknown): Date | null {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim()) : null;
  if (!match) return null;
  return boundary(Number(match[1]), Number(match[2]), Number(match[3]), false);
}

/** `YYYY-MM-DD` (ou ISO completo) -> fim daquele dia na loja (23:59:59.999). */
export function endOfStoreDay(value: unknown): Date | null {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim()) : null;
  if (!match) return null;
  return boundary(Number(match[1]), Number(match[2]), Number(match[3]), true);
}

/** Dia de hoje na loja, como `YYYY-MM-DD`. */
export function todayInStore(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Desloca um `YYYY-MM-DD` em dias, sem passar por fuso nenhum. */
export function shiftStoreDay(dateOnly: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOnly);
  if (!match) return dateOnly;
  const base = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}
