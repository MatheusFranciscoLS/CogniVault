import { prisma } from '../config/prisma';
import { normalizeIdentifier } from '../utils/normalize';
import { ChatIntentService } from './chat-intent.service';
import { PartSearchService, type PartCandidate } from './part-search.service';

const MIN_CONFIDENCE = Number(process.env.PART_SEARCH_MIN_CONFIDENCE || '0.72');

export type SearchStatus = 'FOUND' | 'PNC_REQUIRED' | 'MODEL_REQUIRED' | 'AMBIGUOUS' | 'NOT_FOUND';

export interface ChatSearchResult {
  status: SearchStatus;
  answer: string;
  requiresPnc?: boolean;
  pncOptions?: string[];
  modelOptions?: string[];
  confidence?: number;
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
  };
  options?: Array<{ id: string; name: string; model: string; pnc: string | null; section: string | null; position: string | null }>;
  feedbackOptions?: Array<{ id: string; name: string; model: string; pnc: string | null; section: string | null; position: string | null }>;
}

function unique<T>(items: T[]): T[] { return [...new Set(items)]; }

export class ChatService {
  static async askQuestion(tenantId: string, question: string, explicitPnc?: string): Promise<ChatSearchResult> {
    const intent = await ChatIntentService.parse(question);
    if (explicitPnc?.trim()) intent.pnc = explicitPnc.trim();

    if (intent.partNumber) {
      const direct = await PartSearchService.directByCode(tenantId, intent.partNumber);
      if (direct.length === 1) return this.found(direct[0], 1, direct[0].universalAcrossPnc ? 'Qualquer um' : (direct[0].pnc || 'Não informado'), direct);
      if (direct.length > 1) return this.resolvePncOrAmbiguity(tenantId, question, intent.pnc, direct, 1);
    }

    const normalizedModel = normalizeIdentifier(intent.model);
    if (normalizedModel) {
      const exactCount = await prisma.part.count({
        where: { normalizedModel, active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED' } },
      });
      if (!exactCount) {
        const options = await PartSearchService.similarModels(tenantId, normalizedModel);
        return {
          status: options.length ? 'MODEL_REQUIRED' : 'NOT_FOUND',
          modelOptions: options,
          answer: options.length
            ? `Não encontrei o modelo “${intent.model}” exatamente. Encontrei modelos parecidos: ${options.join(', ')}. Confirme o modelo para eu não misturar peças.`
            : `Não encontrei o modelo “${intent.model}” nos catálogos processados.`,
        };
      }
    }

    const candidates = await PartSearchService.semantic(tenantId, question, intent);
    if (!candidates.length) {
      return { status: 'NOT_FOUND', answer: 'Não encontrei uma peça com similaridade suficiente. Prefiro não sugerir um código sem segurança.' };
    }

    if (!normalizedModel) {
      const models = unique(candidates.slice(0, 15).map(c => c.model));
      if (models.length > 1) {
        return { status: 'MODEL_REQUIRED', modelOptions: models.slice(0, 8), answer: `Encontrei essa descrição em mais de um equipamento (${models.slice(0, 8).join(', ')}). Informe o modelo exato.` };
      }
    }

    return this.resolvePncOrAmbiguity(tenantId, question, intent.pnc, candidates, undefined);
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
    if (!chosen || selection.ambiguous || (!directConfidence && selection.confidence < MIN_CONFIDENCE)) {
      return {
        status: 'AMBIGUOUS', confidence: selection.confidence,
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
        return this.found(chosen, directConfidence ?? selection.confidence, 'Qualquer um', eligible);
      }

      return {
        status: 'PNC_REQUIRED', requiresPnc: true, pncOptions: availablePncs,
        answer: 'Esse modelo possui mais de um PNC e eu não consigo comprovar que a peça é igual em todos. Informe o PNC do equipamento para eu garantir o código correto.',
      };
    }

    return this.found(chosen, directConfidence ?? selection.confidence, chosen.universalAcrossPnc ? 'Qualquer um' : (chosen.pnc || requestedPnc || 'Não informado'), eligible);
  }

  private static found(candidate: PartCandidate, confidence: number, pncLabel: string, candidates: PartCandidate[]): ChatSearchResult {
    return {
      status: 'FOUND', confidence,
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
      },
      feedbackOptions: this.options(candidates.filter(c => c.normalizedModel === candidate.normalizedModel).slice(0, 5)),
    };
  }

  private static options(candidates: PartCandidate[]) {
    const seen = new Set<string>();
    return candidates.filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id); return true;
    }).map(c => ({ id: c.id, name: c.name, model: c.model, pnc: c.pnc, section: c.section, position: c.position }));
  }
}
