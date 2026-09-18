import { prisma } from '../config/prisma';
import { normalizeIdentifier } from '../utils/normalize';

const HUSQVARNA_SPARE_PARTS_URL = 'https://www.husqvarna.com/br/pecas-sobressalentes/';
import { LRUCache } from 'lru-cache';
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

export interface TechnicalReasoningStep {
  step: number;
  title: string;
  detail: string;
  status: 'SUCCESS' | 'INFO' | 'NOTICE';
}

export interface DiagramHighlight {
  documentId: string;
  filename: string;
  page: number | null;
  position: string | null;
  section: string | null;
}

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
  technicalReasoningSteps?: TechnicalReasoningStep[];
  diagramHighlight?: DiagramHighlight;
  // Toda resposta que NAO entrega um codigo precisa entregar um caminho. As
  // dicas antigas eram "tente uma descricao mais curta" e "informe o modelo e
  // o PNC" — instrucoes para o atendente tentar de novo, com o cliente na
  // frente. Aqui vem o que o app pode fazer por ele: abrir o catalogo do
  // modelo na tela e o link da fonte oficial.
  manualFallback?: {
    catalogs: Array<{ documentId: string; filename: string; model: string | null; pnc: string | null; partCount: number }>;
    officialUrl: string | null;
    officialLabel: string | null;
  };
}

function unique<T>(items: T[]): T[] { return [...new Set(items)]; }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const chatResponseCache = new LRUCache<string, ChatSearchResult>({
  max: 500,
  ttl: 2 * 60 * 1000, // 2 minutes
});

export function invalidateChatResponseCache(tenantId?: string): void {
  if (tenantId) {
    for (const key of chatResponseCache.keys()) {
      if (key.startsWith(`${tenantId}:`)) chatResponseCache.delete(key);
    }
  } else {
    chatResponseCache.clear();
  }
}

