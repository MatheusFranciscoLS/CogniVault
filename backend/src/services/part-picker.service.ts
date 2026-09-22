import { LRUCache } from 'lru-cache';
import { GEMINI_GENERATIVE_MODEL, getGeminiClient } from '../config/gemini';
import { prisma } from '../config/prisma';
import { normalizeIdentifier, normalizeText } from '../utils/normalize';
import { withTransientAIRetry } from '../utils/ai-retry';
import { extractAiUsage, recordAiTelemetry } from '../utils/ai-telemetry';
import {
  interactiveAiFailureSettlementTokens,
  reserveInteractiveAiBudget,
  settleInteractiveAiBudget,
} from './interactive-ai-budget';
import { AiDecisionCacheService } from './ai-decision-cache.service';

/**
 * "O cliente descreveu a peça com as palavras dele e a busca não achou nada."
 *
 * O caso real do balcão: o cliente diz *"a peça que segura a lâmina"* ou *"o
 * negócio que puxa a corda"*. O catálogo escreve `PORCA, Lâmina` e
 * `ARRASTADOR, Partida`. Hoje isso devolve **nada**, e "não achei" com o
 * cliente na frente é o pior resultado possível.
 *
 * ## Por que NÃO é tradução
 *
 * Pedir para a IA traduzir a frase para termo técnico devolveria "fixador da
 * lâmina" ou "suporte de lâmina" — plausível em português e que não casa com
 * nada no catálogo. Trocaria um "não achei" por outro, com custo.
 *
 * Aqui a IA **escolhe de uma lista fechada**: as peças daquela máquina, com os
 * nomes exatos do catálogo. Ela responde com um índice da lista, nunca com
 * texto livre, e o servidor confere que o índice existe. **Não há caminho pelo
 * qual um código inventado chegue à tela** — é a regra do dono ("meu medo é ela
 * não ter certeza do código da peça e mandar qualquer um") aplicada ao desenho,
 * não só à revisão.
 *
 * ## O desenho confirma, não a IA
 *
 * A resposta traz a **posição na vista explodida**. O atendente olha o desenho
 * e confirma em um segundo. Quem decide continua sendo ele; a IA só apontou
 * onde olhar.
 *
 * ## Cabe num plano gratuito
 *
 * Só roda quando a busca determinística não achou nada **e** a máquina é
 * conhecida — código, modelo e PNC digitados nunca chegam aqui. O texto enviado
 * é uma lista de nomes curtos, sem imagem. Respeita
 * `interactive-ai-budget` como o resto da IA interativa, e o resultado fica em
 * cache (memória + `AiDecisionCacheService`), porque "peça que segura a lâmina"
 * na 143RII é pergunta que se repete.
 *
 * **Sem cota, a tela cai no que o produto já faz**: a vista explodida para
 * conferir à mão. Não existe modo de falha novo.
 */

const TIMEOUT_MS = 8_000;
const RETRY = { maxAttempts: 2, baseDelayMs: 500, maxDelayMs: 1_500 } as const;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Teto de candidatos enviados. Uma vista de carburador tem ~20 posições e uma
 * máquina inteira passa de 200; acima disto o texto cresce sem melhorar a
 * escolha, e é gasto de cota num plano gratuito.
 */
const MAX_CANDIDATOS = 120;

/** No máximo 3 palpites: lista longa devolve a indecisão para o atendente. */
const MAX_PALPITES = 3;

const memoria = new LRUCache<string, PartGuess[]>({ max: 300, ttl: 2 * 60 * 60 * 1000 });

export type PartGuess = {
  id: string;
  partNumber: string;
  name: string;
  section: string | null;
  position: string | null;
  /** Por que a IA achou que é esta. Uma linha, do balcão para o balcão. */
  why: string;
};

/**
 * Vale acionar a IA para este texto?
 *
 * Descrição é frase com palavra comum; código e modelo não. A checagem é
 * deliberadamente conservadora: na dúvida, não gasta.
 */
export function looksLikeDescription(query: string): boolean {
  // Checagem de tipo explícita, e não `String(query)`: um objeto vira
  // "[object Object]", que tem duas palavras e nenhum dígito — passaria como
  // descrição e gastaria cota com lixo. O teste ao lado trava isso.
  if (typeof query !== 'string') return false;
  const limpo = query.trim();
  if (limpo.length < 8 || limpo.length > 160) return false;
  // Precisa de pelo menos duas palavras de verdade.
  const palavras = normalizeText(limpo).split(/\s+/).filter(p => p.length >= 3);
  if (palavras.length < 2) return false;
  // Se a maior parte for dígito, é código, não descrição.
  const digitos = (limpo.match(/\d/g) || []).length;
  return digitos / limpo.length < 0.4;
}

type Candidato = { id: string; partNumber: string; name: string; section: string | null; position: string | null };

async function candidatosDaMaquina(tenantId: string, model: string): Promise<Candidato[]> {
  const normalizedModel = normalizeIdentifier(model);
  if (!normalizedModel) return [];

  return prisma.part.findMany({
    where: {
      normalizedModel,
      active: true,
      document: { tenantId, archivedAt: null, status: 'COMPLETED' },
    },
    take: MAX_CANDIDATOS,
    orderBy: { position: 'asc' },
    select: { id: true, partNumber: true, name: true, section: true, position: true },
  });
}

