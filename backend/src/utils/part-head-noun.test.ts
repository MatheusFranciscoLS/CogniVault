import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isHeadNounMatch,
  isQualifierOnlyMatch,
  partHeadNoun,
  partHeadNounDetailed,
} from './part-head-noun';

// Descrições reais, colhidas da fonte:
// Kawasaki FX921V-ES06, conjunto CARBURETOR(1/2);
// Husqvarna HS 608 (artigo 970710701), seção CARBURADOR.

test('o caso que o dono corrigiu: junta não é carburador', () => {
  assert.equal(partHeadNoun('CARBURETOR-ASSY'), 'CARBURETOR');
  assert.equal(partHeadNoun('GASKET,CARBURETOR'), 'GASKET');
  assert.equal(partHeadNoun('GASKET,SCREW-CARBURETOR'), 'GASKET');
  assert.equal(partHeadNoun('GASKET,CARB SPACER'), 'GASKET');

  // Quem pede carburador tem que receber o 15004-0937 (CARBURETOR-ASSY),
  // nunca o 11061-7038 (GASKET,CARBURETOR).
  assert.equal(isHeadNounMatch(['carburador', 'carburetor'], 'CARBURETOR-ASSY'), true, 'o balcão digita em português e o catálogo responde em inglês');
  assert.equal(isHeadNounMatch(['carburador', 'carburetor'], 'GASKET,CARBURETOR'), false, 'com sinônimo e tudo, junta continua não sendo carburador');
  assert.equal(isHeadNounMatch('carburetor', 'CARBURETOR-ASSY'), true);
  assert.equal(isHeadNounMatch('carburetor', 'GASKET,CARBURETOR'), false);
  assert.equal(isQualifierOnlyMatch('carburetor', 'GASKET,CARBURETOR'), true);
  assert.equal(isQualifierOnlyMatch('carburetor', 'CARBURETOR-ASSY'), false);
});

test('válvula do carburador também não é o carburador', () => {
  assert.equal(partHeadNoun('VALVE-THROTTLE'), 'VALVE');
  assert.equal(partHeadNoun('VALVE-FLOAT'), 'VALVE');
  assert.equal(isHeadNounMatch('valve', 'VALVE-THROTTLE'), true);
  assert.equal(isHeadNounMatch('throttle', 'VALVE-THROTTLE'), false);
});

test('português põe o principal na frente; inglês, no fim', () => {
  assert.equal(partHeadNoun('JUNTA DO CARBURADOR'), 'JUNTA');
  assert.equal(partHeadNoun('FILTRO DE AR'), 'FILTRO');
  assert.equal(partHeadNoun('BIELA DO ESTRANGULADOR'), 'BIELA');

  assert.equal(partHeadNoun('CARBURETTOR GASKET'), 'GASKET');
  assert.equal(partHeadNoun('CYLINDER HEAD GASKET'), 'GASKET');
  // Ambíguo de propósito: em inglês o principal fica no fim, então a regra
  // devolve BELT de forma consistente. Não vale caso especial para uma
  // descrição que a própria Husqvarna traduz como "ADMINISTRADOR".
  assert.equal(partHeadNoun('KEEPER BELT, ENGINE'), 'BELT');
});

test('palavra de embalagem não é a peça', () => {
  // "conjunto de junta" é junta; "kit de carburador" é carburador.
  assert.equal(partHeadNoun('CONJUNTO DE JUNTA'), 'JUNTA');
  assert.equal(partHeadNoun('CARBURETTOR GASKET KIT'), 'GASKET');
  assert.equal(partHeadNoun('CARBURETTOR KIT'), 'CARBURETTOR');
  assert.equal(partHeadNoun('KIT'), null, 'só embalagem não nomeia peça');
});

test('sufixo de multipack não vira a peça', () => {
  assert.equal(partHeadNoun('CARBURETTOR GASKET - MULTIPACK: 10'), 'GASKET');
  assert.equal(partHeadNoun('PINO T430: M8/6 L=147 - MULTIPACK: 2'), 'PINO');
});

test('descrição de uma palavra é ela mesma', () => {
  assert.equal(partHeadNoun('CARBURADOR'), 'CARBURADOR');
  assert.equal(partHeadNoun('SILENCIADOR'), 'SILENCIADOR');
  assert.equal(partHeadNoun('MOTOR'), 'MOTOR');
  assert.equal(partHeadNoun('carburador'), 'CARBURADOR', 'caixa e acento não mudam o principal');
  assert.equal(partHeadNoun('SOLENÓIDE'), 'SOLENOIDE');
});

