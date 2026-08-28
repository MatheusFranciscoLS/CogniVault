import { prisma } from '../config/prisma';
import { normalizeIdentifier } from '../utils/normalize';
import { ChatIntentService } from './chat-intent.service';
import { buildFallbackIntent, calibrateMatchConfidence, extractLikelyPartNumber } from './chat-reliability';
import { PartSearchService, type PartCandidate } from './part-search.service';
import type { SearchIntent } from './chat-intent.service';
import { buildSearchGroups } from './part-vocabulary';

const MIN_CONFIDENCE = Number(process.env.PART_SEARCH_MIN_CONFIDENCE || '0.72');

export type SearchStatus = 'FOUND' | 'PNC_REQUIRED' | 'MODEL_REQUIRED' | 'PART_REQUIRED' | 'AMBIGUOUS' | 'NOT_FOUND';

export interface ChatSearchResult {
  status: SearchStatus;
  answer: string;
  requiresPnc?: boolean;
  pncOptions?: string[];
  modelOptions?: string[];
  confidence?: number;
  interpreted?: {
    partDescription: string;
    manufacturer: string | null;
    model: string | null;
    pnc: string | null;
    partNumber: string | null;
  };
  match?: {
    method: 'DIRECT_CODE' | 'SEMANTIC' | 'LEXICAL';
    level: 'EXACT' | 'HIGH' | 'REVIEW';
    explanation: string;
  };
  guidance?: { title: string; description: string; tips: string[] };
  part?: {
    id: string;
    name: string;
    partNumber: string;
    manufacturer: string | null;
    model: string;
    pnc: string;
    section: string | null;
    position: string | null;
    page: number | null;
    documentId: string;
    filename: string;
    universalAcrossPnc: boolean;
    applications: Array<{ model: string; pnc: string }>;
  };
  options?: Array<{ id: string; name: string; partNumber: string; model: string; pnc: string | null; section: string | null; position: string | null }>;
  feedbackOptions?: Array<{ id: string; name: string; partNumber: string; model: string; pnc: string | null; section: string | null; position: string | null }>;
}

function unique<T>(items: T[]): T[] { return [...new Set(items)]; }

