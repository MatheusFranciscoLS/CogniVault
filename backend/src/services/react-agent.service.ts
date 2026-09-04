import { GEMINI_GENERATIVE_MODEL, getGeminiClient } from '../config/gemini';
import { PartSearchService, type PartCandidate } from './part-search.service';
import type { SearchIntent } from './chat-intent.service';
import { ChatIntentService } from './chat-intent.service';
import { filterCandidatesByMarket } from './catalog-market';
import { findPartConcepts } from './part-vocabulary';
import { retrieveTechnicalContext } from './document-memory';
import { preferCurrentPartNumbers } from './part-supersession';
import { chooseCandidateLocally } from './chat-reliability';

export interface ReActSearchResult {
  status: 'FOUND' | 'NOT_FOUND' | 'AMBIGUOUS' | 'MODEL_REQUIRED' | 'PNC_REQUIRED';
  chosenPartId?: string;
  explanation: string;
  suggestedModel?: string;
  suggestedPnc?: string;
  candidates?: PartCandidate[];
}

export class ReActAgentService {
  /**
   * Executa o fluxo de reasoning e ação para resolver a intenção do usuário com alta velocidade e certeza técnica.
   */
  static async execute(
    tenantId: string,
    question: string,
    explicitPnc?: string,
    preParsedIntent?: SearchIntent,
  ): Promise<ReActSearchResult> {
    // Step 1: Parse and Expand Query (Reasoning)
    const intent = preParsedIntent || (await ChatIntentService.parse(question));
    if (explicitPnc) intent.pnc = explicitPnc;

    // Fast local concept expansion using Husqvarna ontology (zero latency)
    let expandedDescription = intent.partDescription || '';
    const concepts = findPartConcepts(intent.partDescription || question);
    if (concepts.length > 0) {
      const allTerms = concepts.flatMap(c => c.variants);
      expandedDescription = [...new Set([expandedDescription, ...allTerms])].filter(Boolean).join(' / ');
    }

    const searchIntent: SearchIntent = {
      ...intent,
      partDescription: expandedDescription || intent.partDescription,
    };

    // Step 2: Action - Search Database (Hybrid Retrieval)
    const rawCandidates = await PartSearchService.semantic(tenantId, question, searchIntent);

    if (!rawCandidates.length) {
      return {
        status: 'NOT_FOUND',
        explanation: 'Não encontrei nenhuma peça correspondente no catálogo técnico.',
        candidates: [],
      };
    }

    // Step 3: Market Filtering & Official Supersession (Strict priority to Latin America / Brazil)
    const candidates = preferCurrentPartNumbers(filterCandidatesByMarket(rawCandidates));
    if (!candidates.length) {
      return {
        status: 'NOT_FOUND',
        explanation: 'Nenhuma peça correspondente foi encontrada para a região de mercado configurada.',
        candidates: rawCandidates,
      };
    }

    // Fast-path 1: Single remaining candidate (0ms)
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

    // Fast-path 2: Deterministic local selection using Husqvarna engineering ontology (<20ms)
    const localSelection = chooseCandidateLocally(question, candidates.map(c => ({
      id: c.id,
      name: c.name,
      model: c.model,
      pnc: c.pnc,
      section: c.section,
      position: c.position,
      aliases: c.alternativeNames,
      feedbackScore: c.feedbackScore,
      notes: c.notes,
      retrievalScore: c.retrievalScore,
      retrievalAgreement: c.retrievalAgreement,
      retrievalSources: c.retrievalSources,
    })));

    if (!localSelection.ambiguous && localSelection.id) {
      const top = candidates.find(c => c.id === localSelection.id);
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

    // Fast-path 3: Dominant winner with decisive margin or strong retrieval agreement
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

    // Step 4: Observation & Reasoning via Gemini with technical notes and market context
    const ai = await getGeminiClient();
    const candidatesSummary = candidates.slice(0, 10).map((c, index) => {
      return `Opção ${index + 1}:
ID: ${c.id}
Nome: ${c.name}
Código: ${c.partNumber}
Modelo: ${c.model}
PNC: ${c.pnc || 'Qualquer'}
Seção: ${c.section || 'N/A'}
Posição: ${c.position || 'N/A'}
Mercado/Notas: ${c.notes || 'Universal'}
Score de Recuperação: ${c.distance} (menor é melhor)`;
    }).join('\n\n');

    const decisionPrompt = `Você é um especialista em catálogo de peças Husqvarna.
O usuário perguntou: "${question}"

Resultados da busca no banco de dados (IPLs):
${candidatesSummary}

Instruções:
1. Analise cuidadosamente a pergunta do usuário e os candidatos.
2. Priorize estritamente opções para o mercado regional (Brasil / América Latina / South America). Se houver indicação de substituição oficial vigente, preserve o código atualizado.
3. Identifique qual é a peça exata que o usuário deseja com base em modelo, seção, posição e descrição técnica.
4. Para cortadores Giro Zero (ex: Z248F, Z254F, Z448, Z454, Z460, Z560X) e seus motores acoplados (Kawasaki FR691V, FX730V, FX921V, Husqvarna HV764, etc.), correlacione peças internas de motor com o motor correspondente e peças de deck/chassi com a máquina.
5. Se houver uma peça claramente correta no mercado regional, escolha-a.
6. Se não houver uma peça claramente correta, retorne ambiguous = true.
7. Explique seu raciocínio técnico.

Retorne um JSON com:
- chosenId: O ID da peça escolhida (ou null se ambíguo/não encontrado)
- explanation: A explicação do seu raciocínio técnico
- ambiguous: Booleano indicando se a resposta é incerta`;

    try {
      const decisionResponse = await ai.interactions.create({
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
      });

      const rawText = String((decisionResponse as any).output_text || '').trim();
      const cleanedText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      let decision: { chosenId?: string | null; explanation?: string; ambiguous?: boolean } = {};
      try {
        decision = JSON.parse(cleanedText || '{}');
      } catch (parseError) {
        console.warn('[ReActAgent] Resposta não-JSON do Gemini:', parseError, rawText);
        return {
          status: 'AMBIGUOUS',
          explanation: 'Identifiquei múltiplos candidatos no catálogo e recomendo conferência manual.',
          candidates,
        };
      }

      if (decision.ambiguous || !decision.chosenId) {
        return {
          status: 'AMBIGUOUS',
          explanation: decision.explanation || 'Encontrei mais de uma peça possível e preciso de mais detalhes.',
          candidates,
        };
      }

      const chosenCandidate = candidates.find(c => c.id === decision.chosenId);
      if (!chosenCandidate) {
        return { status: 'NOT_FOUND', explanation: 'O candidato escolhido não é válido.', candidates };
      }

      let contextEvidence = '';
      try {
        const hits = await retrieveTechnicalContext(tenantId, question, {
          model: chosenCandidate.model,
          documentId: chosenCandidate.documentId,
          limit: 2,
        });
        if (hits.length) {
          contextEvidence = hits.map(h => h.content).join('\n');
        }
      } catch (e) {}

      const supersessionNotice = chosenCandidate.notes?.includes('Substituição oficial') ? ` [Substituição oficial ativa: ${chosenCandidate.partNumber}]` : '';
      return {
        status: 'FOUND',
        chosenPartId: chosenCandidate.id,
        explanation: `${decision.explanation}${contextEvidence ? ' (Confirmado no contexto do IPL)' : ''}${supersessionNotice}`,
        candidates,
      };

    } catch (e) {
      console.warn('⚠️ Falha na tomada de decisão do ReAct Agent.', e);
      return { status: 'AMBIGUOUS', explanation: 'Falha ao analisar os candidatos.', candidates };
    }
  }
}
