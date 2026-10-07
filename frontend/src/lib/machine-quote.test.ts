import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  buildMachineQuotePdf,
  defaultHighlight,
  engineStroke,
  formatPower,
  machineQuoteDescription,
  machineQuoteFileName,
  machineQuoteReference,
  parseMoneyInput,
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
