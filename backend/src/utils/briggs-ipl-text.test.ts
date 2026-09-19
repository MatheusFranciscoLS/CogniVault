import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBriggsIplText, briggsDeclineLabel } from './briggs-ipl-text';

// Recortes REAIS do texto extraído dos PDFs da Briggs, capturados em
// 2026-09-19. Encurtados, mas com a estrutura exata — inclusive a coluna QTY
// que aparece em alguns modelos e não em outros, e o qualificador na linha
// seguinte.

/** Gera linhas de peça suficientes para passar do piso de 20. */
function linhas(quantas: number, comQty = false): string {
  return Array.from({ length: quantas }, (_, i) => {
    const pos = 100 + i;
    const codigo = 590500 + i;
    return comQty ? `${pos} ${codigo} 1 SCREW` : `${pos} ${codigo} SCREW`;
  }).join('\n');
}

const SEM_QTY = `Parts Manual\tParts Manual
Mfg. No: 104M02-0002-F1
Copyright © Briggs & Stratton. All Rights reserved 19-Sep-2026

-- 4 of 23 --

Air Cleaner, Cylinder Head\t
Air Cleaner, Cylinder Head
REF NO\tREF NO PART NO\tPART NO QTY\tQTY DESCRIPTION\tDESCRIPTION
5 595353 HEAD, Cylinder
7 592358 GASKET, Cylinder Head
13 590512 SCREW
-(Cylinder Head)
35 590532 SPRING, Valve
-(Intake)
192 590535 ADJUSTER. Rocker Arm
${linhas(20)}
`;

const COM_QTY = `Parts Manual
Mfg. No: 09P702-0212-F1

Air Cleaner, Cylinder Head
REF NO\tPART NO\tQTY\tDESCRIPTION
7 799586 1 GASKET, Cylinder Head
22 692551 6 SCREW
3 299819S 1 SEAL, Oil
${linhas(20, true)}
`;

const CHINES = `-- 1 of 20 --
缸体组件
1 594100 缸体组件
3 299819S 海豹油
${Array.from({ length: 25 }, (_, i) => `${200 + i} ${591000 + i} 海豹油`).join('\n')}
`;

test('aceita o Parts Manual e lê posição, código e descrição', () => {
  const r = analyzeBriggsIplText(SEM_QTY, '104M02-0002-F1');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.model, '104M02-0002-F1');

  const junta = r.parts.find(part => part.partNumber === '592358');
  assert.deepEqual(junta, {
    position: '7',
    partNumber: '592358',
    name: 'GASKET, Cylinder Head',
    quantity: null,
    section: 'Air Cleaner, Cylinder Head',
    qualifier: null,
    notes: [],
  });
});

test('a coluna QTY é opcional — e ausente é null, nunca 1', () => {
  // Medido: `104M02-0002-F1` não traz QTY em nenhuma linha; `09P702-0212-F1`
  // traz em 53 de 131. Afirmar "1" onde a fonte não diz seria inventar número.
  const semQty = analyzeBriggsIplText(SEM_QTY, '104M02-0002-F1');
  const comQty = analyzeBriggsIplText(COM_QTY, '09P702-0212-F1');
  assert.equal(semQty.ok && comQty.ok, true);
  if (!semQty.ok || !comQty.ok) return;

  assert.equal(semQty.parts.every(part => part.quantity === null), true);
  assert.equal(comQty.parts.find(part => part.partNumber === '692551')?.quantity, 6);
  assert.equal(comQty.parts.find(part => part.partNumber === '799586')?.quantity, 1);
});

test('quantidade de 1 dígito não é confundida com código', () => {
  // `22 692551 6 SCREW` tem três números. O código é o de 5–7 dígitos; o `6` é
  // quantidade. Ler errado aqui entregaria "6" como código de peça.
  const r = analyzeBriggsIplText(COM_QTY, '09P702-0212-F1');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const linha = r.parts.find(part => part.position === '22');
  assert.equal(linha?.partNumber, '692551');
  assert.equal(linha?.name, 'SCREW');
});

