import { extractTechnicalQualifiers, relationSpecificityBonus } from './candidate-specificity';
import { rankingEvidence, type PartCandidate, type RetrievalSource } from './part-search.service';

export type ConfidenceDecision = {
  safe: boolean;
  confidence: number;
  level: 'EXACT' | 'HIGH' | 'REVIEW';
  evidence: string[];
  reason: string;
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sources(candidate: PartCandidate): RetrievalSource[] {
  return [...new Set(candidate.retrievalSources?.length ? candidate.retrievalSources : [candidate.searchMethod])];
}

function explicitQualifierCount(question: string): number {
  const qualifiers = extractTechnicalQualifiers(question);
  return Object.values(qualifiers).filter(value => value !== null).length;
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
}): ConfidenceDecision {
  const { question, chosen, runnerUp, exactCode = false } = params;
  if (exactCode || chosen.searchMethod === 'DIRECT_CODE') {
    return {
      safe: true,
      confidence: 1,
      level: 'EXACT',
      evidence: ['Código localizado diretamente em um registro de peça ativo.'],
      reason: 'Código exato encontrado na base técnica.',
    };
  }

  const retrievalSources = sources(chosen);
  const agreement = Math.max(chosen.retrievalAgreement || 0, retrievalSources.length);
  const retrieval = chosen.retrievalScore ?? Math.max(0, 1 - chosen.distance);
  const semanticConfidence = Math.max(0, 1 - Math.max(0, chosen.distance - chosen.feedbackScore));
  const specificity = relationSpecificityBonus(question, {
    name: chosen.name,
    section: chosen.section,
    aliases: chosen.alternativeNames,
    notes: chosen.notes,
  });
  const qualifierCount = explicitQualifierCount(question);
  const chosenEvidence = rankingEvidence(question, chosen);
  const runnerEvidence = runnerUp ? rankingEvidence(question, runnerUp) : 0;
  const sameCodeRunner = Boolean(runnerUp && runnerUp.normalizedPartNumber === chosen.normalizedPartNumber);
  const margin = runnerUp ? chosenEvidence - runnerEvidence : 0.35;

  let confidence = Math.min(clamp(params.selectionConfidence), clamp(Math.max(semanticConfidence, retrieval)));
  if (agreement >= 3) confidence += 0.10;
  else if (agreement === 2) confidence += 0.06;
  if (specificity >= 0.18) confidence += 0.05;
  if (qualifierCount > 0 && specificity > 0) confidence += Math.min(0.05, qualifierCount * 0.015);
  if (!runnerUp || sameCodeRunner) confidence += 0.04;
  else if (margin >= 0.20) confidence += 0.06;
  else if (margin >= 0.10) confidence += 0.03;
  else if (margin < 0.05) confidence -= 0.12;

  const fuzzyOnly = retrievalSources.length === 1 && retrievalSources[0] === 'FUZZY';
  const semanticOnly = retrievalSources.length === 1 && retrievalSources[0] === 'SEMANTIC';
  if (fuzzyOnly) confidence = Math.min(confidence, 0.66);
  if (semanticOnly) confidence = Math.min(confidence, 0.74);
  confidence = clamp(confidence);

  const strongLead = !runnerUp || sameCodeRunner || margin >= 0.08;
  const independentEvidence = agreement >= 2 || retrievalSources.includes('LEXICAL') || retrievalSources.includes('FULL_TEXT');
  const safe = confidence >= 0.72 && strongLead && independentEvidence && !fuzzyOnly;
  const evidence: string[] = [];
  if (agreement >= 2) evidence.push(`${agreement} métodos independentes concordaram com esta peça.`);
  else evidence.push(`Recuperação principal: ${retrievalSources[0] || chosen.searchMethod}.`);
  if (specificity > 0) evidence.push('Os detalhes mecânicos explícitos da pergunta combinam com o candidato.');
  if (runnerUp && !sameCodeRunner) evidence.push(`Margem técnica sobre a segunda opção: ${Math.max(0, margin).toFixed(3)}.`);
  if (chosen.feedbackScore > 0.02) evidence.push('Há feedback positivo/correção anterior favorecendo este resultado.');
  if (fuzzyOnly) evidence.push('A peça apareceu apenas pela tolerância a erro de digitação; confirmação adicional é obrigatória.');

  return {
    safe,
    confidence,
    level: safe && confidence >= 0.86 ? 'HIGH' : 'REVIEW',
    evidence,
    reason: safe
      ? 'Há evidência independente e separação suficiente das alternativas.'
      : 'A evidência ainda não é suficiente para liberar automaticamente um código.',
  };
}
