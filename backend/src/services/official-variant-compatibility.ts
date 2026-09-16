import { normalizeIdentifier } from '../utils/normalize';
import { HusqvarnaOfficialDetailService, type HusqvarnaOfficialProductDetails } from './husqvarna-official-detail.service';

export type OfficialVariantCompatibilityStatus =
  | 'CONFIRMED_ALL_VARIANTS'
  | 'VARIANT_SPECIFIC'
  | 'SINGLE_VARIANT'
  | 'INCONCLUSIVE';

export type OfficialVariantCompatibility = {
  status: OfficialVariantCompatibilityStatus;
  seedPnc: string;
  variantPncs: string[];
  checkedPncs: string[];
  matchingPncs: string[];
  missingPncs: string[];
  unresolvedPncs: string[];
  reason: string;
};

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalizeIdentifier).filter(Boolean))];
}

function partExists(details: HusqvarnaOfficialProductDetails, partNumber: string): boolean {
  const expected = normalizeIdentifier(partNumber);
  return details.iplSections.some(section =>
    section.parts.some(part => normalizeIdentifier(part.partNumber) === expected),
  );
}

export function classifyOfficialVariantCompatibility(input: {
  seedPnc: string;
  variantPncs: string[];
  checkedPncs: string[];
  matchingPncs: string[];
  unresolvedPncs: string[];
}): OfficialVariantCompatibility {
  const seedPnc = normalizeIdentifier(input.seedPnc);
  const variantPncs = unique([seedPnc, ...input.variantPncs]);
  const checkedPncs = unique(input.checkedPncs);
  const matchingPncs = unique(input.matchingPncs);
  const unresolvedPncs = unique(input.unresolvedPncs);
  const missingPncs = checkedPncs.filter(pnc => !matchingPncs.includes(pnc));

  if (!variantPncs.length || !checkedPncs.length) {
    return {
      status: 'INCONCLUSIVE', seedPnc, variantPncs, checkedPncs, matchingPncs, missingPncs, unresolvedPncs,
      reason: 'A fonte oficial não forneceu variantes suficientes para comprovar a aplicação.',
    };
  }

  if (variantPncs.length === 1 && checkedPncs.length === 1 && matchingPncs.includes(variantPncs[0]) && !unresolvedPncs.length) {
    return {
      status: 'SINGLE_VARIANT', seedPnc, variantPncs, checkedPncs, matchingPncs, missingPncs, unresolvedPncs,
      reason: 'A fonte oficial expôs uma única variante e a peça está presente no IPL consultado.',
    };
  }

  const allResolved = variantPncs.every(pnc => checkedPncs.includes(pnc)) && unresolvedPncs.length === 0;
  const allMatch = allResolved && variantPncs.every(pnc => matchingPncs.includes(pnc));
  if (allMatch) {
    return {
      status: 'CONFIRMED_ALL_VARIANTS', seedPnc, variantPncs, checkedPncs, matchingPncs, missingPncs, unresolvedPncs,
      reason: `O mesmo Part Number aparece nos IPLs oficiais de todas as ${variantPncs.length} variantes consultadas.`,
    };
  }

  if (allResolved && matchingPncs.length > 0 && missingPncs.length > 0) {
    return {
      status: 'VARIANT_SPECIFIC', seedPnc, variantPncs, checkedPncs, matchingPncs, missingPncs, unresolvedPncs,
      reason: 'A peça aparece em apenas parte das variantes oficiais; o PNC é necessário para evitar aplicação incorreta.',
    };
  }

  return {
    status: 'INCONCLUSIVE', seedPnc, variantPncs, checkedPncs, matchingPncs, missingPncs, unresolvedPncs,
    reason: 'Nem todas as variantes oficiais puderam ser verificadas. Falha de consulta não é tratada como ausência da peça.',
  };
}

export class OfficialVariantCompatibilityService {
  static async verify(partNumberInput: string, seedPncInput: string): Promise<OfficialVariantCompatibility> {
    const partNumber = normalizeIdentifier(partNumberInput);
    const seedPnc = normalizeIdentifier(seedPncInput);
    if (!/^\d{6,14}$/.test(partNumber) || !/^\d{8,14}$/.test(seedPnc)) {
      return classifyOfficialVariantCompatibility({ seedPnc, variantPncs: [], checkedPncs: [], matchingPncs: [], unresolvedPncs: [] });
    }

    const seedDetails = await HusqvarnaOfficialDetailService.getProductDetails(seedPnc);
    if (!seedDetails) {
      return classifyOfficialVariantCompatibility({ seedPnc, variantPncs: [], checkedPncs: [], matchingPncs: [], unresolvedPncs: [seedPnc] });
    }

    const variantPncs = unique([seedPnc, ...seedDetails.variants.map(variant => variant.pnc)]).slice(0, 16);
    const checkedPncs: string[] = [];
    const matchingPncs: string[] = [];
    const unresolvedPncs: string[] = [];

    const results = await Promise.allSettled(variantPncs.map(async pnc => {
      const details = pnc === seedPnc ? seedDetails : await HusqvarnaOfficialDetailService.getProductDetails(pnc);
      return { pnc, details };
    }));

    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value.details) {
        const pnc = result.status === 'fulfilled' ? result.value.pnc : variantPncs[results.indexOf(result)];
        if (pnc) unresolvedPncs.push(pnc);
        continue;
      }
      checkedPncs.push(result.value.pnc);
      if (partExists(result.value.details, partNumber)) matchingPncs.push(result.value.pnc);
    }

    return classifyOfficialVariantCompatibility({
      seedPnc,
      variantPncs,
      checkedPncs,
      matchingPncs,
      unresolvedPncs,
    });
  }
}
