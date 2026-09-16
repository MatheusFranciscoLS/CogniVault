import { GEMINI_GENERATIVE_MODEL, getGeminiClient } from '../config/gemini';
import { PartSearchService, type PartCandidate } from './part-search.service';
import type { SearchIntent } from './chat-intent.service';
import { ChatIntentService } from './chat-intent.service';
import { filterCandidatesByMarket } from './catalog-market';
import { findPartConcepts } from './part-vocabulary';
import { retrieveTechnicalContext } from './document-memory';
import { preferCurrentPartNumbers } from './part-supersession';
import { chooseCandidateLocally } from './chat-reliability';
import { withTransientAIRetry } from '../utils/ai-retry';
import { extractAiUsage, recordAiTelemetry } from '../utils/ai-telemetry';
import { canUseInteractiveAi, consumeInteractiveAiBudget } from './interactive-ai-budget';
import { AiDecisionCacheService } from './ai-decision-cache.service';

const INTERACTIVE_AI_TIMEOUT_MS = 8_000;
const PERSISTENT_RANKING_TTL_MS = 24 * 60 * 60 * 1000;

export interface ReActSearchResult {
  status: 'FOUND' | 'NOT_FOUND' | 'AMBIGUOUS' | 'MODEL_REQUIRED' | 'PNC_REQUIRED';
  chosenPartId?: string;
  explanation: string;
  suggestedModel?: string;
  suggestedPnc?: string;
  candidates?: PartCandidate[];
}

type CachedRankingDecision = {
  chosenId?: string | null;
  explanation: string;
  ambiguous: boolean;
};

function rankingIdentity(question: string, explicitPnc: string | undefined, candidates: PartCandidate[]) {
  return {
    question: question.trim().toLocaleLowerCase('pt-BR'),
    pnc: explicitPnc || '',
    candidates: candidates.slice(0, 6).map(candidate => ({
      id: candidate.id,
      code: candidate.partNumber,
      model: candidate.model,
      pnc: candidate.pnc || '',
      section: candidate.section || '',
      position: candidate.position || '',
      notes: candidate.notes || '',
      agreement: candidate.retrievalAgreement || 0,
    })),
  };
}

async function foundFromDecision(decision: CachedRankingDecision, candidates: PartCandidate[], tenantId: string, question: string): Promise<ReActSearchResult> {
  if (decision.ambiguous || !decision.chosenId) {
    return {
      status: 'AMBIGUOUS',
      explanation: decision.explanation || 'Encontrei mais de uma peça possível e preciso de mais detalhes.',
      candidates,
    };
  }

  const chosenCandidate = candidates.find(candidate => candidate.id === decision.chosenId);
  if (!chosenCandidate) {
    return { status: 'AMBIGUOUS', explanation: 'A composição do catálogo mudou. Reavalie os candidatos antes de concluir.', candidates };
  }

  let contextEvidence = '';
  try {
    const hits = await retrieveTechnicalContext(tenantId, question, {
      model: chosenCandidate.model,
      documentId: chosenCandidate.documentId,
      limit: 2,
    });
    if (hits.length) contextEvidence = hits.map(hit => hit.content).join('\n');
  } catch {}

  const supersessionNotice = chosenCandidate.notes?.includes('Substituição oficial')
    ? ` [Substituição oficial ativa: ${chosenCandidate.partNumber}]`
    : '';
  return {
    status: 'FOUND',
    chosenPartId: chosenCandidate.id,
    explanation: `${decision.explanation}${contextEvidence ? ' (Confirmado no contexto do IPL)' : ''}${supersessionNotice}`,
    candidates,
  };
}

