export type PositionStatus = 'POSITIONED' | 'SOURCE_UNPOSITIONED' | 'SUSPECT_MISSING';

export type PositionProvenanceInput = {
  position?: string | null;
  positionStatus?: string | null;
  positionEvidence?: string | null;
};

export type PositionProvenance = {
  position: string | null;
  positionStatus: PositionStatus;
  positionEvidence: string | null;
};

const SOURCE_UNPOSITIONED_MARKER = /^(?:-{1,3}(?:\s+-{1,3})?|–{1,3}|—{1,3}|N\s*\/?\s*A|SEM\s+(?:POSI[CÇ][AÃ]O|REF(?:ER[EÊ]NCIA)?))$/i;

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isExplicitUnpositionedMarker(value: string | null | undefined): boolean {
  const marker = clean(value).replace(/\s+/g, ' ');
  return Boolean(marker) && SOURCE_UNPOSITIONED_MARKER.test(marker);
}

/**
 * A posição é um dado de origem do catálogo, não um número que o CogniVault pode
 * completar por heurística. Quando a fonte não publica KEY/REF, mantemos null e
 * registramos SOURCE_UNPOSITIONED. Quando a extração simplesmente não conseguiu
 * provar a posição, marcamos SUSPECT_MISSING para revisão.
 */
export function resolvePositionProvenance(input: PositionProvenanceInput): PositionProvenance {
  const rawPosition = clean(input.position);
  const rawStatus = clean(input.positionStatus).toUpperCase();
  const rawEvidence = clean(input.positionEvidence);

  if (rawPosition && !isExplicitUnpositionedMarker(rawPosition)) {
    return {
      position: rawPosition,
      positionStatus: 'POSITIONED',
      positionEvidence: rawEvidence || rawPosition,
    };
  }

  if (
    rawStatus === 'SOURCE_UNPOSITIONED'
    || isExplicitUnpositionedMarker(rawPosition)
    || isExplicitUnpositionedMarker(rawEvidence)
  ) {
    return {
      position: null,
      positionStatus: 'SOURCE_UNPOSITIONED',
      positionEvidence: rawEvidence || rawPosition || '--',
    };
  }

  return {
    position: null,
    positionStatus: 'SUSPECT_MISSING',
    positionEvidence: rawEvidence || null,
  };
}