test('sem descrição não afirma nada', () => {
  for (const vazio of [null, undefined, '', '   ', '123']) {
    assert.equal(partHeadNoun(vazio), null, String(vazio));
    assert.equal(isHeadNounMatch('carburetor', vazio), null, String(vazio));
    assert.equal(isQualifierOnlyMatch('carburetor', vazio), false, String(vazio));
  }
});

test('termo ausente da descrição não é "só qualificador"', () => {
  // Não mencionar é diferente de mencionar como qualificador: o primeiro é
  // "outra peça", o segundo é a armadilha que o dono apontou.
  assert.equal(isQualifierOnlyMatch('carburetor', 'VALVE-FLOAT'), false);
  assert.equal(isQualifierOnlyMatch('junta', 'CARBURADOR'), false);
});

test('a junta do carburador responde por junta, não por carburador', () => {
  assert.equal(isHeadNounMatch('junta', 'JUNTA DO CARBURADOR'), true);
  assert.equal(isHeadNounMatch('carburador', 'JUNTA DO CARBURADOR'), false);
  assert.equal(isQualifierOnlyMatch('carburador', 'JUNTA DO CARBURADOR'), true);
});

test('as três peças que o dono citou são três peças diferentes', () => {
  // "Válvula e tampa de válvula ou até mesmo junta da tampa de válvula
  //  são 3 peças diferentes."
  assert.equal(partHeadNoun('VÁLVULA'), 'VALVULA');
  assert.equal(partHeadNoun('TAMPA DE VÁLVULA'), 'TAMPA');
  assert.equal(partHeadNoun('JUNTA DA TAMPA DE VÁLVULA'), 'JUNTA');

  // Nenhuma responde pela outra, nos dois sentidos.
  assert.equal(isHeadNounMatch('válvula', 'VÁLVULA'), true);
  assert.equal(isHeadNounMatch('válvula', 'TAMPA DE VÁLVULA'), false);
  assert.equal(isHeadNounMatch('válvula', 'JUNTA DA TAMPA DE VÁLVULA'), false);

  assert.equal(isHeadNounMatch('tampa de válvula', 'TAMPA DE VÁLVULA'), true);
  assert.equal(isHeadNounMatch('tampa de válvula', 'VÁLVULA'), false, 'quem pede a tampa não pode receber a válvula');
  assert.equal(isHeadNounMatch('tampa de válvula', 'JUNTA DA TAMPA DE VÁLVULA'), false);

  assert.equal(isHeadNounMatch('junta da tampa de válvula', 'JUNTA DA TAMPA DE VÁLVULA'), true);
  assert.equal(isHeadNounMatch('junta da tampa de válvula', 'TAMPA DE VÁLVULA'), false);
  assert.equal(isHeadNounMatch('junta da tampa de válvula', 'VÁLVULA'), false);

  // E todas caem como "só qualificador" quando o termo aparece sem ser o principal.
  assert.equal(isQualifierOnlyMatch('válvula', 'TAMPA DE VÁLVULA'), true);
  assert.equal(isQualifierOnlyMatch('válvula', 'JUNTA DA TAMPA DE VÁLVULA'), true);
  assert.equal(isQualifierOnlyMatch('tampa', 'JUNTA DA TAMPA DE VÁLVULA'), true);
});

test('frase em português nomeia a peça no começo, não no fim', () => {
  // Bug que a mensagem do dono me fez achar: aplicar a regra do inglês aqui
  // devolvia "combustível" em vez de "depósito".
  assert.equal(partHeadNoun('CONJ DO DEPÓSITO DE COMBUSTÍVEL'), 'DEPOSITO');
  assert.equal(partHeadNoun('CONJUNTO DO DEPÓSITO DE COMBUSTÍVEL'), 'DEPOSITO');
  assert.equal(partHeadNoun('JUNTA DO CÁRTER'), 'JUNTA');
  assert.equal(partHeadNoun('BOMBA DE COMBUSTÍVEL'), 'BOMBA');
  assert.equal(partHeadNoun('FILTRO DE COMBUSTÍVEL'), 'FILTRO');
  assert.equal(partHeadNoun('MOTOR DE PARTIDA'), 'MOTOR');
  assert.equal(partHeadNoun('CONJ DE MANGUEIRA'), 'MANGUEIRA');
});

