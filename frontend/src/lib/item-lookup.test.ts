import { describe, expect, it } from 'vitest';
import type { MasterPrice } from '../components/machines/master-part-prices';
import { resolveItemLookup } from './item-lookup';

const loja = (over: Partial<MasterPrice> = {}): MasterPrice => ({ partNumber: '587106701', name: 'CARBURADOR', price: 378.26, stock: null, location: null, freshness: 'FRESH', ...over });

describe('item digitado com código', () => {
  it('código Husqvarna na loja: descrição, preço e marca saem sozinhos', () => {
    expect(resolveItemLookup({ code: '587 10 67-01', store: loja() })).toEqual({
      kind: 'FOUND', origin: 'LOJA', name: 'CARBURADOR', price: 378.26, manufacturer: 'Husqvarna', confirmPrice: false,
    });
  });

  it('preço de mês anterior ou sem data é mostrado, com o aviso de conferir', () => {
    for (const freshness of ['STALE', 'UNKNOWN'] as const) {
      const found = resolveItemLookup({ code: '587106701', store: loja({ freshness }) });
      expect(found).toMatchObject({ kind: 'FOUND', price: 378.26, confirmPrice: true });
    }
  });

  it('código de motor só no catálogo oficial: descrição automática e PREÇO EM ABERTO', () => {
    for (const [source, marca] of [['BRIGGS', 'Briggs & Stratton'], ['KAWASAKI', 'Kawasaki'], ['KOHLER', 'Kohler']] as const) {
      const found = resolveItemLookup({ code: '594028', official: [{ source, name: 'JUNTA DO CABEÇOTE' }] });
      expect(found).toEqual({ kind: 'FOUND', origin: 'OFICIAL', name: 'JUNTA DO CABEÇOTE', manufacturer: marca, confirmPrice: false });
      expect('price' in found && found.price !== undefined).toBe(false);
    }
  });

  it('motor que a loja também vende: nome e preço da loja, marca do catálogo', () => {
    const found = resolveItemLookup({ code: '11013-7046', store: loja({ name: 'VELA DE IGNIÇÃO', price: 35 }), official: [{ source: 'KAWASAKI', name: 'SPARK PLUG' }] });
    expect(found).toEqual({ kind: 'FOUND', origin: 'LOJA', name: 'VELA DE IGNIÇÃO', price: 35, manufacturer: 'Kawasaki', confirmPrice: false });
  });

  it('código de outro fornecedor (Branco, Tramontina, Vipeças...): nada é puxado, tudo em aberto', () => {
    for (const code of ['TR-12345', 'BR 8890', 'VP0042', 'abc123xyz']) expect(resolveItemLookup({ code })).toEqual({ kind: 'NONE' });
  });

  it('cadastro da loja sem preço (zero ou nulo): acha a descrição, deixa o preço em aberto', () => {
    for (const price of [0, null, -5]) {
      const found = resolveItemLookup({ code: '587106701', store: loja({ price: price as number | null }) });
      expect(found).toMatchObject({ kind: 'FOUND', name: 'CARBURADOR', confirmPrice: false });
      expect('price' in found && found.price).toBeFalsy();
    }
  });

  it('código curto, vazio ou só símbolo não consulta nada; resposta vazia das fontes vira NONE', () => {
    for (const code of ['', ' ', 'ab', '--', '12']) expect(resolveItemLookup({ code, store: loja() })).toEqual({ kind: 'NONE' });
    expect(resolveItemLookup({ code: '587106701', store: loja({ name: '  ' }), official: [{ source: 'BRIGGS', name: ' ' }] })).toEqual({ kind: 'NONE' });
    expect(resolveItemLookup({ code: '587106701', store: null, official: [] })).toEqual({ kind: 'NONE' });
  });

  it('cadastro de código que não é de 9 dígitos fica sem marca em vez de chutar Husqvarna', () => {
    expect(resolveItemLookup({ code: 'FX921VHS04S', store: loja({ name: 'MOTOR KAWASAKI', price: 100 }) })).toMatchObject({ kind: 'FOUND', manufacturer: undefined });
  });
});
