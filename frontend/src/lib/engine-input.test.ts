import { describe, expect, it } from 'vitest';
import { engineInputHelp, parseEngineInput } from './engine-input';

const ok = (raw: string) => {
  const result = parseEngineInput(raw);
  return result.kind === 'ok' ? `${result.brand}|${result.model}|${result.precision}` : result.kind;
};

describe('modelo do motor digitado a partir da plaqueta', () => {
  it('Kohler: o spec com hífen, espaço, colado, em minúsculas ou com sujeira da mão', () => {
    for (const typed of ['SV540-3212', 'sv540-3212', 'SV540 3212', 'sv540  3212', ' SV540-3212 ', 'SV5403212', 'SV540_3212', 'SV540–3212']) {
      expect(ok(typed), typed).toBe('Kohler|SV540-3212|MODELO');
    }
    expect(ok('CH740-0001')).toBe('Kohler|CH740-0001|MODELO');
    expect(ok('KT745 3017')).toBe('Kohler|KT745-3017|MODELO');
  });

  it('Kohler só com a série pede o spec completo (não finge abrir catálogo)', () => {
    const result = parseEngineInput('SV540');
    expect(result.kind).toBe('needs-spec');
    expect(engineInputHelp(result)).toMatch(/spec completo/);
    expect(parseEngineInput('KT 740').kind).toBe('needs-spec');
  });

  it('Kawasaki: série + spec em qualquer escrita, com a letra final que o catálogo não usa', () => {
    for (const typed of ['FX921V-ES06', 'fx921v-es06', 'FX921V ES06', 'FX921VES06', 'FX921V-ES06S', 'FX921VES06S ']) {
      expect(ok(typed), typed).toBe('Kawasaki|FX921V-ES06|MODELO');
    }
    expect(ok('FR730VFS16S')).toBe('Kawasaki|FR730V-FS16|MODELO');
    expect(ok('FS481V-CS55')).toBe('Kawasaki|FS481V-CS55|MODELO');
  });

  it('Kawasaki só com a série abre pela série (o catálogo pergunta o spec)', () => {
    expect(ok('FX730V')).toBe('Kawasaki|FX730V|SERIE');
    expect(ok('fr 691v')).toBe('Kawasaki|FR691V|SERIE');
  });

  it('Briggs: o modelo com hífen, colado, com espaço ou de 5 dígitos (leva zero na frente)', () => {
    for (const typed of ['104M02-0002-F1', '104M02 0002 F1', '104m020002f1', '104M02-0002-F1.']) {
      expect(ok(typed), typed).toBe('Briggs & Stratton|104M02-0002-F1|MODELO');
    }
    expect(ok('12J902-0118-01')).toBe('Briggs & Stratton|12J902-0118-01|MODELO');
    expect(ok('9P702-0212-F1')).toBe('Briggs & Stratton|09P702-0212-F1|MODELO');
    expect(ok('104M02-0002')).toBe('Briggs & Stratton|104M02-0002|MODELO');
  });

  it('motor Husqvarna próprio (HS, HV)', () => {
    expect(ok('HS452')).toBe('Husqvarna|HS452|MODELO');
    expect(ok('hv 764')).toBe('Husqvarna|HV764|MODELO');
    expect(ok('HS452AE')).toBe('Husqvarna|HS452AE|MODELO');
  });

  it('o que NÃO é modelo de motor não vira catálogo: código de peça, PNC, palavra solta, vazio', () => {
    for (const typed of ['587106701', '587 10 67-01', '15004-0937', '967 17 65-01', 'carburador', 'filtro de ar', 'Z460', 'TS138', 'LC121P', '', '   ', 'abc', 'FX', '1234']) {
      expect(parseEngineInput(typed).kind, typed).toBe('unknown');
    }
    expect(engineInputHelp(parseEngineInput('carburador'))).toMatch(/Digite como está na plaqueta/);
  });

  it('linha inteira colada de catálogo ou plaqueta: acha o modelo dentro do texto', () => {
    expect(ok('Model No. FX921V-ES06')).toBe('Kawasaki|FX921V-ES06|MODELO');
    expect(ok('FX921V-ES06 4 Stroke Engine FX921V')).toBe('Kawasaki|FX921V-ES06|MODELO');
    expect(ok('motor Kawasaki FX730V')).toBe('Kawasaki|FX730V|SERIE');
    expect(ok('ENGINE MODEL: SV540 3212 SERIAL 3012345678')).toBe('Kohler|SV540-3212|MODELO');
    expect(ok('Kohler Command SV540-3212 (V-Twin)')).toBe('Kohler|SV540-3212|MODELO');
    expect(ok('Courage SV540-3212 - SV540')).toBe('Kohler|SV540-3212|MODELO');
  });

  it('plaqueta da Briggs com modelo, tipo e código em campos separados', () => {
    expect(ok('MODEL 104M02 TYPE 0002 CODE F1')).toBe('Briggs & Stratton|104M02-0002-F1|MODELO');
    expect(ok('Model No. 104M02 Type No. 0002-F1 Code 12345678')).toBe('Briggs & Stratton|104M02-0002-F1|MODELO');
    expect(ok('model 12j902 type 0118 code 01')).toBe('Briggs & Stratton|12J902-0118-01|MODELO');
  });

  it('palavras soltas em volta NÃO viram catálogo: só vale um formato inteiro e exato', () => {
    for (const typed of ['carburador 587106701', 'filtro de ar do Z460', 'preciso do motor da máquina', 'motor Briggs 104M02', 'LC121P 2018 FX', '967 33 29-04 Husqvarna 143R-II']) {
      expect(parseEngineInput(typed).kind, typed).toBe('unknown');
    }
  });

  it('a série da Kohler no meio do texto ainda pede o spec', () => {
    expect(parseEngineInput('motor Kohler CH 740').kind).toBe('needs-spec');
  });

  it('entrada enorme ou estranha não trava nem passa', () => {
    expect(parseEngineInput('A'.repeat(5000)).kind).toBe('unknown');
    expect(ok('SV540-3212 '.repeat(50))).toBe('Kohler|SV540-3212|MODELO');
    expect(parseEngineInput('lorem ipsum '.repeat(500)).kind).toBe('unknown');
    expect(parseEngineInput(null).kind).toBe('unknown');
    expect(parseEngineInput(undefined).kind).toBe('unknown');
  });

  it('um modelo de máquina Husqvarna parecido com motor não é confundido com Kohler ou Kawasaki', () => {
    for (const machine of ['LC121P', 'LB155S', 'R316TX', 'TS142', 'Z560X', 'LTH1842', 'CS 1234']) {
      expect(['unknown', 'needs-spec'].includes(parseEngineInput(machine).kind) || ok(machine).startsWith('Husqvarna'), machine).toBe(true);
    }
  });
});