test('peças reais das vistas que eu consultei na fonte', () => {
  // Husqvarna HS 608, seção CARBURADOR.
  assert.equal(partHeadNoun('CONJUNTO DE JUNTA'), 'JUNTA');
  assert.equal(partHeadNoun('BIELA DO ESTRANGULADOR'), 'BIELA');
  assert.equal(partHeadNoun('SOLENÓIDE'), 'SOLENOIDE');

  // Husqvarna TS 142, seção MOTOR.
  assert.equal(partHeadNoun('SILENCIADOR'), 'SILENCIADOR');
  assert.equal(partHeadNoun('POLIA'), 'POLIA');
  assert.equal(partHeadNoun('EMBRAIAGEM'), 'EMBRAIAGEM');

  // Kawasaki FX921V-ES06, conjunto CARBURETOR(1/2).
  assert.equal(partHeadNoun('GASKET,CARB SPACER'), 'GASKET');
  assert.equal(partHeadNoun('VALVE-FLOAT'), 'VALVE');

  // Nenhuma dessas responde por carburador.
  for (const outra of ['CONJUNTO DE JUNTA', 'BIELA DO ESTRANGULADOR', 'SOLENÓIDE', 'VALVE-FLOAT', 'GASKET,CARB SPACER']) {
    assert.equal(isHeadNounMatch(['carburador', 'carburetor', 'carburettor'], outra), false, outra);
  }
  // E o carburador de verdade responde, nos dois idiomas.
  assert.equal(isHeadNounMatch(['carburador', 'carburetor', 'carburettor'], 'CARBURADOR'), true);
  assert.equal(isHeadNounMatch(['carburador', 'carburetor', 'carburettor'], 'CARBURETOR-ASSY'), true);
});

test('erros que só a auditoria sobre 292 descrições reais expôs', () => {
  // Ponto separa como vírgula. Isto era grave: quem pedisse silenciador
  // recebia uma CHAPA.
  assert.equal(partHeadNoun('PLATE.MUFFLER'), 'PLATE');
  assert.equal(partHeadNoun('PLATE.CHOKE'), 'PLATE');
  assert.equal(partHeadNoun('LEVER.CHOKE'), 'LEVER');
  assert.equal(isHeadNounMatch(['silenciador', 'muffler'], 'PLATE.MUFFLER'), false);

  // Palavra composta com hífen não se divide.
  assert.equal(partHeadNoun('MICRO-INTERRUPTOR'), 'INTERRUPTOR');
  assert.equal(partHeadNoun('PROTECÇÃO CONTRA-FAÍSCAS'), 'PROTECCAO');

  // Substantivo + adjetivo em português, sem ligação: o vocabulário decide.
  assert.equal(partHeadNoun('PORCA SEXTAVADA'), 'PORCA');
  assert.equal(partHeadNoun('MOLA ESPIRAL'), 'MOLA');
  assert.equal(partHeadNoun('EIXO MOTRIZ'), 'EIXO');
  assert.equal(partHeadNoun('CHAVE FIXA'), 'CHAVE');
  assert.equal(partHeadNoun('TUBO EXTENSOR'), 'TUBO');
  assert.equal(partHeadNoun('MEMBRO CRUZADO'), 'MEMBRO');

  // Código de especificação não é peça.
  assert.equal(partHeadNoun('PARAFUSO IHSCT'), 'PARAFUSO');
  assert.equal(partHeadNoun('PARAFUSO IHSCFM'), 'PARAFUSO');

  // Palavra de posição diz ONDE, não O QUE.
  assert.equal(partHeadNoun('WHEEL ADJ BRACKET FRONT'), 'BRACKET');
  assert.equal(partHeadNoun('SUPORTE TRASEIRO'), 'SUPORTE');
});

test('com duas peças conhecidas na frase, a posição continua decidindo', () => {
  // É o que mantém as três peças do dono separadas: TAMPA e VALVULA são as
  // duas conhecidas, e quem manda é a ligação em português.
  assert.equal(partHeadNoun('TAMPA DE VÁLVULA'), 'TAMPA');
  assert.equal(partHeadNoun('JUNTA DA TAMPA DE VÁLVULA'), 'JUNTA');
  assert.equal(partHeadNoun('CARBURETTOR GASKET'), 'GASKET');
  assert.equal(partHeadNoun('GASKET,CARBURETOR'), 'GASKET');
});

test('vírgula também separa palavra', () => {
  // `CONJ.SUPORTE DA PEGA`: o ponto vira vírgula na normalização, e sem cortar
  // a vírgula o resultado era "CONJ,SUPORTE" — uma palavra que não existe. A
  // peça é o SUPORTE.
  assert.equal(partHeadNoun('CONJ.SUPORTE DA PEGA'), 'SUPORTE');
  assert.equal(partHeadNoun('LABEL,COVER'), 'LABEL');
  assert.equal(partHeadNoun('TUBE ASSY'), 'TUBE');
});