test('código com sufixo de letra é preservado', () => {
  const r = analyzeBriggsIplText(COM_QTY, '09P702-0212-F1');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.parts.some(part => part.partNumber === '299819S'), true);
});

test('o qualificador da linha seguinte fica na peça', () => {
  // `-(Intake)` diz QUAL das duas molas de válvula é aquela. Perder isso faria
  // as duas parecerem a mesma peça.
  const r = analyzeBriggsIplText(SEM_QTY, '104M02-0002-F1');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.parts.find(part => part.position === '13')?.qualifier, 'Cylinder Head');
  assert.equal(r.parts.find(part => part.position === '35')?.qualifier, 'Intake');
});

test('o conjunto da página fica na peça', () => {
  const r = analyzeBriggsIplText(SEM_QTY, '104M02-0002-F1');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.parts.every(part => part.section === 'Air Cleaner, Cylinder Head'), true);
});

test('PDF sem camada de texto recusa dizendo que é digitalizado', () => {
  // Distinguir isto de "li mas não reconheci" é o que separa limite da fonte
  // de lacuna do parser — a mesma distinção do extrator de catálogo.
  for (const texto of ['', '   ', 'abc', 'x'.repeat(199)]) {
    const r = analyzeBriggsIplText(texto);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, 'NO_TEXT_LAYER', JSON.stringify(texto.slice(0, 12)));
  }
});

test('texto sem assinatura de Parts Manual é recusado', () => {
  const r = analyzeBriggsIplText('lorem ipsum '.repeat(40));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'NO_SIGNATURE');
});

test('PDF que não diz de que motor é NÃO é aceito', () => {
  // Sem saber o motor, a lista não vale: ela pode ser de qualquer um. É o caso
  // real do PDF chinês, que não traz `Mfg. No:`.
  const semModelo = `Parts Manual\nREF NO PART NO QTY DESCRIPTION\n${linhas(25)}\n`;
  const r = analyzeBriggsIplText(semModelo);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'NO_MODEL');
});

test('PDF de OUTRO motor é recusado em vez de entregue', () => {
  // A URL do visualizador é montada do modelo. Se ela devolver o PDF errado, a
  // lista chegaria com aparência de certa — este é o caso mais perigoso.
  const r = analyzeBriggsIplText(SEM_QTY, '12J902-0118-01');
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, 'MODEL_MISMATCH');
    assert.equal((r.detail as { noPdf?: string }).noPdf, '104M02-0002-F1');
  }
});

test('o modelo é comparado sem pontuação, como o balcão digita', () => {
  for (const pedido of ['104M02-0002-F1', '104M020002F1', '104m02 0002 f1']) {
    assert.equal(analyzeBriggsIplText(SEM_QTY, pedido).ok, true, pedido);
  }
});

test('poucas linhas é recusa, não entrega parcial', () => {
  // Mesmo espírito do `MIN_CATALOG_OCCURRENCES`: tabela pequena é onde o falso
  // positivo mora. Os PDFs reais trazem 155–283 linhas.
  // O preenchimento existe para o texto passar do piso de 200 caracteres: sem
  // ele a recusa vira `NO_TEXT_LAYER` e o teste não exercita o piso de linhas.
  const poucas = `Parts Manual
Mfg. No: 104M02-0002-F1
Table Of Contents
${'Air Cleaner, Cylinder Head '.repeat(8)}
REF NO PART NO QTY DESCRIPTION
${linhas(5)}
`;
  const r = analyzeBriggsIplText(poucas, '104M02-0002-F1');
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, 'TOO_FEW_ROWS');
    assert.equal((r.detail as { rows?: number }).rows, 5);
  }
});

