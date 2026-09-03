import { GEMINI_GENERATIVE_MODEL, getGeminiClient } from '../config/gemini';
import { PartSearchService, type PartCandidate } from './part-search.service';
import type { SearchIntent } from './chat-intent.service';
import { ChatIntentService } from './chat-intent.service';
import { evaluateAnswerConfidence } from './confidence-gate';
import { retrieveTechnicalContext } from './document-memory';

export interface ReActSearchResult {
  status: 'FOUND' | 'NOT_FOUND' | 'AMBIGUOUS' | 'MODEL_REQUIRED' | 'PNC_REQUIRED';
  chosenPartId?: string;
  explanation: string;
  suggestedModel?: string;
  suggestedPnc?: string;
}

export class ReActAgentService {
  /**
   * Executa o fluxo de reasoning e ação para resolver a intenção do usuário.
   */
  static async execute(tenantId: string, question: string, explicitPnc?: string): Promise<ReActSearchResult> {
    const ai = await getGeminiClient();
    
    // Step 1: Parse and Expand Query (Reasoning)
    const intent = await ChatIntentService.parse(question);
    if (explicitPnc) intent.pnc = explicitPnc;

    // Expanding terms (Translating to Husqvarna Technical English/Spanish)
    const expansionPrompt = `O usuário está buscando uma peça de equipamento Husqvarna.
Consulta original: "${question}"
Equipamento detectado: ${intent.model || 'Nenhum'}
Descrição detectada: ${intent.partDescription || 'Nenhuma'}

Forneça sinônimos técnicos e traduções comuns (Inglês e Espanhol) para esta peça que costumam aparecer nos Manuais de Peças (IPL) da Husqvarna. 
Retorne apenas os sinônimos separados por " / ". Não inclua o nome do modelo.`;

    let expandedDescription = intent.partDescription;
    try {
      const expansionResponse = await ai.interactions.create({
        model: GEMINI_GENERATIVE_MODEL,
        input: expansionPrompt,
      });
      const synonyms = expansionResponse.output_text?.trim() || '';
      if (synonyms && !synonyms.includes('{') && !synonyms.includes('}')) {
        expandedDescription = `${intent.partDescription} / ${synonyms}`;
      }
    } catch (e) {
      console.warn('⚠️ Falha ao expandir sinônimos no ReAct Agent.', e);
    }

    const searchIntent: SearchIntent = {
      ...intent,
      partDescription: expandedDescription,
    };

    // Step 2: Action - Search Database
    const candidates = await PartSearchService.semantic(tenantId, question, searchIntent);

    if (!candidates.length) {
      return {
        status: 'NOT_FOUND',
        explanation: 'Não encontrei nenhuma peça correspondente após expandir a busca para múltiplos idiomas e sinônimos técnicos.',
      };
    }

    // Step 3: Observation & Reasoning - Let Gemini pick the best candidate based on technical context
    const candidatesSummary = candidates.slice(0, 10).map((c, index) => {
      return `Opção ${index + 1}:
ID: ${c.id}
Nome: ${c.name}
Código: ${c.partNumber}
Modelo: ${c.model}
PNC: ${c.pnc || 'Qualquer'}
Seção: ${c.section || 'N/A'}
Posição: ${c.position || 'N/A'}
Score de Recuperação: ${c.distance} (menor é melhor)`;
    }).join('\n\n');

    const decisionPrompt = `Você é um especialista em catálogo de peças Husqvarna.
O usuário perguntou: "${question}"

Resultados da busca no banco de dados (IPLs):
${candidatesSummary}

Instruções:
1. Analise cuidadosamente a pergunta do usuário e os candidatos.
2. Identifique qual é a peça exata que o usuário deseja. Leve em conta modelo, posição e descrições equivalentes (português, inglês, espanhol).
3. Se não houver uma peça claramente correta, retorne ambiguous = true.
4. Explique seu raciocínio (Thought) detalhadamente na explicação.

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

      const decision = JSON.parse((decisionResponse as any).output_text || '{}');
      if (decision.ambiguous || !decision.chosenId) {
        return {
          status: 'AMBIGUOUS',
          explanation: decision.explanation || 'Encontrei mais de uma peça possível e preciso de mais detalhes.',
        };
      }

      const chosenCandidate = candidates.find(c => c.id === decision.chosenId);
      if (!chosenCandidate) {
        return { status: 'NOT_FOUND', explanation: 'O candidato escolhido não é válido.' };
      }

      // Action 2: Get Context to verify
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

      return {
        status: 'FOUND',
        chosenPartId: chosenCandidate.id,
        explanation: `${decision.explanation}${contextEvidence ? ' (Confirmado no contexto do IPL)' : ''}`,
      };

    } catch (e) {
      console.warn('⚠️ Falha na tomada de decisão do ReAct Agent.', e);
      return { status: 'AMBIGUOUS', explanation: 'Falha ao analisar os candidatos.' };
    }
  }
}
