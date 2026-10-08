import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { baseEnginesForMachine, engineBrandOf, enginesCitedByPortal, enginesFromListingSpec, mergeEngineHints } from './machine-base-engine';

describe('motor de base da máquina', () => {
  it('pares informados pelo dono aparecem com a marca certa', () => {
    const lth = baseEnginesForMachine('LTH1842');
    assert.deepEqual(lth.map(item => [item.brand, item.model, item.source]), [['Kohler', 'SV540-3212', 'DONO']]);
    const rider = baseEnginesForMachine('R316TX');
    assert.deepEqual(rider.map(item => [item.brand, item.model]), [['Kawasaki', 'FS481V-CS55']]);
  });

  it('o modelo vem com espaço, hífen ou caixa diferente e acha do mesmo jeito', () => {
    assert.equal(baseEnginesForMachine('lth 1842').length, 1);
    assert.equal(baseEnginesForMachine('R-316 TX').length, 1);
  });

  it('o nome do Portal vem com sufixo e espaço: casa pelas primeiras palavras, nunca por pedaço de palavra', () => {
    assert.equal(baseEnginesForMachine('R 316TX AWD').length, 1);
    assert.equal(baseEnginesForMachine('Cortador de Grama frontal com operador embarcado Husqvarna R 316TX').length, 1, 'o Portal escreve a descrição inteira');
    assert.equal(baseEnginesForMachine('LTH1842 (2018)').length, 1);
    assert.equal(baseEnginesForMachine('TS 138').length > 0, true);
    assert.deepEqual(baseEnginesForMachine('TS 1385'), [], 'TS1385 não é TS138');
    assert.deepEqual(baseEnginesForMachine('LTH18420'), []);
  });

  it('o IPL manda: TS138 tem motor por PNC e o par do dono (HS452) não duplica o HS452AE', () => {
    const ts = baseEnginesForMachine('TS138');
    assert.ok(ts.some(item => item.model === 'HS452AE' && item.machinePnc === '96041042900'));
    assert.ok(ts.some(item => item.model === 'HS608' && item.machinePnc === '96041045600'));
    assert.equal(ts.filter(item => item.model.startsWith('HS452')).length, 1);
  });

  it('Briggs sai sem o prefixo "Motor Briggs", e o mesmo motor guardado de três jeitos aparece uma vez', () => {
    const lc = baseEnginesForMachine('LC121P');
    assert.deepEqual(lc.map(item => [item.brand, item.searchTerm]), [['Briggs & Stratton', '104M02-0002-F1']]);
  });

  it('só a série (Kawasaki FX730V, Kohler KT740) é SERIE: não finge ser um catálogo que abre', () => {
    const mz = baseEnginesForMachine('MZ54');
    assert.ok(mz.some(item => item.brand === 'Kohler' && item.model === 'KT740' && item.precision === 'SERIE'));
    assert.ok(mz.some(item => item.brand === 'Kawasaki' && item.model === 'FR730V' && item.precision === 'SERIE'));
    assert.equal(baseEnginesForMachine('LTH1842')[0].precision, 'MODELO');
  });

  it('máquina sem vínculo devolve lista vazia, e modelo vazio também', () => {
    assert.deepEqual(baseEnginesForMachine('XYZ999'), []);
    assert.deepEqual(baseEnginesForMachine(''), []);
  });

  it('reconhece a marca pelo formato do modelo', () => {
    assert.equal(engineBrandOf('SV540-3212'), 'Kohler');
    assert.equal(engineBrandOf('KT740'), 'Kohler');
    assert.equal(engineBrandOf('FX921V'), 'Kawasaki');
    assert.equal(engineBrandOf('HV764'), 'Husqvarna');
    assert.equal(engineBrandOf('Motor Briggs 12J902-0118-01'), 'Briggs & Stratton');
    assert.equal(engineBrandOf('algo sem marca'), null);
  });
});

