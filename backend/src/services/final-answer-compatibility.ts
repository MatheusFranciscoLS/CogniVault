import { normalizeIdentifier } from '../utils/normalize';
import { buildFallbackIntent, extractLikelyPartNumber } from './chat-reliability';
import type { ChatSearchResult } from './chat.service';
import { OfficialVariantCompatibilityService, type OfficialVariantCompatibility } from './official-variant-compatibility';
import { PartSearchService } from './part-search.service';

export type CompatibilityGuardedResult = ChatSearchResult & { serialRequired?: boolean };

function numericPnc(value: string | null | undefined): string {
  const normalized = normalizeIdentifier(value || '');
  return /^\d{8,14}$/.test(normalized) ? normalized : '';
}

function resultPncs(result: ChatSearchResult): string[] {
  if (!result.part) return [];
  return [...new Set([
    numericPnc(result.part.pnc),
    ...(result.part.applications || []).map(application => numericPnc(application.pnc)),
  ].filter(Boolean))];
}

function evidence(result: ChatSearchResult, line: string): ChatSearchResult['match'] {
  if (!result.match) return result.match;
  return {
    ...result.match,
    explanation: `${result.match.explanation} ${line}`,
    evidence: [...(result.match.evidence || []), line],
  };
}

function blocked(
  result: ChatSearchResult,
  status: 'PNC_REQUIRED' | 'AMBIGUOUS',
  answer: string,
  title: string,
  description: string,
  tips: string[],
  pncOptions: string[] = [],
  serialRequired = false,
): CompatibilityGuardedResult {
  return {
    ...result,
    status,
    requiresPnc: status === 'PNC_REQUIRED',
    pncOptions: status === 'PNC_REQUIRED' ? pncOptions : result.pncOptions,
    serialRequired,
    part: undefined,
    options: undefined,
    feedbackOptions: undefined,
    answer,
    match: result.match ? {
      ...result.match,
      level: 'REVIEW',
      explanation: `${result.match.explanation} O gate final de compatibilidade bloqueou o código porque a aplicação ainda não possui evidência suficiente.`,
    } : result.match,
    guidance: { title, description, tips },
  };
}

function officialConfirmation(result: ChatSearchResult, verification: OfficialVariantCompatibility): CompatibilityGuardedResult {
  if (!result.part) return result;
  const line = verification.status === 'SINGLE_VARIANT'
    ? 'Portal Husqvarna: a ocorrência técnica foi confirmada na única variante oficial consultável.'
    : `Portal Husqvarna: o mesmo Part Number foi confirmado na mesma vista/posição em ${verification.variantPncs.length} variante(s) oficiais.`;
  return {
    ...result,
    part: {
      ...result.part,
      pnc: 'Qualquer um',
      universalAcrossPnc: true,
      applications: verification.variantPncs.length
        ? verification.variantPncs.map(pnc => ({ model: result.part!.model, pnc }))
        : result.part.applications,
    },
    match: evidence(result, line),
    technicalReasoningSteps: [
      ...(result.technicalReasoningSteps || []),
      {
        step: (result.technicalReasoningSteps?.length || 0) + 1,
        title: 'Compatibilidade entre variantes',
        detail: verification.reason,
        status: 'SUCCESS',
      },
    ],
  };
}

function confirmedForPnc(
  result: ChatSearchResult,
  requestedPnc: string,
  verification: OfficialVariantCompatibility,
): CompatibilityGuardedResult {
  if (!result.part) return result;
  const line = `Portal Husqvarna: código confirmado na ocorrência técnica do PNC ${requestedPnc}.`;
  return {
    ...result,
    part: {
      ...result.part,
      pnc: requestedPnc,
      universalAcrossPnc: false,
      applications: [{ model: result.part.model, pnc: requestedPnc }],
    },
    match: evidence(result, line),
    technicalReasoningSteps: [
      ...(result.technicalReasoningSteps || []),
      {
        step: (result.technicalReasoningSteps?.length || 0) + 1,
        title: 'Aplicação no PNC informado',
        detail: verification.reason,
        status: 'SUCCESS',
      },
    ],
  };
}

