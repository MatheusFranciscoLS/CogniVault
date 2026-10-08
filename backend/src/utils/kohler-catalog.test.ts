import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  kohlerEngineUrl,
  normalizeKohlerSpec,
  parseKohlerDrawing,
  parseKohlerEngineHeader,
  parseKohlerGroups,
  parseKohlerHotspots,
  parseKohlerParts,
} from './kohler-catalog';

// HTML e SVG INVENTADOS: só o desenho do desenho de dados (colunas, botões e atributos) é o da página real. Códigos, nomes e
// coordenadas não são de nenhum motor.
const IMG = 'https://partnersportal.kohlerpower.it/servicepartcatalogueimages/gasoline/ZZ000_01.svg';

const row = (pos: string, code: string, substitution: string, name: string, qty: string, note = '') => `
<tr>
  <td scope="row" class="part-finder-hotspotting-position" data-label="${pos}"><span>${pos}</span></td>
  <td></td>
  <td></td>
  <td><div class="d-flex"><span class="d-block text-nowrap">
     ${code}
  </span><img src="https://partnersportal.kohlerpower.it/api/thumbnail/thumbnails?image=x" /></div></td>
  <td class="pdf-export-none">${substitution}</td>
  <td class="part-finder-hotspotting-description"><span>
     ${name}
  </span></td>
  <td class="text-center">${note}</td>
  <td class="text-center">${qty}</td>
  <td class="text-center"></td>
  <td class="text-center pdf-export-none"><button class="btn">Add</button></td>
</tr>`;

const substitutionButton = (label: string, items: string) =>
  `<div><button class="kp-app-btn-link" data-toggle="tooltip" data-html="true" title="&lt;ul class=&quot;text-left&quot;&gt;${items}&lt;/ul&gt;">${label}</button></div>`;

const PAGE = `
<div class="kp-app-secondary-header-item"><span>Spec</span>&nbsp;ZZ100-0001</div>
<div class="kp-app-secondary-header-item"><span>Description</span>&nbsp;ZZ100 - Motor de Teste (ZZ)</div>
<div class="part-finder-menu-item"><button class="btn nav-link open-group-a active" type="button" data-toggle="collapse" data-target="#part-finder-101-nav-item" aria-expanded="true">
   Eixo Teste
</button></div>
<div class="part-finder-menu-item"><button class="btn nav-link open-group-b" type="button" data-toggle="collapse" data-target="#part-finder-102-nav-item">
   Bloco Teste
</button></div>
<img class="img-fluid part-finder-image-with-alternative d-none" src="${IMG}" alt="Eixo Teste"/>
<div class="kp-app-part-table-container"><div class="kp-app-part-table-title"><div class="d-flex"><h4>Eixo Teste - Group: 01</h4></div></div>
<table><thead><tr><th>Pos</th></tr></thead><tbody>
${row('1', '00 000 01-S', '', 'EIXO COMPLETO', '1')}
${row('2', '00 000 02-S',
  substitutionButton('replaces', '&lt;li&gt;00 000 90-S [PINO, USE 00 000 02-S]&lt;/li&gt;&lt;li&gt;00 000 91-S&lt;/li&gt;')
  + substitutionButton('replaced by', '&lt;li&gt;DISC. [not available]&lt;/li&gt;'),
  'PINO DE TESTE-(#DSC)', '2', 'ver nota')}
${row('3', '00 000 03-S', substitutionButton('replaced by', '&lt;li&gt;00 000 04-S&lt;/li&gt;'), 'ANEL', '4')}
</tbody></table></div>`;

