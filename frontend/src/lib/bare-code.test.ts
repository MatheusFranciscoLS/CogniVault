import { describe, expect, it } from 'vitest';
import { bareHusqvarnaCode } from './bare-code';

describe('bareHusqvarnaCode', () => {
  it('aceita o código puro, com a máscara da etiqueta', () => {
    expect(bareHusqvarnaCode('506027201')).toBe('506027201');
    expect(bareHusqvarnaCode('  587 10 67-01 ')).toBe('587106701');
    expect(bareHusqvarnaCode('587.10.67-01')).toBe('587106701');
    expect(bareHusqvarnaCode('96041044000')).toBe('96041044000');
  });

  it('recusa frase, modelo e código com letra: aí o código é contexto', () => {
    expect(bareHusqvarnaCode('carburador 587106701')).toBeNull();
    expect(bareHusqvarnaCode('143RII 967332904')).toBeNull();
    expect(bareHusqvarnaCode('104M02-0002-F1')).toBeNull();
    expect(bareHusqvarnaCode('587106701 carburador')).toBeNull();
  });

  it('recusa número curto demais ou longo demais, e lixo', () => {
    expect(bareHusqvarnaCode('12345')).toBeNull();
    expect(bareHusqvarnaCode('123456789012345')).toBeNull();
    expect(bareHusqvarnaCode('')).toBeNull();
    expect(bareHusqvarnaCode('- 587106701')).toBeNull();
    expect(bareHusqvarnaCode('587106701 -')).toBeNull();
  });
});