export async function enforceFinalApplicationCompatibility(input: {
  tenantId: string;
  question: string;
  explicitPnc?: string;
  manualSelection?: boolean;
  result: CompatibilityGuardedResult;
}): Promise<CompatibilityGuardedResult> {
  const { tenantId, question, manualSelection } = input;
  let { result } = input;
  if (manualSelection || result.status !== 'FOUND' || !result.part) return result;

  // O Portal usado abaixo é específico da Husqvarna. Fabricante ausente não é
  // evidência de Husqvarna: nesses casos preservamos o resultado local em vez
  // de tentar validar a peça contra uma fonte de outra marca.
  const manufacturer = normalizeIdentifier(result.part.manufacturer);
  if (!manufacturer.includes('HUSQVARNA')) return result;

  const intent = buildFallbackIntent(question);
  const requestedPnc = numericPnc(input.explicitPnc || intent.pnc);
  const requestedModel = normalizeIdentifier(intent.model);
  const requestedCode = extractLikelyPartNumber(question);

  // Uma consulta isolada de Part Number não afirma aplicação em uma máquina.
  if (requestedCode && !requestedModel && !requestedPnc) return result;

  const localPnc = numericPnc(result.part.pnc);
  const broadLocalClaim = Boolean(
    result.part.universalAcrossPnc
    || !localPnc
    || result.part.pnc === 'Qualquer um'
    || result.part.pnc === 'Várias aplicações',
  );

  // Evidência local específica para o mesmo PNC continua válida; o Portal é
  // necessário para validar alegações amplas/legadas, não para desacreditar o IPL.
  if (requestedPnc && !broadLocalClaim && localPnc === requestedPnc) return result;

  let availableLocalPncs: string[] = [];
  try {
    availableLocalPncs = await PartSearchService.availablePncs(tenantId, normalizeIdentifier(result.part.model));
  } catch {
    // Falha de inventário local não transforma aplicação em incompatibilidade.
  }

  const seeds = [...new Set([
    requestedPnc,
    localPnc,
    ...resultPncs(result),
    ...availableLocalPncs.map(numericPnc),
  ].filter(Boolean))];

  if (!seeds.length) {
    return blocked(
      result,
      'AMBIGUOUS',
      'Encontrei uma peça plausível, mas não há PNC de referência suficiente para comprovar a aplicação nesta máquina. Prefiro não liberar o código como compatível sem evidência adicional.',
      'Aplicação ainda não comprovada',
      'O catálogo local não fornece identificação suficiente para validar esta ocorrência contra a fonte oficial.',
      ['Se tiver PNC ou S/N, informe.', 'Sem identificação, confira a vista/posição no Portal Husqvarna antes de concluir.'],
    );
  }

  let verification: OfficialVariantCompatibility;
  try {
    verification = await OfficialVariantCompatibilityService.verify(
      result.part.partNumber,
      requestedPnc || seeds[0],
      { section: result.part.section, position: result.part.position },
    );
  } catch {
    return broadLocalClaim || !requestedPnc
      ? blocked(
          result,
          requestedPnc ? 'AMBIGUOUS' : 'PNC_REQUIRED',
          'A fonte oficial ficou indisponível e eu não consegui comprovar esta aplicação ampla. Isso não significa que a peça não sirva; significa apenas que não vou afirmar compatibilidade sem prova.',
          'Fonte oficial inconclusiva',
          'Falha de consulta nunca é tratada como ausência nem como confirmação.',
          ['Tente novamente quando o Portal estiver disponível.', 'Se houver PNC/S/N, mantenha esses dados no atendimento.'],
          verificationOptions(seeds, availableLocalPncs),
        )
      : result;
  }

  if (requestedPnc) {
    if (verification.multipleCodePncs.includes(requestedPnc)) {
      return blocked(
        result,
        'AMBIGUOUS',
        `O PNC ${requestedPnc} possui mais de um código na mesma vista/posição oficial. Informe o S/N para separar a variante correta antes de concluir.`,
        'Número de série necessário',
        'O PNC foi identificado, mas a própria ocorrência técnica possui variação adicional.',
        ['Localize S/N ou Serial Number na etiqueta.', 'Refaça a consulta acrescentando o S/N.'],
        [],
        true,
      );
    }
    if (verification.matchingPncs.includes(requestedPnc)) {
      return confirmedForPnc(result, requestedPnc, verification);
    }
    if (verification.checkedPncs.includes(requestedPnc)) {
      return blocked(
        result,
        'AMBIGUOUS',
        `O código encontrado localmente não foi confirmado na mesma vista/posição do PNC ${requestedPnc} no Portal Husqvarna. Não vou liberar essa aplicação automaticamente.`,
        'Código não confirmado para este PNC',
        'A fonte oficial consultada divergiu da aplicação local nesta ocorrência.',
        ['Abra a vista oficial para conferência.', 'Verifique se o código foi substituído ou se existe faixa de S/N.'],
      );
    }
    return broadLocalClaim
      ? blocked(
          result,
          'AMBIGUOUS',
          `Não consegui verificar a mesma vista/posição do PNC ${requestedPnc}. A consulta ficou inconclusiva; isso não prova incompatibilidade.`,
          'Aplicação ainda não comprovada',
          'O resultado local era amplo e a fonte oficial não forneceu evidência suficiente para este PNC.',
          ['Tente novamente com o Portal disponível.', 'Confira vista e posição antes de concluir.'],
        )
      : result;
  }

  if (verification.status === 'CONFIRMED_ALL_VARIANTS' || verification.status === 'SINGLE_VARIANT') {
    return officialConfirmation(result, verification);
  }

  const pncOptions = verification.variantPncs.length
    ? verification.variantPncs
    : verificationOptions(seeds, availableLocalPncs);
  if (verification.status === 'VARIANT_SPECIFIC') {
    const needsSerial = verification.multipleCodePncs.length > 0 && verification.variantPncs.length <= 1;
    return blocked(
      result,
      needsSerial ? 'AMBIGUOUS' : 'PNC_REQUIRED',
      needsSerial
        ? 'A mesma variante oficial possui mais de um código nessa vista/posição. Informe o S/N antes de concluir.'
        : 'Esse modelo possui variantes oficiais que não usam o mesmo código nessa vista/posição. Informe o PNC da máquina para eu escolher a aplicação correta.',
      needsSerial ? 'Número de série necessário' : 'PNC necessário',
      verification.reason,
      needsSerial
        ? ['Localize o S/N na etiqueta da máquina.', 'Não escolha entre os códigos apenas pelo nome do modelo.']
        : ['Localize o PNC na etiqueta.', 'Depois do PNC, o CogniVault verifica se ainda existe divisão por S/N.'],
      pncOptions,
      needsSerial,
    );
  }

  return blocked(
    result,
    pncOptions.length ? 'PNC_REQUIRED' : 'AMBIGUOUS',
    'Encontrei uma peça plausível, mas não consegui comprovar que o mesmo código vale para todas as variantes oficiais. Prefiro pedir identificação adicional em vez de arriscar um código.',
    'Compatibilidade ainda não comprovada',
    verification.reason,
    ['Informe o PNC se estiver disponível.', 'Sem PNC, confira a vista/posição oficial antes de concluir.'],
    pncOptions,
  );
}

function verificationOptions(seedPncs: string[], localPncs: string[]): string[] {
  return [...new Set([...seedPncs, ...localPncs].map(numericPnc).filter(Boolean))];
}
