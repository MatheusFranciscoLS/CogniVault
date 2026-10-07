import { describe, expect, it } from 'vitest';
import { addDays, buildWhatsAppMessage, formatBRL, quoteTotals, validUntil } from './quote-message';

const carburador = { partNumber: '587106701', manufacturer: 'Husqvarna', name: 'CARBURADOR', model: '143RII', pnc: '967332904', quantity: 1, unitPrice: 378.26 };
const vela = { partNumber: '501691702', manufacturer: 'Husqvarna', name: 'CHAVE COMBINADA (VELA) 13-19MM', model: '143RII', quantity: 2, unitPrice: 21.15 };
// Quarta-feira, 7 de outubro de 2026.
const quarta = new Date(2026, 9, 7, 10, 30);

describe('formatBRL', () => {
  it('usa separador de milhar e vírgula (antes saía "R$ 4093,48")', () => {
    expect(formatBRL(4093.48)).toBe('R$ 4.093,48');
    expect(formatBRL(378.26)).toBe('R$ 378,26');
    expect(formatBRL(0.5)).toBe('R$ 0,50');
  });
});

describe('validade', () => {
  it('vale 20 dias corridos, como no modelo da loja', () => {
    expect(validUntil(quarta)).toBe('27/10/2026');
  });

  it('a validade atravessa a virada de mês e de ano', () => {
    expect(addDays(new Date(2026, 11, 20), 20).getDate()).toBe(9);
    expect(validUntil(new Date(2026, 11, 20))).toBe('09/01/2027');
  });

  it('aceita outro prazo', () => {
    expect(validUntil(quarta, 7)).toBe('14/10/2026');
  });
});

describe('quoteTotals', () => {
  it('aplica o desconto sobre o bruto e informa se há preço', () => {
    const totals = quoteTotals([carburador, vela], 10);
    expect(totals.gross).toBeCloseTo(420.56);
    expect(totals.discount).toBeCloseTo(42.056);
    expect(totals.net).toBeCloseTo(378.504);
    expect(totals.hasAnyPrice).toBe(true);
  });

  it('arredonda como o servidor: 484,35 com 10% é desconto 48,44 e total 435,91 (não 435,92)', () => {
    const totals = quoteTotals([{ ...carburador, quantity: 1, unitPrice: 484.35 }], 10);
    expect(totals.discount).toBe(48.44);
    expect(totals.net).toBe(435.91);
  });

  it('sem preço nenhum, não há total', () => {
    const totals = quoteTotals([{ ...carburador, unitPrice: undefined }]);
    expect(totals.hasAnyPrice).toBe(false);
    expect(totals.gross).toBe(0);
  });
});

describe('buildWhatsAppMessage', () => {
  const message = buildWhatsAppMessage({ items: [carburador, vela], options: { customerName: 'Sr. Carlos', paymentMethod: 'À Vista / PIX (5% desc.)' }, now: quarta });

  it('traz cliente, máquina, data, itens, total, pagamento, validade e a marca da loja', () => {
    expect(message).toContain('Cliente: *Sr. Carlos*');
    expect(message).toContain('Máquina: Husqvarna 143RII');
    expect(message).toContain('Data: 07/10/2026');
    expect(message).toContain('1. *CARBURADOR*');
    expect(message).toContain('*Total: R$ 420,56*');
    expect(message).toContain('Pagamento: À Vista / PIX (5% desc.)');
    expect(message).toContain('Válido até 27/10/2026');
    expect(message).toContain('Vardão Máquinas · Revenda Autorizada Ouro Husqvarna');
    expect(message).toContain('Peças originais Husqvarna');
  });

  it('NÃO traz código de peça: o cliente poderia cotar o mesmo código em outra revenda', () => {
    expect(message).not.toMatch(/587 ?10 ?67|587106701|501 ?69 ?17|501691702|Código/);
    expect(message).toContain('CARBURADOR');
  });

  it('uma unidade mostra o preço uma vez; várias mostram a conta', () => {
    expect(message).toContain('   R$ 378,26');
    expect(message).not.toContain('Subtotal: R$ 378,26');
    expect(message).toContain('2 × R$ 21,15 = R$ 42,30');
    expect(message).toContain('— 2x');
    expect(message).not.toContain('— 1x');
  });

  it('não vaza informação interna do balcão (posição na vista, seção, PNC)', () => {
    const semPagamento = buildWhatsAppMessage({ items: [carburador, vela], options: {}, now: quarta });
    expect(semPagamento).not.toMatch(/Pos\.|vista explodida|seção|PNC|967332904/i);
  });

  it('não promete "assistência técnica": a loja é revenda autorizada', () => {
    expect(message).not.toMatch(/Assistência/i);
  });

  it('desconto mostra subtotal, desconto e total', () => {
    const withDiscount = buildWhatsAppMessage({ items: [carburador], options: { discountPercentage: 10 }, now: quarta });
    expect(withDiscount).toContain('Subtotal: R$ 378,26');
    expect(withDiscount).toContain('Desconto (10%): -R$ 37,83');
    expect(withDiscount).toContain('*Total: R$ 340,43*');
  });

  it('"A Combinar no Balcão" não vira linha de pagamento', () => {
    const combine = buildWhatsAppMessage({ items: [carburador], options: { paymentMethod: 'A Combinar no Balcão' }, now: quarta });
    expect(combine).not.toContain('Pagamento:');
  });

  it('item sem preço, num orçamento com preços, diz "Valor a consultar" em vez de sumir', () => {
    const mixed = buildWhatsAppMessage({ items: [carburador, { ...vela, unitPrice: undefined }], options: {}, now: quarta });
    expect(mixed).toContain('Valor a consultar');
    expect(mixed).toContain('*Total: R$ 378,26*');
  });

  it('serviço avulso e peça substituída também não mostram código, nem o antigo', () => {
    const text = buildWhatsAppMessage({
      items: [
        { partNumber: 'SRV-1234', name: 'Mão de obra', model: 'Balcão', quantity: 1, unitPrice: 80 },
        { ...carburador, isSuperseded: true, originalCode: '587106601' },
      ],
      options: {},
      now: quarta,
    });
    const service = text.split('2. *')[0];
    expect(service).not.toContain('Código');
    expect(text).not.toMatch(/587 ?10 ?66|587106601|Substitui/);
  });

  it('serviço avulso não conta como segunda máquina', () => {
    const text = buildWhatsAppMessage({
      items: [carburador, vela, { partNumber: 'SRV-1', name: 'Mão de obra', model: 'Balcão', quantity: 1, unitPrice: 80 }],
      options: {},
      now: quarta,
    });
    expect(text.match(/Máquina:/g)).toHaveLength(1);
    expect(text).toContain('Máquina: Husqvarna 143RII');
  });

  it('vários modelos: cada peça diz a máquina dela; um só modelo não repete', () => {
    const several = buildWhatsAppMessage({ items: [carburador, { ...vela, model: '545F' }], options: {}, now: quarta });
    expect(several).toContain('Máquina: 143RII');
    expect(several).toContain('Máquina: 545F');
    const one = buildWhatsAppMessage({ items: [carburador, vela], options: {}, now: quarta });
    expect(one.match(/Máquina:/g)).toHaveLength(1);
  });

  it('sem itens, nada é enviado', () => {
    expect(buildWhatsAppMessage({ items: [], options: {}, now: quarta })).toBe('');
  });
});
