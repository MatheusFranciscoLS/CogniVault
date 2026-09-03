import { GEMINI_GENERATIVE_MODEL, getGeminiClient, getGeminiType } from '../config/gemini';
import { extractExplicitSerialNumber } from './candidate-specificity';
import { buildFallbackIntent, chooseCandidateLocally } from './chat-reliability';
import { hasDomainKnowledge } from './husqvarna-domain-knowledge';
import { hasKnownPartVocabulary, lexicalTerms } from './part-vocabulary';

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

    try {
      const [ai, Type] = await Promise.all([getGeminiClient(), getGeminiType()]);
      const localHints = [
        localIntent.manufacturer ? `Fabricante detectado localmente: ${localIntent.manufacturer}` : '',
        localIntent.model ? `Modelo detectado localmente: ${localIntent.model}` : '',
        localIntent.pnc ? `PNC detectado localmente: ${localIntent.pnc}` : '',
        serial ? `Número de série detectado localmente: ${serial}` : '',
      ].filter(Boolean).join('\n');

      const response = await ai.models.generateContent({
        model: GEMINI_GENERATIVE_MODEL,
        contents: `Interprete uma consulta de balcão de peças. Extraia somente o que foi informado ou claramente implícito. Não invente modelo, PNC, posição ou código.\n${localHints ? `\nPistas locais confiáveis (não contradiga):\n${localHints}\n` : ''}\nPara partDescription, preserve o nome pedido pelo usuário. Se houver um equivalente técnico inequívoco em inglês, espanhol, português do Brasil ou português de Portugal, acrescente-o na mesma string separado por " / ". Exemplo: "volante magnético / flywheel / volante". Não transforme um componente em conjunto completo e não invente sinônimos incertos.\n\nConsulta: ${question}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              manufacturer: { type: Type.STRING },
              model: { type: Type.STRING },
              pnc: { type: Type.STRING },
              partDescription: { type: Type.STRING },
              partNumber: { type: Type.STRING },
              section: { type: Type.STRING },
              position: { type: Type.STRING },
            },
            required: ['manufacturer', 'model', 'pnc', 'partDescription', 'partNumber', 'section', 'position'],
          },
        },
      });
      const parsed = JSON.parse(response.text || '{}') as Partial<SearchIntent>;
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
      const [ai, Type] = await Promise.all([getGeminiClient(), getGeminiType()]);
      const response = await ai.models.generateContent({
        model: GEMINI_GENERATIVE_MODEL,
        contents: `Você está escolhendo uma peça entre candidatos JÁ ENCONTRADOS no banco.\nNunca crie IDs. Nunca escolha apenas por modelo parecido. Diferencie peça completa, kit, junta, parafuso, suporte etc.\nOs campos retrievalScore/retrievalAgreement apenas informam concordância dos recuperadores; eles não substituem compatibilidade mecânica.\nSe houver duas opções plausíveis, marque ambiguous=true.\n\nPergunta: ${question}\n\nCandidatos:\n${candidates.map(candidate => JSON.stringify(candidate)).join('\n')}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              ambiguous: { type: Type.BOOLEAN },
            },
            required: ['id', 'confidence', 'ambiguous'],
          },
        },
      });
      const parsed = JSON.parse(response.text || '{}') as { id?: unknown; confidence?: unknown; ambiguous?: unknown };
      const id = typeof parsed.id === 'string' && candidates.some(candidate => candidate.id === parsed.id) ? parsed.id : null;
      const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
      return { id, confidence, ambiguous: Boolean(parsed.ambiguous) || !id };
    } catch (error) {
      console.warn('⚠️ Ranking generativo indisponível; usando comparação textual segura.', error instanceof Error ? error.message : error);
      return chooseCandidateLocally(question, candidates);
    }
  }
}
