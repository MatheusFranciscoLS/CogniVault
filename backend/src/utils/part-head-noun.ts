/**
 * Qual peça a descrição do catálogo realmente nomeia.
 *
 * Correção do dono, e é a que mais importa em todo este produto:
 *
 *   > "GASKET não é o carburador, e sim a junta do carburador. Se for somente
 *   > o carburador é o 15004, código 15004-0937."
 *
 * Eu havia tratado `GASKET,CARBURETOR` como peça de carburador. Não é: é a
 * JUNTA. Quem pede "carburador" e recebe `11061-7038` recebe uma junta — e
 * peça errada no balcão é devolução, que é justamente o que este produto
 * existe para evitar.
 *
 * O catálogo segue uma convenção, e ela é o que dá para explorar: **a peça é o
 * substantivo principal**, e o resto qualifica.
 *
 *     CARBURETOR-ASSY             -> CARBURETOR   (é o carburador)
 *     GASKET,CARBURETOR           -> GASKET       (é junta)
 *     GASKET,SCREW-CARBURETOR     -> GASKET       (é junta)
 *     VALVE-THROTTLE              -> VALVE        (é válvula)
 *     JUNTA DO CARBURADOR         -> JUNTA
 *     CONJUNTO DE JUNTA           -> JUNTA
 *     CARBURETTOR GASKET KIT      -> GASKET
 *     CARBURETTOR KIT             -> CARBURETTOR
 *     CARBURADOR                  -> CARBURADOR
 *
 * Repare que inglês e português colocam o principal em pontas opostas:
 * `JUNTA do carburador` começa pelo principal, `carburettor GASKET` termina
 * nele. Por isso a extração é por etapas, não por "primeira palavra".
 *
 * ## O que esta regra NÃO é
 *
 * Não é gramática, é a convenção destes catálogos (Husqvarna, Briggs,
 * Kawasaki), verificada com descrições reais colhidas da fonte. Quando a
 * descrição não segue nenhuma das formas, a função devolve a frase inteira e
 * quem chama trata como "não sei dizer" — nunca como "é isto".
 *
 * ## Auditado, não conferido por amostra
 *
 * O dono perguntou se eu tinha certeza de que os erros eram só aqueles. Não
 * tinha: rodei a regra contra as **292 descrições reais** de 6 máquinas
 * (TS 142, TS 148, HS 608, Z460, 143R II, LC 121P) colhidas da API, e a
 * auditoria expôs 16 erros que a conferência por amostra não pegava — entre
 * eles `PLATE.MUFFLER` resolvendo para MUFFLER, que faria quem pede
 * silenciador receber uma chapa.
 *
 * Estado final: das 292, nenhuma resolve para palavra de posição nem de
 * embalagem, e só duas não resolvem — `KIT` (é só embalagem, `null` está
 * certo) e `SPARKPLUGBPMR7A`, que vem grudada com o código do eletrodo e cai
 * no filtro de especificação. `null` ali significa "não sei dizer", que é
 * seguro: quem chama não recebe palpite.
 *
 * E o uso é **rebaixar, não apagar**: se ninguém tem o principal certo, é
 * melhor mostrar a junta claramente rotulada do que não mostrar nada. O que
 * não pode é a junta aparecer como resposta para quem pediu o carburador.
 */

/** Palavras que embalam outra peça, sem serem a peça. */
const CONTAINER_WORDS = new Set([
  'KIT', 'KITS', 'CONJUNTO', 'CONJ', 'JOGO', 'SET', 'ASSY', 'ASSEMBLY', 'ASM',
  'MULTIPACK', 'PACK', 'COMPLETO', 'COMPLETE',
]);

/**
 * Palavras de posição e lado. Dizem ONDE a peça fica, nunca qual ela é.
 *
 * A auditoria pegou `WHEEL ADJ BRACKET FRONT` resolvendo para "FRONT": a regra
 * do último substantivo não sabia que "front" não é peça. Atravessar estas
 * palavras devolve BRACKET, que é a peça de verdade.
 */
