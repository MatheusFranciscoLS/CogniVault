import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  buildMachineQuotePdf,
  defaultHighlight,
  engineStroke,
  formatPower,
  machineQuoteDescription,
  machineVariantNote,
  decimalComma,
  defaultIncludeEquipment,
  machineQuoteFileName,
  machineQuoteReference,
  parseInputDate,
  parseMoneyInput,
  todayInputValue,
  suggestComplement,
  type MachineQuoteFields,
} from './machine-quote';
import type { ListedMachine } from './machine-list';
import type { SheetEquipment } from './machine-sheet';

// Máquinas inventadas: a lista real não entra no repositório.
const giroZero: ListedMachine = {
  pnc: '900000001', model: 'ZX900', description: 'CORTADOR DE GRAMA GZ ZX900', category: 'GIRO ZERO', segment: null,
  technology: 'PRODUTOS A COMBUSTÃO', application: 'PROFISSIONAL', listPrice: 80999, discontinued: false, isNew: false,
  priceBefore: null, sortOrder: 1, details: null,
  specs: [
    { label: 'Cilindrada', value: '726 cm³' }, { label: 'Potência', value: '23 hp (17,2 kW)' },
    { label: 'Motor', value: 'Kawasaki FS Series V-Twin' }, { label: 'Tanque', value: '22 L' },
    { label: 'Largura de trabalho', value: '152 cm' }, { label: 'Peso', value: '373 kg' }, { label: 'NCM', value: '84332090' },
  ],
};
const rocadeira: ListedMachine = {
  pnc: '900000002', model: 'R200', description: 'ROCADEIRA R200', category: 'ROÇADEIRA', segment: null,
  technology: 'PRODUTOS A COMBUSTÃO', application: 'COMERCIAL', listPrice: 3249, discontinued: false, isNew: false,
  priceBefore: null, sortOrder: 2, details: null,
  specs: [
    { label: 'Cilindrada', value: '41,5 cm³' }, { label: 'Potência', value: '1,6 kW (2,1 hp)' },
    { label: 'Motor', value: 'Combustão interna, 2 tempos' }, { label: 'Tanque', value: '0,94 L' },
  ],
};

const fields: MachineQuoteFields = {
  customerName: 'Fazenda Teste', price: 79900, payment: 'A combinar', leadTime: 'Imediato',
  observation: 'Preços para produto a serem faturados no estado de São Paulo', complement: '', highlight: 'Recomendado para trabalhos profissionais e intensivos',
  includeEquipment: true,
};

describe('machineQuoteDescription', () => {
  it('monta a frase do modelo em Word só com o que a ficha traz', () => {
    expect(machineQuoteDescription(giroZero)).toBe(
      'Giro Zero Cortador de Grama, modelo ZX900 equipado com motor 4 tempos de 726 cm³, potência de 17,2 KW/ 23 HP, peso de 373 kg, tanque de combustível com capacidade de 22 litros, largura de corte de 152 cm.',
    );
  });

  it('roçadeira: lê 2 tempos da ficha e converte o tanque de litros', () => {
    expect(machineQuoteDescription(rocadeira)).toBe(
      'Roçadeira, modelo R200 equipado com motor 2 tempos de 41,5 cm³, potência de 1,6 KW/ 2,1 HP, tanque de combustível com capacidade de 0,94 litros.',
    );
  });

  it('o complemento do atendente entra no fim, sem ponto duplicado', () => {
    expect(machineQuoteDescription(giroZero, 'com transmissão Hidrostática. ')).toContain('largura de corte de 152 cm, com transmissão Hidrostática.');
  });

  it('sem ficha técnica sobra só o modelo, sem inventar nada', () => {
    expect(machineQuoteDescription({ ...rocadeira, specs: [] })).toBe('Roçadeira, modelo R200.');
  });

  it('não leva PNC nem código algum', () => {
    expect(machineQuoteDescription(giroZero)).not.toContain('900000001');
  });
});

