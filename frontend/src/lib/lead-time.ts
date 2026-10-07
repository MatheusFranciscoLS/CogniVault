// Prazo das peças no orçamento (pedido do dono, 2026-10-07): o atendente ESCOLHE, não digita do zero.
//   Imediato  -> pronta entrega: o PDF diz "Imediato".
//   Encomenda -> a Husqvarna costuma levar 7 a 10 dias: o PDF diz o prazo (editável).
//   Sem prazo -> orçamento expresso, só por curiosidade do cliente: o PDF não tem coluna de prazo, só nome, quantidade e valor.
// O que é guardado continua sendo um texto (`Quote.leadTime`): vazio = sem prazo.
import { QUOTE_DEFAULTS } from './store-profile';

export type LeadMode = 'NONE' | 'NOW' | 'ORDER';

export const LEAD_TIME_NOW: string = QUOTE_DEFAULTS.leadTimeNow;
export const LEAD_TIME_ORDER: string = QUOTE_DEFAULTS.leadTimeOrder;

export function leadMode(leadTime: string | null | undefined): LeadMode {
  const text = (leadTime ?? '').trim();
  if (!text) return 'NONE';
  return /^imediat[oa]$/i.test(text) ? 'NOW' : 'ORDER';
}

/** O texto que passa a valer quando o atendente troca de opção (em "Encomenda" mantém o que já estava digitado). */
export function leadTimeFor(mode: LeadMode, current: string | null | undefined): string {
  if (mode === 'NONE') return '';
  if (mode === 'NOW') return LEAD_TIME_NOW;
  return leadMode(current) === 'ORDER' ? (current ?? '').trim() : LEAD_TIME_ORDER;
}
