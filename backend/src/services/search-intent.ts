/**
 * O que a busca de peça entende de uma frase digitada: fabricante, modelo, PNC, descrição, código, seção e posição.
 *
 * Estes tipos moravam em `chat-intent.service.ts`, junto com a chamada ao Gemini que interpretava as perguntas do
 * assistente de IA em gaveta. O assistente saiu do balcão em 2026-10-07 e a classe `ChatIntentService` foi
 * removida; ficaram só os tipos, que a busca (`part-search`, `hybrid-part-retrieval`, `chat-reliability`) ainda usa.
 */
export interface SearchIntent {
  manufacturer: string;
  model: string;
  pnc: string;
  partDescription: string;
  partNumber: string;
  section: string;
  position: string;
}

export interface CandidateForAi {
  id: string;
  name: string;
  model: string;
  pnc: string | null;
  section: string | null;
  position: string | null;
  aliases: string[];
  feedbackScore?: number;
  notes?: string | null;
  retrievalScore?: number;
  retrievalAgreement?: number;
  retrievalSources?: string[];
}