describe('catálogo Kohler: leitura do HTML', () => {
  it('lê spec e descrição do cabeçalho', () => {
    assert.deepEqual(parseKohlerEngineHeader(PAGE), { spec: 'ZZ100-0001', description: 'ZZ100 - Motor de Teste (ZZ)' });
    assert.equal(parseKohlerEngineHeader('<html>sem cabeçalho</html>'), null);
  });

  it('lê os grupos do motor com o código de grupo', () => {
    assert.deepEqual(parseKohlerGroups(PAGE), [
      { sectionId: '101', groupCode: '01', name: 'Eixo Teste' },
      { sectionId: '102', groupCode: '02', name: 'Bloco Teste' },
    ]);
  });

  it('lê as peças: posição, código, nome, quantidade e nota', () => {
    const parts = parseKohlerParts(PAGE);
    assert.equal(parts.length, 3);
    assert.deepEqual(
      [parts[0].position, parts[0].partNumber, parts[0].name, parts[0].quantity, parts[0].note],
      ['1', '00 000 01-S', 'EIXO COMPLETO', 1, null],
    );
    assert.equal(parts[1].quantity, 2);
    assert.equal(parts[1].note, 'ver nota');
  });

  it('substituição: o que o código troca e por quem foi trocado; "DISC." vira descontinuada, não código', () => {
    const [, second, third] = parseKohlerParts(PAGE);
    assert.deepEqual(second.replaces, [{ code: '00 000 90-S', note: 'PINO, USE 00 000 02-S' }, { code: '00 000 91-S', note: null }]);
    assert.equal(second.discontinued, true);
    assert.deepEqual(second.replacedBy, [], 'a Kohler escreve "DISC. [not available]": não é um código para pedir');
    assert.deepEqual(third.replacedBy, [{ code: '00 000 04-S', note: null }]);
    assert.equal(third.discontinued, false);
  });

  it('desenho: título do grupo e imagem; imagem "não disponível" ou de outro domínio não serve de vista explodida', () => {
    assert.deepEqual(parseKohlerDrawing(PAGE), { title: 'Eixo Teste - Group: 01', imageUrl: IMG });
    const semImagem = PAGE.replace(IMG, 'https://partnersportal.kohlerpower.it/servicepartcatalogueimages/gasoline/ImageNotAvailable.svg');
    assert.equal(parseKohlerDrawing(semImagem).imageUrl, null);
    assert.equal(parseKohlerDrawing(PAGE.replace(IMG, 'https://atacante.example.com/x.svg')).imageUrl, null);
  });

  it('página sem tabela devolve lista vazia, sem lançar', () => {
    assert.deepEqual(parseKohlerParts('<html></html>'), []);
    assert.deepEqual(parseKohlerGroups('<html></html>'), []);
  });
});

describe('catálogo Kohler: posições do desenho', () => {
  const SVG = `<svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
<text class="cls-3" transform="translate(0 8.58)">GROUP TITLE</text>
<text class="cls-6" transform="translate(100 100)">5</text>
<text class="cls-6" transform="translate(200 50)">12</text>
<text class="cls-6" transform="translate(900 50)">7</text></svg>`;

  it('converte o número do desenho em porcentagem do viewBox, ignorando texto que não é número e o que cai fora', () => {
    const { hotspots, width, height } = parseKohlerHotspots(SVG);
    assert.equal(width, 400);
    assert.equal(height, 200);
    assert.deepEqual(hotspots.map(spot => spot.position), ['5', '12'], 'o título e o número fora do desenho não viram posição');
    const five = hotspots.find(spot => spot.position === '5')!;
    assert.ok(five.left > 25 && five.left < 27, `esquerda ${five.left}`);
    assert.ok(five.top > 48 && five.top < 51, `topo ${five.top}`);
  });

  it('sem viewBox não marca nada: marcar sem escala é adivinhar a posição', () => {
    assert.deepEqual(parseKohlerHotspots('<svg><text transform="translate(1 1)">5</text></svg>').hotspots, []);
  });
});

describe('catálogo Kohler: spec e endereço', () => {
  it('aceita o spec da plaqueta e recusa formato Briggs, Kawasaki e texto livre', () => {
    assert.equal(normalizeKohlerSpec(' sv540-3212 '), 'SV540-3212');
    assert.equal(normalizeKohlerSpec('CH740-0001'), 'CH740-0001');
    assert.equal(normalizeKohlerSpec('104M02-0002-F1'), null, 'Briggs começa por dígito');
    assert.equal(normalizeKohlerSpec('FX921V-ES06'), null, 'Kawasaki termina em letras');
    assert.equal(normalizeKohlerSpec('SV540'), null, 'só a série não é catálogo');
    assert.equal(normalizeKohlerSpec('../../etc'), null);
  });

  it('o endereço leva o spec escapado e só o domínio da Kohler', () => {
    const url = kohlerEngineUrl('SV540-3212', '101', '01');
    assert.equal(new URL(url).hostname, 'partnersportal.kohlerpower.it');
    assert.equal(new URL(url).searchParams.get('EngineMatNumber'), 'SV540-3212');
    assert.equal(new URL(url).searchParams.get('SectionId'), '101');
  });
});
