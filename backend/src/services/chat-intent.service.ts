import { GEMINI_GENERATIVE_MODEL, getGeminiClient, getGeminiType } from '../config/gemini';
import { buildFallbackIntent, chooseCandidateLocally } from './chat-reliability';
import { hasKnownPartVocabulary } from './part-vocabulary';

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
}

export class ChatIntentService {
  static async parse(question: string): Promise<SearchIntent> {
    const localIntent = buildFallbackIntent(question);
    if (hasKnownPartVocabulary(question) || localIntent.model || localIntent.pnc || localIntent.partNumber) return localIntent;

    try {
      const [ai, Type] = await Promise.all([getGeminiClient(), getGeminiType()]);
      const response = await ai.models.generateContent({
        model: GEMINI_GENERATIVE_MODEL,
        contents: `Interprete uma consulta de balcão de peças. Extraia somente o que foi informado ou claramente implícito. Não invente modelo, PNC ou código.\n\nConsulta: ${question}`,
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
      const clean = (v: unknown) => typeof v === 'string' ? v.trim() : '';
      return {
        manufacturer: clean(parsed.manufacturer),
        model: clean(parsed.model),
        pnc: clean(parsed.pnc),
        partDescription: clean(parsed.partDescription) || question.trim(),
        partNumber: clean(parsed.partNumber),
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
    // Para termos técnicos conhecidos, duas opções textualmente equivalentes
    // representam ambiguidade real de catálogo. A IA não recebe evidência nova
    // para escolher uma delas e, portanto, não deve inventar um desempate.
    if (hasKnownPartVocabulary(question)) return localSelection;

    try {
      const [ai, Type] = await Promise.all([getGeminiClient(), getGeminiType()]);
      const response = await ai.models.generateContent({
        model: GEMINI_GENERATIVE_MODEL,
        contents: `Você está escolhendo uma peça entre candidatos JÁ ENCONTRADOS no banco.\nNunca crie IDs. Nunca escolha apenas por modelo parecido. Diferencie peça completa, kit, junta, parafuso, suporte etc.\nSe houver duas opções plausíveis, marque ambiguous=true.\n\nPergunta: ${question}\n\nCandidatos:\n${candidates.map(c => JSON.stringify(c)).join('\n')}`,
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
      const id = typeof parsed.id === 'string' && candidates.some(c => c.id === parsed.id) ? parsed.id : null;
      const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
      return { id, confidence, ambiguous: Boolean(parsed.ambiguous) || !id };
    } catch (error) {
      console.warn('⚠️ Ranking generativo indisponível; usando comparação textual segura.', error instanceof Error ? error.message : error);
      return chooseCandidateLocally(question, candidates);
    }
  }
}