// Textos INVENTADOS no desenho do campo "Motor" da ficha da lista de preços (modelos que não existem).
describe('motor lido da ficha da lista de preços', () => {
  it('código completo vira série + spec de 4 caracteres, sem a letra final', () => {
    const [hint] = enginesFromListingSpec('Kawasaki FX Series - FX999V - FX999VZS01S');
    assert.deepEqual([hint.brand, hint.model, hint.precision, hint.source], ['Kawasaki', 'FX999V-ZS01', 'MODELO', 'LISTA']);
  });

  it('só a série vira SERIE (o catálogo vai perguntar o spec)', () => {
    const hints = enginesFromListingSpec('Kawasaki FS999V - FS Series V-Twin');
    assert.deepEqual(hints.map(item => [item.model, item.precision]), [['FS999V', 'SERIE']]);
  });

  it('a ficha cita duas séries na mesma linha: as duas aparecem, nenhuma é escolhida por nós', () => {
    const hints = enginesFromListingSpec('Kawasaki FS Series V-Twin - FR998V - FS999VLS00S');
    assert.deepEqual(hints.map(item => item.model).sort(), ['FR998V', 'FS999V-LS00']);
  });

  it('texto que não nomeia motor (tipo, ciclo, BLDC) não vira vínculo', () => {
    for (const texto of ['2 tempos', 'Combustão interna', 'BLDC', 'Monocilíndrico, 4 tempos', null, undefined, '']) {
      assert.deepEqual(enginesFromListingSpec(texto), [], String(texto));
    }
  });

  it('Kohler na ficha: só spec de plaqueta (letras, número, hífen, 4 dígitos)', () => {
    assert.deepEqual(enginesFromListingSpec('Kohler Command SV540-3212 V-Twin').map(item => item.model), ['SV540-3212']);
    assert.deepEqual(enginesFromListingSpec('Kohler Command V-Twin'), []);
  });
});

describe('motor citado pelo Portal e junção das fontes', () => {
  const part = (engine: { brand: string | null; model: string | null; modelOnPlate: boolean } | null, servesThisPnc = true) => ({ servesThisPnc, engine });

  it('lê marca e modelo do IPL, só das linhas que servem ao PNC', () => {
    const hints = enginesCitedByPortal({ iplSections: [{ parts: [
      part({ brand: 'BRIGGS', model: '12J902-0118-01', modelOnPlate: false }),
      part({ brand: 'HUSQVARNA', model: 'HS999', modelOnPlate: false }, false),
    ] }] }, '96041042900');
    assert.deepEqual(hints.map(item => [item.brand, item.model, item.source]), [['Briggs & Stratton', '12J902-0118-01', 'PORTAL']]);
  });

  it('"Kawasaki, leia a plaqueta" vira só a marca: sem modelo, sem palpite', () => {
    const [hint] = enginesCitedByPortal({ iplSections: [{ parts: [part({ brand: 'KAWASAKI', model: null, modelOnPlate: true })] }] }, null);
    assert.deepEqual([hint.brand, hint.model, hint.precision], ['Kawasaki', '', 'SO_MARCA']);
  });

  it('a série da ficha e o modelo informado pela loja são o mesmo motor: fica o mais específico, que abre o catálogo', () => {
    const lista = enginesFromListingSpec('Kawasaki FS999V - FS Series V-Twin');
    const loja = [{ brand: 'Kawasaki' as const, model: 'FS999V-AB12', searchTerm: 'FS999V-AB12', machinePnc: null, source: 'DONO' as const, precision: 'MODELO' as const }];
    const merged = mergeEngineHints([], lista, loja);
    assert.deepEqual(merged.map(item => [item.model, item.precision]), [['FS999V-AB12', 'MODELO']]);
  });

  it('o Portal vem primeiro, e o mesmo motor não repete', () => {
    const portal = enginesCitedByPortal({ iplSections: [{ parts: [part({ brand: 'KAWASAKI', model: 'FX999V-ZS01', modelOnPlate: false })] }] }, null);
    const lista = enginesFromListingSpec('Kawasaki FX999V - FX999VZS01S');
    const loja = baseEnginesForMachine('Z460');
    const merged = mergeEngineHints(portal, lista, loja);
    assert.equal(merged[0].source, 'PORTAL');
    assert.equal(merged.filter(item => item.model.startsWith('FX999V')).length, 1);
    assert.ok(merged.some(item => item.source === 'IPL'), 'o vínculo da loja continua, mais abaixo');
  });
});
