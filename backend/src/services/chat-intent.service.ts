import { GEMINI_GENERATIVE_MODEL, getGeminiClient } from '../config/gemini';
import { extractExplicitSerialNumber } from './candidate-specificity';
import { buildFallbackIntent, chooseCandidateLocally } from './chat-reliability';
import { hasDomainKnowledge } from './husqvarna-domain-knowledge';
import { hasKnownPartVocabulary, lexicalTerms } from './part-vocabulary';
import { withTransientAIRetry } from '../utils/ai-retry';
import { LRUCache } from 'lru-cache';
import { extractAiUsage, recordAiTelemetry } from '../utils/ai-telemetry';
import { PartSearchService } from './part-search.service';
import {
  interactiveAiFailureSettlementTokens,
  reserveInteractiveAiBudget,
  settleInteractiveAiBudget,
} from './interactive-ai-budget';
import { AiDecisionCacheService } from './ai-decision-cache.service';

const INTERACTIVE_AI_TIMEOUT_MS = 8_000;
const INTERACTIVE_AI_RETRY = { maxAttempts: 2, baseDelayMs: 500, maxDelayMs: 1_500 } as const;
const PERSISTENT_INTENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const intentCache = new LRUCache<string, Partial<SearchIntent>>({
  max: 500,
  ttl: 1000 * 60 * 60 * 2,
});

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

function mergeIntent(localIntent: SearchIntent, cached: Partial<SearchIntent>, question: string): SearchIntent {
  const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  return {
    manufacturer: localIntent.manufacturer || clean(cached.manufacturer),
    model: localIntent.model || clean(cached.model),
    pnc: localIntent.pnc || clean(cached.pnc),
    partDescription: clean(cached.partDescription) || localIntent.partDescription || question.trim(),
    partNumber: localIntent.partNumber || clean(cached.partNumber),
    section: clean(cached.section),
    position: clean(cached.position),
  };
}