const POSITION_WORDS = new Set([
  'FRONT', 'REAR', 'LEFT', 'RIGHT', 'UPPER', 'LOWER', 'INNER', 'OUTER',
  'TOP', 'BOTTOM', 'SIDE', 'CENTER', 'CENTRE', 'ADJ',
  'DIANTEIRA', 'DIANTEIRO', 'TRASEIRA', 'TRASEIRO', 'ESQUERDA', 'ESQUERDO',
  'DIREITA', 'DIREITO', 'SUPERIOR', 'INFERIOR', 'INTERNO', 'EXTERNO',
  'FRENTE', 'TRAS', 'LADO', 'CENTRAL',
]);

/** Ligações que separam o principal do que o qualifica, em português. */
const PT_PREPOSITIONS = [' DOS ', ' DAS ', ' DO ', ' DA ', ' DE ', ' P/ ', ' PARA '];

/**
 * Prefixos que formam palavra composta com hífen, e não qualificam nada.
 *
 * Sem esta lista, `PÁRA-CHOQUES` resolvia para "PARA" e `MICRO-INTERRUPTOR`
 * para "MICRO" — a regra de hífen do catálogo (`VALVE-THROTTLE`) aplicada a uma
 * palavra que só existe inteira.
 */
const COMPOUND_PREFIXES = new Set([
  'PARA', 'PRE', 'POS', 'ANTI', 'CONTRA', 'MICRO', 'MINI', 'MULTI', 'SEMI',
  'AUTO', 'SUB', 'SUPER', 'INTER', 'EXTRA', 'NAO',
]);

/**
 * Substantivos de peça que aparecem nestes catálogos.
 *
 * A regra de posição resolve a maioria, mas erra em dois casos que a auditoria
 * sobre 292 descrições reais da API expôs:
 *
 *   - substantivo + adjetivo em português, sem ligação: `PORCA SEXTAVADA`
 *     virava "SEXTAVADA", `MOLA ESPIRAL` virava "ESPIRAL", `EIXO MOTRIZ`
 *     virava "MOTRIZ";
 *   - código de especificação no lugar do qualificador: `PARAFUSO IHSCT`
 *     virava "IHSCT".
 *
 * Quando **exatamente uma** palavra da frase é peça conhecida, ela é o
 * principal — não depende de posição nem de idioma. Com duas ou mais
 * (`TAMPA DE VÁLVULA`), a decisão volta para a regra de posição, que é o que
 * distingue as três peças que o dono citou.
 *
 * A lista não precisa ser completa: o que não está nela cai na regra de
 * posição, que é o comportamento anterior.
 */
