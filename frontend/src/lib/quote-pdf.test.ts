import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { buildQuotePdf, cityAndDate, formatPhoneBr } from './quote-pdf';
import { STORE_PROFILE } from './store-profile';

const carburador = { partNumber: '587106701', manufacturer: 'Husqvarna', name: 'CARBURADOR', model: '143RII', pnc: '967332904', quantity: 1, unitPrice: 378.26, position: '15', section: 'Carburador' };
const vela = { partNumber: '501691702', manufacturer: 'Husqvarna', name: 'CHAVE COMBINADA (VELA) 13-19MM', model: '143RII', quantity: 2, unitPrice: 21.15 };
const quarta = new Date(2026, 9, 7, 10, 30);
// PNG de 1x1 pixel: só para provar que a logo entra no arquivo sem precisar da imagem de verdade.
const PIXEL = { dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', width: 960, height: 220 };

function gerar(items: Parameters<typeof buildQuotePdf>[0]['items'], options: Parameters<typeof buildQuotePdf>[0]['options'], logo?: typeof PIXEL | null) {
  const doc = buildQuotePdf({ doc: new jsPDF('p', 'pt', 'a4'), autoTable, items, options, logo, now: quarta });
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

describe('cityAndDate', () => {
  it('"Cidade, dia de mês de ano", como no modelo da loja', () => {
    expect(cityAndDate(quarta)).toBe('Limeira, 07 de outubro de 2026');
  });
});

describe('buildQuotePdf (modelo com timbre da loja)', () => {
  const { doc, texto } = gerar([carburador, vela], {
    customerName: 'Sr. Carlos', customerPhone: '19987654321', paymentMethod: 'Cartão de Débito', discountPercentage: 10, attendantName: 'Matheus Francisco',
  });

  it('gera um PDF de verdade, de uma página para poucas peças', () => {
    expect(texto.startsWith('%PDF')).toBe(true);
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('traz o timbre: dados cadastrais da loja no alto e no rodapé', () => {
    expect(texto).toContain(STORE_PROFILE.legalName);
    expect(texto).toContain(`CNPJ ${STORE_PROFILE.cnpj}`);
    expect(texto).toContain(`IE ${STORE_PROFILE.stateRegistration}`);
    expect(texto).toContain(STORE_PROFILE.phones[0]);
    expect(texto).toContain(`E-mail: ${STORE_PROFILE.email}`);
  });

  it('traz título, cidade e data, A/C, telefone, Ref. e máquina', () => {
    expect(texto).toContain('ORÇAMENTO');
    expect(texto).toContain('Limeira, 07 de outubro de 2026');
    expect(texto).toContain('A/C:');
    expect(texto).toContain('Sr. Carlos');
    expect(texto).toContain('(19) 98765-4321');
    expect(texto).toContain('Ref.:');
    expect(texto).toContain('Estimativa de Preço Peças de Reposição');
    expect(texto).toContain('Husqvarna 143RII');
  });

  it('a tabela tem descrição, quantidade e valores, e sem escolha de prazo não tem coluna de prazo', () => {
    for (const titulo of ['DESCRIÇÃO', 'QTD', 'VALOR UNIT.', 'VALOR TOTAL']) expect(texto).toContain(titulo);
    expect(texto).not.toContain('PRAZO');
    expect(texto).not.toContain('IMEDIATO');
  });

  it('valores com milhar e total igual ao do servidor, e NENHUM código de peça', () => {
    expect(texto).not.toMatch(/587 ?10 ?67|587106701|501691702|Código/);
    expect(texto).toContain('R$ 378,26');
    expect(texto).toContain('R$ 420,56');
    // 420,56 com 10%: desconto 42,06 e total 378,50 (arredondado como o servidor faz)
    expect(texto).toContain('-R$ 42,06');
    expect(texto).toContain('R$ 378,50');
  });

  it('condições do modelo: pagamento, validade de 20 dias com a data, transportadora e observações', () => {
    expect(texto).toContain('Condição de Pagamento:');
    expect(texto).toContain('Cartão de Débito');
    expect(texto).toContain('Validade do Orçamento:');
    expect(texto).toContain('20 dias (até 27/10/2026)');
    expect(texto).toContain('Transportadora:');
    expect(texto).toContain('Retira');
    expect(texto).toContain('Observação:');
    expect(texto).toContain('Impostos inclusos');
    expect(texto).toContain('Estoque rotativo sujeito a venda diária');
  });

  it('assina com ATT. e o nome do atendente', () => {
    expect(texto).toContain('ATT.');
    expect(texto).toContain('Matheus Francisco');
  });

  it('não vaza informação interna do balcão', () => {
    expect(texto).not.toMatch(/967332904|Carburador|Pos\./);
  });
});

describe('buildQuotePdf: padrões e opções', () => {
  it('pagamento combinado no balcão vira "A combinar", como no modelo', () => {
    const { texto: t } = gerar([carburador], { paymentMethod: 'A Combinar no Balcão' });
    expect(t).toContain('A combinar');
  });

  it('sem nome do atendente, não há linha ATT.', () => {
    const { texto: t } = gerar([carburador], {});
    expect(t).not.toContain('ATT.');
  });

  it('cada padrão do modelo pode ser trocado por orçamento', () => {
    const { texto: t } = gerar([carburador], { leadTime: '3 dias', shipping: 'Entrega', validityDays: 30, reference: 'Orçamento de reparo', observations: ['Frete por conta do cliente'] });
    expect(t).toContain('3 dias');
    expect(t).toContain('Entrega');
    expect(t).toContain('30 dias (até 06/11/2026)');
    expect(t).toContain('Orçamento de reparo');
    expect(t).toContain('Frete por conta do cliente');
    expect(t).not.toContain('Impostos inclusos');
  });

  it('Encomenda e Imediato aparecem na coluna de prazo; vazio ou só espaço é orçamento expresso, sem a coluna', () => {
    expect(gerar([carburador], { leadTime: '7 a 10 dias' }).texto).toContain('7 a 10 dias');
    expect(gerar([carburador], { leadTime: '7 a 10 dias' }).texto).toContain('PRAZO');
    expect(gerar([carburador], { leadTime: 'Imediato' }).texto).toContain('Imediato');
    expect(gerar([carburador], { leadTime: '   ' }).texto).not.toContain('PRAZO');
  });

  it('as observações digitadas (uma por linha) substituem as padrão da loja', () => {
    const { texto: t } = gerar([carburador], { notes: 'Frete por conta do cliente\n- Peça sob encomenda\n\n' });
    expect(t).toContain('Frete por conta do cliente');
    expect(t).toContain('Peça sob encomenda');
    expect(t).not.toContain('Impostos inclusos');
    // Sem observação digitada, valem as três do modelo.
    expect(gerar([carburador], { notes: '  ' }).texto).toContain('Impostos inclusos');
  });

  it('observações vazias tiram a linha inteira', () => {
    const { texto: t } = gerar([carburador], { observations: [] });
    expect(t).not.toContain('Observação:');
  });

  it('peça sem preço diz "Sob consulta" e não entra no total', () => {
    const { texto: t } = gerar([carburador, { ...vela, unitPrice: undefined }], {});
    expect(t).toContain('Sob consulta');
    expect(t).toContain('R$ 378,26');
  });

  it('a logo entra no arquivo quando existe; sem ela, o nome da loja aparece em texto', () => {
    const com = gerar([carburador], {}, PIXEL);
    expect(com.texto).toContain('/Subtype /Image');
    const sem = gerar([carburador], {}, null);
    expect(sem.texto).not.toContain('/Subtype /Image');
    expect(sem.texto).toContain('MÁQUINAS E JARDINAGEM');
  });

  it('muitas peças passam para a segunda página e o rodapé tem "Página n de N" em todas', () => {
    const muitas = Array.from({ length: 40 }, (_, i) => ({ ...carburador, partNumber: `5871067${String(i).padStart(2, '0')}`, name: `PEÇA ${i}` }));
    const { doc: d, texto: t } = gerar(muitas, { attendantName: 'Matheus Francisco' });
    const paginas = d.getNumberOfPages();
    expect(paginas).toBeGreaterThan(1);
    expect(t).toContain(`Página 1 de ${paginas}`);
    expect(t).toContain(`Página ${paginas} de ${paginas}`);
    // O timbre do rodapé aparece em TODAS as páginas.
    expect(t.split(STORE_PROFILE.legalName).length - 1).toBe(paginas + 1);
  });
});

describe('buildQuotePdf: motor da máquina', () => {
  it('traz a linha Motor quando o atendente marcou o motor, e nenhum código de peça', () => {
    const { texto } = gerar([carburador], { engine: 'Kawasaki FX921V-ES06' });
    expect(texto).toContain('Motor:');
    expect(texto).toContain('Kawasaki FX921V-ES06');
    expect(texto).not.toContain(carburador.partNumber);
  });

  it('sem motor, não há linha de motor', () => {
    const { texto } = gerar([carburador], {});
    expect(texto).not.toContain('Motor:');
  });
});