test('assinatura reconhecida sem nenhuma linha recusa com NO_ROWS', () => {
  const vazio = `Parts Manual\nMfg. No: 104M02-0002-F1\nREF NO PART NO QTY DESCRIPTION\nTable Of Contents\n${'texto solto '.repeat(30)}`;
  const r = analyzeBriggsIplText(vazio, '104M02-0002-F1');
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'NO_ROWS');
});

test('descrição em outro alfabeto é recusada — o balcão não confere', () => {
  // O código pode até estar certo, mas a descrição existe para o atendente
  // conferir se é a peça pedida. Em chinês ele não consegue, e o PDF continua
  // valendo como vista explodida.
  const comAssinatura = `Parts Manual\nMfg. No: 103M02-0027-H1\nREF NO PART NO\n${CHINES}`;
  const r = analyzeBriggsIplText(comAssinatura, '103M02-0027-H1');
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'NOT_LATIN');
});

test('código implausível não entra na lista', () => {
  // `isPlausiblePartNumber` é a mesma regra que barra a gravação de peça no
  // `ai.service`. Aqui ela age antes de a linha existir.
  const comLixo = `Parts Manual
Mfg. No: 104M02-0002-F1
REF NO PART NO
5 12345 OK CURTO DEMAIS
${linhas(25)}
`;
  const r = analyzeBriggsIplText(comLixo, '104M02-0002-F1');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // 12345 tem 5 dígitos e passa (Briggs usa 5–6); o que este teste trava é que
  // a lista só contém códigos que a regra aceita.
  assert.equal(r.parts.every(part => /^\d{5,7}[A-Z]?$/.test(part.partNumber)), true);
});

test('a mesma posição e código não entram duas vezes', () => {
  const repetido = `Parts Manual
Mfg. No: 104M02-0002-F1
REF NO PART NO
5 595353 HEAD, Cylinder
5 595353 HEAD, Cylinder
${linhas(25)}
`;
  const r = analyzeBriggsIplText(repetido, '104M02-0002-F1');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.parts.filter(part => part.partNumber === '595353').length, 1);
});

// ---------------------------------------------------------------------------
// Avisos do IPL. Todos os textos abaixo são recortes REAIS do
// `104M02-0002-F1`, capturados em 2026-09-19.
// ---------------------------------------------------------------------------

const COM_AVISOS = `Parts Manual
Mfg. No: 104M02-0002-F1
REF NO\tPART NO\tDESCRIPTION
209 590541 SPRING, Governor
-Used Before Code Date 17092700
209 596459 SPRING, Governor
-Used After Code Date 17092600
300F 596511 MUFFLER
-Used Before Code Date 26080500 (No Longer Available) (See Reference 300D
for Service)
608B 84013129 STARTER, Rewind
-(Must Be Replaced As A Kit)
455B 84013130 CUP, Flywheel
-(Only For Use With Reference 608B)
${linhas(20)}
`;

test('duas peças na MESMA posição se distinguem pelo code date', () => {
  // O caso mais caro do catálogo Briggs: as duas molas aparecem idênticas na
  // tela, e o que decide qual serve é a data gravada no motor. Sem o aviso,
  // metade das vendas sai errada.
  const r = analyzeBriggsIplText(COM_AVISOS, '104M02-0002-F1');
  assert.equal(r.ok, true);
  if (!r.ok) return;

  const molas = r.parts.filter(part => part.position === '209');
  assert.equal(molas.length, 2);
  assert.deepEqual(molas.find(m => m.partNumber === '590541')?.notes, [
    { kind: 'CODE_DATE_BEFORE', codeDate: '17092700' },
  ]);
  assert.deepEqual(molas.find(m => m.partNumber === '596459')?.notes, [
    { kind: 'CODE_DATE_AFTER', codeDate: '17092600' },
  ]);
});

