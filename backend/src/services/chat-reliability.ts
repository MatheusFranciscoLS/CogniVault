import { normalizeIdentifier, normalizeText } from '../utils/normalize';
import type { CandidateForAi, SearchIntent } from './chat-intent.service';
import { relationSpecificityBonus } from './candidate-specificity';
import { extractKnownHusqvarnaModel } from './husqvarna-domain-knowledge';
import { lexicalTerms, scorePartText } from './part-vocabulary';

function isPncContext(question: string, index: number) {
  return /pnc\s*$/i.test(question.slice(Math.max(0, index - 8), index));
}

export function extractLikelyPartNumber(question: string): string {
  const candidates: Array<{ value: string; index: number }> = [];
  const grouped = /\b(?:[A-Z0-9]*\d[A-Z0-9]*)(?:[\s./-]+(?:[A-Z0-9]*\d[A-Z0-9]*)){1,}\b/gi;
  const compact = /\b(?:[A-Z]{1,3})?\d{6,}\b/gi;
  for (const pattern of [grouped, compact]) {
    for (const match of question.matchAll(pattern)) {
      if (match.index === undefined || isPncContext(question, match.index)) continue;
      const value = match[0].trim();
      const normalized = normalizeIdentifier(value);
      const digits = normalized.replace(/\D/g, '').length;
      if (normalized.length >= 6 && digits >= 5) candidates.push({ value, index: match.index });
    }
  }
  return candidates.sort((a, b) => normalizeIdentifier(b.value).length - normalizeIdentifier(a.value).length)[0]?.value || '';
}

export function extractLikelyPnc(question: string): string {
  const match = question.match(/\bpnc\s*[:#-]?\s*((?:[a-z0-9]*\d[a-z0-9]*)(?:[\s./-]+(?:[a-z0-9]*\d[a-z0-9]*)){1,})/i);
  return match?.[1]?.trim() || '';
}

export function extractLikelyPosition(question: string): string {
  const normalized = normalizeText(question);
  const match = normalized.match(/\b(?:posicao|pos|item|ref|referencia)\s*[:#.-]?\s*(\d{1,3})\b/i);
  return match?.[1] || '';
}

export function extractLikelyModel(question: string): string {
  const partNumber = extractLikelyPartNumber(question);
  const pnc = extractLikelyPnc(question);
  let withoutReferences = [partNumber, pnc].filter(Boolean).reduce((value, reference) => value.replace(reference, ' '), question);
  withoutReferences = withoutReferences.replace(/\b(?:posição|posicao|pos|item|ref|referência|referencia)\s*[:#.-]?\s*\d{1,3}\b/gi, ' ');
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
  return {
    manufacturer: extractLikelyManufacturer(question),
    model: extractLikelyModel(question),
    pnc: extractLikelyPnc(question),
    partDescription: question.trim(),
    partNumber: extractLikelyPartNumber(question),
    section: '',
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
  const safeLead = best && best.score >= 0.58 && (!second || best.score - second.score >= 0.16);
  return safeLead
    ? { id: best.id, confidence: Math.max(0.72, Math.min(0.94, best.score)), ambiguous: false }
    : { id: null, confidence: Math.max(0, Math.min(1, best?.score || 0)), ambiguous: true };
}

export function calibrateMatchConfidence(selectionConfidence: number, distance: number, exactCode = false): number {
  if (exactCode) return 1;
  const semanticConfidence = Math.max(0, Math.min(1, 1 - distance));
  return Math.max(0, Math.min(1, Math.min(selectionConfidence, semanticConfidence)));
}
