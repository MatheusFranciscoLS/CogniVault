import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { buildQuotePdf, formatPhoneBr } from './quote-pdf';

const carburador = { partNumber: '587106701', manufacturer: 'Husqvarna', name: 'CARBURADOR', model: '143RII', pnc: '967332904', quantity: 1, unitPrice: 378.26, position: '15', section: 'Carburador' };
const vela = { partNumber: '501691702', manufacturer: 'Husqvarna', name: 'CHAVE COMBINADA (VELA) 13-19MM', model: '143RII', quantity: 2, unitPrice: 21.15 };
const quarta = new Date(2026, 9, 7, 10, 30);

function gerar(items: Parameters<typeof buildQuotePdf>[0]['items'], options: Parameters<typeof buildQuotePdf>[0]['options']) {
  const doc = buildQuotePdf({ doc: new jsPDF('p', 'pt', 'a4'), autoTable, items, options, now: quarta });
  // jsPDF não comprime por padrão: o texto aparece no arquivo e dá para conferir o que o cliente lê.
  // No arquivo PDF os parênteses do texto vêm escapados (\( e \)): desfaz para comparar com o que o cliente lê.
  const bruto = new TextDecoder('latin1').decode(doc.output('arraybuffer'));
  return { doc, texto: bruto.replace(/\\([()])/g, '$1') };
}

describe('formatPhoneBr', () => {
  it('formata celular e fixo, com ou sem 55', () => {
    expect(formatPhoneBr('19987654321')).toBe('(19) 98765-4321');
    expect(formatPhoneBr('5519987654321')).toBe('(19) 98765-4321');
    expect(formatPhoneBr('1933334444')).toBe('(19) 3333-4444');
    expect(formatPhoneBr('123')).toBe('123');
  });
});

describe('buildQuotePdf', () => {
  const { doc, texto } = gerar([carburador, vela], { customerName: 'Sr. Carlos', customerPhone: '19987654321', paymentMethod: 'Cartão de Débito', discountPercentage: 10 });

  it('gera um PDF de verdade, de uma página para poucas peças', () => {
    expect(texto.startsWith('%PDF')).toBe(true);
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('traz a loja, o cliente, o telefone formatado, a máquina e a validade com data', () => {
    expect(texto).toContain('VARDÃO MÁQUINAS'.replace('Ã', '\xc3').replace('Á', '\xc1'));
    expect(texto).toContain('Sr. Carlos');
    expect(texto).toContain('(19) 98765-4321');
    expect(texto).toContain('Husqvarna 143RII');
    expect(texto).toContain('16/10/2026');
  });

  it('traz os códigos como a etiqueta, os valores com milhar e o total igual ao do servidor', () => {
    expect(texto).toContain('587 10 67-01');
    expect(texto).toContain('R$ 378,26');
    expect(texto).toContain('R$ 420,56');
    // 420,56 com 10%: desconto 42,06 e total 378,50 (arredondado como o servidor faz)
    expect(texto).toContain('-R$ 42,06');
    expect(texto).toContain('R$ 378,50');
  });

  it('não vaza informação interna do balcão', () => {
    expect(texto).not.toMatch(/967332904|Carburador|Pos\./);
  });

  it('pagamento combinado no balcão não vira linha', () => {
    const { texto: t } = gerar([carburador], { paymentMethod: 'A Combinar no Balcão' });
    expect(t).not.toContain('Pagamento');
  });

  it('peça sem preço diz "Sob consulta" e não entra no total', () => {
    const { texto: t } = gerar([carburador, { ...vela, unitPrice: undefined }], {});
    expect(t).toContain('Sob consulta');
    expect(t).toContain('R$ 378,26');
  });

  it('muitas peças passam para a segunda página e o rodapé tem "Página n de N" em todas', () => {
    const muitas = Array.from({ length: 40 }, (_, i) => ({ ...carburador, partNumber: `5871067${String(i).padStart(2, '0')}`, name: `PEÇA ${i}` }));
    const { doc: d, texto: t } = gerar(muitas, {});
    const paginas = d.getNumberOfPages();
    expect(paginas).toBeGreaterThan(1);
    expect(t).toContain(`Página 1 de ${paginas}`);
    expect(t).toContain(`Página ${paginas} de ${paginas}`);
  });
});
