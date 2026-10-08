import assert from 'node:assert/strict';
import test, { TestContext } from 'node:test';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { BriggsManualsController } from './briggs-manuals.controller';
import { BriggsManualsService } from '../services/briggs-manuals.service';
import { BriggsIplService } from '../services/briggs-ipl.service';
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
  let sent: Buffer | null = null;
  let headers: Record<string, string> = {};
  const res = {
    status(value: number) { status = value; return this; },
    json(value: unknown) { body = value; return this; },
    set(value: Record<string, string>) { headers = { ...headers, ...(value ?? {}) }; return this; },
    send(value: Buffer) { sent = value; return this; },
    redirect(code: number, url: string) { redirectStatus = code; redirectUrl = url; },
  };
  await new BriggsManualsController().openPartsManual(
    { query: { model }, user: { id: 'u', role: 'ADMIN', tenantId: 't' } } as unknown as AuthenticatedRequest,
    res as unknown as Response,
  );
  return { status, redirectStatus, redirectUrl, body, sent: sent as Buffer | null, headers };
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

const PDF = Buffer.from('%PDF-1.4 teste');

test('abrir ENTREGA o PDF da lista em INGLÊS pela origem do app, sem redirecionar', async t => {
  stub(t, comIngles);
  const pdfFor = t.mock.method(BriggsIplService, 'pdfFor', async () => PDF);
  const { redirectStatus, sent, headers } = await abrir('12J902-0118-01');
  assert.equal(redirectStatus, null, 'o redirect caía no site da Briggs no navegador do dono');
  assert.equal(pdfFor.mock.calls[0].arguments[0], `${VIEWER}12J902011801~_IPLURL_LO.pdf`);
  assert.equal(sent, PDF);
  assert.equal(headers['Content-Type'], 'application/pdf');
  assert.match(headers['Content-Disposition'], /^inline; filename="Lista-de-pecas-12J902-0118-01.pdf"$/);
});

test('sem inglês, entrega o idioma que existe em vez de não abrir nada', async t => {
  // O dono: *"se não tiver o inglês e outra língua eu tenho que abrir igual
  // para ver o código e ver o preço"*.
  stub(t, soChines);
  const pdfFor = t.mock.method(BriggsIplService, 'pdfFor', async () => PDF);
  const { sent } = await abrir('103M02-0027-H1');
  assert.equal(pdfFor.mock.calls[0].arguments[0], `${VIEWER}103M020027H1~ZH_IPLURL_LO.pdf`);
  assert.equal(sent, PDF);
});

test('se a Briggs não devolve um PDF, o balcão vai para "Todos os manuais" do motor, não para um beco sem saída', async t => {
  stub(t, comIngles);
  t.mock.method(BriggsIplService, 'pdfFor', async () => null);
  const { redirectStatus, redirectUrl, sent } = await abrir('12J902-0118-01');
  assert.equal(sent, null);
  assert.equal(redirectStatus, 302);
  assert.ok(String(redirectUrl).startsWith('https://www.briggsandstratton.com/pt-br/support/manuals/results?search='));
});

test('motor sem lista de peças responde 404, não um redirect para lugar nenhum', async t => {
  stub(t, vazio);
  const { status, redirectStatus, body } = await abrir('X');
  assert.equal(status, 404);
  assert.equal(redirectStatus, null);
  assert.match(body.error, /não publica lista de peças/i);
});

test('não busca nem redireciona para fora do visualizador da Briggs', async t => {
  // A guarda está no caminho de saída de propósito: é o último ponto antes de
  // o servidor buscar a URL, e seguir o que vier é open redirect / SSRF.
  t.mock.method(BriggsManualsService, 'forModel', async () => ({
    model: 'X',
    hasEnglish: true,
    partsManuals: [{ language: 'English', languageLabel: 'inglês', url: 'https://atacante.net/a.pdf' }],
  } as BriggsManualsResult));
  const pdfFor = t.mock.method(BriggsIplService, 'pdfFor', async () => PDF);
  const { status, redirectStatus, sent } = await abrir('X');
  assert.equal(status, 404);
  assert.equal(redirectStatus, null);
  assert.equal(sent, null);
  assert.equal(pdfFor.mock.callCount(), 0, 'a URL de terceiro nunca é baixada');

  const comModelo = await abrir('12J902-0118-01');
  assert.equal(pdfFor.mock.callCount(), 0);
  assert.equal(new URL(String(comModelo.redirectUrl)).hostname, 'www.briggsandstratton.com', 'o único destino possível é o site da Briggs');
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