export class ReActAgentService {
  static async execute(
    tenantId: string,
    question: string,
    explicitPnc?: string,
    preParsedIntent?: SearchIntent,
  ): Promise<ReActSearchResult> {
    const intent = preParsedIntent || (await ChatIntentService.parse(question, tenantId));
    if (explicitPnc) intent.pnc = explicitPnc;

    let expandedDescription = intent.partDescription || '';
    const concepts = findPartConcepts(intent.partDescription || question);
    if (concepts.length > 0) {
      const allTerms = concepts.flatMap(concept => concept.variants);
      expandedDescription = [...new Set([expandedDescription, ...allTerms])].filter(Boolean).join(' / ');
    }

    const searchIntent: SearchIntent = {
      ...intent,
      partDescription: expandedDescription || intent.partDescription,
    };

    const rawCandidates = await PartSearchService.semantic(tenantId, question, searchIntent);
    if (!rawCandidates.length) {
      return { status: 'NOT_FOUND', explanation: 'Não encontrei nenhuma peça correspondente no catálogo técnico.', candidates: [] };
    }

    const candidates = preferCurrentPartNumbers(filterCandidatesByMarket(rawCandidates));
    if (!candidates.length) {
      return {
        status: 'NOT_FOUND',
        explanation: 'Nenhuma peça correspondente foi encontrada para a região de mercado configurada.',
        candidates: rawCandidates,
      };
    }

    if (candidates.length === 1) {
      const single = candidates[0];
      const supersessionNotice = single.notes?.includes('Substituição oficial') ? ` [Substituição oficial ativa: ${single.partNumber}]` : '';
      return {
        status: 'FOUND',
        chosenPartId: single.id,
        explanation: `Peça única identificada com certeza técnica para o modelo ${single.model} (${single.name}, código ${single.partNumber})${supersessionNotice}.`,
        candidates,
      };
    }

    const localSelection = chooseCandidateLocally(question, candidates.map(candidate => ({
      id: candidate.id,
      name: candidate.name,
      model: candidate.model,
      pnc: candidate.pnc,
      section: candidate.section,
      position: candidate.position,
      aliases: candidate.alternativeNames,
      feedbackScore: candidate.feedbackScore,
      notes: candidate.notes,
      retrievalScore: candidate.retrievalScore,
      retrievalAgreement: candidate.retrievalAgreement,
      retrievalSources: candidate.retrievalSources,
    })));

    if (!localSelection.ambiguous && localSelection.id) {
      const top = candidates.find(candidate => candidate.id === localSelection.id);
      if (top) {
        const supersessionNotice = top.notes?.includes('Substituição oficial') ? ` [Substituição oficial ativa: ${top.partNumber}]` : '';
        return {
          status: 'FOUND',
          chosenPartId: top.id,
          explanation: `Peça identificada com alta certeza técnica e semântica para o modelo ${top.model} (${top.name}, código ${top.partNumber})${supersessionNotice}.`,
          candidates,
        };
      }
    }

    const top = candidates[0];
    const second = candidates[1];
    if (top.distance <= 0.22 && (second.distance - top.distance >= 0.25 || (top.retrievalAgreement && top.retrievalAgreement >= 2))) {
      const supersessionNotice = top.notes?.includes('Substituição oficial') ? ` [Substituição oficial ativa: ${top.partNumber}]` : '';
      return {
        status: 'FOUND',
        chosenPartId: top.id,
        explanation: `Peça correspondente de alta precisão identificada para o modelo ${top.model} (${top.name}, código ${top.partNumber})${supersessionNotice}.`,
        candidates,
      };
    }

    const cacheIdentity = rankingIdentity(question, explicitPnc, candidates);
    const cachedDecision = await AiDecisionCacheService.get<CachedRankingDecision>(tenantId, 'REACT_RANKING', cacheIdentity);
    if (cachedDecision) return foundFromDecision(cachedDecision, candidates, tenantId, question);

    // IA só entra depois de recuperação, filtros de mercado, supersession e ranking
    // local. Sem franquia, o comportamento seguro é pedir contexto em vez de chutar.
    if (!(await canUseInteractiveAi(tenantId))) {
      return {
        status: 'AMBIGUOUS',
        explanation: 'Há mais de uma peça tecnicamente plausível. Informe PNC, posição, vista ou número de série para eu resolver sem depender da IA generativa.',
        candidates,
      };
    }

    const ai = await getGeminiClient();
    const candidatesSummary = candidates.slice(0, 6).map((candidate, index) =>
      `#${index + 1} id=${candidate.id}; nome=${candidate.name}; codigo=${candidate.partNumber}; modelo=${candidate.model}; pnc=${candidate.pnc || 'qualquer'}; secao=${candidate.section || 'N/A'}; posicao=${candidate.position || 'N/A'}; notas=${candidate.notes || 'N/A'}; score=${candidate.distance}; acordo=${candidate.retrievalAgreement || 0}`,
    ).join('\n');

    const decisionPrompt = `Você é um especialista em catálogo de peças Husqvarna.\nPergunta: "${question}"\n\nCandidatos já encontrados no IPL:\n${candidatesSummary}\n\nEscolha SOMENTE entre esses IDs. Priorize Brasil/América Latina, modelo, PNC, seção, posição e descrição. Preserve substituição oficial vigente. Se duas opções continuarem plausíveis, marque ambiguous=true. Não invente aplicação nem código.\n\nRetorne JSON com chosenId, explanation e ambiguous.`;

    try {
      const decisionResponse = await withTransientAIRetry(
        () => ai.interactions.create({
          model: GEMINI_GENERATIVE_MODEL,
          input: decisionPrompt,
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: {
              type: 'object',
              properties: {
                chosenId: { type: 'string' },
                explanation: { type: 'string' },
                ambiguous: { type: 'boolean' },
              },
              required: ['explanation', 'ambiguous'],
            },
          },
        }, { timeout_ms: INTERACTIVE_AI_TIMEOUT_MS }),
        { label: 'ReAct Agent Decision', maxAttempts: 2, baseDelayMs: 500, maxDelayMs: 1_500 },
      );

      recordAiTelemetry(tenantId, 'REACT_AGENT_DECISION', decisionResponse);
      consumeInteractiveAiBudget(tenantId, extractAiUsage(decisionResponse).totalTokens);

      const rawText = String((decisionResponse as any).output_text || '').trim();
      const cleanedText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      let decision: CachedRankingDecision;
      try {
        const parsed = JSON.parse(cleanedText || '{}') as Partial<CachedRankingDecision>;
        decision = {
          chosenId: typeof parsed.chosenId === 'string' ? parsed.chosenId : null,
          explanation: typeof parsed.explanation === 'string' ? parsed.explanation.trim() : '',
          ambiguous: Boolean(parsed.ambiguous),
        };
      } catch (parseError) {
        console.warn('[ReActAgent] Resposta não-JSON do Gemini:', parseError, rawText);
        return { status: 'AMBIGUOUS', explanation: 'Identifiquei múltiplos candidatos no catálogo e recomendo conferência manual.', candidates };
      }

      // Só persiste decisões que referenciam o mesmo conjunto de candidatos; a
      // identidade contém IDs/códigos/contexto, então alterações de catálogo geram outra chave.
      await AiDecisionCacheService.set(tenantId, 'REACT_RANKING', cacheIdentity, decision, PERSISTENT_RANKING_TTL_MS);
      return foundFromDecision(decision, candidates, tenantId, question);
    } catch (error) {
      console.warn('⚠️ Falha na tomada de decisão do ReAct Agent.', error);
      return { status: 'AMBIGUOUS', explanation: 'Falha ao analisar os candidatos.', candidates };
    }
  }
}
