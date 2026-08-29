import { findPartConcepts, inferPartQueryRelation } from './part-vocabulary';

type CandidateText = {
  name: string;
  section?: string | null;
  aliases?: string[];
  notes?: string | null;
};

type Direction = 'LEFT' | 'RIGHT';
type AxlePosition = 'FRONT' | 'REAR';
type SprocketType = 'RIM' | 'SPUR';

type TechnicalQualifiers = {
  direction: Direction | null;
  axlePosition: AxlePosition | null;
  sprocketType: SprocketType | null;
  teeth: number | null;
  chainPitch: string | null;
  metricThread: string | null;
  metricSizeMm: number | null;
  voltageV: number | null;
  inchSize: number | null;
};

function technicalText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/,/g, '.')
    .toUpperCase();
}

function extractDirection(text: string): Direction | null {
  if (/\b(?:LH|LEFT|ESQUERD[AO])\b/.test(text)) return 'LEFT';
  if (/\b(?:RH|RIGHT|DIREIT[AO])\b/.test(text)) return 'RIGHT';
  return null;
}

function extractAxlePosition(text: string): AxlePosition | null {
  if (/\b(?:FRONT|FRONTAL|DIANTEIR[AO]|FRENTE)\b/.test(text)) return 'FRONT';
  if (/\b(?:REAR|TRASEIR[AO])\b/.test(text)) return 'REAR';
  return null;
}

function extractSprocketType(text: string): SprocketType | null {
  if (/\bRIM\b/.test(text)) return 'RIM';
  if (/\bSPUR\b/.test(text)) return 'SPUR';
  return null;
}

function extractTeeth(text: string): number | null {
  const match = text.match(/\b(\d{1,2})\s*(?:T\b|DENTES?\b)/);
  return match ? Number(match[1]) : null;
}

function extractChainPitch(text: string): string | null {
  if (/\b3\s*\/\s*8\b/.test(text)) return '3/8';
  if (/\b1\s*\/\s*4\b/.test(text)) return '1/4';
  if (/(?:^|\s)\.?325(?:\s|$|["'])/.test(text)) return '.325';
  if (/(?:^|\s)\.?404(?:\s|$|["'])/.test(text)) return '.404';
  return null;
}

function extractMetricThread(text: string): string | null {
  const match = text.match(/\bM\s*(\d+(?:\.\d+)?)\s*[X×]\s*(\d+(?:\.\d+)?)\b/);
  if (!match) return null;
  return `M${match[1]}X${match[2]}`;
}

function extractMetricSizeMm(text: string): number | null {
  const match = text.match(/(?:Ø|\bDIA(?:METRO)?\s*)?(\d{1,4}(?:\.\d+)?)\s*MM\b/);
  return match ? Number(match[1]) : null;
}

function extractVoltage(text: string): number | null {
  const match = text.match(/\b(\d{1,3}(?:\.\d+)?)\s*V(?:OLT(?:S)?)?\b/);
  return match ? Number(match[1]) : null;
}

function extractInchSize(text: string): number | null {
  for (const match of text.matchAll(/\b(\d{1,3}(?:\.\d+)?)\s*(?:"|INCH(?:ES)?\b|IN\b|POLEGADAS?\b)/g)) {
    const start = match.index ?? 0;
    // Evita interpretar o denominador de 3/8" como uma medida inteira de 8".
    if (start > 0 && text.slice(Math.max(0, start - 3), start).includes('/')) continue;
    return Number(match[1]);
  }
  return null;
}

export function extractTechnicalQualifiers(value: string): TechnicalQualifiers {
  const text = technicalText(value);
  return {
    direction: extractDirection(text),
    axlePosition: extractAxlePosition(text),
    sprocketType: extractSprocketType(text),
    teeth: extractTeeth(text),
    chainPitch: extractChainPitch(text),
    metricThread: extractMetricThread(text),
    metricSizeMm: extractMetricSizeMm(text),
    voltageV: extractVoltage(text),
    inchSize: extractInchSize(text),
  };
}

function categoricalEvidence<T>(requested: T | null, candidate: T | null, match: number, conflict: number): number {
  if (requested === null || candidate === null) return 0;
  return requested === candidate ? match : -conflict;
}

/**
 * Usa restrições mecânicas explicitamente escritas pelo usuário para desempatar
 * candidatos JÁ compatíveis com tenant/modelo/PNC. Não cria aplicação.
 *
 * Exemplos: LH/RH, dianteira/traseira, Rim/Spur, 7T/8T, 3/8 vs .325,
 * M5x20, Ø22/Ø25 mm, 12 V e 12". Igualdade soma evidência; contradição reduz
 * o score; ausência de uma informação no candidato não é tratada como erro.
 */
export function technicalConstraintBonus(query: string, candidate: CandidateText): number {
  const requested = extractTechnicalQualifiers(query);
  const directText = [candidate.name, candidate.section, ...(candidate.aliases || []), candidate.notes]
    .filter(Boolean)
    .join(' ');
  const present = extractTechnicalQualifiers(directText);

  let score = 0;
  score += categoricalEvidence(requested.direction, present.direction, 0.24, 0.38);
  score += categoricalEvidence(requested.axlePosition, present.axlePosition, 0.24, 0.38);
  score += categoricalEvidence(requested.sprocketType, present.sprocketType, 0.24, 0.38);
  score += categoricalEvidence(requested.teeth, present.teeth, 0.18, 0.30);
  score += categoricalEvidence(requested.chainPitch, present.chainPitch, 0.22, 0.36);
  score += categoricalEvidence(requested.metricThread, present.metricThread, 0.20, 0.32);
  score += categoricalEvidence(requested.metricSizeMm, present.metricSizeMm, 0.18, 0.30);
  score += categoricalEvidence(requested.voltageV, present.voltageV, 0.16, 0.28);
  score += categoricalEvidence(requested.inchSize, present.inchSize, 0.16, 0.26);

  return Math.max(-0.9, Math.min(0.9, score));
}

/**
 * Evidência de nomenclatura específica do próprio item + restrições mecânicas.
 *
 * Ex.: em "parafuso da embreagem", "Screw Clutch shoe" é evidência mais forte
 * do que um "SCREW" genérico que apenas aparece na vista CLUTCH. A mesma regra
 * vale para "mola do defletor", além de detalhes como lado, eixo, passo, dentes,
 * rosca, medida e tensão explicitamente pedidos. Nenhuma dessas regras cria código
 * ou compatibilidade; elas apenas ordenam candidatos já recuperados da base.
 */
export function relationSpecificityBonus(query: string, candidate: CandidateText): number {
  const relation = inferPartQueryRelation(query);
  let relationBonus = 0;

  if (relation) {
    const directText = [candidate.name, ...(candidate.aliases || [])].filter(Boolean).join(' ');
    const directConcepts = new Set(findPartConcepts(directText).map(group => group.key));
    if (directConcepts.has(relation.primary.key) && directConcepts.has(relation.context.key)) {
      // O contexto no próprio nome/alias é mais específico que apenas pertencer à seção.
      relationBonus = 0.25;
    }
  }

  return relationBonus + technicalConstraintBonus(query, candidate);
}