export class PartPickerService {
  /**
   * Palpites de peça para uma descrição, dentro do catálogo de UMA máquina.
   *
   * Devolve `[]` sempre que não dá para responder com segurança: sem máquina,
   * sem catálogo, sem cota, IA fora do ar ou resposta que não casa com a lista.
   * Lista vazia é resposta legítima — a tela mostra a vista explodida.
   */
  static async guess(tenantId: string, model: string, query: string): Promise<PartGuess[]> {
    if (!tenantId || !model || !looksLikeDescription(query)) return [];

    const normalizedModel = normalizeIdentifier(model);
    const normalizedQuery = normalizeText(query);
    const chave = `${tenantId}:${normalizedModel}:${normalizedQuery}`;

    const daMemoria = memoria.get(chave);
    if (daMemoria) return daMemoria;

    const doBanco = await AiDecisionCacheService.get<PartGuess[]>(
      tenantId,
      'PART_PICK',
      { model: normalizedModel, query: normalizedQuery },
    ).catch(() => null);
    if (doBanco) {
      memoria.set(chave, doBanco);
      return doBanco;
    }

    const candidatos = await candidatosDaMaquina(tenantId, model);
    // Abaixo de 3 peças não há escolha a fazer, e a busca normal já teria achado.
    if (candidatos.length < 3) return [];

    // A reserva acontece no PostgreSQL para que duas instâncias Render não
    // liberem chamadas concorrentes acima da cota do tenant.
    const reservation = await reserveInteractiveAiBudget(tenantId);
    if (!reservation) {
      console.warn(`[Palpite de peça] Cota de IA interativa esgotada para ${tenantId}; a tela fica com a vista explodida.`);
      return [];
    }

    let aiRequestAttempted = false;
    try {
      const ai = await getGeminiClient();
      const lista = candidatos
        .map((c, i) => `${i}. ${c.name}${c.section ? ` (${c.section})` : ''}`)
        .join('\n');

      aiRequestAttempted = true;
      const response = await withTransientAIRetry(
        () => ai.interactions.create({
          model: GEMINI_GENERATIVE_MODEL,
          input: [
            'Você ajuda um atendente de balcão de peças. O cliente descreveu uma peça com as',
            'palavras dele e você tem a lista EXATA das peças desta máquina.',
            '',
            `Máquina: ${model}`,
            `O cliente disse: "${query}"`,
            '',
            'Peças desta máquina:',
            lista,
            '',
            'Responda com os índices das peças que mais provavelmente são a que o cliente',
            `descreveu, no máximo ${MAX_PALPITES}, do mais provável para o menos.`,
            'REGRAS:',
            '- Use SOMENTE índices da lista acima. Não invente peça, código nem nome.',
            '- Se nenhuma peça da lista corresponde, devolva a lista vazia. Vazio é melhor',
            '  que um palpite ruim: o atendente vende a peça errada e o cliente volta.',
            '- Em "why", escreva UMA frase curta em português dizendo por que essa peça',
            '  corresponde ao que o cliente falou. Fale como balconista, não explique o sistema.',
          ].join('\n'),
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: {
              type: 'object',
              properties: {
                picks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      index: { type: 'integer' },
                      why: { type: 'string' },
                    },
                    required: ['index', 'why'],
                  },
                },
              },
              required: ['picks'],
            },
          },
        }, { timeout_ms: TIMEOUT_MS }),
        { label: 'Part Pick', ...RETRY },
      );

      recordAiTelemetry(tenantId, 'PART_PICK', response, { reservationId: reservation.id });
      await settleInteractiveAiBudget(tenantId, reservation.id, extractAiUsage(response).totalTokens);

      const bruto = String((response as { output_text?: unknown }).output_text || '').trim();
      const limpo = bruto.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(limpo || '{}') as { picks?: Array<{ index?: unknown; why?: unknown }> };

      // A validação que sustenta a regra: só passa índice que existe na lista
      // que NÓS montamos. Qualquer outra coisa é descartada em silêncio.
      const vistos = new Set<number>();
      const palpites: PartGuess[] = [];
      for (const pick of parsed.picks ?? []) {
        const i = Number(pick?.index);
        if (!Number.isInteger(i) || i < 0 || i >= candidatos.length || vistos.has(i)) continue;
        vistos.add(i);
        const c = candidatos[i];
        palpites.push({
          id: c.id,
          partNumber: c.partNumber,
          name: c.name,
          section: c.section,
          position: c.position,
          why: String(pick?.why || '').trim().slice(0, 140),
        });
        if (palpites.length >= MAX_PALPITES) break;
      }

      memoria.set(chave, palpites);
      void AiDecisionCacheService.set(
        tenantId,
        'PART_PICK',
        { model: normalizedModel, query: normalizedQuery },
        palpites,
        CACHE_TTL_MS,
      ).catch(() => undefined);

      return palpites;
    } catch (error) {
      const failureTokens = interactiveAiFailureSettlementTokens(aiRequestAttempted);
      if (failureTokens !== null) {
        await settleInteractiveAiBudget(tenantId, reservation.id, failureTokens).catch(() => undefined);
      }
      // Falha de IA nunca vira erro na tela: o balcão continua com a vista
      // explodida, que é a saída que o dono definiu para todo caso sem código.
      console.warn(
        '[Palpite de peça] Indisponível; a tela fica com a vista explodida.',
        error instanceof Error ? error.message : error,
      );
      return [];
    }
  }
}
