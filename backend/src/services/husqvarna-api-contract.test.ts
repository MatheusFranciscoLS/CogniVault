import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

// Em 2026-10-07 a Husqvarna removeu `mainImageData` da API pública do portal e deixou só `mainImage`
// (CdnImage: url, altText). A API recusa a consulta INTEIRA quando ela pede um campo que não existe
// ("Cannot query field 'mainImageData' on type 'Machine'"), então a busca de máquina voltou vazia e o detalhe da
// máquina voltou sem vistas explodidas. Foi achado pelo roteiro de testes da tela, não por erro no log.
//
// Este teste lê o texto das consultas: nenhuma pode voltar a pedir o campo que não existe mais. (Como o
// `source-safety.test.ts`, lê `src/` a partir da pasta do backend, onde os testes rodam.)
const serviceFile = (nome: string) => readFileSync(join(process.cwd(), 'src', 'services', nome), 'utf8');

const ARQUIVOS_COM_CONSULTA = [
  'husqvarna-official-detail.service.ts',
  'husqvarna-product-search.service.ts',
  'husqvarna-portal-graphql.service.ts',
];

test('nenhuma consulta ao portal da Husqvarna pede o campo removido `mainImageData`', () => {
  for (const nome of ARQUIVOS_COM_CONSULTA) {
    assert.ok(!/mainImageData/.test(serviceFile(nome)), `${nome} ainda pede mainImageData: a API recusaria a consulta inteira`);
  }
});

test('as consultas que trazem foto usam `mainImage { url ... }`', () => {
  assert.match(serviceFile('husqvarna-product-search.service.ts'), /mainImage \{ url altText \}/);
  assert.match(serviceFile('husqvarna-official-detail.service.ts'), /mainImage \{ url/);
});
