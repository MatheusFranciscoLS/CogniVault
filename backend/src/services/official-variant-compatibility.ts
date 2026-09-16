import { normalizeIdentifier } from '../utils/normalize';
import { HusqvarnaOfficialDetailService, type HusqvarnaOfficialProductDetails } from './husqvarna-official-detail.service';

export type OfficialVariantCompatibilityStatus =
  | 'CONFIRMED_ALL_VARIANTS'
  | 'VARIANT_SPECIFIC'
  | 'SINGLE_VARIANT'
  | 'INCONCLUSIVE';

export type OfficialOccurrenceContext = {
  section?: string | null;
  position?: string | null;
};

export type OfficialVariantCompatibility = {
  status: OfficialVariantCompatibilityStatus;
  seedPnc: string;
  variantPncs: string[];
  checkedPncs: string[];
  matchingPncs: string[];
  missingPncs: string[];
  unresolvedPncs: string[];
  multipleCodePncs: string[];
  reason: string;
};

type OccurrenceState = 'MATCH' | 'MISSING' | 'MULTIPLE_CODES' | 'UNRESOLVED';

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalizeIdentifier).filter(Boolean))];
}

function normalizedSection(value: string | null | undefined, productName = ''): string {
  let section = normalizeIdentifier(value || '');
  const product = normalizeIdentifier(productName).replace(/^HUSQVARNA/, '');
  if (product && section.startsWith(product)) section = section.slice(product.length);
  return section.replace(/^(?:IPL|PARTS|PECAS)/, '');
}

function comparableSection(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length < 4 || right.length < 4) return false;
  return left.includes(right) || right.includes(left);
}

function occurrenceState(
  details: HusqvarnaOfficialProductDetails,
  partNumber: string,
  occurrence?: OfficialOccurrenceContext,
): OccurrenceState {
  const expected = normalizeIdentifier(partNumber);
  if (!expected) return 'UNRESOLVED';

  const position = normalizeIdentifier(occurrence?.position || '');
  if (!position) {
    return details.iplSections.some(section =>
      section.parts.some(part => normalizeIdentifier(part.partNumber) === expected),
    ) ? 'MATCH' : 'MISSING';
  }

  const wantedSection = normalizedSection(occurrence?.section);
  let sections = details.iplSections;
  if (wantedSection) {
    sections = details.iplSections.filter(section =>
      comparableSection(normalizedSection(section.name, details.productName), wantedSection),
    );
    // Nome de vista diferente entre variantes é evidência insuficiente, não ausência.
    if (!sections.length) return 'UNRESOLVED';
  }

  const codes = new Set<string>();
  for (const section of sections) {
    for (const part of section.parts) {
      if (normalizeIdentifier(part.position || '') !== position) continue;
      const code = normalizeIdentifier(part.partNumber || '');
      if (code) codes.add(code);
    }
  }

  if (!codes.size) return wantedSection ? 'MISSING' : 'UNRESOLVED';
  if (!codes.has(expected)) return 'MISSING';
  return codes.size === 1 ? 'MATCH' : 'MULTIPLE_CODES';
}

