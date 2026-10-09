// Prazo das peças no orçamento (pedido do dono, 2026-10-07): o atendente ESCOLHE, não digita do zero.
//   Pronta entrega -> a peça está na loja: o PDF diz "Pronta entrega" na coluna e "Peça em pronta entrega" nas observações
//                     (antes dizia "Imediato"; orçamento já guardado com esse texto continua valendo como pronta entrega).
//   Encomenda -> a Husqvarna costuma levar 7 a 10 dias: o PDF diz o prazo (editável) e "Peça sob encomenda" nas observações.
//   Sem prazo -> orçamento expresso, só por curiosidade do cliente: o PDF não tem coluna de prazo, só nome, quantidade e valor.
// O que é guardado continua sendo um texto (`Quote.leadTime`): vazio = sem prazo.
import { QUOTE_DEFAULTS } from './store-profile';

export type LeadMode = 'NONE' | 'NOW' | 'ORDER';

export const LEAD_TIME_NOW: string = QUOTE_DEFAULTS.leadTimeNow;
export const LEAD_TIME_ORDER: string = QUOTE_DEFAULTS.leadTimeOrder;

export function leadMode(leadTime: string | null | undefined): LeadMode {
  const text = (leadTime ?? '').trim();
  if (!text) return 'NONE';
  return /^(imediat[oa]|pronta\s+entrega)$/i.test(text) ? 'NOW' : 'ORDER';
}

/** O texto que passa a valer quando o atendente troca de opção (em "Encomenda" mantém o que já estava digitado). */
export function leadTimeFor(mode: LeadMode, current: string | null | undefined): string {
  if (mode === 'NONE') return '';
  if (mode === 'NOW') return LEAD_TIME_NOW;
  return leadMode(current) === 'ORDER' ? (current ?? '').trim() : LEAD_TIME_ORDER;
}

/** A linha das observações que acompanha a escolha do prazo, para o texto nunca contradizer a coluna. Sem prazo, nenhuma. */
export function leadTimeNote(leadTime: string | null | undefined): string | null {
  const mode = leadMode(leadTime);
  if (mode === 'NOW') return 'Peça em pronta entrega';
  if (mode === 'ORDER') return 'Peça sob encomenda';
  return null;
}

const SAYS_ORDER = /encomend/i;
const SAYS_NOW = /pronta[\s-]*entrega|imediat/i;

/** O que as observações já dizem sobre a entrega, para não repetir a linha automática nem contradizê-la. */
export function notesMention(notes: string | null | undefined): LeadMode {
  const text = notes ?? '';
  if (SAYS_ORDER.test(text)) return 'ORDER';
  if (SAYS_NOW.test(text)) return 'NOW';
  return 'NONE';
}

/** Aviso para a gaveta quando o prazo escolhido e as observações digitadas se contradizem. Vazio = tudo certo. */
export function leadTimeConflict(leadTime: string | null | undefined, notes: string | null | undefined): string | null {
  const chosen = leadMode(leadTime);
  const said = notesMention(notes);
  if (chosen === 'NONE' || said === 'NONE' || chosen === said) return null;
  return chosen === 'NOW'
    ? 'As observações falam em encomenda, mas o prazo é pronta entrega.'
    : 'As observações falam em pronta entrega, mas o prazo é encomenda.';
}