describe('detalhes do modelo', () => {
  it('assunto por categoria, como a loja escreve', () => {
    expect(machineQuoteReference(giroZero)).toBe('Orçamento Trator Giro Zero Husqvarna ZX900');
    expect(machineQuoteReference({ category: 'TRATOR', model: 'T1' })).toBe('Orçamento Trator Husqvarna T1');
    expect(machineQuoteReference({ category: 'RIDER', model: 'RX' })).toBe('Orçamento Trator Rider Husqvarna RX');
    expect(machineQuoteReference(rocadeira)).toBe('Orçamento Roçadeira Husqvarna R200');
  });

  it('potência nas duas ordens da lista', () => {
    expect(formatPower('17,9 kW (24 hp)')).toBe('17,9 KW/ 24 HP');
    expect(formatPower('31 hp / 23.1 kw')).toBe('23,1 KW/ 31 HP');
    expect(formatPower('12 cv')).toBe('12 cv');
    expect(formatPower(null)).toBeNull();
  });

  it('motor: lê da ficha; trator, rider e giro zero são 4 tempos; o resto sem ficha não chuta', () => {
    expect(engineStroke(rocadeira)).toBe('2 tempos');
    expect(engineStroke(giroZero)).toBe('4 tempos');
    expect(engineStroke({ category: 'MOTOSSERRA', specs: [] })).toBeNull();
  });

  it('destaque conforme a aplicação', () => {
    expect(defaultHighlight('PROFISSIONAL')).toContain('profissionais e intensivos');
    expect(defaultHighlight('OCASIONAL')).toBe('');
  });

  it('valor digitado em qualquer formato do balcão', () => {
    expect(parseMoneyInput('R$ 79.900,00')).toBe(79900);
    expect(parseMoneyInput('79900')).toBe(79900);
    expect(parseMoneyInput('79.900')).toBe(79900);
    expect(parseMoneyInput('1.234,5')).toBe(1234.5);
    expect(parseMoneyInput('abc')).toBeNull();
    expect(parseMoneyInput('0')).toBeNull();
  });

  it('nome do arquivo', () => {
    expect(machineQuoteFileName({ model: 'Z 460/X' })).toBe('Orcamento-Z-460-X.pdf');
  });
});

