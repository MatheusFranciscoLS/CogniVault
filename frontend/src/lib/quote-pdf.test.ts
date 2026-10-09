import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { buildQuotePdf, cityAndDate, customerNoteRows, formatPhoneBr } from './quote-pdf';
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

  it('Encomenda e Pronta entrega aparecem na coluna de prazo; vazio ou só espaço é orçamento expresso, sem a coluna', () => {
    expect(gerar([carburador], { leadTime: '7 a 10 dias' }).texto).toContain('7 a 10 dias');
    expect(gerar([carburador], { leadTime: '7 a 10 dias' }).texto).toContain('PRAZO');
    expect(gerar([carburador], { leadTime: 'Pronta entrega' }).texto).toContain('Pronta entrega');
    expect(gerar([carburador], { leadTime: 'Imediato' }).texto).toContain('Imediato');
    expect(gerar([carburador], { leadTime: '   ' }).texto).not.toContain('PRAZO');
  });

  it('a observação acompanha o prazo: pronta entrega e encomenda nunca se contradizem (dono, 2026-10-09)', () => {
    const pronta = gerar([carburador], { leadTime: 'Pronta entrega' }).texto;
    expect(pronta).toContain('Peça em pronta entrega');
    expect(pronta).not.toMatch(/encomenda/i);
    expect(pronta).toContain('Impostos inclusos');
    const encomenda = gerar([carburador], { leadTime: '7 a 10 dias' }).texto;
    expect(encomenda).toContain('Peça sob encomenda');
    expect(encomenda).not.toMatch(/pronta entrega/i);
    // Sem prazo (orçamento expresso), nenhuma linha de entrega.
    const expresso = gerar([carburador], { leadTime: '' }).texto;
    expect(expresso).not.toMatch(/pronta entrega|encomenda/i);
  });

  it('se o que foi digitado já fala da entrega, a linha automática não se repete', () => {
    const { texto } = gerar([carburador], { leadTime: '7 a 10 dias', notes: 'Peça sob encomenda\nFrete por conta do cliente' });
    expect(texto.match(/sob encomenda/g)).toHaveLength(1);
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

describe('orçamento de conserto e de empresa (exemplos reais da loja, 2026-10-09)', () => {
  const maoDeObra = { partNumber: 'SRV-0001', name: 'MÃO DE OBRA', model: 'Serviço / Balcão', quantity: 1, unitPrice: 150 };
  const juntaDeOutraMarca = { partNumber: 'VI21488', manufacturer: null, name: 'JOGO DE JUNTAS', model: '', quantity: 1, unitPrice: 20 };

  it('a mão de obra não tem prazo de peça: a célula fica em branco e só as peças dizem o prazo', () => {
    const { texto } = gerar([carburador, juntaDeOutraMarca, maoDeObra], { leadTime: '7 dias' });
    expect(texto.match(/\(7 dias\) Tj/g)).toHaveLength(2);
    expect(texto).toContain('MÃO DE OBRA');
  });

  it('nenhum código de peça vai ao cliente, nem o de outro fornecedor', () => {
    const { texto } = gerar([carburador, juntaDeOutraMarca, maoDeObra], {});
    expect(texto).not.toMatch(/VI21488|587106701|587 10 67-01/);
    expect(texto).toContain('JOGO DE JUNTAS');
  });

  it('empresa e número do orçamento saem quando preenchidos e somem quando não', () => {
    const com = gerar([carburador], { customerName: 'WILLIAM – GRUPO GPS', company: 'METSO EQUIPAMENTOS', quoteNumber: '25092026' }).texto;
    expect(com).toContain('Empresa:');
    expect(com).toContain('METSO EQUIPAMENTOS');
    expect(com).toContain('Nº:');
    expect(com).toContain('25092026');
    const sem = gerar([carburador], { customerName: 'Sr. Carlos', company: '   ', quoteNumber: '' }).texto;
    expect(sem).not.toContain('Empresa:');
    expect(sem).not.toContain('Nº:');
  });
});

describe('informações do cliente no cabeçalho (pedido, frota, contato)', () => {
  it('"Rótulo: valor" vira linha com rótulo; linha sem rótulo vira Obs.; vazias somem', () => {
    expect(customerNoteRows('Pedido: 4500123\n\n  Frota: 12 \nligar antes das 10h')).toEqual([
      ['Pedido:', '4500123'],
      ['Frota:', '12'],
      ['Obs.:', 'ligar antes das 10h'],
    ]);
    expect(customerNoteRows('')).toEqual([]);
    expect(customerNoteRows(undefined)).toEqual([]);
    expect(customerNoteRows('   \n  ')).toEqual([]);
  });

  it('hora e telefone no valor não quebram o rótulo (só o primeiro ":" separa)', () => {
    expect(customerNoteRows('Contato: Maria (19) 99999-0000, 08:30')).toEqual([['Contato:', 'Maria (19) 99999-0000, 08:30']]);
  });

  it('limita a 5 linhas de 140 caracteres', () => {
    const muitas = Array.from({ length: 12 }, (_, i) => `Item ${i}: valor`).join('\n');
    expect(customerNoteRows(muitas)).toHaveLength(5);
    expect(customerNoteRows(`Pedido: ${'9'.repeat(500)}`)[0][1].length).toBeLessThanOrEqual(140);
  });

  it('as linhas saem no PDF, com rótulo comprido sem invadir o valor, e some quando vazio', () => {
    const { texto } = gerar([carburador], { customerName: 'Sr. Carlos', customerNotes: 'Pedido de compra: 4500123\nFrota: 12' });
    expect(texto).toContain('Pedido de compra:');
    expect(texto).toContain('4500123');
    expect(texto).toContain('Frota:');
    expect(gerar([carburador], { customerNotes: '  ' }).texto).not.toContain('Frota:');
  });
});

describe('orçamento de conserto: prazo por linha, OS e texto próprio (planilha "ORÇAMENTO DAV", 2026-10-09)', () => {
  const junta = { partNumber: 'VI25463', manufacturer: null, name: 'JOGO DE JUNTAS', model: '', quantity: 1, unitPrice: 20, leadTime: '7 DIAS' };
  const filtro = { partNumber: '503443201', manufacturer: null, name: 'FILTRO GASOLINA', model: '', quantity: 1, unitPrice: 18, leadTime: 'Pronta entrega' };
  const maoDeObra = { partNumber: 'SRV-0001', name: 'MÃO DE OBRA', model: '', quantity: 1, unitPrice: 220 };

  it('cada linha diz o seu prazo; a mão de obra fica em branco quando não tem o dela', () => {
    const { texto } = gerar([junta, filtro, maoDeObra], { kind: 'REPAIR' });
    expect(texto).toContain('PRAZO');
    expect(texto).toContain('(7 DIAS) Tj');
    expect(texto).toContain('(Pronta entrega) Tj');
    expect(texto.match(/\(Pronta entrega\) Tj/g)).toHaveLength(1);
  });

  it('prazo diferente entre as peças: nenhuma linha "Peça em pronta entrega" nem "sob encomenda" nas observações', () => {
    const { texto } = gerar([junta, filtro, maoDeObra], { kind: 'REPAIR' });
    expect(texto).not.toMatch(/Peça em pronta entrega|Peça sob encomenda/);
  });

  it('a mão de obra pode ter prazo próprio, como na planilha ("IMEDIATO")', () => {
    const { texto } = gerar([junta, { ...maoDeObra, leadTime: 'Pronta entrega' }], { kind: 'REPAIR' });
    expect(texto.match(/\(Pronta entrega\) Tj/g)).toHaveLength(1);
  });

  it('conserto: o número digitado sai como OS, a Ref. é de conserto e não há código', () => {
    const { texto } = gerar([junta, filtro, maoDeObra], { kind: 'REPAIR', quoteNumber: '59600', customerName: 'Cliente' });
    expect(texto).toContain('OS:');
    expect(texto).toContain('59600');
    expect(texto).toContain('Orçamento de Conserto');
    expect(texto).not.toMatch(/VI25463|503443201/);
    const pecas = gerar([junta], { quoteNumber: '59600' }).texto;
    expect(pecas).toContain('Nº:');
    expect(pecas).not.toContain('OS:');
    expect(pecas).toContain('Estimativa de Pre');
  });
});
