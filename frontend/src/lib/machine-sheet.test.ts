import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { buildMachineSheetMessage, buildMachineSheetPdf, machineFacts, machineSheetFileName } from './machine-sheet';
import type { ListedMachine } from './machine-list';

// Máquina inventada: a lista real não entra no repositório.
const machine: ListedMachine = {
  pnc: '900000001', model: 'X100', description: 'ROCADEIRA HUSQ. X100 BR', category: 'ROÇADEIRA', segment: null,
  technology: 'PRODUTOS A COMBUSTÃO', application: 'PROFISSIONAL', listPrice: 2099, discontinued: false, isNew: true,
  priceBefore: 2199, sortOrder: 3, specs: [{ label: 'Cilindrada', value: '40 cm³' }, { label: 'Tanque', value: '0,6 L' }], details: null,
};
const equipment = {
  included: [{ name: 'Cabeçote', value: 'Fio de nylon' }, { name: 'Cinto', value: null }],
  notIncluded: [{ name: 'Óculos', value: null }],
};
const data = new Date(2026, 9, 5);

describe('buildMachineSheetMessage', () => {
  const texto = buildMachineSheetMessage({ machine, equipment, listDate: data });

  it('traz modelo, categoria e o preço com a data da tabela', () => {
    expect(texto).toContain('*X100* · Husqvarna');
    expect(texto).toContain('Roçadeira · Combustão · Profissional');
    expect(texto).toContain('*Preço: R$ 2.099,00*');
    expect(texto).toContain('Valor da tabela de 05/10/2026');
  });

  it('lista a ficha técnica e o que acompanha, e o que não acompanha', () => {
    expect(texto).toContain('• Cilindrada: 40 cm³');
    expect(texto).toContain('*Acompanha*\n• Cabeçote: Fio de nylon\n• Cinto');
    expect(texto).toContain('*Não acompanha*\n• Óculos');
  });

  it('não vaza nada interno do balcão: PNC, selo de novidade, preço anterior', () => {
    expect(texto).not.toContain('900000001');
    expect(texto).not.toMatch(/Nova|2\.199|Baixou/);
  });

  it('termina com a assinatura da loja', () => {
    expect(texto.endsWith('Vardão Máquinas · Revenda Autorizada Ouro Husqvarna')).toBe(true);
  });

  it('sem ficha e sem Portal, ainda é uma mensagem válida (só modelo e preço)', () => {
    const curta = buildMachineSheetMessage({ machine: { ...machine, specs: [] }, equipment: null, listDate: null });
    expect(curta).toContain('*Preço: R$ 2.099,00*');
    expect(curta).not.toContain('Ficha técnica');
    expect(curta).not.toContain('Valor da tabela');
    expect(curta).not.toContain('Acompanha');
  });
});

describe('machineFacts e nome do arquivo', () => {
  it('juntam só o que existe', () => {
    expect(machineFacts({ ...machine, application: null })).toBe('Roçadeira · Combustão');
  });
  it('o arquivo não leva espaço, acento nem barra', () => {
    expect(machineFacts(machine)).toBe('Roçadeira · Combustão · Profissional');
    expect(machineSheetFileName({ model: '135 MarkII / BR' })).toBe('Ficha-135-MarkII-BR.pdf');
    expect(machineSheetFileName({ model: '???' })).toBe('Ficha-maquina.pdf');
  });
});

describe('buildMachineSheetPdf', () => {
  const doc = buildMachineSheetPdf({ doc: new jsPDF('p', 'pt', 'a4'), autoTable, machine, equipment, listDate: data });
  const bruto = new TextDecoder('latin1').decode(doc.output('arraybuffer')).replace(/\\([()])/g, '$1');

  it('gera um PDF de verdade, de uma página', () => {
    expect(bruto.startsWith('%PDF')).toBe(true);
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('mostra o modelo, o preço e a data da tabela, sem o PNC', () => {
    expect(bruto).toContain('Husqvarna X100');
    expect(bruto).toContain('R$ 2.099,00');
    expect(bruto).toContain('05/10/2026');
    expect(bruto).not.toContain('900000001');
  });

  it('traz a ficha técnica e as listas do que acompanha', () => {
    expect(bruto).toContain('Cilindrada');
    expect(bruto).toContain('40 cm');
    expect(bruto).toContain('Fio de nylon');
  });

  it('uma máquina com muitos itens continua cabendo: vira várias páginas, com rodapé numerado', () => {
    const grande = { ...machine, specs: Array.from({ length: 60 }, (_, i) => ({ label: `Item ${i}`, value: `Valor ${i}` })) };
    const paginas = buildMachineSheetPdf({ doc: new jsPDF('p', 'pt', 'a4'), autoTable, machine: grande, equipment: null, listDate: data });
    expect(paginas.getNumberOfPages()).toBeGreaterThan(1);
    const texto = new TextDecoder('latin1').decode(paginas.output('arraybuffer'));
    expect(texto).toContain(`de ${paginas.getNumberOfPages()}`);
  });
});