describe('buildMachineQuotePdf', () => {
  const build = (extra: Partial<MachineQuoteFields> = {}, equipment: SheetEquipment = { included: [{ name: 'Cinto', value: null }], notIncluded: [] }) =>
    buildMachineQuotePdf({ doc: new jsPDF('p', 'pt', 'a4'), autoTable, machine: giroZero, equipment, fields: { ...fields, ...extra }, attendantName: 'Maria Teste', now: new Date(2026, 9, 7) });

  it('gera um PDF de verdade, de uma página', () => {
    const doc = build();
    expect(String(doc.output()).startsWith('%PDF')).toBe(true);
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('traz o texto do modelo da loja: assunto, descrição, preço, condições, validade e quem atendeu', () => {
    const texto = new TextDecoder('latin1').decode(build().output('arraybuffer')).replace(/\\([()])/g, '$1');
    for (const trecho of [
      'Limeira, 07 de outubro de 2026', 'A/C:', 'Fazenda Teste', 'Ref.:', 'Orçamento Trator Giro Zero Husqvarna ZX900',
      '01-) Giro Zero Cortador de Grama, modelo ZX900', 'Recomendado para trabalhos profissionais e intensivos',
      'Preço: R$ 79.900,00', 'Condição de Pagamento:', 'Prazo de Entrega:', 'Validade do Orçamento:', '20 dias (até 27/10/2026)',
      'Observação:', 'ATT.', 'Maria Teste',
    ]) expect(texto).toContain(trecho);
  });

  it('não leva PNC nem o preço da lista', () => {
    const texto = new TextDecoder('latin1').decode(build().output('arraybuffer')).replace(/\\([()])/g, '$1');
    expect(texto).not.toContain('900000001');
    expect(texto).not.toContain('80.999');
  });

  it('com muita coisa a descrever, continua em mais de uma página sem quebrar', () => {
    const muita = { included: Array.from({ length: 14 }, (_, i) => ({ name: `Acessório ${i + 1} com um nome um pouco longo para ocupar a linha`, value: 'valor' })), notIncluded: [] };
    const doc = build({ complement: 'x'.repeat(900) }, muita);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});

describe('descrição por tipo de máquina', () => {
  const bateria: ListedMachine = {
    ...rocadeira, model: 'B300', category: 'ROÇADEIRA', technology: 'BATERIA', listPrice: 2999,
    specs: [
      { label: 'Potência', value: '0,8 kW' }, { label: 'Motor', value: 'Elétrico sem escovas (BLDC)' },
      { label: 'Combustível', value: 'Bateria' }, { label: 'Tensão', value: '36 V' }, { label: 'Peso', value: '2,63 kg' },
    ],
  };
  const gerador: ListedMachine = {
    ...rocadeira, model: 'G5000', category: 'GERADOR', technology: 'PRODUTOS A COMBUSTÃO',
    specs: [
      { label: 'Cilindrada', value: '390 cm³' }, { label: 'Potência', value: '7,5 hp (5,5 kW / 5.500 W)' },
      { label: 'Motor', value: 'Monocilíndrico, 4 tempos' }, { label: 'Tanque', value: '27 L' }, { label: 'Tensão', value: '127/220 V AC' }, { label: 'Peso', value: '88 kg' },
    ],
  };

  it('a bateria descreve o motor elétrico e a tensão, sem inventar cilindrada nem tempos', () => {
    expect(machineQuoteDescription(bateria)).toBe(
      'Roçadeira, modelo B300 equipado com motor elétrico sem escovas (BLDC), alimentado por bateria de 36 V, potência de 0,8 KW, peso de 2,63 kg.',
    );
  });

  it('gerador traz a tensão de saída', () => {
    expect(machineQuoteDescription(gerador)).toContain('equipado com motor 4 tempos de 390 cm³, tensão de 127/220 V AC, potência de 5,5 KW/ 7,5 HP');
  });

  it('tensão que não é tensão (dado ruim da lista) fica de fora', () => {
    const ruim = { ...bateria, specs: [...bateria.specs.filter(item => item.label !== 'Tensão'), { label: 'Tensão', value: 'Relação de transmissão 13:1' }] };
    expect(machineQuoteDescription(ruim)).not.toContain('alimentado por bateria');
  });
});

describe('suggestComplement (tirado do Portal)', () => {
  const portal = {
    features: [{ name: 'Motor Profissional' }, { name: 'Transmissão Parker HTE' }, { name: 'Ajuste de altura da plataforma em 13 posições' }],
    specifications: [
      { group: 'Capacidade', name: 'Velocidade à frente, min-máx min', value: '0 km/h' },
      { group: 'Capacidade', name: 'Velocidade à frente, min-máx max', value: '16 km/h' },
      { group: 'Sistema', name: 'Velocidade da marcha à ré, min-máx max', value: '5 km/h' },
    ],
  };

  it('junta transmissão, altura e velocidade máxima à frente, no estilo do modelo da loja', () => {
    expect(suggestComplement(giroZero, portal)).toBe('com transmissão Parker HTE, 13 posições para regulagem da altura de corte e velocidade máxima de 16 km/h');
  });

  it('o que o Portal não diz fica de fora, sem chute', () => {
    expect(suggestComplement(giroZero, { features: [{ name: 'Motor Profissional' }], specifications: [] })).toBe('');
    expect(suggestComplement(giroZero, { features: [{ name: 'Transmissão hidrostática operada por pedal' }] })).toBe('com transmissão hidrostática operada por pedal');
  });

  it('só para máquinas de cortar grama sentado; roçadeira e Portal fora do ar não sugerem nada', () => {
    expect(suggestComplement(rocadeira, portal)).toBe('');
    expect(suggestComplement(giroZero, undefined)).toBe('');
  });
});

describe('machineVariantNote', () => {
  const serra = (pnc: string, description: string) => ({ ...rocadeira, pnc, model: '272XP', category: 'MOTOSSERRA', description });
  const lote = [serra('1', 'MOTOSSERRA MOD272XP 13"PD 3/8"'), serra('2', 'MOTOSSERRA MOD272XP 20"PD 3/8"'), rocadeira];

  it('modelo com mais de uma versão na lista diz só o que distingue a versão', () => {
    expect(machineVariantNote(lote[0], lote)).toBe('13"PD 3/8"');
    expect(machineVariantNote({ ...lote[0], description: 'SOPRADOR 120iB CJ', model: '120iB', category: 'SOPRADOR' }, [{ model: '120iB' }, { model: '120iB' }])).toBe('CJ');
    expect(machineQuoteDescription(serra('1', 'x'), '', '13"PD 3/8"')).toContain('modelo 272XP (13"PD 3/8")');
  });

  it('modelo único, ou versão sem nada que a distinga, não leva nota', () => {
    expect(machineVariantNote(rocadeira, lote)).toBeNull();
    expect(machineVariantNote({ ...lote[0], description: 'MOTOSSERRA 272XP' }, lote)).toBeNull();
  });
});

describe('o que muda por tipo de máquina', () => {
  const equipamento = { included: [{ name: 'Lâmina', value: 'Multi 330-2' }, { name: 'Cinturão', value: 'Balance 55' }], notIncluded: [] };

  it('motosserra fala de sabre, não de largura de corte', () => {
    const serra = { ...rocadeira, model: '272XP', category: 'MOTOSSERRA', specs: [{ label: 'Largura de trabalho', value: '38 cm' }] };
    expect(machineQuoteDescription(serra)).toContain('comprimento do sabre de 38 cm');
    expect(machineQuoteDescription(serra)).not.toContain('largura de corte');
  });

  it('"conjunto composto por" entra sozinho só na roçadeira', () => {
    expect(defaultIncludeEquipment(rocadeira, equipamento)).toBe(true);
    expect(defaultIncludeEquipment({ category: 'MOTOSSERRA' }, equipamento)).toBe(false);
    expect(defaultIncludeEquipment(rocadeira, null)).toBe(false);
    expect(defaultIncludeEquipment(rocadeira, { included: Array.from({ length: 9 }, (_, i) => ({ name: 'x' + i, value: null })), notIncluded: [] })).toBe(false);
  });
});

describe('acabamento do texto', () => {
  it('ponto decimal vira vírgula, mas milhar fica', () => {
    expect(decimalComma('3.5 kg')).toBe('3,5 kg');
    expect(decimalComma('0.35 kW')).toBe('0,35 kW');
    expect(decimalComma('7.890 kg')).toBe('7.890 kg');
    expect(decimalComma(null)).toBeNull();
  });

  it('sem motor na ficha a frase vira lista com vírgulas, sem "modelo X peso de"', () => {
    const robo = { ...rocadeira, model: 'AM1', category: 'AUTOMOWER', technology: 'ROBÓTICA', specs: [{ label: 'Peso', value: '18.1 kg' }, { label: 'Largura de trabalho', value: '22 cm' }] };
    expect(machineQuoteDescription(robo)).toBe('Automower, modelo AM1, peso de 18,1 kg, largura de corte de 22 cm.');
  });
});

describe('fichas que vêm da lista (transmissão, velocidade, área do robô)', () => {
  it('a ficha da lista manda na sugestão e o Portal só completa', () => {
    const ride = { ...giroZero, specs: [...giroZero.specs, { label: 'Transmissão', value: 'Parker  HTE10 - Hidrostática' }, { label: 'Velocidade máxima', value: '16 km/h' }] };
    expect(suggestComplement(ride, undefined)).toBe('com transmissão Parker HTE10 - Hidrostática e velocidade máxima de 16 km/h');
    expect(suggestComplement(ride, { features: [{ name: 'Transmissão Outra' }], specifications: [] })).toContain('com transmissão Parker HTE10 - Hidrostática');
  });

  it('o robô diz a área de trabalho e a inclinação máxima', () => {
    const robo = { ...rocadeira, model: 'AM9', category: 'AUTOMOWER', technology: 'ROBÓTICA', specs: [{ label: 'Área de trabalho', value: '1.500 m²' }, { label: 'Inclinação máxima', value: '22 ° (40%)' }, { label: 'Peso', value: '9 kg' }] };
    expect(machineQuoteDescription(robo)).toBe('Automower, modelo AM9, área de trabalho de até 1.500 m², inclinação máxima de 22 ° (40%), peso de 9 kg.');
  });
});

describe('data do orçamento', () => {
  it('hoje pela data local, com zero à esquerda', () => {
    expect(todayInputValue(new Date(2026, 9, 7, 23, 59))).toBe('2026-10-07');
    expect(todayInputValue(new Date(2026, 0, 3, 0, 5))).toBe('2026-01-03');
  });

  it('o texto do campo vira data ao meio-dia local, sem recuar um dia', () => {
    const data = parseInputDate('2026-10-15');
    expect(data?.getDate()).toBe(15);
    expect(data?.getHours()).toBe(12);
    expect(parseInputDate('2026-02-30')).toBeNull();
    expect(parseInputDate('15/10/2026')).toBeNull();
    expect(parseInputDate('')).toBeNull();
  });

  it('o PDF traz a data negociada e a validade de 20 dias contada dela', () => {
    const doc = buildMachineQuotePdf({ doc: new jsPDF('p', 'pt', 'a4'), autoTable, machine: giroZero, equipment: null, fields, now: parseInputDate('2026-10-15') as Date });
    const texto = new TextDecoder('latin1').decode(doc.output('arraybuffer')).replace(/\\([()])/g, '$1');
    expect(texto).toContain('Limeira, 15 de outubro de 2026');
    expect(texto).toContain('20 dias (até 04/11/2026)');
  });
});
