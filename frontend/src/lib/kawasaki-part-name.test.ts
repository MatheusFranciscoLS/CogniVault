import { describe, expect, it } from 'vitest';
import { splitKawasakiPartName } from './kawasaki-part-name';

describe('splitKawasakiPartName', () => {
  it('separa o nome do aviso de série', () => {
    expect(splitKawasakiPartName('999CC CYL HEAD KIT#1(EARLY) | FOR FX921V SERIAL NUMBERS THROUGH FX921VA45905.')).toEqual({
      name: '999CC CYL HEAD KIT#1(EARLY)',
      note: 'FOR FX921V SERIAL NUMBERS THROUGH FX921VA45905.',
    });
  });

  it('nome sem aviso fica como veio', () => {
    expect(splitKawasakiPartName('GASKET-SET(ENGINE)')).toEqual({ name: 'GASKET-SET(ENGINE)', note: null });
  });

  it('nunca devolve nome vazio', () => {
    expect(splitKawasakiPartName(' | só o aviso')).toEqual({ name: 'só o aviso', note: null });
    expect(splitKawasakiPartName('')).toEqual({ name: '', note: null });
  });
});