test('peça fora de linha vem com o substituto, mesmo com o aviso quebrado em duas linhas', () => {
  // O texto real quebra no meio do parêntese: "(See Reference 300D" numa linha
  // e "for Service)" na outra. Sem juntar, some justamente o substituto.
  const r = analyzeBriggsIplText(COM_AVISOS, '104M02-0002-F1');
  assert.equal(r.ok, true);
  if (!r.ok) return;

  const fora = r.parts.find(part => part.partNumber === '596511');
  assert.deepEqual(fora?.notes, [
    { kind: 'CODE_DATE_BEFORE', codeDate: '26080500' },
    { kind: 'DISCONTINUED' },
    { kind: 'SEE_REFERENCE', position: '300D' },
  ]);
});

test('kit e peça casada também viram aviso', () => {
  const r = analyzeBriggsIplText(COM_AVISOS, '104M02-0002-F1');
  assert.equal(r.ok, true);
  if (!r.ok) return;

  assert.deepEqual(r.parts.find(part => part.partNumber === '84013129')?.notes, [{ kind: 'KIT_ONLY' }]);
  assert.deepEqual(r.parts.find(part => part.partNumber === '84013130')?.notes, [
    { kind: 'ONLY_WITH', position: '608B' },
  ]);
});

test('código de 8 dígitos entra — o teto de 7 descartava peça de verdade', () => {
  // Medido no IPL real: 4 peças perdidas por catálogo, e não eram parafusos —
  // motor de partida, tanque, tampa de tanque e copo do volante.
  const r = analyzeBriggsIplText(COM_AVISOS, '104M02-0002-F1');
  assert.equal(r.ok, true);
  if (!r.ok) return;

  assert.equal(r.parts.some(part => part.partNumber === '84013129'), true);
  assert.equal(r.parts.some(part => part.partNumber === '84013130'), true);
});

test('qualificador simples continua desembrulhado, como antes', () => {
  // A mudança do regex não pode alterar o caso comum: `-(Intake)` segue virando
  // `Intake`, sem parênteses e sem virar nota.
  const r = analyzeBriggsIplText(SEM_QTY, '104M02-0002-F1');
  assert.equal(r.ok, true);
  if (!r.ok) return;

  const parafuso = r.parts.find(part => part.position === '13');
  assert.equal(parafuso?.qualifier, 'Cylinder Head');
  assert.deepEqual(parafuso?.notes, []);
});

test('texto que não reconheço não vira aviso inventado', () => {
  // Nota mal interpretada é pior que nota nenhuma, porque parece informação.
  // O texto cru fica em `qualifier`; `notes` só recebe o que casou.
  const estranho = `Parts Manual
Mfg. No: 104M02-0002-F1
REF NO\tPART NO\tDESCRIPTION
5 595353 HEAD, Cylinder
-Alguma observação que o parser não conhece
${linhas(22)}
`;
  const r = analyzeBriggsIplText(estranho, '104M02-0002-F1');
  assert.equal(r.ok, true);
  if (!r.ok) return;

  const cabecote = r.parts.find(part => part.partNumber === '595353');
  assert.equal(cabecote?.qualifier, 'Alguma observação que o parser não conhece');
  assert.deepEqual(cabecote?.notes, []);
});

test('todo motivo de recusa tem rótulo em português', () => {
  const motivos = ['NO_TEXT_LAYER', 'NO_SIGNATURE', 'NO_MODEL', 'MODEL_MISMATCH', 'NO_ROWS', 'TOO_FEW_ROWS', 'NOT_LATIN'] as const;
  for (const motivo of motivos) {
    const rotulo = briggsDeclineLabel(motivo);
    assert.ok(rotulo && rotulo.length > 8, motivo);
    // Em português e sem vazar o nome do enum para a tela do balcão. "PDF" é
    // sigla e fica de fora da checagem.
    assert.equal(/[A-Z_]{4,}/.test(rotulo.replace(/PDF/g, '')), false, motivo);
  }
});
