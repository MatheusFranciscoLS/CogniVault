import type { PartBenchmarkCase } from './part-benchmark';

/**
 * Golden set inicial construída apenas com respostas comprovadas nos IPLs que
 * foram analisados durante o desenvolvimento. Novos casos devem apontar para a
 * fonte que comprova o Part Number esperado.
 */
export const HUSQVARNA_GOLDEN_BENCHMARK: PartBenchmarkCase[] = [
  {
    id: '321s25-pump-piston',
    query: 'qual o código do pistão da bomba do pulverizador 321S25?',
    model: '321S25',
    expectedPartNumbers: ['589832901'],
    source: 'Pulverizador Husqvarna 321S25.pdf · p.19 · PISTÃO DA BOMBA / Pump piston',
  },
  {
    id: '321s25-engine-piston',
    query: 'qual o pistão do motor do 321S25?',
    model: '321S25',
    expectedPartNumbers: ['590210901'],
    source: 'Pulverizador Husqvarna 321S25.pdf · p.10 · CONJ. DO PISTÃO kit 321S sprayer',
  },
  {
    id: '321s25-clutch-screw',
    query: 'qual o parafuso da embreagem do pulverizador 321S25?',
    model: '321S25',
    expectedPartNumbers: ['589539801'],
    source: 'Pulverizador Husqvarna 321S25.pdf · p.3 · Screw / Clutch screw',
  },
  {
    id: '525p5s-12-guide-bar',
    query: 'qual o código da lâmina de 12 polegadas do podador 525P5S?',
    model: '525P5S',
    expectedPartNumbers: ['501959245'],
    source: 'Podador de Galhos Husqvarna 525P5S.pdf · acessórios · LÂMINA LAM 12 3/8 mini',
  },
  {
    id: '525p5s-drive-shaft',
    query: 'qual o eixo motriz do tubo do podador 525P5S?',
    model: '525P5S',
    expectedPartNumbers: ['587411702'],
    source: 'Podador de Galhos Husqvarna 525P5S.pdf · tubo · EIXO MOTRIZ ClickOn 1114mm',
  },
  {
    id: '525p5s-crankshaft',
    query: 'qual o virabrequim do motor do podador 525P5S?',
    model: '525P5S',
    expectedPartNumbers: ['579223201'],
    source: 'Podador de Galhos Husqvarna 525P5S.pdf · motor · VIRABREQUIM COMPLETE',
  },
  {
    id: 'z460-left-transmission',
    query: 'qual a transmissão esquerda do giro zero Z460?',
    model: 'Z460',
    expectedPartNumbers: ['594090301'],
    source: 'Cortador Giro Zero Husqvarna Z460.pdf · p.51/83 · TRANSMISSÃO HTE LH',
  },
  {
    id: 'z460-right-transmission',
    query: 'qual a transmissão direita do giro zero Z460?',
    model: 'Z460',
    expectedPartNumbers: ['594090302'],
    source: 'Cortador Giro Zero Husqvarna Z460.pdf · p.51/83 · TRANSMISSÃO HTE RH',
  },
  {
    id: 'lc353awd-front-transmission',
    query: 'qual a transmissão dianteira da LC353AWD?',
    model: 'LC353AWD',
    expectedPartNumbers: ['589486201'],
    source: 'Cortador de grama Husqvarna LC353AWD.pdf · p.5 · TRANSMISSÃO AWD Front',
  },
  {
    id: 'lc353awd-rear-transmission',
    query: 'qual a transmissão traseira da LC353AWD?',
    model: 'LC353AWD',
    expectedPartNumbers: ['586137601'],
    source: 'Cortador de grama Husqvarna LC353AWD.pdf · p.5 · TRANSMISSÃO REAR AWD',
  },
  {
    id: '125b-outer-scroll',
    query: 'qual o caracol externo do soprador 125B?',
    model: '125B',
    expectedPartNumbers: ['575533201'],
    source: 'Soprador de folhas Husqvarna 125B.pdf · p.13 · ASSEMBLY OUTER SCROLL',
  },
  {
    id: 'hs452ae-rocker-arm',
    query: 'qual o balancim do motor HS452AE?',
    model: 'HS452AE',
    expectedPartNumbers: ['590971801'],
    source: 'Motor Husqvarna HS452.pdf · p.5 · KIT DA VÁLVULA ROCKER ARM KIT',
  },
  {
    id: '353-rim-clutch-drum',
    query: 'qual o tambor de embreagem Rim 3/8 7 dentes da motosserra 353?',
    model: '353',
    expectedPartNumbers: ['503980003'],
    source: 'Motosserra Husqvarna 353.pdf · p.6 · TAMBOR DE EMBRAIAGEM Rim 3/8 7T',
  },
  {
    id: '365special-rim-clutch-set',
    query: 'qual o conjunto de embreagem Rim 3/8 7 dentes da 365 Special?',
    model: '365SPECIAL',
    expectedPartNumbers: ['586980601'],
    source: 'Motosserra Husqvarna 365 Special.pdf · p.5 · CONJ DE EMBRAIAGEM Rim 3/8 7T',
  },
  {
    id: '272xp-piston',
    query: 'qual o conjunto do pistão da motosserra 272XP?',
    model: '272XP',
    expectedPartNumbers: ['504017002'],
    source: 'Motosserra Husqvarna 272 XP.pdf · p.24/25 · CONJ. DO PISTÃO Ø52',
  },
];