export class ChatIntentService {
  static async parse(question: string, tenantId?: string): Promise<SearchIntent> {
    const localIntent = buildFallbackIntent(question);
    const knownVocabulary = hasKnownPartVocabulary(question);
    const knownDomain = hasDomainKnowledge(question, localIntent.model);
    const serial = extractExplicitSerialNumber(question);
    const unknownDescriptionTerms = lexicalTerms(question, [
      localIntent.manufacturer,
      localIntent.model,
      localIntent.pnc,
      localIntent.partNumber,
      serial,
      'serial',
      'numero de serie',
      'número de série',
    ]);

    // O caminho comum do balcão não consome IA: código, vocabulário conhecido,
    // domínio conhecido e consultas totalmente interpretáveis ficam locais.
    if (localIntent.partNumber || knownVocabulary || knownDomain || !unknownDescriptionTerms.length) return localIntent;

    const normalizedQuestion = question.trim().toLocaleLowerCase('pt-BR');
    const cacheKey = `${tenantId || 'global'}:${normalizedQuestion}`;
    const cached = intentCache.get(cacheKey);
    if (cached) return mergeIntent(localIntent, cached, question);

    // Persistência evita pagar novamente pela mesma interpretação depois que o
    // Render Free dorme/reinicia. O cache contém apenas intenção estruturada.
    if (tenantId) {
      const persisted = await AiDecisionCacheService.get<Partial<SearchIntent>>(
        tenantId,
        'CHAT_INTENT_PARSE',
        { question: normalizedQuestion },
      );
      if (persisted) {
        intentCache.set(cacheKey, persisted);
        return mergeIntent(localIntent, persisted, question);
      }
    }

    let similarModelsHint = '';
    if (tenantId && localIntent.model) {
      const similar = await PartSearchService.similarModels(tenantId, localIntent.model);
      if (similar.length > 0) {
        similarModelsHint = `Modelos válidos existentes na loja mais próximos: [${similar.join(', ')}]\nSe a menção do usuário corresponder fonética ou ortograficamente a um desses, use a grafia oficial.`;
      }
    }

    const reservation = tenantId ? await reserveInteractiveAiBudget(tenantId) : null;
    if (tenantId && !reservation) {
      console.info('[AI Budget] Interpretação generativa pulada; usando leitura local segura.');
      return localIntent;
    }

    let aiRequestAttempted = false;
    try {
      const ai = await getGeminiClient();
      const localHints = [
        localIntent.manufacturer ? `Fabricante detectado localmente: ${localIntent.manufacturer}` : '',
        localIntent.model ? `Modelo detectado localmente: ${localIntent.model}` : '',
        localIntent.pnc ? `PNC detectado localmente: ${localIntent.pnc}` : '',
        serial ? `Número de série detectado localmente: ${serial}` : '',
        similarModelsHint,
      ].filter(Boolean).join('\n');

      aiRequestAttempted = true;
      const response = await withTransientAIRetry(
        () => ai.interactions.create({
          model: GEMINI_GENERATIVE_MODEL,
          input: `Interprete uma consulta de balcão de peças. Extraia somente o que foi informado ou claramente implícito. Não invente modelo, PNC, posição ou código.\n${localHints ? `\nPistas locais confiáveis (não contradiga):\n${localHints}\n` : ''}\nPara partDescription, preserve o nome pedido pelo usuário. É CRÍTICO preservar adjetivos mecânicos e de posição (ex: "esquerda", "direita", "superior", "inferior", "traseiro"). Se houver um equivalente técnico inequívoco em inglês ou português, acrescente-o separado por " / " (Ex: "volante magnético / flywheel"). Não transforme um componente em conjunto completo e não invente sinônimos incertos.\n\nConsulta: ${question}`,
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: {
              type: 'object',
              properties: {
                manufacturer: { type: 'string' },
                model: { type: 'string' },
                pnc: { type: 'string' },
                partDescription: { type: 'string' },
                partNumber: { type: 'string' },
                section: { type: 'string' },
                position: { type: 'string' },
              },
              required: ['manufacturer', 'model', 'pnc', 'partDescription', 'partNumber', 'section', 'position'],
            },
          },
        }, { timeout_ms: INTERACTIVE_AI_TIMEOUT_MS }),
        { label: 'Chat Intent Parse', ...INTERACTIVE_AI_RETRY },
      );
      recordAiTelemetry(tenantId || 'global', 'CHAT_INTENT_PARSE', response, reservation ? { reservationId: reservation.id } : undefined);
      if (tenantId && reservation) {
        await settleInteractiveAiBudget(tenantId, reservation.id, extractAiUsage(response).totalTokens);
      }

      const rawText = String((response as any).output_text || '').trim();
      const cleanedText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      let parsed: Partial<SearchIntent>;
      try {
        parsed = JSON.parse(cleanedText || '{}');
      } catch {
        console.error('❌ Falha ao processar o JSON retornado pelo Gemini no ChatIntentService.parse:', rawText);
        throw new Error('Gemini retornou JSON inválido.');
      }

      intentCache.set(cacheKey, parsed);
      if (tenantId) {
        void AiDecisionCacheService.set(
          tenantId,
          'CHAT_INTENT_PARSE',
          { question: normalizedQuestion },
          parsed,
          PERSISTENT_INTENT_TTL_MS,
        );
      }
      return mergeIntent(localIntent, parsed, question);
    } catch (error) {
      if (tenantId && reservation) {
        const failureTokens = interactiveAiFailureSettlementTokens(aiRequestAttempted);
        if (failureTokens !== null) {
          await settleInteractiveAiBudget(tenantId, reservation.id, failureTokens).catch(() => undefined);
        }
      }
      console.warn('⚠️ Interpretação generativa indisponível; usando leitura local segura.', error instanceof Error ? error.message : error);
      return localIntent;
    }
  }

  static async choose(tenantId: string, question: string, candidates: CandidateForAi[]): Promise<{ id: string | null; confidence: number; ambiguous: boolean }> {
    if (candidates.length === 1) return { id: candidates[0].id, confidence: 0.99, ambiguous: false };

    const localSelection = chooseCandidateLocally(question, candidates);
    if (!localSelection.ambiguous) return localSelection;

    const reservation = await reserveInteractiveAiBudget(tenantId);
    if (!reservation) return localSelection;
    let aiRequestAttempted = false;
    try {
      const ai = await getGeminiClient();
      aiRequestAttempted = true;
      const response = await withTransientAIRetry(
        () => ai.interactions.create({
          model: GEMINI_GENERATIVE_MODEL,
          input: `Você está escolhendo uma peça entre candidatos JÁ ENCONTRADOS no banco.\nNunca crie IDs. Nunca escolha apenas por modelo parecido. Diferencie peça completa, kit, junta, parafuso, suporte etc.\nOs campos retrievalScore/retrievalAgreement apenas informam concordância dos recuperadores; eles não substituem compatibilidade mecânica.\nConsidere que a revenda está no Brasil. Se houver restrição regional nos nomes ou notas (ex: EU, US, ASIA, Latin America), dê preferência à opção compatível com o Brasil (Latin America, BR, etc) e descarte as de outras regiões.\nSe ainda houver duas opções plausíveis, marque ambiguous=true.\n\nPergunta: ${question}\n\nCandidatos:\n${candidates.map(candidate => JSON.stringify(candidate)).join('\n')}`,
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                confidence: { type: 'number' },
                ambiguous: { type: 'boolean' },
              },
              required: ['id', 'confidence', 'ambiguous'],
            },
          },
        }, { timeout_ms: INTERACTIVE_AI_TIMEOUT_MS }),
        { label: 'Chat Intent Choose', ...INTERACTIVE_AI_RETRY },
      );
      recordAiTelemetry(tenantId, 'CHAT_INTENT_CHOOSE', response, { reservationId: reservation.id });
      await settleInteractiveAiBudget(tenantId, reservation.id, extractAiUsage(response).totalTokens);

      const rawText = String((response as any).output_text || '').trim();
      const cleanedText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

      let parsed: { id?: unknown; confidence?: unknown; ambiguous?: unknown };
      try {
        parsed = JSON.parse(cleanedText || '{}');
      } catch {
        console.error('❌ Falha ao processar o JSON retornado pelo Gemini no ChatIntentService.choose:', rawText);
        throw new Error('Gemini retornou JSON inválido.');
      }

      const id = typeof parsed.id === 'string' && candidates.some(candidate => candidate.id === parsed.id) ? parsed.id : null;
      const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
      return { id, confidence, ambiguous: Boolean(parsed.ambiguous) || !id };
    } catch (error) {
      const failureTokens = interactiveAiFailureSettlementTokens(aiRequestAttempted);
      if (failureTokens !== null) {
        await settleInteractiveAiBudget(tenantId, reservation.id, failureTokens).catch(() => undefined);
      }
      console.warn('⚠️ Ranking generativo indisponível; usando comparação textual segura.', error instanceof Error ? error.message : error);
      return chooseCandidateLocally(question, candidates);
    }
  }
}
