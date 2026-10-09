import { LEAD_TIME_NOW, LEAD_TIME_ORDER, leadMode } from './lead-time';

// A linha do orçamento (peças e conserto) e a linha de entrada usam as MESMAS colunas, para tudo alinhar como a planilha da loja:
// descrição, quantidade, valor, prazo, total, remover.
export const LINE_COLUMNS = 'grid grid-cols-[minmax(0,1fr)_104px_96px_136px_92px_32px] items-center gap-x-3';

export type LeadChoice = 'NOW' | 'ORDER';

/** Qual opção do seletor de prazo vale para o texto guardado na linha ('' = a linha não tem prazo próprio). */
export function leadChoiceOf(text: string | null | undefined): '' | LeadChoice {
  if (!text?.trim()) return '';
  return leadMode(text) === 'NOW' ? 'NOW' : 'ORDER';
}

/** O texto que passa a valer quando o balcão escolhe a opção; "Encomenda" repete o prazo de encomenda que o orçamento já tem, se tiver. */
export function leadTextFor(choice: LeadChoice, quoteLeadTime = ''): string {
  if (choice === 'NOW') return LEAD_TIME_NOW;
  return leadMode(quoteLeadTime) === 'ORDER' ? quoteLeadTime.trim() : LEAD_TIME_ORDER;
}
