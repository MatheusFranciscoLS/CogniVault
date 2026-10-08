import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { baseEnginesForMachine, engineBrandOf } from './machine-base-engine';

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
