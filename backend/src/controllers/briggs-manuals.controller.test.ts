import assert from 'node:assert/strict';
import test, { TestContext } from 'node:test';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { BriggsManualsController } from './briggs-manuals.controller';
import { BriggsManualsService } from '../services/briggs-manuals.service';
import type { BriggsManualsResult } from '../utils/briggs-manuals';

const VIEWER = 'https://www.thepowerportal.com/ipls/ipl.htm?md=';

const comIngles: BriggsManualsResult = {
  model: '12J902-0118-01',
  hasEnglish: true,
  partsManuals: [
    { language: 'English', languageLabel: 'inglês', url: `${VIEWER}12J902011801~_IPLURL_LO.pdf` },
    { language: 'Chinese', languageLabel: 'chinês', url: `${VIEWER}12J902011801~ZH_IPLURL_LO.pdf` },
  ],
};

const soChines: BriggsManualsResult = {
  model: '103M02-0027-H1',
  hasEnglish: false,
  partsManuals: [
    { language: 'Chinese', languageLabel: 'chinês', url: `${VIEWER}103M020027H1~ZH_IPLURL_LO.pdf` },
  ],
};

const vazio: BriggsManualsResult = { model: 'X', hasEnglish: false, partsManuals: [] };

function stub(t: TestContext, resultado: BriggsManualsResult) {
  return t.mock.method(BriggsManualsService, 'forModel', async () => resultado);
}

async function abrir(model: string) {
  let status = 200;
  let redirectStatus: number | null = null;
  let redirectUrl: string | null = null;
  let body: any;
  const res = {
    status(value: number) { status = value; return this; },
    json(value: unknown) { body = value; return this; },
    set() { return this; },
    redirect(code: number, url: string) { redirectStatus = code; redirectUrl = url; },
  };
  await new BriggsManualsController().openPartsManual(
    { query: { model }, user: { id: 'u', role: 'ADMIN', tenantId: 't' } } as unknown as AuthenticatedRequest,
    res as unknown as Response,
  );
  return { status, redirectStatus, redirectUrl, body };
}

async function listar(model: string) {
  let body: any;
  const res = { set() { return this; }, json(value: unknown) { body = value; return this; } };
  await new BriggsManualsController().partsManuals(
    { query: { model }, user: { id: 'u', role: 'ADMIN', tenantId: 't' } } as unknown as AuthenticatedRequest,
    res as unknown as Response,
  );
  return body;
}

test('abrir redireciona para a lista em INGLÊS quando ela existe', async t => {
  stub(t, comIngles);
  const { redirectStatus, redirectUrl } = await abrir('12J902-0118-01');
  assert.equal(redirectStatus, 302);
  assert.equal(redirectUrl, `${VIEWER}12J902011801~_IPLURL_LO.pdf`);
});

test('sem inglês, abre o idioma que existe em vez de não abrir nada', async t => {
  // O dono: *"se não tiver o inglês e outra língua eu tenho que abrir igual
  // para ver o código e ver o preço"*.
  stub(t, soChines);
  const { redirectStatus, redirectUrl } = await abrir('103M02-0027-H1');
  assert.equal(redirectStatus, 302);
  assert.equal(redirectUrl, `${VIEWER}103M020027H1~ZH_IPLURL_LO.pdf`);
});

test('motor sem lista de peças responde 404, não um redirect para lugar nenhum', async t => {
  stub(t, vazio);
  const { status, redirectStatus, body } = await abrir('X');
  assert.equal(status, 404);
  assert.equal(redirectStatus, null);
  assert.match(body.error, /não publica lista de peças/i);
});

test('não redireciona para fora do visualizador da Briggs', async t => {
  // A guarda está no caminho de saída de propósito: é o último ponto antes de
  // o navegador do balcão seguir o redirect, e redirecionar para o que vier é
  // open redirect.
  t.mock.method(BriggsManualsService, 'forModel', async () => ({
    model: 'X',
    hasEnglish: true,
    partsManuals: [{ language: 'English', languageLabel: 'inglês', url: 'https://atacante.net/a.pdf' }],
  } as BriggsManualsResult));
  const { status, redirectStatus } = await abrir('X');
  assert.equal(status, 404);
  assert.equal(redirectStatus, null);
});

test('a listagem devolve os idiomas e 200 mesmo sem catálogo', async t => {
  stub(t, comIngles);
  const comDados = await listar('12J902-0118-01');
  assert.equal(comDados.briggs.hasEnglish, true);
  assert.equal(comDados.briggs.partsManuals.length, 2);

  // Sem catálogo é 200 com lista vazia, não erro: o balcão não tem o que fazer
  // com um erro aqui — ou aparece o botão, ou a tela diz que não existe.
  t.mock.restoreAll();
  stub(t, vazio);
  const semDados = await listar('X');
  assert.deepEqual(semDados.briggs.partsManuals, []);
});