const PART_NOUNS = new Set([
  'CARBURADOR', 'JUNTA', 'VALVULA', 'TAMPA', 'MOLA', 'PORCA', 'PARAFUSO', 'ANILHA',
  'ANEL', 'EIXO', 'CHAVE', 'TUBO', 'MANGUEIRA', 'BRACADEIRA', 'CABO', 'CORREIA',
  'POLIA', 'FILTRO', 'BOMBA', 'BOBINA', 'VELA', 'PISTAO', 'BIELA', 'CAMBOTA',
  'VIRABREQUIM', 'CILINDRO', 'CABECOTE', 'CARTER', 'SILENCIADOR', 'EMBRAIAGEM',
  'ROLAMENTO', 'RETENTOR', 'VEDACAO', 'PLACA', 'CHAPA', 'SUPORTE', 'PEDAL',
  'PAINEL', 'DEPOSITO', 'TANQUE', 'MEDIDOR', 'VARETA', 'PENEIRA', 'BUJAO',
  'SOLENOIDE', 'INTERRUPTOR', 'MOTOR', 'ALAVANCA', 'HASTE', 'HASTES', 'BRACO',
  'GUIA', 'PROTECAO', 'PROTECCAO', 'PROTETOR', 'RESGUARDO', 'COBERTURA', 'DEFLETOR',
  'RODA', 'PNEU', 'LAMINA', 'ACELERADOR', 'MEMBRO', 'CORPO', 'COPO', 'ARCO',
  'PUNHO', 'PEGA', 'CORDA', 'ASSENTO', 'SACO', 'REFORCO', 'ALCA', 'MODULO',
  'CONTROLE', 'CONTROLO', 'BLOQUEIO', 'DISPOSITIVO', 'OLEO', 'TENAZ', 'DEQUE',
  'CARBURETOR', 'CARBURETTOR', 'GASKET', 'VALVE', 'COVER', 'SPRING', 'NUT',
  'SCREW', 'BOLT', 'WASHER', 'RING', 'SHAFT', 'HOSE', 'CLAMP', 'BELT', 'PULLEY',
  'FILTER', 'PUMP', 'COIL', 'PLUG', 'PISTON', 'ROD', 'CRANKSHAFT', 'CYLINDER',
  'HEAD', 'CRANKCASE', 'MUFFLER', 'CLUTCH', 'BEARING', 'SEAL', 'PLATE', 'BRACKET',
  'PANEL', 'TANK', 'GAUGE', 'DIPSTICK', 'STRAINER', 'SOLENOID', 'SWITCH',
  'LEVER', 'ARM', 'GUIDE', 'SHIELD', 'GUARD', 'DEFLECTOR', 'WHEEL', 'TIRE',
  'BLADE', 'THROTTLE', 'CHOKE', 'CORD', 'SEAT', 'BAG', 'HANDLE', 'GRIP', 'CASE',
  'FOAM', 'STRAP', 'PIN', 'COTTER', 'TIE', 'CAP', 'HOLDER', 'BUMPER',
  'HANGER', 'PIECE', 'LABEL', 'NOZZLE', 'STARTER', 'TUBE', 'PEDAL',
]);

