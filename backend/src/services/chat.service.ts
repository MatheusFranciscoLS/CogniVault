import { prisma } from '../config/prisma';
import { normalizeIdentifier } from '../utils/normalize';
import { ChatIntentService } from './chat-intent.service';
import { buildFallbackIntent, extractLikelyPartNumber } from './chat-reliability';
import { PartSearchService, type PartCandidate, type RetrievalSource } from './part-search.service';
import type { SearchIntent } from './chat-intent.service';
import { ReActAgentService } from './react-agent.service';
import { buildSearchGroups, focusCandidatesByDescription } from './part-vocabulary';
import { filterCandidatesByMarket } from './catalog-market';
import { resolveEngineCatalogRoute, findEngineApplications, isMachineEngineInquiry } from './husqvarna-domain-knowledge';
import { getVerifiedSupersession, preferCurrentPartNumbers } from './part-supersession';
import { evaluateAnswerConfidence, type CatalogConfidenceContext, type ConfidenceDecision } from './confidence-gate';
import { retrieveTechnicalContext } from './document-memory';
import { applyExplicitOccurrenceConstraints } from './explicit-occurrence-constraints';

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
    evidence?: string[];
    retrievalSources?: RetrievalSource[];
  };
  technicalContext?: Array<{
    filename: string;
    page: number | null;
    section: string | null;
    excerpt: string;
    method: 'FULL_TEXT' | 'FUZZY' | 'SEMANTIC';
  }>;
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
    notes: string | null;
    documentId: string;
    filename: string;
    universalAcrossPnc: boolean;
    applications: Array<{ model: string; pnc: string }>;
  };
  options?: Array<{ id: string; name: string; partNumber: string; model: string; pnc: string | null; section: string | null; position: string | null; notes: string | null }>;
  feedbackOptions?: Array<{ id: string; name: string; partNumber: string; model: string; pnc: string | null; section: string | null; position: string | null; notes: string | null }>;
  b2bPortal?: {
    stockStatus: string;
    supersededBy?: string;
    success: boolean;
    message?: string;
  };
}

