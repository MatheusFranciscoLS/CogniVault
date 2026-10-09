import { describe, expect, it } from 'vitest';
import { composeQuoteMachine, engineLabel, splitQuoteMachine } from './quote-engine';

describe('motor no texto da máquina do orçamento', () => {
  it('monta o rótulo com a marca curta', () => {
    expect(engineLabel('Kawasaki', 'FX921V-ES06')).toBe('Kawasaki FX921V-ES06');
    expect(engineLabel('Briggs & Stratton', '104M02-0002-F1')).toBe('Briggs 104M02-0002-F1');
    expect(engineLabel(null, 'ABC123')).toBe('ABC123');
    expect(engineLabel('Kohler', '   ')).toBe('');
  });

  it('junta máquina e motor, e separa de volta sem perder nada', () => {
    const text = composeQuoteMachine('Z460', 'Kawasaki FX921V-ES06');
    expect(text).toBe('Z460 · Motor Kawasaki FX921V-ES06');
    expect(splitQuoteMachine(text)).toEqual({ machine: 'Z460', engine: 'Kawasaki FX921V-ES06' });
  });

  it('sem motor devolve a máquina como veio; sem máquina, só o motor', () => {
    expect(composeQuoteMachine('143RII', '')).toBe('143RII');
    expect(composeQuoteMachine(undefined, null)).toBe('');
    const onlyEngine = composeQuoteMachine('', 'Kohler SV540-3212');
    expect(onlyEngine).toBe('Motor Kohler SV540-3212');
    expect(splitQuoteMachine(onlyEngine)).toEqual({ machine: '', engine: 'Kohler SV540-3212' });
  });

  it('texto de orçamento antigo (sem motor) não é mexido', () => {
    for (const text of ['143RII', 'Husqvarna Z460 / TS142', '', 'Motor de popa', 'Motor Yamaha X1']) {
      expect(splitQuoteMachine(text)).toEqual({ machine: text, engine: '' });
    }
    expect(splitQuoteMachine(null)).toEqual({ machine: '', engine: '' });
  });

  it('uma máquina com " · " no nome continua inteira', () => {
    const text = composeQuoteMachine('Rider R 316TX · AWD', 'Kawasaki FS481V-CS55');
    expect(splitQuoteMachine(text)).toEqual({ machine: 'Rider R 316TX · AWD', engine: 'Kawasaki FS481V-CS55' });
  });
});
