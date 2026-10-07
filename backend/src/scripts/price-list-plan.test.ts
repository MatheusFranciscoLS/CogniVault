import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePriceListHtml } from './price-list-html';
import { buildNewRecords, sectionLabelFor } from './price-list-plan';

function page(catalog: Record<string, unknown>): string {
  return `<script id="catalogData" type="application/json">${JSON.stringify(catalog)}</script>`;
}
const empty = { pecas: [], acessorios: [], lubrificantes: [], ferramentas: [] };

test('categorias reaproveitam os nomes da planilha antiga', () => {
  assert.equal(sectionLabelFor('pecas', 'COMBUSTÃO', 'MOTOSSERRA'), 'PEÇAS DE REPOSIÇÃO GERAL');
  assert.equal(sectionLabelFor('pecas', 'BATERIA', 'MOTOSSERRA'), 'PEÇAS PARA PRODUTOS A BATERIA');
  assert.equal(sectionLabelFor('pecas', 'ROBÔ', 'AUTOMOWER'), 'PEÇAS PARA CORTADORES DE GRAMA AUTOMOWER');
  assert.equal(sectionLabelFor('pecas', 'COMBUSTÃO', 'GIRO ZERO'), 'PEÇAS PARA CORTADORES DE GRAMA GIRO ZERO');
  assert.equal(sectionLabelFor('ferramentas', null, 'AFIAÇÃO'), 'FERRAMENTAS');
  assert.equal(sectionLabelFor('acessorios', 'COMBUSTÃO', 'MOTOSSERRA'), 'ACESSÓRIOS');
  assert.equal(sectionLabelFor('lubrificantes', null, 'GRAXA'), 'LUBRIFICANTES');
});

test('código novo ganha preço comercial (÷ 0,92), marca e uma aplicação por modelo', () => {
  const { items } = parsePriceListHtml(
    page({
      ...empty,
      pecas: [
        { codigo: '505283309', descricao: 'ABRACADEIRA', preco: 'R$ 22,00', modelo: '365', categoria: 'MOTOSSERRA', tecnologia: 'COMBUSTÃO' },
        { codigo: '505283309', descricao: 'ABRACADEIRA', preco: 'R$ 22,00', modelo: '372XP', categoria: 'MOTOSSERRA', tecnologia: 'COMBUSTÃO' },
        { codigo: '505283309', descricao: 'ABRACADEIRA', preco: 'R$ 22,00', modelo: '365', categoria: 'MOTOSSERRA', tecnologia: 'COMBUSTÃO' },
      ],
    }),
  );
  const { masters, sections } = buildNewRecords(items);

  assert.equal(masters.length, 1);
  assert.equal(masters[0].price, 23.91, 'R$ 22,00 → R$ 23,91, o exemplo conferido com o Portal Parceiro');
  assert.equal(masters[0].brand, 'HUSQVARNA');
  assert.equal(masters[0].category, 'PEÇAS DE REPOSIÇÃO GERAL');
  assert.deepEqual(sections.map(s => s.applicationKey).sort(), ['365', '372XP']);
  assert.ok(sections.every(s => s.sourceSheet.startsWith('LISTA_HTML')));
});

test('aplicação ausente vira chave vazia, igual ao banco', () => {
  const { items } = parsePriceListHtml(
    page({ ...empty, lubrificantes: [{ codigo: '598592101', descricao: 'GRAXA', preco: 'R$ 51,99', categoria: 'GRAXA' }] }),
  );
  const { masters, sections } = buildNewRecords(items);
  assert.equal(masters[0].category, 'LUBRIFICANTES');
  assert.equal(sections[0].applicationKey, '');
  assert.equal(sections[0].application, null);
});