export function classifyOfficialVariantCompatibility(input: {
  seedPnc: string;
  variantPncs: string[];
  checkedPncs: string[];
  matchingPncs: string[];
  unresolvedPncs: string[];
  multipleCodePncs?: string[];
}): OfficialVariantCompatibility {
  const seedPnc = normalizeIdentifier(input.seedPnc);
  const variantPncs = unique([seedPnc, ...input.variantPncs]);
  const checkedPncs = unique(input.checkedPncs);
  const matchingPncs = unique(input.matchingPncs);
  const unresolvedPncs = unique(input.unresolvedPncs);
  const multipleCodePncs = unique(input.multipleCodePncs || []);
  const missingPncs = checkedPncs.filter(pnc => !matchingPncs.includes(pnc) && !multipleCodePncs.includes(pnc));

  if (!variantPncs.length || !checkedPncs.length) {
    return {
      status: 'INCONCLUSIVE', seedPnc, variantPncs, checkedPncs, matchingPncs, missingPncs, unresolvedPncs, multipleCodePncs,
      reason: 'A fonte oficial não forneceu variantes suficientes para comprovar a aplicação.',
    };
  }

  if (multipleCodePncs.length) {
    return {
      status: 'VARIANT_SPECIFIC', seedPnc, variantPncs, checkedPncs, matchingPncs, missingPncs, unresolvedPncs, multipleCodePncs,
      reason: `A mesma vista/posição possui mais de um Part Number no(s) PNC(s) ${multipleCodePncs.join(', ')}. O PNC sozinho pode não bastar; confirme também o S/N quando disponível.`,
    };
  }

  if (variantPncs.length === 1 && checkedPncs.length === 1 && matchingPncs.includes(variantPncs[0]) && !unresolvedPncs.length) {
    return {
      status: 'SINGLE_VARIANT', seedPnc, variantPncs, checkedPncs, matchingPncs, missingPncs, unresolvedPncs, multipleCodePncs,
      reason: 'A fonte oficial expôs uma única variante e a peça está presente na ocorrência técnica consultada.',
    };
  }

  const allResolved = variantPncs.every(pnc => checkedPncs.includes(pnc)) && unresolvedPncs.length === 0;
  const allMatch = allResolved && variantPncs.every(pnc => matchingPncs.includes(pnc));
  if (allMatch) {
    return {
      status: 'CONFIRMED_ALL_VARIANTS', seedPnc, variantPncs, checkedPncs, matchingPncs, missingPncs, unresolvedPncs, multipleCodePncs,
      reason: `O mesmo Part Number foi confirmado na mesma ocorrência técnica dos IPLs oficiais de todas as ${variantPncs.length} variantes consultadas.`,
    };
  }

  if (allResolved && matchingPncs.length > 0 && missingPncs.length > 0) {
    return {
      status: 'VARIANT_SPECIFIC', seedPnc, variantPncs, checkedPncs, matchingPncs, missingPncs, unresolvedPncs, multipleCodePncs,
      reason: 'A mesma ocorrência técnica usa esse código em apenas parte das variantes oficiais; o PNC é necessário para evitar aplicação incorreta.',
    };
  }

  return {
    status: 'INCONCLUSIVE', seedPnc, variantPncs, checkedPncs, matchingPncs, missingPncs, unresolvedPncs, multipleCodePncs,
    reason: 'Nem todas as variantes oficiais puderam ser verificadas na mesma ocorrência técnica. Falha de consulta não é tratada como ausência da peça.',
  };
}

export class OfficialVariantCompatibilityService {
  static async verify(
    partNumberInput: string,
    seedPncInput: string,
    occurrence?: OfficialOccurrenceContext,
  ): Promise<OfficialVariantCompatibility> {
    const partNumber = normalizeIdentifier(partNumberInput);
    const seedPnc = normalizeIdentifier(seedPncInput);
    if (!/^\d{6,14}$/.test(partNumber) || !/^\d{8,14}$/.test(seedPnc)) {
      return classifyOfficialVariantCompatibility({ seedPnc, variantPncs: [], checkedPncs: [], matchingPncs: [], unresolvedPncs: [] });
    }

    const seedDetails = await HusqvarnaOfficialDetailService.getProductDetails(seedPnc);
    if (!seedDetails) {
      return classifyOfficialVariantCompatibility({ seedPnc, variantPncs: [], checkedPncs: [], matchingPncs: [], unresolvedPncs: [seedPnc] });
    }

    const allVariantPncs = unique([seedPnc, ...seedDetails.variants.map(variant => variant.pnc)]);
    // Não declarar universalidade se o Portal expuser mais variantes do que podemos verificar com segurança.
    if (allVariantPncs.length > 16) {
      return classifyOfficialVariantCompatibility({
        seedPnc,
        variantPncs: allVariantPncs,
        checkedPncs: [],
        matchingPncs: [],
        unresolvedPncs: allVariantPncs,
      });
    }

    const checkedPncs: string[] = [];
    const matchingPncs: string[] = [];
    const unresolvedPncs: string[] = [];
    const multipleCodePncs: string[] = [];

    const results = await Promise.allSettled(allVariantPncs.map(async pnc => {
      const details = pnc === seedPnc ? seedDetails : await HusqvarnaOfficialDetailService.getProductDetails(pnc);
      return { pnc, details };
    }));

    results.forEach((result, index) => {
      const fallbackPnc = allVariantPncs[index];
      if (result.status !== 'fulfilled' || !result.value.details) {
        if (fallbackPnc) unresolvedPncs.push(fallbackPnc);
        return;
      }

      const pnc = result.value.pnc;
      const state = occurrenceState(result.value.details, partNumber, occurrence);
      if (state === 'UNRESOLVED') {
        unresolvedPncs.push(pnc);
        return;
      }
      checkedPncs.push(pnc);
      if (state === 'MATCH') matchingPncs.push(pnc);
      if (state === 'MULTIPLE_CODES') {
        matchingPncs.push(pnc);
        multipleCodePncs.push(pnc);
      }
    });

    return classifyOfficialVariantCompatibility({
      seedPnc,
      variantPncs: allVariantPncs,
      checkedPncs,
      matchingPncs,
      unresolvedPncs,
      multipleCodePncs,
    });
  }
}