function unique<T>(items: T[]): T[] { return [...new Set(items)]; }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export class ChatService {
  static async askQuestion(
    tenantId: string,
    question: string,
    explicitPnc?: string,
    selectedPartId?: string,
    fallbackModel?: string,
  ): Promise<ChatSearchResult> {
    const result = await this.askQuestionInternal(tenantId, question, explicitPnc, selectedPartId, fallbackModel);
    return result;
  }

  private static async askQuestionInternal(
    tenantId: string,
    question: string,
    explicitPnc?: string,
    selectedPartId?: string,
    fallbackModel?: string,
  ): Promise<ChatSearchResult> {
    if (selectedPartId) {
      const selected = await PartSearchService.byId(tenantId, selectedPartId);
      const selectionIntent = buildFallbackIntent(question);
      if (!selected) return this.withContext({ status: 'NOT_FOUND', answer: 'A peça selecionada não está mais disponível em um catálogo ativo.' }, selectionIntent);
      const manualDecision: ConfidenceDecision = {
        safe: true,
        confidence: 1,
        level: 'HIGH',
        evidence: ['A peça foi selecionada manualmente entre as alternativas do próprio catálogo.'],
        reason: 'Seleção explícita do usuário.',
      };
      const result = this.found(selected, 1, selected.universalAcrossPnc ? 'Qualquer um' : (selected.pnc || explicitPnc || 'Não informado'), [selected], manualDecision);
      return this.withContext(await this.enrichWithTechnicalContext(tenantId, question, selected, result), selectionIntent);
    }

    const likelyCode = extractLikelyPartNumber(question);
    if (likelyCode) {
      const localIntent = buildFallbackIntent(question);
      localIntent.partNumber = likelyCode;
      if (explicitPnc?.trim()) localIntent.pnc = explicitPnc.trim();
      const direct = await PartSearchService.directByCode(tenantId, likelyCode);
      if (direct.length >= 1) {
        const normModel = normalizeIdentifier(localIntent.model);
        const matchingModel = normModel
          ? direct.find(d => normalizeIdentifier(d.model).includes(normModel) || normModel.includes(normalizeIdentifier(d.model)))
          : undefined;
        const chosen = matchingModel || direct[0];
        const directResult = this.withSupersessionNotice(
          this.found(chosen, 1, chosen.universalAcrossPnc ? 'Qualquer um' : (chosen.pnc || (direct.length > 1 ? 'Várias aplicações' : 'Não informado')), direct),
          likelyCode,
        );
        return this.withContext(directResult, localIntent);
      }
    }

    const intent = await ChatIntentService.parse(question);
    if (!intent.model && fallbackModel?.trim()) {
      intent.model = fallbackModel.trim();
    }
    if (explicitPnc?.trim()) intent.pnc = explicitPnc.trim();
    if (intent.partNumber) {
      const direct = await PartSearchService.directByCode(tenantId, intent.partNumber);
      if (direct.length >= 1) {
        const normModel = normalizeIdentifier(intent.model);
        const matchingModel = normModel
          ? direct.find(d => normalizeIdentifier(d.model).includes(normModel) || normModel.includes(normalizeIdentifier(d.model)))
          : undefined;
        const chosen = matchingModel || direct[0];
        return this.withContext(this.withSupersessionNotice(
          this.found(chosen, 1, chosen.universalAcrossPnc ? 'Qualquer um' : (chosen.pnc || (direct.length > 1 ? 'Várias aplicações' : 'Não informado')), direct),
          intent.partNumber,
        ), intent);
      }
    }

    if (intent.model && isMachineEngineInquiry(question)) {
      const applications = findEngineApplications(intent.model, intent.pnc);
      if (applications.length) {
        if (applications.length === 1 || (intent.pnc && applications.some(a => a.machinePnc))) {
          const app = applications.find(a => !intent.pnc || !a.machinePnc || normalizeIdentifier(a.machinePnc) === normalizeIdentifier(intent.pnc)) || applications[0];
          const articleInfo = app.engineArticle ? ` (artigo oficial ${app.engineArticle})` : '';
          return this.withContext({
            status: 'FOUND',
            answer: `O equipamento Husqvarna ${app.machineModel} utiliza o motor ${app.engineModel}${articleInfo}. Esse motor está vinculado tecnicamente ao equipamento no sistema para consulta de todas as suas peças internas (filtros, velas, juntas, carburador, virabrequim, etc.).`,
          }, intent);
        } else {
          const summary = applications.map(a => `${a.machinePnc ? `PNC ${a.machinePnc}: ` : ''}${a.engineModel}${a.engineArticle ? ` (${a.engineArticle})` : ''}`).join(' | ');
          return this.withContext({
            status: 'PNC_REQUIRED',
            requiresPnc: true,
            pncOptions: [...new Set(applications.map(a => a.machinePnc).filter((p): p is string => Boolean(p)))],
            answer: `O catálogo do ${intent.model} indica motores diferentes conforme a versão/PNC: ${summary}. Informe o PNC da sua máquina para visualizar o catálogo do motor exato.`,
          }, intent);
        }
      }
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
      const exactCount = await prisma.part.count({ where: { normalizedModel, active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED' } } });
      if (!exactCount) {
        const engineFallback = await this.tryEngineCatalogFallback(tenantId, question, intent);
        if (engineFallback) return this.withContext(engineFallback, intent);

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

    const reactResult = await ReActAgentService.execute(tenantId, question, intent.pnc || undefined, intent);
    
    if (reactResult.status === 'FOUND' && reactResult.chosenPartId) {
       const chosen = await PartSearchService.byId(tenantId, reactResult.chosenPartId);
       if (chosen) {
         const decision = evaluateAnswerConfidence({
           question, chosen, runnerUp: undefined, selectionConfidence: 0.9, exactCode: false,
           catalog: await this.catalogConfidenceContext(tenantId, chosen.documentId)
         });
         
         const result = this.found(chosen, 0.9, chosen.universalAcrossPnc ? 'Qualquer um' : (chosen.pnc || intent.pnc || 'Não informado'), [chosen], decision);
         // Attach reasoning explanation to the match
         if (result.match) result.match.explanation += `\nReAct Reasoning: ${reactResult.explanation}`;
         return this.withContext(await this.enrichWithTechnicalContext(tenantId, question, chosen, result), intent);
       }
    }
    
    // Fallback to local logic if ReAct fails or is ambiguous.
    // Reutiliza os candidatos já obtidos pelo ReAct para evitar consulta semântica/banco duplicada.
    const candidates = reactResult.candidates !== undefined
      ? reactResult.candidates
      : await PartSearchService.semantic(tenantId, question, intent);

    if (!candidates.length) {
      const engineFallback = await this.tryEngineCatalogFallback(tenantId, question, intent);
      if (engineFallback) return this.withContext(engineFallback, intent);
      return this.withContext({ status: 'NOT_FOUND', answer: 'Não encontrei uma peça com evidência suficiente. Prefiro não sugerir um código sem segurança.' }, intent);
    }

    if (!normalizedModel) {
      const models = unique(candidates.slice(0, 15).map(candidate => candidate.model));
      if (models.length > 1) {
        return this.withContext({ status: 'MODEL_REQUIRED', modelOptions: models.slice(0, 8), answer: `Encontrei essa descrição em mais de um equipamento (${models.slice(0, 8).join(', ')}). Informe o modelo exato.` }, intent);
      }
    }

    return this.withContext(await this.resolvePncOrAmbiguity(
      tenantId, question, intent.partDescription || question, intent.pnc, candidates, undefined,
    ), intent);
  }

  private static async tryEngineCatalogFallback(tenantId: string, question: string, intent: SearchIntent): Promise<ChatSearchResult | null> {
    const route = resolveEngineCatalogRoute(intent.model, intent.pnc, question);
    if (!route) return null;
    if (route.status === 'PNC_REQUIRED') {
      const availablePncs = await PartSearchService.availablePncs(tenantId, normalizeIdentifier(route.machineModel));
      return {
        status: 'PNC_REQUIRED', requiresPnc: true,
        pncOptions: availablePncs.length ? availablePncs : route.knownPncs,
        answer: `O catálogo do ${route.machineModel} indica motores diferentes conforme a versão/PNC. Informe o PNC antes de eu entrar no IPL do motor e escolher uma peça interna.`,
      };
    }

    const targetModel = normalizeIdentifier(route.engineModel);
    const baseModel = targetModel.replace(/V$/i, '');
    const enginePart = await prisma.part.findFirst({
      where: {
        active: true,
        document: { tenantId, archivedAt: null, status: 'COMPLETED' },
        OR: [
          { normalizedModel: targetModel },
          { normalizedModel: { startsWith: targetModel } },
          { normalizedModel: baseModel },
          { normalizedModel: { startsWith: baseModel } },
          { model: { contains: route.engineModel, mode: 'insensitive' } },
          { model: { contains: baseModel, mode: 'insensitive' } },
        ],
      },
      select: { model: true, normalizedModel: true },
    });
    if (!enginePart) {
      return { status: 'NOT_FOUND', answer: `O catálogo do ${route.machineModel} referencia o motor ${route.engineModel}, mas o IPL desse motor ainda não está processado neste tenant. Não vou inventar a peça interna sem esse catálogo.` };
    }

    const effectiveEngineModel = enginePart.model;
    const withoutMachineModel = intent.model
      ? (intent.partDescription || question).replace(new RegExp(escapeRegExp(intent.model), 'ig'), ' ')
      : (intent.partDescription || question);
    const bridgeDescription = [withoutMachineModel.trim(), route.engineArticle || ''].filter(Boolean).join(' ');
    const engineIntent: SearchIntent = { ...intent, model: effectiveEngineModel, pnc: '', partNumber: '', partDescription: bridgeDescription };
    const engineQuestion = `${bridgeDescription} ${effectiveEngineModel}`.trim();
    const engineCandidates = await PartSearchService.semantic(tenantId, engineQuestion, engineIntent);
    if (!engineCandidates.length) {
      return { status: 'NOT_FOUND', answer: `O ${route.machineModel} referencia o motor ${route.engineModel}, mas não encontrei essa peça interna com evidência suficiente no IPL do motor.` };
    }

    const resolved = await this.resolvePncOrAmbiguity(tenantId, engineQuestion, bridgeDescription, '', engineCandidates, undefined);
    const application = route.engineArticle
      ? `O catálogo do ${route.machineModel} referencia o motor ${route.engineModel} (${route.engineArticle}); consultei o IPL separado desse motor.`
      : `O catálogo do ${route.machineModel} referencia o motor ${route.engineModel}; consultei o IPL separado desse motor.`;
    return {
      ...resolved,
      answer: `${application}\n${resolved.answer}`,
      match: resolved.match ? { ...resolved.match, explanation: `${resolved.match.explanation} A busca atravessou uma relação máquina → motor explicitamente indicada no catálogo técnico.` } : resolved.match,
    };
  }

  private static async catalogConfidenceContext(tenantId: string, documentId: string): Promise<CatalogConfidenceContext | undefined> {
    try {
      const document = await prisma.document.findFirst({
        where: { id: documentId, tenantId, archivedAt: null, status: 'COMPLETED' },
        select: { healthScore: true, reviewStatus: true, reviewReasons: true },
      });
      if (!document) return undefined;
      return {
        healthScore: document.healthScore,
        reviewStatus: document.reviewStatus,
        reviewReasons: document.reviewReasons,
      };
    } catch (error) {
      console.warn('⚠️ Saúde do catálogo indisponível durante o gate; usando as demais evidências.', error instanceof Error ? error.message : error);
      return undefined;
    }
  }

  private static async resolvePncOrAmbiguity(
    tenantId: string,
    question: string,
    partDescription: string,
    requestedPnc: string,
    candidates: PartCandidate[],
    directConfidence?: number,
  ): Promise<ChatSearchResult> {
    const model = candidates[0]?.normalizedModel;
    if (!model) return { status: 'NOT_FOUND', answer: 'Não encontrei candidatos válidos.' };
    const sameModel = candidates.filter(candidate => candidate.normalizedModel === model);
    const availablePncs = await PartSearchService.availablePncs(tenantId, model);
    const normalizedRequestedPnc = normalizeIdentifier(requestedPnc);

    let eligible = sameModel;
    if (normalizedRequestedPnc) {
      eligible = sameModel.filter(candidate => candidate.universalAcrossPnc || candidate.normalizedPnc === normalizedRequestedPnc);
      if (!eligible.length) {
        return {
          status: 'PNC_REQUIRED', requiresPnc: true, pncOptions: availablePncs,
          answer: `Não encontrei essa peça para o PNC informado. PNCs cadastrados para ${sameModel[0].model}: ${availablePncs.join(', ') || 'nenhum identificado'}.`,
        };
      }
    }

    eligible = preferCurrentPartNumbers(focusCandidatesByDescription(partDescription, filterCandidatesByMarket(eligible)));
    eligible = applyExplicitOccurrenceConstraints(question, eligible);
    const selection = await ChatIntentService.choose(question, eligible.slice(0, 20).map(candidate => ({
      id: candidate.id, name: candidate.name, model: candidate.model, pnc: candidate.pnc,
      section: candidate.section, position: candidate.position, aliases: candidate.alternativeNames,
      feedbackScore: candidate.feedbackScore, notes: candidate.notes,
      retrievalScore: candidate.retrievalScore,
      retrievalAgreement: candidate.retrievalAgreement,
      retrievalSources: candidate.retrievalSources,
    })));
    const chosen = eligible.find(candidate => candidate.id === selection.id);
    if (!chosen || selection.ambiguous) {
      return {
        status: 'AMBIGUOUS', confidence: selection.confidence,
        answer: 'Encontrei mais de uma peça plausível e nenhuma possui vantagem técnica suficiente. Prefiro pedir confirmação em vez de arriscar um código.',
        options: this.options(eligible.slice(0, 5)), feedbackOptions: this.options(eligible.slice(0, 5)),
      };
    }

    let pncLabel = chosen.universalAcrossPnc ? 'Qualquer um' : (chosen.pnc || requestedPnc || 'Não informado');
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
      const universal = equivalentRows.some(row => row.universalAcrossPnc);
      const coveredPncs = new Set(equivalentRows.map(row => row.normalizedPnc).filter((value): value is string => Boolean(value)));
      const allCovered = availablePncs.every(pnc => coveredPncs.has(normalizeIdentifier(pnc)));
      if (!universal && !allCovered) {
        return {
          status: 'PNC_REQUIRED', requiresPnc: true, pncOptions: availablePncs,
          answer: 'Esse modelo possui mais de um PNC e eu não consigo comprovar que a peça é igual em todos. Informe o PNC do equipamento para eu garantir o código correto.',
        };
      }
      pncLabel = 'Qualquer um';
    }

    const runnerUp = eligible.find(candidate => candidate.id !== chosen.id);
    const catalog = await this.catalogConfidenceContext(tenantId, chosen.documentId);
    const decision = evaluateAnswerConfidence({
      question,
      chosen,
      runnerUp,
      selectionConfidence: directConfidence === 1 ? 1 : selection.confidence,
      exactCode: directConfidence === 1,
      catalog,
    });
    if (!decision.safe) {
      return {
        status: 'AMBIGUOUS', confidence: decision.confidence,
        answer: `${decision.reason} Confira a vista/posição ou informe mais detalhes antes de eu liberar o código.`,
        match: {
          method: chosen.searchMethod,
          level: 'REVIEW',
          explanation: 'O candidato ficou em primeiro lugar, mas o gate de confiança impediu que isso fosse tratado como certeza.',
          evidence: decision.evidence,
          retrievalSources: chosen.retrievalSources,
        },
        options: this.options(eligible.slice(0, 5)), feedbackOptions: this.options(eligible.slice(0, 5)),
      };
    }

    const result = this.found(chosen, decision.confidence, pncLabel, eligible, decision);
    return this.enrichWithTechnicalContext(tenantId, question, chosen, result);
  }

  private static found(candidate: PartCandidate, confidence: number, pncLabel: string, candidates: PartCandidate[], decision?: ConfidenceDecision): ChatSearchResult {
    const level = candidate.searchMethod === 'DIRECT_CODE' ? 'EXACT' : (decision?.level || (confidence >= 0.85 ? 'HIGH' : 'REVIEW'));
    const sources = candidate.retrievalSources || [candidate.searchMethod];
    const baseExplanation = candidate.searchMethod === 'DIRECT_CODE'
      ? 'Código localizado diretamente na base técnica, sem depender de interpretação semântica.'
      : `Código liberado somente após compatibilidade de modelo/PNC e validação do ranking técnico. Recuperadores: ${sources.join(', ')}.`;
    const feedbackExplanation = candidate.feedbackScore > 0.02 ? ' Correções anteriores do balcão também favoreceram este resultado.' : '';
    return {
      status: 'FOUND', confidence,
      match: {
        method: candidate.searchMethod,
        level,
        explanation: `${baseExplanation}${feedbackExplanation}`,
        evidence: decision?.evidence,
        retrievalSources: sources,
      },
      answer: [
        `Peça: ${candidate.name}`,
        `Código: ${candidate.partNumber}`,
        `Modelo: ${candidate.model}`,
        `PNC: ${pncLabel}`,
        candidate.section ? `Seção: ${candidate.section}` : '',
        candidate.position ? `Posição na vista: ${candidate.position}` : '',
        candidate.page ? `Página: ${candidate.page}` : '',
        candidate.notes ? `Nota técnica: ${candidate.notes}` : '',
        `Fonte: ${candidate.filename}`,
      ].filter(Boolean).join('\n'),
      part: {
        id: candidate.id, name: candidate.name, partNumber: candidate.partNumber,
        manufacturer: candidate.manufacturer, model: candidate.model, pnc: pncLabel,
        section: candidate.section, position: candidate.position, page: candidate.page, notes: candidate.notes,
        documentId: candidate.documentId, filename: candidate.filename,
        universalAcrossPnc: candidate.universalAcrossPnc,
        applications: [...new Map(candidates.map(item => {
          const application = { model: item.model, pnc: item.universalAcrossPnc ? 'Qualquer um' : (item.pnc || 'Não informado') };
          return [`${application.model}|${application.pnc}`, application] as const;
        })).values()].slice(0, 12),
      },
      b2bPortal: (candidate.notes?.includes('Substituição oficial') || getVerifiedSupersession(candidate.partNumber)) ? {
        stockStatus: 'Código oficial ativo no Portal Husqvarna',
        supersededBy: getVerifiedSupersession(candidate.partNumber)?.currentPartNumber !== candidate.partNumber ? getVerifiedSupersession(candidate.partNumber)?.currentPartNumber : undefined,
        success: true,
        message: 'Substituição oficial comprovada no portal público Husqvarna Brasil.',
      } : undefined,
      feedbackOptions: this.options(candidates.filter(candidateItem => candidateItem.normalizedModel === candidate.normalizedModel).slice(0, 5)),
    };
  }

  private static async enrichWithTechnicalContext(tenantId: string, question: string, candidate: PartCandidate, result: ChatSearchResult): Promise<ChatSearchResult> {
    if (result.status !== 'FOUND') return result;
    try {
      const hits = await retrieveTechnicalContext(tenantId, question, {
        model: candidate.model,
        pnc: candidate.universalAcrossPnc ? undefined : (candidate.pnc || undefined),
        documentId: candidate.documentId,
        limit: 3,
      });
      if (!hits.length) return result;
      const context = hits.map(hit => ({
        filename: hit.filename,
        page: hit.page,
        section: hit.section,
        excerpt: hit.content.slice(0, 700),
        method: hit.method,
      }));
      return {
        ...result,
        technicalContext: context,
        match: result.match ? {
          ...result.match,
          explanation: `${result.match.explanation} A memória técnica da mesma fonte foi consultada apenas para contexto; o Part Number continua vindo exclusivamente da tabela de peças.`,
          evidence: [...(result.match.evidence || []), `Contexto confirmado em ${hits.length} trecho(s) da mesma biblioteca técnica.`],
        } : result.match,
      };
    } catch (error) {
      console.warn('⚠️ Contexto técnico auxiliar indisponível; mantendo a resposta de peça validada.', error instanceof Error ? error.message : error);
      return result;
    }
  }

  private static options(candidates: PartCandidate[]) {
    const seen = new Set<string>();
    return candidates.filter(candidate => {
      if (seen.has(candidate.id)) return false;
      seen.add(candidate.id);
      return true;
    }).map(candidate => ({
      id: candidate.id, name: candidate.name, partNumber: candidate.partNumber, model: candidate.model,
      pnc: candidate.pnc, section: candidate.section, position: candidate.position, notes: candidate.notes,
    }));
  }

  private static withSupersessionNotice(result: ChatSearchResult, requestedPartNumber: string): ChatSearchResult {
    const replacement = getVerifiedSupersession(requestedPartNumber);
    if (!replacement) return result;
    return {
      ...result,
      answer: `O código consultado ${replacement.previousPartNumber} foi substituído pelo código atual ${replacement.currentPartNumber}, conforme o portal oficial Husqvarna.\n${result.answer}`,
      match: result.match ? {
        ...result.match,
        explanation: `${result.match.explanation} O código ${replacement.previousPartNumber} foi substituído pelo código atual ${replacement.currentPartNumber}, conforme revisão no portal oficial Husqvarna Brasil.`,
      } : result.match,
    };
  }

  private static withContext(result: ChatSearchResult, intent: SearchIntent): ChatSearchResult {
    const guidance: Record<SearchStatus, ChatSearchResult['guidance']> = {
      FOUND: {
        title: 'Código localizado',
        description: 'O código passou pelos filtros técnicos e pelo gate de confiança. Ainda confirme a máquina quando houver identificação física disponível.',
        tips: ['Confira modelo e PNC.', 'Use página/seção como segunda conferência quando o atendimento for crítico.'],
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
        title: 'Confirmação necessária',
        description: 'O sistema encontrou candidato(s), mas recusou liberar um código sem separação suficiente das alternativas.',
        tips: ['Compare descrição, lado, medida e posição na vista.', 'Informe o PNC quando existir.', 'Abra o catálogo se necessário.'],
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
