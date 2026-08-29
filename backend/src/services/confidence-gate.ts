import { extractTechnicalQualifiers, relationSpecificityBonus } from './candidate-specificity';
import { rankingEvidence, type PartCandidate, type RetrievalSource } from './part-search.service';

export type ConfidenceDecision = {
  safe: boolean;
  confidence: number;
  level: 'EXACT' | 'HIGH' | 'REVIEW';
  evidence: string[];
  reason: string;
};

export type CatalogConfidenceContext = {
  healthScore?: number | null;
  reviewStatus?: 'PENDING' | 'READY' | 'NEEDS_REVIEW' | 'REVIEWED' | null;
  reviewReasons?: string[];
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sources(candidate: PartCandidate): RetrievalSource[] {
  return [...new Set(candidate.retrievalSources?.length ? candidate.retrievalSources : [candidate.searchMethod])];
}

function retrievalEvidence(candidate: PartCandidate): number {
  return candidate.retrievalScore ?? Math.max(0, 1 - candidate.distance);
}

function explicitQualifierCount(question: string): number {
  const qualifiers = extractTechnicalQualifiers(question);
  return Object.values(qualifiers).filter(value => value !== null).length;
}

function plainText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function explicitPosition(value: string): string | null {
  const match = plainText(value).match(/\b(?:POSICAO|POS|ITEM|REF|REFERENCIA)\s*[:#.-]?\s*(\d{1,3})\b/);
  return match?.[1] || null;
}

function explicitTechnicalContradictions(question: string, candidate: PartCandidate): string[] {
  const requested = extractTechnicalQualifiers(question);
  const candidateText = [candidate.name, candidate.section, ...candidate.alternativeNames, candidate.notes]
    .filter(Boolean)
    .join(' ');
  const present = extractTechnicalQualifiers(candidateText);
  const labels: Array<[keyof typeof requested, string]> = [
    ['direction', 'lado LH/RH'],
    ['axlePosition', 'posição dianteira/traseira'],
    ['sprocketType', 'tipo Rim/Spur'],
    ['teeth', 'quantidade de dentes'],
    ['chainPitch', 'passo da corrente'],
    ['metricThread', 'rosca métrica'],
    ['metricSizeMm', 'medida em milímetros'],
    ['voltageV', 'tensão elétrica'],
    ['inchSize', 'medida em polegadas'],
  ];
  const conflicts: string[] = [];

  for (const [key, label] of labels) {
    if (requested[key] !== null && present[key] !== null && requested[key] !== present[key]) {
      conflicts.push(label);
    }
  }

  const requestedPosition = explicitPosition(question);
  const candidatePosition = candidate.position?.trim() || null;
  if (requestedPosition && candidatePosition && requestedPosition !== candidatePosition) {
    conflicts.push('posição da vista explodida');
  }

  return conflicts;
}

function catalogEvidence(context: CatalogConfidenceContext | undefined): {
  adjustment: number;
  blocksInference: boolean;
  messages: string[];
} {
  if (!context) return { adjustment: 0, blocksInference: false, messages: [] };
  const health = typeof context.healthScore === 'number' && Number.isFinite(context.healthScore)
    ? Math.max(0, Math.min(100, context.healthScore))
    : null;
  const status = context.reviewStatus || null;
  const messages: string[] = [];
  let adjustment = 0;
  let blocksInference = false;

  if (status === 'NEEDS_REVIEW') {
    blocksInference = true;
    adjustment -= 0.16;
    messages.push('O catálogo de origem está marcado para revisão estrutural; respostas inferidas exigem conferência humana.');
  } else if (status === 'REVIEWED') {
    adjustment += 0.03;
    messages.push('O catálogo de origem já passou por revisão administrativa de qualidade.');
  } else if (status === 'READY') {
    adjustment += 0.01;
    messages.push('O catálogo de origem passou pelas verificações estruturais automáticas.');
  } else if (status === 'PENDING') {
    adjustment -= 0.02;
    messages.push('A revisão estrutural do catálogo de origem ainda está pendente.');
  }

  if (health !== null && health > 0) {
    if (health < 60) {
      blocksInference = true;
      adjustment -= 0.12;
      messages.push(`Saúde estrutural do catálogo: ${Math.round(health)}/100, abaixo do mínimo para liberar uma inferência.`);
    } else if (health < 75) {
      adjustment -= 0.04;
      messages.push(`Saúde estrutural do catálogo: ${Math.round(health)}/100; confiança reduzida.`);
    } else if (health >= 90) {
      adjustment += 0.02;
      messages.push(`Saúde estrutural do catálogo: ${Math.round(health)}/100.`);
    }
  }

  if (blocksInference && context.reviewReasons?.length) {
    messages.push(`Motivo de revisão: ${context.reviewReasons[0]}.`);
  }

  return { adjustment, blocksInference, messages };
}

/**
 * Decide se o primeiro candidato tem evidência suficiente para liberar um código.
 * Ranking e autorização são propositadamente separados: um candidato sempre pode
 * ser o primeiro, mas isso não significa que o CogniVault tenha permissão para
 * tratá-lo como resposta segura.
 */
export function evaluateAnswerConfidence(params: {
  question: string;
  chosen: PartCandidate;
  runnerUp?: PartCandidate;
  selectionConfidence: number;
  exactCode?: boolean;
  catalog?: CatalogConfidenceContext;
}): ConfidenceDecision {
  const { question, chosen, runnerUp, exactCode = false } = params;
  const catalog = catalogEvidence(params.catalog);

  if (exactCode || chosen.searchMethod === 'DIRECT_CODE') {
    return {
      safe: true,
      confidence: 1,
      level: 'EXACT',
      evidence: ['Código localizado diretamente em um registro de peça ativo.', ...catalog.messages],
      reason: catalog.blocksInference
        ? 'Código exato encontrado na base técnica; o catálogo possui alerta estrutural para consultas inferidas.'
        : 'Código exato encontrado na base técnica.',
    };
  }

  const retrievalSources = sources(chosen);
  const agreement = Math.max(chosen.retrievalAgreement || 0, retrievalSources.length);
  const retrieval = retrievalEvidence(chosen);
  const semanticConfidence = Math.max(0, 1 - Math.max(0, chosen.distance - chosen.feedbackScore));
  const specificity = relationSpecificityBonus(question, {
    name: chosen.name,
    section: chosen.section,
    aliases: chosen.alternativeNames,
    notes: chosen.notes,
  });
  const qualifierCount = explicitQualifierCount(question);
  const contradictions = explicitTechnicalContradictions(question, chosen);
  const chosenEvidence = rankingEvidence(question, chosen);
  const runnerEvidence = runnerUp ? rankingEvidence(question, runnerUp) : 0;
  const sameCodeRunner = Boolean(runnerUp && runnerUp.normalizedPartNumber === chosen.normalizedPartNumber);
  const margin = runnerUp ? chosenEvidence - runnerEvidence : 0.35;
  const rawRetrievalMargin = runnerUp && !sameCodeRunner
    ? retrieval - retrievalEvidence(runnerUp)
    : 1;

  // Se códigos diferentes chegam praticamente empatados pelos recuperadores,
  // uma regra de desempate mecânico pode ordenar as opções, mas não deve sozinha
  // transformar o primeiro colocado em certeza. O usuário ainda recebe o melhor
  // candidato, porém precisa confirmar a aplicação/vista antes do código liberar.
  const differentCodeNearTie = Boolean(
    runnerUp
    && !sameCodeRunner
    && rawRetrievalMargin < 0.03
    && margin < 0.16,
  );

  let confidence = Math.min(clamp(params.selectionConfidence), clamp(Math.max(semanticConfidence, retrieval)));
  if (agreement >= 3) confidence += 0.10;
  else if (agreement === 2) confidence += 0.06;
  if (specificity >= 0.18) confidence += 0.05;
  if (qualifierCount > 0 && specificity > 0) confidence += Math.min(0.05, qualifierCount * 0.015);
  if (!runnerUp || sameCodeRunner) confidence += 0.04;
  else if (margin >= 0.20) confidence += 0.06;
  else if (margin >= 0.10) confidence += 0.03;
  else if (margin < 0.05) confidence -= 0.12;
  if (differentCodeNearTie) confidence -= 0.08;
  if (contradictions.length) confidence -= Math.min(0.35, contradictions.length * 0.14);
  confidence += catalog.adjustment;

  const fuzzyOnly = retrievalSources.length === 1 && retrievalSources[0] === 'FUZZY';
  const semanticOnly = retrievalSources.length === 1 && retrievalSources[0] === 'SEMANTIC';
  if (fuzzyOnly) confidence = Math.min(confidence, 0.66);
  if (semanticOnly) confidence = Math.min(confidence, 0.74);
  confidence = clamp(confidence);

  const strongLead = !runnerUp || sameCodeRunner || margin >= 0.08;
  const independentEvidence = agreement >= 2 || retrievalSources.includes('LEXICAL') || retrievalSources.includes('FULL_TEXT');
  const safe = confidence >= 0.72
    && strongLead
    && independentEvidence
    && !differentCodeNearTie
    && contradictions.length === 0
    && !fuzzyOnly
    && !catalog.blocksInference;
  const evidence: string[] = [];
  if (agreement >= 2) evidence.push(`${agreement} métodos independentes concordaram com esta peça.`);
  else evidence.push(`Recuperação principal: ${retrievalSources[0] || chosen.searchMethod}.`);
  if (specificity > 0) evidence.push('Os detalhes mecânicos explícitos da pergunta combinam com o candidato.');
  if (runnerUp && !sameCodeRunner) {
    evidence.push(`Margem técnica sobre a segunda opção: ${Math.max(0, margin).toFixed(3)}.`);
    evidence.push(`Margem entre recuperadores para códigos diferentes: ${Math.max(0, rawRetrievalMargin).toFixed(3)}.`);
  }
  if (differentCodeNearTie) evidence.push('Dois códigos diferentes ficaram praticamente empatados na recuperação; confirmação humana obrigatória.');
  if (contradictions.length) evidence.push(`Contradição explícita detectada: ${contradictions.join(', ')}.`);
  if (chosen.feedbackScore > 0.02) evidence.push('Há feedback positivo/correção anterior favorecendo este resultado.');
  if (fuzzyOnly) evidence.push('A peça apareceu apenas pela tolerância a erro de digitação; confirmação adicional é obrigatória.');
  evidence.push(...catalog.messages);

  return {
    safe,
    confidence,
    level: safe && confidence >= 0.86 ? 'HIGH' : 'REVIEW',
    evidence,
    reason: safe
      ? 'Há evidência independente, separação suficiente das alternativas e o catálogo não possui bloqueio estrutural conhecido.'
      : contradictions.length
        ? 'O candidato contradiz um detalhe técnico informado explicitamente na consulta; não vou liberar o código.'
        : catalog.blocksInference
          ? 'O catálogo de origem precisa de revisão antes de uma resposta inferida ser liberada automaticamente.'
          : differentCodeNearTie
            ? 'Dois códigos diferentes ficaram próximos demais para eu liberar um deles automaticamente.'
            : 'A evidência ainda não é suficiente para liberar automaticamente um código.',
  };
}
