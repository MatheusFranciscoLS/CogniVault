import { GEMINI_GENERATIVE_MODEL, getGeminiClient } from '../config/gemini';
import { extractExplicitSerialNumber } from './candidate-specificity';
import { buildFallbackIntent, chooseCandidateLocally } from './chat-reliability';
import { hasDomainKnowledge } from './husqvarna-domain-knowledge';
import { hasKnownPartVocabulary, lexicalTerms } from './part-vocabulary';
import { LRUCache } from 'lru-cache';

const intentCache = new LRUCache<string, Partial<SearchIntent>>({
  max: 500, // Armazena até 500 intenções
  ttl: 1000 * 60 * 60 * 2, // 2 horas de cache por pergunta
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

export class ChatIntentService {
  static async parse(question: string): Promise<SearchIntent> {
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

    if (localIntent.partNumber || knownVocabulary || knownDomain || !unknownDescriptionTerms.length) return localIntent;

    const cacheKey = question.trim().toLowerCase();
    const cached = intentCache.get(cacheKey);
    if (cached) {
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

    try {
      const ai = await getGeminiClient();
      const localHints = [
        localIntent.manufacturer ? `Fabricante detectado localmente: ${localIntent.manufacturer}` : '',
        localIntent.model ? `Modelo detectado localmente: ${localIntent.model}` : '',
        localIntent.pnc ? `PNC detectado localmente: ${localIntent.pnc}` : '',
        serial ? `Número de série detectado localmente: ${serial}` : '',
      ].filter(Boolean).join('\n');

      const response = await ai.interactions.create({
        model: GEMINI_GENERATIVE_MODEL,
        input: `Interprete uma consulta de balcão de peças. Extraia somente o que foi informado ou claramente implícito. Não invente modelo, PNC, posição ou código.\n${localHints ? `\nPistas locais confiáveis (não contradiga):\n${localHints}\n` : ''}\nPara partDescription, preserve o nome pedido pelo usuário. Se houver um equivalente técnico inequívoco em inglês, português do Brasil ou português de Portugal, acrescente-o na mesma string separado por " / ". Exemplo: "volante magnético / flywheel". Não transforme um componente em conjunto completo e não invente sinônimos incertos.\n\nConsulta: ${question}`,
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
      });
      const parsed = JSON.parse((response as any).output_text || '{}') as Partial<SearchIntent>;
      intentCache.set(cacheKey, parsed);
      const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';
      return {
        manufacturer: localIntent.manufacturer || clean(parsed.manufacturer),
        model: localIntent.model || clean(parsed.model),
        pnc: localIntent.pnc || clean(parsed.pnc),
        partDescription: clean(parsed.partDescription) || localIntent.partDescription || question.trim(),
        partNumber: localIntent.partNumber || clean(parsed.partNumber),
        section: clean(parsed.section),
        position: clean(parsed.position),
      };
    } catch (error) {
      console.warn('⚠️ Interpretação generativa indisponível; usando leitura local segura.', error instanceof Error ? error.message : error);
      return localIntent;
    }
  }

  static async choose(question: string, candidates: CandidateForAi[]): Promise<{ id: string | null; confidence: number; ambiguous: boolean }> {
    if (candidates.length === 1) return { id: candidates[0].id, confidence: 0.99, ambiguous: false };

    const localSelection = chooseCandidateLocally(question, candidates);
    if (!localSelection.ambiguous) return localSelection;

    try {
      const ai = await getGeminiClient();
      const response = await ai.interactions.create({
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
      });
      const parsed = JSON.parse((response as any).output_text || '{}') as { id?: unknown; confidence?: unknown; ambiguous?: unknown };
      const id = typeof parsed.id === 'string' && candidates.some(candidate => candidate.id === parsed.id) ? parsed.id : null;
      const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
      return { id, confidence, ambiguous: Boolean(parsed.ambiguous) || !id };
    } catch (error) {
      console.warn('⚠️ Ranking generativo indisponível; usando comparação textual segura.', error instanceof Error ? error.message : error);
      return chooseCandidateLocally(question, candidates);
    }
  }
}
