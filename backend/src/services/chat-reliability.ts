import { normalizeIdentifier, normalizeText } from '../utils/normalize';
import type { CandidateForAi, SearchIntent } from './chat-intent.service';
import {
  extractExplicitSerialNumber,
  relationSpecificityBonus,
  stripExplicitSerialContext,
} from './candidate-specificity';
import {
  extractExplicitOccurrencePosition,
  extractExplicitOccurrenceSection,
} from './explicit-occurrence-constraints';
import { extractKnownHusqvarnaModel } from './husqvarna-domain-knowledge';
import { lexicalTerms, scorePartText } from './part-vocabulary';

function isPncContext(question: string, index: number) {
  return /pnc\s*[:#-]?\s*$/i.test(question.slice(Math.max(0, index - 14), index));
}

export function extractLikelyPartNumber(question: string): string {
  const candidates: Array<{ value: string; index: number }> = [];
  const explicitSerial = normalizeIdentifier(extractExplicitSerialNumber(question));
  const grouped = /\b(?:[A-Z0-9]*\d[A-Z0-9]*)(?:[\s./-]+(?:[A-Z0-9]*\d[A-Z0-9]*)){1,}\b/gi;
  const compact = /\b(?:[A-Z]{1,3})?\d{6,}\b/gi;
  for (const pattern of [grouped, compact]) {
    for (const match of question.matchAll(pattern)) {
      if (match.index === undefined || isPncContext(question, match.index)) continue;
      const value = match[0].trim();
      const normalized = normalizeIdentifier(value);
      if (explicitSerial && normalized === explicitSerial) continue;
      const digits = normalized.replace(/\D/g, '').length;
      if (normalized.length >= 6 && digits >= 5) candidates.push({ value, index: match.index });
    }
  }
  return candidates.sort((a, b) => normalizeIdentifier(b.value).length - normalizeIdentifier(a.value).length)[0]?.value || '';
}

export function extractLikelyPnc(question: string): string {
  const match = question.match(/\bpnc\s*[:#-]?\s*((?:\d{8,12})|(?:[a-z0-9]*\d[a-z0-9]*)(?:[\s./-]+(?:[a-z0-9]*\d[a-z0-9]*)){1,})/i);
  return match?.[1]?.trim() || '';
}

export function extractLikelyPosition(question: string): string {
  return extractExplicitOccurrencePosition(question);
}

export function extractLikelyModel(question: string): string {
  const partNumber = extractLikelyPartNumber(question);
  const pnc = extractLikelyPnc(question);
  const serial = extractExplicitSerialNumber(question);
  let withoutReferences = [partNumber, pnc, serial].filter(Boolean).reduce((value, reference) => value.replace(reference, ' '), question);
  withoutReferences = withoutReferences
    .replace(/\b(?:posição|posicao|pos|item|ref|referência|referencia)\s*[:#.-]?\s*\d{1,3}\b/gi, ' ')
    .replace(/\b(?:s\s*\/\s*n|sn|serial(?:\s+number)?|número\s+(?:de\s+)?série|numero\s+(?:de\s+)?serie)\s*[:#.-]?\s*/gi, ' ');
  const knownModel = extractKnownHusqvarnaModel(withoutReferences);
  if (knownModel && (/^\d+$/.test(knownModel) || knownModel.includes('MARK'))) return knownModel;
  const spaced = withoutReferences.match(/\b\d{2,4}\s*(?:r\s*)?(?:ii|iii|iv|v|rs|rx|rj|xp|x|[a-z]{1,3})\b/i);
  if (spaced?.[0]) return spaced[0].replace(/\s+/g, '');
  const compact = withoutReferences.match(/\b(?=[a-z0-9-]{3,14}\b)(?=[a-z0-9-]*[a-z])(?=[a-z0-9-]*\d)[a-z0-9-]+\b/i);
  return compact?.[0] || knownModel || '';
}

function extractLikelyManufacturer(question: string): string {
  const manufacturers = ['Husqvarna', 'Stihl', 'Honda', 'Kawashima', 'Toyama', 'Briggs & Stratton'];
  const normalized = normalizeText(question);
  return manufacturers.find(item => normalized.includes(normalizeText(item))) || '';
}

export function buildFallbackIntent(question: string): SearchIntent {
  const retrievalDescription = stripExplicitSerialContext(question) || question.trim();
  return {
    manufacturer: extractLikelyManufacturer(question),
    model: extractLikelyModel(question),
    pnc: extractLikelyPnc(question),
    partDescription: retrievalDescription,
    partNumber: extractLikelyPartNumber(question),
    section: extractExplicitOccurrenceSection(question),
    position: extractLikelyPosition(question),
  };
}

export function lexicalSearchTerms(value: string): string[] {
  return lexicalTerms(value);
}

export function chooseCandidateLocally(
  question: string,
  candidates: CandidateForAi[],
): { id: string | null; confidence: number; ambiguous: boolean } {
  if (candidates.length === 1) return { id: candidates[0].id, confidence: 0.9, ambiguous: false };
  const requestedPosition = normalizeIdentifier(extractLikelyPosition(question));
  const ranked = candidates.map(candidate => {
    const technicalScore = scorePartText(question, {
      name: candidate.name,
      section: candidate.section,
      aliases: candidate.aliases,
      notes: candidate.notes,
    });
    const retrievalScore = Math.max(0, Math.min(1, candidate.retrievalScore || 0));
    const agreement = Math.max(1, candidate.retrievalAgreement || candidate.retrievalSources?.length || 1);
    let score = technicalScore
      + relationSpecificityBonus(question, candidate)
      + (candidate.feedbackScore || 0)
      + retrievalScore * 0.16
      + Math.min(0.12, Math.max(0, agreement - 1) * 0.04);

    if (requestedPosition) {
      const candidatePosition = normalizeIdentifier(candidate.position);
      if (candidatePosition === requestedPosition) score += 0.32;
      else if (candidatePosition) score -= 0.16;
    }
    return { id: candidate.id, score };
  }).sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const second = ranked[1];
  
  const bestCandidate = best ? candidates.find(c => c.id === best.id) : undefined;
  const secondCandidate = second ? candidates.find(c => c.id === second.id) : undefined;
  const hasFeedbackAdvantage = bestCandidate && secondCandidate && (bestCandidate.feedbackScore || 0) - (secondCandidate.feedbackScore || 0) >= 0.03;

  const safeLead = best && best.score >= 0.58 && (!second || best.score - second.score >= 0.16 || (hasFeedbackAdvantage && best.score - second.score >= 0.04));
  return safeLead
    // Esta confiança pertence apenas ao desempate heurístico local. Ela não deve
    // parecer "quase certeza": o gate final ainda precisa validar recuperadores,
    // catálogo, PNC e separação entre códigos diferentes.
    ? { id: best.id, confidence: Math.max(0.72, Math.min(0.9, best.score)), ambiguous: false }
    : { id: null, confidence: Math.max(0, Math.min(1, best?.score || 0)), ambiguous: true };
}

export function calibrateMatchConfidence(selectionConfidence: number, distance: number, exactCode = false): number {
  if (exactCode) return 1;
  const semanticConfidence = Math.max(0, Math.min(1, 1 - distance));
  return Math.max(0, Math.min(1, Math.min(selectionConfidence, semanticConfidence)));
}