export class ChatService {
  static async askQuestion(
    tenantId: string,
    question: string,
    explicitPnc?: string,
    selectedPartId?: string,
    fallbackModel?: string,
  ): Promise<ChatSearchResult> {
    const cacheKey = `${tenantId}:${question.trim().toLowerCase()}:${explicitPnc || ''}:${selectedPartId || ''}:${fallbackModel || ''}`;
    const cached = chatResponseCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.askQuestionInternal(tenantId, question, explicitPnc, selectedPartId, fallbackModel);
    if (result && (result.status !== 'NOT_FOUND' || result.answer)) {
      chatResponseCache.set(cacheKey, result);
    }
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
      if (!selected) return this.withContext(tenantId, { status: 'NOT_FOUND', answer: 'A peça selecionada não está mais disponível em um catálogo ativo.' }, selectionIntent);
      const manualDecision: ConfidenceDecision = {
        safe: true,
        confidence: 1,
        level: 'HIGH',
        evidence: ['A peça foi selecionada manualmente entre as alternativas do próprio catálogo.'],
        reason: 'Seleção explícita do usuário.',
      };
      const result = this.found(selected, 1, selected.universalAcrossPnc ? 'Qualquer um' : (selected.pnc || explicitPnc || 'Não informado'), [selected], manualDecision);
      return this.withContext(tenantId, await this.enrichWithTechnicalContext(tenantId, question, selected, result), selectionIntent);
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
        return this.withContext(tenantId, directResult, localIntent);
      }
    }

    const intent = await ChatIntentService.parse(question, tenantId);
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
        return this.withContext(tenantId, this.withSupersessionNotice(
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
          return this.withContext(tenantId, {
            status: 'FOUND',
            answer: `O equipamento Husqvarna ${app.machineModel} utiliza o motor ${app.engineModel}${articleInfo}. Esse motor está vinculado tecnicamente ao equipamento no sistema para consulta de todas as suas peças internas (filtros, velas, juntas, carburador, virabrequim, etc.).`,
          }, intent);
        } else {
          const summary = applications.map(a => `${a.machinePnc ? `PNC ${a.machinePnc}: ` : ''}${a.engineModel}${a.engineArticle ? ` (${a.engineArticle})` : ''}`).join(' | ');
          return this.withContext(tenantId, {
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
      return this.withContext(tenantId, {
        status: 'PART_REQUIRED',
        answer: intent.model
          ? `Entendi o modelo ${intent.model}, mas falta dizer qual peça você procura. Por exemplo: “carburador”, “filtro de ar” ou “embreagem”.`
          : 'Diga o nome ou a descrição da peça que você procura. Se souber, informe também o modelo do equipamento.',
      }, intent);
    }

    let resolvedNormalizedModel = normalizeIdentifier(intent.model);
    if (resolvedNormalizedModel) {
      let exactCount = await prisma.part.count({ where: { normalizedModel: resolvedNormalizedModel, active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED' } } });
      if (!exactCount) {
        // Tenta remover prefixos de marca e tipo (ex: HUSQVARNA, KAWASAKI, STIHL, HONDA, KOHLER, MOTOR, ENGINE)
        const stripped = resolvedNormalizedModel.replace(/^(HUSQVARNA|KAWASAKI|STIHL|HONDA|KOHLER|BRIGGS(?:STRATTON)?|MOTOR|ENGINE|CORTE|TRATOR|SOPRADOR|ROCADEIRA|MOTOSSERRA)/, '');
        if (stripped && stripped !== resolvedNormalizedModel) {
          const strippedCount = await prisma.part.count({ where: { normalizedModel: stripped, active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED' } } });
          if (strippedCount > 0) {
            resolvedNormalizedModel = stripped;
            exactCount = strippedCount;
            intent.model = stripped;
          }
        }
      }
      if (!exactCount) {
        const engineFallback = await this.tryEngineCatalogFallback(tenantId, question, intent);
        if (engineFallback) return this.withContext(tenantId, engineFallback, intent);

        const options = await PartSearchService.similarModels(tenantId, resolvedNormalizedModel);
        // Se encontrou exatamente 1 modelo parecido e ele corresponde ao modelo pesquisado, adota sem travar o atendimento
        if (options.length === 1 && (normalizeIdentifier(options[0]).includes(resolvedNormalizedModel) || resolvedNormalizedModel.includes(normalizeIdentifier(options[0])))) {
          intent.model = options[0];
          resolvedNormalizedModel = normalizeIdentifier(options[0]);
        } else {
          return this.withContext(tenantId, {
            status: options.length ? 'MODEL_REQUIRED' : 'NOT_FOUND',
            modelOptions: options,
            answer: options.length
              ? `Não encontrei o modelo “${intent.model}” exatamente. Encontrei modelos parecidos: ${options.join(', ')}. Confirme o modelo para eu não misturar peças.`
              : `Não encontrei o modelo “${intent.model}” nos catálogos processados.`,
          }, intent);
        }
      }
    }

    const reactResult = await ReActAgentService.execute(tenantId, question, intent.pnc || undefined, intent);

    // A verificação oficial de variantes é mais conservadora do que o fallback
    // local. Se ela exigir PNC, não podemos reutilizar os mesmos candidatos e
    // permitir que uma inferência local rebaixe essa trava para FOUND.
    if (reactResult.status === 'PNC_REQUIRED') {
      const localPncs = resolvedNormalizedModel
        ? await PartSearchService.availablePncs(tenantId, resolvedNormalizedModel)
        : [];
      const suggestedPnc = normalizeIdentifier(reactResult.suggestedPnc || '');
      const pncOptions = [...new Set([
        ...localPncs,
        ...(/^\d{8,14}$/.test(suggestedPnc) ? [suggestedPnc] : []),
      ])];
      return this.withContext(tenantId, {
        status: 'PNC_REQUIRED',
        requiresPnc: true,
        pncOptions,
        answer: reactResult.explanation || 'A peça pode variar entre versões deste modelo. Informe o PNC para eu liberar o código com segurança.',
      }, intent);
    }

    if (reactResult.status === 'FOUND' && reactResult.chosenPartId) {
      const chosen = await PartSearchService.byId(tenantId, reactResult.chosenPartId);
      if (chosen) {
        const decision = evaluateAnswerConfidence({
          question, chosen, runnerUp: undefined, selectionConfidence: 0.9, exactCode: false,
          catalog: await this.catalogConfidenceContext(tenantId, chosen.documentId),
        });

        const result = this.found(chosen, 0.9, chosen.universalAcrossPnc ? 'Qualquer um' : (chosen.pnc || intent.pnc || 'Não informado'), [chosen], decision);
        // Attach reasoning explanation to the match
        if (result.match) result.match.explanation += `\nReAct Reasoning: ${reactResult.explanation}`;
        return this.withContext(tenantId, await this.enrichWithTechnicalContext(tenantId, question, chosen, result), intent);
      }
    }

    // Fallback to local logic if ReAct fails or is ambiguous.
    // Reutiliza os candidatos já obtidos pelo ReAct para evitar consulta semântica/banco duplicada.
    const candidates = reactResult.candidates !== undefined
      ? reactResult.candidates
      : await PartSearchService.semantic(tenantId, question, intent);

    if (!candidates.length) {
      const engineFallback = await this.tryEngineCatalogFallback(tenantId, question, intent);
      if (engineFallback) return this.withContext(tenantId, engineFallback, intent);
      return this.withContext(tenantId, { status: 'NOT_FOUND', answer: 'Não encontrei uma peça com evidência suficiente. Prefiro não sugerir um código sem segurança.' }, intent);
    }

    if (!resolvedNormalizedModel) {
      const models = unique(candidates.slice(0, 15).map(candidate => candidate.model));
      if (models.length > 1) {
        return this.withContext(tenantId, { status: 'MODEL_REQUIRED', modelOptions: models.slice(0, 8), answer: `Encontrei essa descrição em mais de um equipamento (${models.slice(0, 8).join(', ')}). Informe o modelo exato.` }, intent);
      }
    }

    return this.withContext(tenantId, await this.resolvePncOrAmbiguity(
      tenantId, question, intent.partDescription || question, intent.pnc, candidates, undefined,
    ), intent);
  }

  private static async tryEngineCatalogFallback(tenantId: string, question: string, intent: SearchIntent): Promise<ChatSearchResult | null> {
    const route = resolveEngineCatalogRoute(intent.model, intent.pnc, question);
    if (!route) return null;
    if (route.status === 'PNC_REQUIRED') {
      // Aqui estava o defeito que o balcao encontrou: a lista oferecida vinha de
      // `availablePncs`, que sao TODOS os PNCs do modelo no catalogo — no TS142,
      // dez. Só DOIS deles têm motor mapeado. O atendente escolhia um dos outros
      // oito e caía em "nenhum código seguro encontrado", sem entender por quê.
      //
      // Oferecer uma opção que não pode funcionar é pior do que oferecer menos:
      // agora a lista é a dos PNCs que resolvem. `availablePncs` entra só para
      // confirmar quais desses existem de fato no catálogo deste tenant.
      const availablePncs = await PartSearchService.availablePncs(tenantId, normalizeIdentifier(route.machineModel));
      const availableSet = new Set(availablePncs.map(normalizeIdentifier));
      const resolvable = route.knownPncs.filter(pnc => availableSet.has(normalizeIdentifier(pnc)));
      const options = resolvable.length ? resolvable : route.knownPncs;
      return this.withWayOut(tenantId, [route.machineModel], {
        status: 'PNC_REQUIRED', requiresPnc: true,
        pncOptions: options,
        answer: `O ${route.machineModel} sai com motores diferentes conforme a versão, e a peça interna muda com o motor. Confirme o PNC da etiqueta — ${options.length === 1 ? 'só um' : `sÃ£o ${options.length}`} dos PNCs deste modelo leva a um IPL de motor que eu consigo ler.`,
      });
    }

    if (route.status === 'PNC_UNMAPPED') {
      // O PNC existe no catálogo da máquina, mas não está entre os que apontam
      // para um motor. Dizer QUAL serve é a diferença entre um beco sem saída e
      // um próximo passo.
      return this.withWayOut(tenantId, [route.machineModel], {
        status: 'PNC_REQUIRED', requiresPnc: true,
        pncOptions: route.knownPncs,
        answer: route.knownPncs.length
          ? `O PNC ${route.requestedPnc} existe no catálogo do ${route.machineModel}, mas não é um dos que apontam para um IPL de motor aqui. Os que apontam são: ${route.knownPncs.join(', ')}. Confira a etiqueta — e se o PNC da máquina for mesmo ${route.requestedPnc}, abra o catálogo abaixo para conferir a peça na vista.`
          : `O PNC ${route.requestedPnc} existe no catálogo do ${route.machineModel}, mas nenhum PNC deste modelo está ligado a um IPL de motor aqui. Abra o catálogo abaixo para conferir a peça na vista.`,
      });
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
      return this.withWayOut(tenantId, [route.machineModel, route.engineModel], {
        status: 'NOT_FOUND',
        answer: `O ${route.machineModel} usa o motor ${route.engineModel}, e o IPL desse motor ainda não está nesta base. Não vou inventar a peça interna sem o catálogo — abra o que existe abaixo, ou a fonte oficial, para pegar o código na vista.`,
      });
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
      return this.withWayOut(tenantId, [route.machineModel, route.engineModel], {
        status: 'NOT_FOUND',
        answer: `O ${route.machineModel} usa o motor ${route.engineModel}, mas não achei essa peça interna com evidência suficiente no IPL dele. Abra o catálogo abaixo na vista explodida: o código está lá, eu só não consigo garantir qual é.`,
      });
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
    const reasoningSteps: TechnicalReasoningStep[] = [
      {
        step: 1,
        title: 'Identificação da Máquina e Motor',
        detail: candidate.manufacturer
          ? `${candidate.manufacturer} · Modelo ${candidate.model} (PNC: ${pncLabel})`
          : `Equipamento ${candidate.model} (PNC: ${pncLabel})`,
        status: 'SUCCESS',
      },
    ];

    if (candidate.section || candidate.page || candidate.position) {
      reasoningSteps.push({
        step: 2,
        title: 'Localização na Vista Explodida',
        detail: [
          candidate.section ? `Seção "${candidate.section}"` : '',
          candidate.page ? `Página ${candidate.page} do catálogo` : '',
          candidate.position ? `Posição Nº ${candidate.position}` : '',
        ].filter(Boolean).join(' · '),
        status: 'SUCCESS',
      });
    }

    const verifiedSupersession = getVerifiedSupersession(candidate.partNumber);
    if (verifiedSupersession && verifiedSupersession.currentPartNumber !== candidate.partNumber) {
      reasoningSteps.push({
        step: 3,
        title: 'Cruzamento de Substituição Oficial',
        detail: `Código anterior ${candidate.partNumber} substituído pela fabricante pelo código vigente ${verifiedSupersession.currentPartNumber}.`,
        status: 'NOTICE',
      });
    } else {
      reasoningSteps.push({
        step: 3,
        title: 'Validação do Código Oficial',
        detail: `Part Number oficial ${candidate.partNumber} verificado para ${candidate.name}.`,
        status: 'SUCCESS',
      });
    }

    reasoningSteps.push({
      step: 4,
      title: 'Segurança Técnica e Compatibilidade',
      detail: decision?.reason || (candidate.searchMethod === 'DIRECT_CODE'
        ? 'Código direto identificado no catálogo sem ambiguidade.'
        : `Liberado via ${sources.join(' + ')} com nível ${level}.`),
      status: 'SUCCESS',
    });

    const diagramHighlight: DiagramHighlight | undefined = (candidate.documentId && (candidate.page || candidate.position)) ? {
      documentId: candidate.documentId,
      filename: candidate.filename,
      page: candidate.page ?? null,
      position: candidate.position ?? null,
      section: candidate.section ?? null,
    } : undefined;

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
      b2bPortal: getVerifiedSupersession(candidate.partNumber) ? {
        stockStatus: 'Código oficial ativo no Portal Husqvarna',
        supersededBy: getVerifiedSupersession(candidate.partNumber)?.currentPartNumber !== candidate.partNumber ? getVerifiedSupersession(candidate.partNumber)?.currentPartNumber : undefined,
        success: true,
        message: 'Substituição oficial comprovada no portal público Husqvarna Brasil.',
      } : undefined,
      technicalReasoningSteps: reasoningSteps,
      diagramHighlight,
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

  // O codigo SEMPRE existe: esta no catalogo, impresso na vista explodida.
  // Quando o app nao consegue garantir QUAL e, o minimo e colocar esse catalogo
  // na mao do atendente em vez de pedir que ele reformule a pergunta.
  private static async wayOut(tenantId: string, models: string[]): Promise<ChatSearchResult['manualFallback']> {
    const normalized = [...new Set(models.map(normalizeIdentifier).filter(Boolean))];
    const officialUrl = HUSQVARNA_SPARE_PARTS_URL;
    const officialLabel = 'Peças sobressalentes Husqvarna';
    if (!normalized.length) return { catalogs: [], officialUrl, officialLabel };

    try {
      // Pelo lado de Part e nao de Document: garante que o catalogo oferecido
      // realmente contem peca daquele modelo, e ja da a contagem real.
      const grouped = await prisma.part.groupBy({
        by: ['documentId'],
        where: {
          active: true,
          normalizedModel: { in: normalized },
          document: { tenantId, archivedAt: null, status: 'COMPLETED' },
        },
        _count: { _all: true },
        orderBy: { _count: { documentId: 'desc' } },
        take: 4,
      });
      if (!grouped.length) return { catalogs: [], officialUrl, officialLabel };

      const documents = await prisma.document.findMany({
        where: { id: { in: grouped.map(row => row.documentId) } },
        select: { id: true, filename: true, model: true, pnc: true },
      });
      const byId = new Map(documents.map(document => [document.id, document]));

      return {
        catalogs: grouped.flatMap(row => {
          const document = byId.get(row.documentId);
          if (!document) return [];
          return [{
            documentId: document.id,
            filename: document.filename,
            model: document.model,
            pnc: document.pnc,
            partCount: row._count._all,
          }];
        }),
        officialUrl,
        officialLabel,
      };
    } catch (error) {
      // A saida e um extra: se a consulta falhar, a resposta principal continua.
      console.warn('⚠️ Não foi possível montar os catálogos de saída manual.', error instanceof Error ? error.message : error);
      return { catalogs: [], officialUrl, officialLabel };
    }
  }

  private static async withWayOut(tenantId: string, models: string[], result: ChatSearchResult): Promise<ChatSearchResult> {
    return { ...result, manualFallback: await this.wayOut(tenantId, models) };
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

  private static async withContext(tenantId: string, result: ChatSearchResult, intent: SearchIntent): Promise<ChatSearchResult> {
    const guidance: Record<SearchStatus, ChatSearchResult['guidance']> = {
      FOUND: {
        title: 'Código localizado',
        description: 'O código passou pelos filtros técnicos e pelo gate de confiança. Ainda confirme a máquina quando houver identificação física disponível.',
        tips: ['Confira modelo e PNC.', 'Use página/seção como segunda conferência quando o atendimento for crítico.'],
      },
      PNC_REQUIRED: {
        title: 'Falta confirmar o PNC',
        description: 'O mesmo modelo possui variações e a peça muda entre elas.',
        tips: ['O PNC está na etiqueta da máquina, junto do número de série.', 'Só os PNCs listados abaixo levam a um catálogo que eu consigo ler.', 'Sem a etiqueta em mãos, abra o catálogo e confira a peça na vista explodida.'],
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
        title: 'Duas peças plausíveis — confirme qual',
        description: 'Achei mais de um candidato e nenhum se separa dos outros com folga. Prefiro perguntar a mandar o código errado.',
        tips: ['Compare lado, medida e posição na vista explodida.', 'O PNC da etiqueta normalmente decide entre as opções.', 'Escolha nas opções acima ou abra o catálogo abaixo.'],
      },
      NOT_FOUND: {
        title: 'Não vou chutar o código',
        description: 'O código existe e está no catálogo — eu é que não consigo garantir qual é. Errar aqui é devolução no balcão.',
        tips: ['Abra o catálogo abaixo e confira a peça na vista explodida: o código está impresso lá.', 'Informar o modelo e o PNC costuma resolver na hora.', 'Se o cliente trouxe a peça, pesquise o código dela sem espaços nem hífens.'],
      },
    };
    // Nenhuma resposta sem código sai daqui sem um caminho. Quem já montou a
    // própria saída (a rota de motor sabe o modelo do motor, e portanto acha o
    // catálogo certo) é respeitado: só preenche quem veio sem nada.
    const manualFallback = result.status === 'FOUND' || result.manualFallback
      ? result.manualFallback
      : await this.wayOut(tenantId, [intent.model, result.part?.model, ...(result.options || []).map(option => option.model)].filter((value): value is string => Boolean(value)));

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
      manualFallback,
    };
  }
}