export class ChatService {
  static async askQuestion(tenantId: string, question: string, explicitPnc?: string, selectedPartId?: string): Promise<ChatSearchResult> {
    if (selectedPartId) {
      const selected = await PartSearchService.byId(tenantId, selectedPartId);
      const selectionIntent = buildFallbackIntent(question);
      if (!selected) {
        return this.withContext({ status: 'NOT_FOUND', answer: 'A peça selecionada não está mais disponível em um catálogo ativo.' }, selectionIntent);
      }
      return this.withContext(
        this.found(selected, 1, selected.universalAcrossPnc ? 'Qualquer um' : (selected.pnc || explicitPnc || 'Não informado'), [selected]),
        selectionIntent,
      );
    }

    const likelyCode = extractLikelyPartNumber(question);
    if (likelyCode) {
      const localIntent = buildFallbackIntent(question);
      localIntent.partNumber = likelyCode;
      if (explicitPnc?.trim()) localIntent.pnc = explicitPnc.trim();
      const direct = await PartSearchService.directByCode(tenantId, likelyCode);
      if (direct.length === 1) {
        return this.withContext(this.found(direct[0], 1, direct[0].universalAcrossPnc ? 'Qualquer um' : (direct[0].pnc || 'Não informado'), direct), localIntent);
      }
      if (direct.length > 1) return this.withContext(this.found(direct[0], 1, direct[0].universalAcrossPnc ? 'Qualquer um' : (direct[0].pnc || 'Várias aplicações'), direct), localIntent);
    }

    const intent = await ChatIntentService.parse(question);
    if (explicitPnc?.trim()) intent.pnc = explicitPnc.trim();

    if (intent.partNumber) {
      const direct = await PartSearchService.directByCode(tenantId, intent.partNumber);
      if (direct.length === 1) return this.withContext(this.found(direct[0], 1, direct[0].universalAcrossPnc ? 'Qualquer um' : (direct[0].pnc || 'Não informado'), direct), intent);
      if (direct.length > 1) return this.withContext(this.found(direct[0], 1, direct[0].universalAcrossPnc ? 'Qualquer um' : (direct[0].pnc || 'Várias aplicações'), direct), intent);
    }

    const partGroups = buildSearchGroups(intent.partDescription || question, [intent.manufacturer, intent.model, intent.pnc]);
    if (!partGroups.length) {
      return this.withContext({
        status: 'PART_REQUIRED',
        answer: intent.model
          ? `Entendi o modelo ${intent.model}, mas falta dizer qual peça você procura. Por exemplo: “carburador”, “filtro de ar” ou “embreagem”.`
          : 'Diga o nome ou a descrição da peça que você procura. Se souber, informe também o modelo do equipamento.',
      }, intent);
    }

    const normalizedModel = normalizeIdentifier(intent.model);
    if (normalizedModel) {
      const exactCount = await prisma.part.count({
        where: { normalizedModel, active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED' } },
      });
      if (!exactCount) {
        const options = await PartSearchService.similarModels(tenantId, normalizedModel);
        return this.withContext({
          status: options.length ? 'MODEL_REQUIRED' : 'NOT_FOUND',
          modelOptions: options,
          answer: options.length
            ? `Não encontrei o modelo “${intent.model}” exatamente. Encontrei modelos parecidos: ${options.join(', ')}. Confirme o modelo para eu não misturar peças.`
            : `Não encontrei o modelo “${intent.model}” nos catálogos processados.`,
        }, intent);
      }
    }

    const candidates = await PartSearchService.semantic(tenantId, question, intent);
    if (!candidates.length) {
      return this.withContext({ status: 'NOT_FOUND', answer: 'Não encontrei uma peça com similaridade suficiente. Prefiro não sugerir um código sem segurança.' }, intent);
    }

    if (!normalizedModel) {
      const models = unique(candidates.slice(0, 15).map(c => c.model));
      if (models.length > 1) {
        return this.withContext({ status: 'MODEL_REQUIRED', modelOptions: models.slice(0, 8), answer: `Encontrei essa descrição em mais de um equipamento (${models.slice(0, 8).join(', ')}). Informe o modelo exato.` }, intent);
      }
    }

    return this.withContext(await this.resolvePncOrAmbiguity(tenantId, question, intent.pnc, candidates, undefined), intent);
  }

  private static async resolvePncOrAmbiguity(
    tenantId: string,
    question: string,
    requestedPnc: string,
    candidates: PartCandidate[],
    directConfidence?: number,
  ): Promise<ChatSearchResult> {
    const model = candidates[0]?.normalizedModel;
    if (!model) return { status: 'NOT_FOUND', answer: 'Não encontrei candidatos válidos.' };

    const sameModel = candidates.filter(c => c.normalizedModel === model);
    const availablePncs = await PartSearchService.availablePncs(tenantId, model);
    const normalizedRequestedPnc = normalizeIdentifier(requestedPnc);

    let eligible = sameModel;
    if (normalizedRequestedPnc) {
      eligible = sameModel.filter(c => c.universalAcrossPnc || c.normalizedPnc === normalizedRequestedPnc);
      if (!eligible.length) {
        return {
          status: 'PNC_REQUIRED', requiresPnc: true, pncOptions: availablePncs,
          answer: `Não encontrei essa peça para o PNC informado. PNCs cadastrados para ${sameModel[0].model}: ${availablePncs.join(', ') || 'nenhum identificado'}.`,
        };
      }
    }

    const selection = await ChatIntentService.choose(question, eligible.slice(0, 20).map(c => ({
      id: c.id, name: c.name, model: c.model, pnc: c.pnc, section: c.section, position: c.position, aliases: c.alternativeNames,
    })));

    const chosen = eligible.find(c => c.id === selection.id);
    const calibratedConfidence = chosen
      ? calibrateMatchConfidence(selection.confidence, chosen.distance, directConfidence === 1)
      : 0;
    if (!chosen || selection.ambiguous || (!directConfidence && (selection.confidence < MIN_CONFIDENCE || calibratedConfidence < 0.58))) {
      return {
        status: 'AMBIGUOUS', confidence: calibratedConfidence,
        answer: 'Encontrei mais de uma peça plausível. Selecione a descrição correta para evitar retornar um código errado.',
        options: this.options(eligible.slice(0, 5)),
        feedbackOptions: this.options(eligible.slice(0, 5)),
      };
    }

    if (!normalizedRequestedPnc && availablePncs.length > 1 && !chosen.universalAcrossPnc) {
      const equivalentRows = await prisma.part.findMany({
        where: {
          normalizedModel: chosen.normalizedModel,
          normalizedPartNumber: chosen.normalizedPartNumber,
          active: true,
          document: { tenantId, archivedAt: null, status: 'COMPLETED' },
        },
        select: { pnc: true, normalizedPnc: true, universalAcrossPnc: true },
      });

      const universal = equivalentRows.some(r => r.universalAcrossPnc);
      const coveredPncs = new Set(equivalentRows.map(r => r.normalizedPnc).filter((v): v is string => Boolean(v)));
      const allCovered = availablePncs.every(pnc => coveredPncs.has(normalizeIdentifier(pnc)));

      if (universal || allCovered) {
        return this.found(chosen, calibratedConfidence, 'Qualquer um', eligible);
      }

      return {
        status: 'PNC_REQUIRED', requiresPnc: true, pncOptions: availablePncs,
        answer: 'Esse modelo possui mais de um PNC e eu não consigo comprovar que a peça é igual em todos. Informe o PNC do equipamento para eu garantir o código correto.',
      };
    }

    return this.found(chosen, calibratedConfidence, chosen.universalAcrossPnc ? 'Qualquer um' : (chosen.pnc || requestedPnc || 'Não informado'), eligible);
  }

  private static found(candidate: PartCandidate, confidence: number, pncLabel: string, candidates: PartCandidate[]): ChatSearchResult {
    const level = candidate.searchMethod === 'DIRECT_CODE' ? 'EXACT' : confidence >= 0.85 ? 'HIGH' : 'REVIEW';
    const explanation = candidate.searchMethod === 'DIRECT_CODE'
      ? 'Código localizado diretamente na base técnica, sem depender de interpretação semântica.'
      : candidate.searchMethod === 'LEXICAL'
        ? 'Resultado encontrado pela busca textual de contingência. Confirme modelo, PNC e catálogo antes de concluir.'
        : 'Descrição comparada com o conteúdo técnico indexado e validada entre os candidatos do catálogo.';
    return {
      status: 'FOUND', confidence,
      match: { method: candidate.searchMethod, level, explanation },
      answer: [
        `Peça: ${candidate.name}`,
        `Código: ${candidate.partNumber}`,
        `Modelo: ${candidate.model}`,
        `PNC: ${pncLabel}`,
        candidate.section ? `Seção: ${candidate.section}` : '',
        candidate.position ? `Posição na vista: ${candidate.position}` : '',
        candidate.page ? `Página: ${candidate.page}` : '',
        `Fonte: ${candidate.filename}`,
      ].filter(Boolean).join('\n'),
      part: {
        id: candidate.id, name: candidate.name, partNumber: candidate.partNumber,
        manufacturer: candidate.manufacturer, model: candidate.model, pnc: pncLabel,
        section: candidate.section, position: candidate.position, page: candidate.page,
        documentId: candidate.documentId, filename: candidate.filename,
        universalAcrossPnc: candidate.universalAcrossPnc,
        applications: [...new Map(candidates.map(item => {
          const application = { model: item.model, pnc: item.universalAcrossPnc ? 'Qualquer um' : (item.pnc || 'Não informado') };
          return [`${application.model}|${application.pnc}`, application] as const;
        })).values()].slice(0, 12),
      },
      feedbackOptions: this.options(candidates.filter(c => c.normalizedModel === candidate.normalizedModel).slice(0, 5)),
    };
  }

  private static options(candidates: PartCandidate[]) {
    const seen = new Set<string>();
    return candidates.filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id); return true;
    }).map(c => ({ id: c.id, name: c.name, partNumber: c.partNumber, model: c.model, pnc: c.pnc, section: c.section, position: c.position }));
  }

  private static withContext(result: ChatSearchResult, intent: SearchIntent): ChatSearchResult {
    const guidance: Record<SearchStatus, ChatSearchResult['guidance']> = {
      FOUND: {
        title: 'Código localizado',
        description: 'Use os dados técnicos abaixo e confirme o equipamento antes de fechar o atendimento.',
        tips: ['Confira modelo e PNC.', 'Abra o catálogo na página indicada quando houver dúvida.'],
      },
      PNC_REQUIRED: {
        title: 'Falta confirmar o PNC',
        description: 'O mesmo modelo possui variações e não é seguro escolher o código sem o PNC.',
        tips: ['Localize o PNC na etiqueta da máquina.', 'Selecione uma das opções cadastradas.'],
      },
      MODEL_REQUIRED: {
        title: 'Falta confirmar o modelo',
        description: 'A descrição aparece em mais de um equipamento.',
        tips: ['Confira a plaqueta da máquina.', 'Escolha o modelo exato entre as opções.'],
      },
      PART_REQUIRED: {
        title: 'Falta informar a peça',
        description: 'O equipamento foi entendido, mas ainda não há uma peça específica para consultar.',
        tips: ['Digite um nome curto, como carburador ou filtro de ar.', 'Você também pode informar a posição da vista explodida.'],
      },
      AMBIGUOUS: {
        title: 'Mais de uma peça possível',
        description: 'O sistema evitou escolher automaticamente porque há alternativas plausíveis.',
        tips: ['Compare a descrição e a posição na vista.', 'Abra o catálogo se necessário.'],
      },
      NOT_FOUND: {
        title: 'Nenhum código seguro encontrado',
        description: 'A IA não inventou um código quando a base técnica não forneceu evidência suficiente.',
        tips: ['Tente uma descrição mais curta.', 'Informe o modelo e o PNC.', 'Pesquise o código sem espaços ou hífens.'],
      },
    };

    return {
      ...result,
      interpreted: {
        partDescription: intent.partDescription,
        manufacturer: intent.manufacturer || null,
        model: intent.model || null,
        pnc: intent.pnc || null,
        partNumber: intent.partNumber || null,
      },
      guidance: guidance[result.status],
    };
  }
}