test('palpite de posição não autoriza punição — regressão real da suíte', () => {
  // O inglês é ambíguo aqui, e isso derrubou um teste que já existia:
  //   "Screw Clutch shoe"   -> o principal é o PARAFUSO, na primeira palavra
  //   "CARBURETTOR GASKET"  -> o principal é a JUNTA, na última
  // Mesma estrutura, principais opostos. Punir com base nesse palpite
  // rebaixava a peça CERTA de "parafuso da embreagem".
  assert.equal(partHeadNounDetailed('Screw Clutch shoe').basis, 'positional');
  assert.equal(partHeadNounDetailed('CARBURETTOR GASKET').basis, 'positional');
  assert.equal(isQualifierOnlyMatch(['parafuso', 'screw'], 'Screw Clutch shoe'), false);

  // Já o sinal explícito do catálogo continua autorizando.
  assert.equal(partHeadNounDetailed('GASKET,CARBURETOR').basis, 'explicit');
  assert.equal(partHeadNounDetailed('JUNTA DA TAMPA DE VÁLVULA').basis, 'explicit');
  assert.equal(partHeadNounDetailed('VALVE-THROTTLE').basis, 'explicit');
  assert.equal(partHeadNounDetailed('PLATE.MUFFLER').basis, 'explicit');
  assert.equal(partHeadNounDetailed('PORCA SEXTAVADA').basis, 'explicit');
  assert.equal(isQualifierOnlyMatch(['carburador', 'carburetor'], 'GASKET,CARBURETOR'), true);
  assert.equal(isQualifierOnlyMatch(['silenciador', 'muffler'], 'PLATE.MUFFLER'), true);
});

test('ponto COM espaço também separa qualificador — o formato da Briggs', () => {
  // Medido no PDF do `104M02-0002-F1`: "ADJUSTER. Rocker Arm" caía na regra
  // posicional e devolvia `ARM`. Um ajustador de balancim virava "braço", e
  // quem pedisse braço receberia o ajustador.
  assert.equal(partHeadNoun('ADJUSTER. Rocker Arm'), 'ADJUSTER');
  assert.equal(partHeadNounDetailed('ADJUSTER. Rocker Arm').basis, 'explicit');
  // Sem espaço continua valendo (era o caso que já existia).
  assert.equal(partHeadNoun('PLATE.MUFFLER'), 'PLATE');
});

test('ponto antes de NÚMERO não é separador de qualificador', () => {
  // `NO. 2` é numeração, não "peça NO qualificada por 2". A regra exige 2+
  // letras dos dois lados justamente para isso.
  assert.equal(partHeadNoun('NO. 2 SCREW'), 'SCREW');
});

test('descrições reais da Briggs: o substantivo principal é o primeiro', () => {
  // A Briggs usa a mesma convenção da Husqvarna, com vírgula OU hífen. As
  // descrições abaixo saíram dos PDFs de `104M02-0002-F1`, `12J902-0118-01`,
  // `28R707-1151-E1` e `09P702-0212-F1`.
  const casos: Array<[string, string]> = [
    ['GASKET, Cylinder Head', 'GASKET'],
    ['GASKET-AIR CLEANER', 'GASKET'],
    ['HEAD, Cylinder', 'HEAD'],
    ['SPRING, Valve', 'SPRING'],
    ['CAP, Valve', 'CAP'],
    ['VALVE, Exhaust', 'VALVE'],
    ['SEAL, Oil', 'SEAL'],
    ['TUBE, Breather', 'TUBE'],
    ['LOCK, Muffler Screw', 'LOCK'],
    ['GASKET, Intake', 'GASKET'],
  ];
  for (const [descricao, esperado] of casos) {
    assert.equal(partHeadNoun(descricao), esperado, descricao);
  }
});

test('junta do cabeçote não é cabeçote, nem na Briggs', () => {
  // A correção do dono, agora no catálogo do motor: `GASKET, Cylinder Head` e
  // `HEAD, Cylinder` são peças diferentes, e a vírgula é quem diz qual é qual.
  assert.notEqual(partHeadNoun('GASKET, Cylinder Head'), partHeadNoun('HEAD, Cylinder'));
  assert.equal(partHeadNoun('GASKET, Cylinder Head'), 'GASKET');
  assert.equal(partHeadNoun('HEAD, Cylinder'), 'HEAD');
});