function normalizeText(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    // O ponto entre palavras é a mesma convenção da vírgula: "PLATE.MUFFLER" é
    // uma CHAPA do silenciador, não o silenciador. Sem isto, quem pedisse
    // silenciador recebia a chapa. Vira vírgula para cair na regra que já existe.
    //
    // O `\s*` cobre o ponto COM espaço, que é como a Briggs escreve: medido no
    // PDF do `104M02-0002-F1`, "ADJUSTER. Rocker Arm" caía na regra posicional e
    // devolvia `ARM` — um ajustador de balancim virava "braço". Exige 2+ letras
    // dos dois lados de propósito: `NO. 2` e abreviação seguida de número não
    // são separador de qualificador.
    .replace(/([A-Z]{2,})\.\s*([A-Z]{2,})/g, '$1,$2')
    .replace(/[^A-Z0-9,\-/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(segment: string): string[] {
  // A vírgula também separa palavra. Sem ela, `CONJ.SUPORTE DA PEGA` (o ponto
  // virou vírgula na normalização) devolvia "CONJ,SUPORTE" como se fosse UMA
  // palavra, quando a peça é o SUPORTE. A regra da vírgula continua valendo
  // antes desta, porque ela recorta o trecho antes de chamar aqui.
  return segment.split(/[\s/,]+/).map(w => w.trim()).filter(Boolean);
}

/**
 * Resolve o principal dentro de um trecho já isolado.
 *
 * Trecho de uma palavra é ele mesmo. Com várias, o inglês põe o principal no
 * fim (`CARBURETTOR GASKET` -> GASKET); e se o fim for palavra de embalagem,
 * anda para trás até achar peça de verdade (`CARBURETTOR GASKET KIT` -> GASKET,
 * `CARBURETTOR KIT` -> CARBURETTOR).
 */
function meaningfulWords(segment: string): string[] {
  // Fora token de especificação: "PINO T430: M8/6 L=147" descreve um pino, e
  // "T430"/"M8"/"L"/"147" são medida, não nome de peça. Sem esse filtro a regra
  // do "último substantivo" devolvia a medida.
  return words(segment).filter(w => !/\d/.test(w) && w.length > 2);
}

/**
 * Resolve o principal dentro de um trecho, na direção do idioma.
 *
 * Inglês nomeia no fim (`CARBURETTOR GASKET` -> GASKET) e português no começo
 * (`TAMPA DE VALVULA` -> TAMPA). Aplicar a direção errada troca a peça: foi
 * assim que `CONJ DO DEPOSITO DE COMBUSTIVEL` virou "combustível" em vez de
 * "depósito" no primeiro rascunho desta regra.
 *
 * Palavra de embalagem é atravessada em qualquer direção.
 */
function headOfSegment(segment: string, from: 'start' | 'end' = 'end'): string | null {
  const list = meaningfulWords(segment);
  if (!list.length) return null;
  const order = from === 'start' ? list : [...list].reverse();
  for (const word of order) {
    if (!CONTAINER_WORDS.has(word) && !POSITION_WORDS.has(word)) return word;
  }
  // Só palavras de embalagem: não há peça nomeada aqui.
  return null;
}

/**
 * O substantivo principal da descrição, ou `null` quando não dá para afirmar.
 */
export function partHeadNoun(description: string | null | undefined): string | null {
  return partHeadNounDetailed(description).head;
}

/**
 * Como a regra chegou ao principal — e é isso que decide se ela pode PUNIR.
 *
 * `explicit`: o catálogo separou (vírgula, ponto, hífen) ou a ligação em
 * português apontou, ou só uma palavra da frase é peça conhecida. Aqui dá para
 * afirmar, e rebaixar quem só casa como qualificador é seguro.
 *
 * `positional`: sobrou o palpite de posição. E ele é **ambíguo em inglês**, o
 * que uma regressão provou: `CARBURETTOR GASKET` nomeia a junta na ÚLTIMA
 * palavra, mas `Screw Clutch shoe` nomeia o parafuso na PRIMEIRA. Mesma
 * estrutura, principais opostos. Por isso `positional` não autoriza punição:
 * palpite não pode esconder a peça certa do balcão.
 */
export type HeadNounBasis = 'explicit' | 'positional';

export function partHeadNounDetailed(
  description: string | null | undefined,
): { head: string | null; basis: HeadNounBasis } {
  const text = normalizeText(description || '');
  if (!text) return { head: null, basis: 'positional' };

  // 1) Convenção de catálogo: "PEÇA,QUALIFICADOR".
  if (text.includes(',')) {
    const head = headOfSegment(text.split(',')[0]);
    if (head) return { head, basis: 'explicit' };
  }

  // 2) Português: a ligação ("DE", "DO", "DA") marca que a frase nomeia a peça
  //    PRIMEIRO e qualifica depois. É o que separa as três peças que o dono
  //    citou: VALVULA, TAMPA DE VALVULA e JUNTA DA TAMPA DE VALVULA.
  const prepositionAt = PT_PREPOSITIONS
    .map(preposition => ({ preposition, at: text.indexOf(preposition) }))
    .filter(item => item.at > 0)
    .sort((a, b) => a.at - b.at)[0];
  if (prepositionAt) {
    const head = headOfSegment(text.slice(0, prepositionAt.at), 'start');
    if (head) return { head, basis: 'explicit' };
    // "CONJUNTO DE JUNTA" / "CONJ DO DEPOSITO DE COMBUSTIVEL": o que vem antes
    // era só embalagem, então o principal é a primeira peça depois da ligação.
    const after = headOfSegment(text.slice(prepositionAt.at + prepositionAt.preposition.length), 'start');
    if (after) return { head: after, basis: 'explicit' };
  }

  // 3) Convenção de catálogo com hífen: "CARBURETOR-ASSY", "VALVE-THROTTLE".
  //    Mas não em palavra composta: "PÁRA-CHOQUES" e "MICRO-INTERRUPTOR" só
  //    existem inteiras, e dividi-las devolvia o prefixo como se fosse a peça.
  if (text.includes('-')) {
    const [before, ...rest] = text.split('-');
    const prefix = before.trim().split(/\s+/).pop() || '';
    if (!COMPOUND_PREFIXES.has(prefix)) {
      const head = headOfSegment(before);
      if (head) return { head, basis: 'explicit' };
    } else if (rest.length) {
      // "MICRO-INTERRUPTOR": a peça é o que vem depois do prefixo.
      const afterPrefix = headOfSegment(rest.join('-'), 'start');
      if (afterPrefix && PART_NOUNS.has(afterPrefix)) return { head: afterPrefix, basis: 'explicit' };
    }
  }

  // 4) Uma única palavra da frase é peça conhecida? Então é ela, sem depender
  //    de posição nem de idioma. Resolve "PORCA SEXTAVADA", "MOLA ESPIRAL",
  //    "EIXO MOTRIZ" e "PARAFUSO IHSCT", que a regra posicional errava.
  const conhecidas = meaningfulWords(text).filter(word => PART_NOUNS.has(word));
  if (conhecidas.length === 1) return { head: conhecidas[0], basis: 'explicit' };

  // 5) Frase solta: sobra o palpite de posição, e ele é ambíguo em inglês.
  //    Devolve o principal para quem quiser exibir, mas marcado como palpite,
  //    para que nenhuma punição de ranking se apoie nele.
  return { head: headOfSegment(text), basis: 'positional' };
}

/**
 * O termo procurado é o principal desta descrição?
 *
 * `false` significa "não é esta peça" — e é o que impede a junta de responder
 * por carburador. Quando não dá para afirmar o principal, devolve `null`, para
 * quem chama decidir (mostrar com ressalva é diferente de esconder).
 */
export function isHeadNounMatch(
  queryTerms: string | string[],
  description: string | null | undefined,
): boolean | null {
  // Aceita VÁRIOS termos de propósito. O catálogo é bilíngue: o balcão digita
  // "carburador" e a descrição diz "CARBURETOR-ASSY". Se esta função
  // respondesse "não é esta peça" por diferença de idioma, ela esconderia a
  // peça CERTA — pior do que o erro que ela existe para impedir. Quem chama
  // passa o termo com os sinônimos que o vocabulário já conhece.
  // O termo do balcão passa pela MESMA regra da descrição. Sem isso,
  // "tampa de válvula" resolvia para VALVULA e a busca trazia a válvula em vez
  // da tampa — o mesmo erro que esta função existe para impedir, só do outro
  // lado da comparação.
  const terms = (Array.isArray(queryTerms) ? queryTerms : [queryTerms])
    .map(value => normalizeText(value || ''))
    .filter(Boolean)
    .map(value => partHeadNoun(value) || value);
  if (!terms.length) return null;

  const head = partHeadNoun(description);
  if (!head) return null;

  for (const termHead of terms) {
    if (head === termHead) return true;
    // Plural e forma curta do catálogo: JUNTA/JUNTAS, GASKET/GASKETS.
    if (head.length > 3 && termHead.length > 3 && (head.startsWith(termHead) || termHead.startsWith(head))) return true;
  }
  return false;
}

/**
 * O termo aparece na descrição, mas só como qualificador?
 *
 * É a assinatura exata do erro relatado: "carburador" está em
 * `GASKET,CARBURETOR`, mas a peça é junta.
 */
export function isQualifierOnlyMatch(
  queryTerms: string | string[],
  description: string | null | undefined,
): boolean {
  const terms = (Array.isArray(queryTerms) ? queryTerms : [queryTerms])
    .map(value => normalizeText(value || ''))
    .filter(Boolean)
    .map(value => partHeadNoun(value) || value);
  const text = normalizeText(description || '');
  if (!terms.length || !text) return false;

  const tokens = words(text.replace(/[,\-]/g, ' '));
  const mentioned = terms.some(termHead => tokens.some(w =>
    w === termHead || (w.length > 3 && termHead.length > 3 && (w.startsWith(termHead) || termHead.startsWith(w)))));
  if (!mentioned) return false;

  // Só afirma "é só qualificador" quando o principal veio de sinal explícito
  // do catálogo. Com palpite de posição, responde `false` — porque em inglês o
  // palpite erra: `Screw Clutch shoe` nomeia o PARAFUSO na primeira palavra e
  // `CARBURETTOR GASKET` nomeia a JUNTA na última. Uma regressão na suíte
  // mostrou isso rebaixando a peça certa de "parafuso da embreagem".
  if (partHeadNounDetailed(description).basis !== 'explicit') return false;

  return isHeadNounMatch(queryTerms, description) === false;
}
