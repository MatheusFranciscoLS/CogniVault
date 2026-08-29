import { findPartConcepts, inferPartQueryRelation } from './part-vocabulary';

type CandidateText = {
  name: string;
  section?: string | null;
  aliases?: string[];
  notes?: string | null;
  pnc?: string | null;
};

type Direction = 'LEFT' | 'RIGHT';
type AxlePosition = 'FRONT' | 'REAR';
type SprocketType = 'RIM' | 'SPUR';
export type SerialApplicability = 'MATCH' | 'CONFLICT' | 'UNKNOWN';

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

/**
 * Número de série só é aceito quando o usuário o identifica explicitamente.
 * Isso impede que um PNC, Part Number ou outra sequência longa seja confundida
 * com serial durante o ranking local.
 */
export function extractExplicitSerialNumber(value: string): string {
  const text = technicalText(value);
  const patterns = [
    /\bS\s*\/\s*N\s*[:#.-]?\s*(\d{6,16})\b/,
    /\bSN\s*[:#.-]?\s*(\d{6,16})\b/,
    /\bSERIAL(?:\s+NUMBER)?\s*[:#.-]?\s*(\d{6,16})\b/,
    /\bNUMERO\s+(?:DE\s+)?SERIE\s*[:#.-]?\s*(\d{6,16})\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return '';
}

function serialBigInt(value: string): bigint | null {
  if (!/^\d{6,16}$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function normalizedPnc(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '');
}

/**
 * Interpreta limites de série literalmente registrados em notes, incluindo os
 * formatos observados nos IPLs Husqvarna: "For PNC ... Up to S/N ..." e
 * "For PNC ... From S/N ...". A regra nunca cria uma aplicação: sem serial
 * explícito na pergunta ou sem limite escrito no candidato, o resultado é UNKNOWN.
 */
export function serialApplicability(query: string, candidate: CandidateText): SerialApplicability {
  const requestedSerialText = extractExplicitSerialNumber(query);
  const requestedSerial = serialBigInt(requestedSerialText);
  const notes = technicalText(candidate.notes || '').replace(/\s+/g, ' ').trim();
  if (requestedSerial === null || !notes) return 'UNKNOWN';

  const candidatePnc = normalizedPnc(candidate.pnc);
  const constraints: Array<{ pnc: string; direction: 'UP_TO' | 'FROM'; serial: bigint }> = [];
  const pattern = /(?:FOR\s+PNC\s+(\d{9,11})[\s,:;-]*)?(UP\s+TO|ATE|FROM|A\s+PARTIR\s+DE)\s+(?:S\s*\/\s*N|SN|SERIAL(?:\s+NUMBER)?)\s*[:#.-]?\s*(\d{6,16})\b/g;

  for (const match of notes.matchAll(pattern)) {
    const pnc = match[1] || '';
    if (pnc && candidatePnc && pnc !== candidatePnc) continue;
    // Quando o registro não possui PNC e a observação contém regras para PNCs
    // distintos, não é seguro escolher qual cláusula se aplica.
    if (pnc && !candidatePnc) continue;
    const serial = serialBigInt(match[3]);
    if (serial === null) continue;
    const direction = /^(?:UP\s+TO|ATE)$/.test(match[2]) ? 'UP_TO' : 'FROM';
    constraints.push({ pnc, direction, serial });
  }

  // Alguns catálogos usam "S/N 123 AND UP" / "AND BELOW".
  for (const match of notes.matchAll(/(?:FOR\s+PNC\s+(\d{9,11})[\s,:;-]*)?(?:S\s*\/\s*N|SN|SERIAL(?:\s+NUMBER)?)\s*[:#.-]?\s*(\d{6,16})\s+(?:AND\s+)?(UP|ABOVE|BELOW|DOWN)\b/g)) {
    const pnc = match[1] || '';
    if (pnc && candidatePnc && pnc !== candidatePnc) continue;
    if (pnc && !candidatePnc) continue;
    const serial = serialBigInt(match[2]);
    if (serial === null) continue;
    const direction = /^(?:UP|ABOVE)$/.test(match[3]) ? 'FROM' : 'UP_TO';
    constraints.push({ pnc, direction, serial });
  }

  if (!constraints.length) return 'UNKNOWN';

  let lower: bigint | null = null;
  let upper: bigint | null = null;
  for (const constraint of constraints) {
    if (constraint.direction === 'FROM') {
      if (lower === null || constraint.serial > lower) lower = constraint.serial;
    } else if (upper === null || constraint.serial < upper) {
      upper = constraint.serial;
    }
  }

  if (lower !== null && requestedSerial < lower) return 'CONFLICT';
  if (upper !== null && requestedSerial > upper) return 'CONFLICT';
  return 'MATCH';
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
 * M5x20, Ø22/Ø25 mm, 12 V, 12" e faixas de número de série.
 * Igualdade soma evidência; contradição reduz o score; ausência de uma informação
 * no candidato não é tratada como erro.
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

  const serial = serialApplicability(query, candidate);
  if (serial === 'MATCH') score += 0.32;
  if (serial === 'CONFLICT') score -= 0.55;

  return Math.max(-0.9, Math.min(0.9, score));
}

/**
 * Evidência de nomenclatura específica do próprio item + restrições mecânicas.
 *
 * Ex.: em "parafuso da embreagem", "Screw Clutch shoe" é evidência mais forte
 * do que um "SCREW" genérico que apenas aparece na vista CLUTCH. A mesma regra
 * vale para "mola do defletor", além de detalhes como lado, eixo, passo, dentes,
 * rosca, medida, tensão e série explicitamente pedidos. Nenhuma dessas regras cria
 * código ou compatibilidade; elas apenas ordenam candidatos já recuperados da base.
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
