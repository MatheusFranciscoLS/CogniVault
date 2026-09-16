import type { PartBenchmarkCase } from './part-benchmark';

/**
 * Casos críticos curados: ficam pequenos de propósito. Eles representam erros
 * caros/perigosos que um benchmark puramente gerado do catálogo pode não capturar,
 * principalmente lateralidade, subsistemas com nomes iguais e contexto regional.
 * A cobertura ampla vem de buildCatalogBenchmarkCases(), baseada nos IPLs ativos.
 */
export const HUSQVARNA_CRITICAL_BENCHMARK: PartBenchmarkCase[] = [
  {
    id: '321s25-pump-piston',
    query: 'qual o código do pistão da bomba do pulverizador 321S25?',
    model: '321S25',
    expectedPartNumbers: ['589832901'],
    hardNegativePartNumbers: ['590210901'],
    source: 'Pulverizador Husqvarna 321S25.pdf · p.19 · PISTÃO DA BOMBA / Pump piston',
    family: 'Pulverizadores', queryType: 'CRITICAL_MANUAL',
  },
  {
    id: '321s25-engine-piston',
    query: 'qual o pistão do motor do 321S25?',
    model: '321S25',
    expectedPartNumbers: ['590210901'],
    hardNegativePartNumbers: ['589832901'],
    source: 'Pulverizador Husqvarna 321S25.pdf · p.10 · CONJ. DO PISTÃO kit 321S sprayer',
    family: 'Pulverizadores', queryType: 'CRITICAL_MANUAL',
  },
  {
    id: 'z460-left-transmission',
    query: 'qual a transmissão esquerda do giro zero Z460?',
    model: 'Z460', expectedPartNumbers: ['594090301'], hardNegativePartNumbers: ['594090302'],
    source: 'Cortador Giro Zero Husqvarna Z460.pdf · p.51/83 · TRANSMISSÃO HTE LH',
    family: 'Giro zero', queryType: 'CRITICAL_MANUAL',
  },
  {
    id: 'z460-right-transmission',
    query: 'qual a transmissão direita do giro zero Z460?',
    model: 'Z460', expectedPartNumbers: ['594090302'], hardNegativePartNumbers: ['594090301'],
    source: 'Cortador Giro Zero Husqvarna Z460.pdf · p.51/83 · TRANSMISSÃO HTE RH',
    family: 'Giro zero', queryType: 'CRITICAL_MANUAL',
  },
  {
    id: 'lc353awd-front-transmission',
    query: 'qual a transmissão dianteira da LC353AWD?',
    model: 'LC353AWD', expectedPartNumbers: ['589486201'], hardNegativePartNumbers: ['586137601'],
    source: 'Cortador de grama Husqvarna LC353AWD.pdf · p.5 · TRANSMISSÃO AWD Front',
    family: 'Cortadores de grama', queryType: 'CRITICAL_MANUAL',
  },
  {
    id: 'lc353awd-rear-transmission',
    query: 'qual a transmissão traseira da LC353AWD?',
    model: 'LC353AWD', expectedPartNumbers: ['586137601'], hardNegativePartNumbers: ['589486201'],
    source: 'Cortador de grama Husqvarna LC353AWD.pdf · p.5 · TRANSMISSÃO REAR AWD',
    family: 'Cortadores de grama', queryType: 'CRITICAL_MANUAL',
  },
  {
    id: '143rii-carburettor-latam',
    query: 'qual o código do carburador da 143RII?',
    model: '143RII', pnc: '967332904', expectedPartNumbers: ['587106701'],
    hardNegativePartNumbers: ['528753801', '587822501', '586931401'],
    source: '143RII.pdf · p.29 · CARBURETTOR & AIR FILTER · pos.15 · Latin America',
    family: 'Roçadeiras', queryType: 'CRITICAL_MANUAL',
  },
  {
    id: '143rii-clutch-drum',
    query: 'qual o código do tambor da embreagem da 143RII?',
    model: '143RII', pnc: '967332904', expectedPartNumbers: ['591425801'],
    hardNegativePartNumbers: ['599764701', '599764801'],
    source: '143RII.pdf · p.14 · CLUTCH · pos.9 TAMBOR',
    family: 'Roçadeiras', queryType: 'CRITICAL_MANUAL',
  },
  {
    id: '143rii-ignition-rotor',
    query: 'qual o código do rotor da ignição da 143RII?',
    model: '143RII', pnc: '967332904', expectedPartNumbers: ['505298201'], hardNegativePartNumbers: ['505298301'],
    source: '143RII.pdf · p.16 · IGNITION · pos.1 ROTOR',
    family: 'Roçadeiras', queryType: 'CRITICAL_MANUAL',
  },
  {
    id: '143rii-ignition-coil',
    query: 'qual o código da bobina de ignição da 143RII?',
    model: '143RII', pnc: '967332904', expectedPartNumbers: ['505298301'], hardNegativePartNumbers: ['505298201'],
    source: '143RII.pdf · p.16 · IGNITION · pos.2 BOBINA',
    family: 'Roçadeiras', queryType: 'CRITICAL_MANUAL',
  },
  {
    id: '143rii-fuel-tank',
    query: 'qual o código do depósito de combustível da 143RII?',
    model: '143RII', pnc: '967332904', expectedPartNumbers: ['586931501'], hardNegativePartNumbers: ['503443201'],
    source: '143RII.pdf · p.25 · TANK · pos.1 DEPÓSITO',
    family: 'Roçadeiras', queryType: 'CRITICAL_MANUAL',
  },
  {
    id: '143rii-fuel-filter',
    query: 'qual o código do filtro de combustível da 143RII?',
    model: '143RII', pnc: '967332904', expectedPartNumbers: ['503443201'],
    hardNegativePartNumbers: ['587287602', '505309201'],
    source: '143RII.pdf · p.25 · TANK · pos.5 FILTRO DE COMBUSTÍVEL',
    family: 'Roçadeiras', queryType: 'CRITICAL_MANUAL',
  },
  {
    id: '143rii-cylinder',
    query: 'qual o código do cilindro do motor da 143RII?',
    model: '143RII', pnc: '967332904', expectedPartNumbers: ['531397004'], hardNegativePartNumbers: ['505296901'],
    source: '143RII.pdf · p.31 · CYLINDER & PISTON · pos.1 CILINDRO',
    family: 'Roçadeiras', queryType: 'CRITICAL_MANUAL',
  },
  {
    id: '143rii-piston',
    query: 'qual o código do pistão do motor da 143RII?',
    model: '143RII', pnc: '967332904', expectedPartNumbers: ['505296901'], hardNegativePartNumbers: ['531397004', '510917901'],
    source: '143RII.pdf · p.31 · CYLINDER & PISTON · pos.3 PISTÃO',
    family: 'Roçadeiras', queryType: 'CRITICAL_MANUAL',
  },
  {
    id: '143rii-piston-ring',
    query: 'qual o código do anel do pistão da 143RII?',
    model: '143RII', pnc: '967332904', expectedPartNumbers: ['510917901'], hardNegativePartNumbers: ['505296901'],
    source: '143RII.pdf · p.31 · CYLINDER & PISTON · pos.4 ANEL DO PISTÃO',
    family: 'Roçadeiras', queryType: 'CRITICAL_MANUAL',
  },
  {
    id: '353-rim-clutch-drum',
    query: 'qual o tambor de embreagem Rim 3/8 7 dentes da motosserra 353?',
    model: '353', expectedPartNumbers: ['503980003'],
    source: 'Motosserra Husqvarna 353.pdf · p.6 · TAMBOR DE EMBRAIAGEM Rim 3/8 7T',
    family: 'Motosserras', queryType: 'CRITICAL_MANUAL',
  },
  {
    id: '272xp-piston',
    query: 'qual o conjunto do pistão da motosserra 272XP?',
    model: '272XP', expectedPartNumbers: ['504017002'],
    source: 'Motosserra Husqvarna 272 XP.pdf · p.24/25 · CONJ. DO PISTÃO Ø52',
    family: 'Motosserras', queryType: 'CRITICAL_MANUAL',
  },
  {
    id: '125b-outer-scroll',
    query: 'qual o caracol externo do soprador 125B?',
    model: '125B', expectedPartNumbers: ['575533201'],
    source: 'Soprador de folhas Husqvarna 125B.pdf · p.13 · ASSEMBLY OUTER SCROLL',
    family: 'Sopradores', queryType: 'CRITICAL_MANUAL',
  },
  {
    id: '525p5s-drive-shaft',
    query: 'qual o eixo motriz do tubo do podador 525P5S?',
    model: '525P5S', expectedPartNumbers: ['587411702'],
    source: 'Podador de Galhos Husqvarna 525P5S.pdf · tubo · EIXO MOTRIZ ClickOn 1114mm',
    family: 'Podadores', queryType: 'CRITICAL_MANUAL',
  },
];

// Compatibilidade com pontos antigos do código; agora o “golden” é somente o
// conjunto crítico comprovado. A cobertura de 500 vem dos próprios catálogos.
export const HUSQVARNA_GOLDEN_BENCHMARK = HUSQVARNA_CRITICAL_BENCHMARK;
