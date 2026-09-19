import { normalizeText } from '../utils/normalize';
import { partHeadNoun } from '../utils/part-head-noun';

/**
 * Peças que vão JUNTO com a que o cliente está levando.
 *
 * Pedido do dono, com os exemplos dele: *"se ele vai comprar um carburador é
 * recomendado ele trocar a junta do carburador e junta do isolador. Se ele vai
 * fazer o motor é bom ele trocar o jogo de juntas, retentor do motor e
 * rolamento do motor"*.
 *
 * ## Por que a versão anterior não servia
 *
 * `getCorrelatedMaintenanceTerms` devolvia termo largo — para carburador,
 * `['junta', 'mangueira', 'filtro de combustivel', 'vela']` — e o controlador
 * procurava esses termos no catálogo inteiro da máquina. Buscar `junta` na
 * 143RII devolve TODAS as juntas: a tela mostrava
 * `JUNTA / JUNTA / JUNTA / FIVELA / JUNTA / JUNTA` e o atendente não tinha como
 * saber qual era a do carburador — que era exatamente a informação que faltava.
 *
 * ## A regra aqui
 *
 * Cada acompanhante diz **substantivo principal + qualificador**, e os dois
 * precisam bater. "Junta" sozinha não vira sugestão; "junta" + "carburador",
 * sim. É a mesma leitura de descrição que `part-head-noun.ts` já faz
 * (`GASKET, Carburettor` = a JUNTA do carburador, não o carburador).
 *
 * **Sem candidato específico, não sugere nada.** Preferir silêncio a uma junta
 * qualquer é a mesma disciplina do resto do produto: sugestão errada no balcão
 * vira devolução, e devolução custa mais que uma venda a menos.
 */

export type Companion = {
  /**
   * Substantivo principal do acompanhante, **nos dois idiomas**: o catálogo
   * mistura `JUNTA, Carburador` e `GASKET, Carburettor` na mesma base.
   */
  heads: string[];
  /**
   * Qualificadores aceitos, em português e inglês (o catálogo tem os dois).
   * Vazio significa que o substantivo sozinho já identifica a peça — use com
   * parcimônia, e só quando não houver ambiguidade possível na máquina.
   */
  qualifiers: string[];
  /** Como a sugestão aparece na tela. */
  label: string;
};

export type CompanionRule = {
  /** Quando a peça aberta tem este substantivo principal. */
  head: RegExp;
  /** Uma linha dizendo por que vale levar junto. */
  reason: string;
  companions: Companion[];
};

/**
 * A tabela é conhecimento de balcão do dono, não dedução minha. Quem souber de
 * um acompanhante que falta acrescenta aqui — e o teste ao lado trava o que
 * **não** pode virar sugestão.
 */
export const COMPANION_RULES: CompanionRule[] = [
  {
    head: /\bcarburador|carburett?or\b/,
    reason: 'Quem troca o carburador leva as juntas junto — elas não se reaproveitam.',
    companions: [
      { heads: ['junta', 'gasket'], qualifiers: ['carburador', 'carburettor', 'carburetor'], label: 'Junta do carburador' },
      { heads: ['junta', 'gasket'], qualifiers: ['isolador', 'insulator', 'spacer', 'espacador'], label: 'Junta do isolador' },
      { heads: ['isolador', 'insulator', 'spacer'], qualifiers: ['carburador', 'carburettor', 'carburetor', ''], label: 'Isolador' },
      { heads: ['filtro', 'filter'], qualifiers: ['combustivel', 'fuel'], label: 'Filtro de combustível' },
    ],
  },
  {
    head: /\b(?:pistao|cilindro|piston|cylinder)\b/,
    reason: 'Motor aberto: junta, retentor e rolamento entram na mesma revisão.',
    companions: [
      { heads: ['junta', 'gasket'], qualifiers: ['cilindro', 'cylinder', 'jogo', 'set', 'kit'], label: 'Jogo de juntas' },
      { heads: ['retentor', 'seal'], qualifiers: ['', 'virabrequim', 'crankshaft', 'oil'], label: 'Retentor' },
      { heads: ['rolamento', 'bearing'], qualifiers: ['', 'virabrequim', 'crankshaft', 'ball'], label: 'Rolamento' },
      { heads: ['anel', 'ring'], qualifiers: ['pistao', 'piston', ''], label: 'Anel do pistão' },
    ],
  },
  {
    head: /\b(?:virabrequim|crankshaft)\b/,
    reason: 'Motor aberto: junta, retentor e rolamento entram na mesma revisão.',
    companions: [
      { heads: ['retentor', 'seal'], qualifiers: ['', 'virabrequim', 'crankshaft', 'oil'], label: 'Retentor' },
      { heads: ['rolamento', 'bearing'], qualifiers: ['', 'virabrequim', 'crankshaft', 'ball'], label: 'Rolamento' },
      { heads: ['junta', 'gasket'], qualifiers: ['cilindro', 'cylinder', 'carter', 'crankcase'], label: 'Junta do cárter' },
    ],
  },
  {
    head: /\b(?:sabre|barra|guia|bar)\b/,
    reason: 'Sabre novo com corrente gasta estraga os dois.',
    companions: [
      { heads: ['corrente', 'chain'], qualifiers: [''], label: 'Corrente' },
      { heads: ['pinhao', 'sprocket'], qualifiers: ['', 'embreagem', 'clutch', 'sprocket'], label: 'Pinhão da embreagem' },
    ],
  },
  {
    head: /\b(?:partida|arranque|starter)\b/,
    reason: 'A corda e a mola são o que quebra primeiro na partida.',
    companions: [
      { heads: ['corda', 'rope'], qualifiers: ['', 'partida', 'starter', 'rope'], label: 'Corda de partida' },
      { heads: ['mola', 'spring'], qualifiers: ['partida', 'starter', 'recoil'], label: 'Mola da partida' },
      { heads: ['punho', 'handle'], qualifiers: ['', 'partida', 'starter', 'handle'], label: 'Punho da partida' },
    ],
  },
  {
    head: /\b(?:lamina|faca|blade)\b/,
    reason: 'A lâmina só fixa direito com porca e prato em bom estado.',
    companions: [
      { heads: ['porca', 'nut'], qualifiers: ['lamina', 'blade', 'faca'], label: 'Porca da lâmina' },
      { heads: ['prato', 'plate', 'washer'], qualifiers: ['', 'lamina', 'blade'], label: 'Prato de apoio' },
    ],
  },
  {
    head: /\b(?:embreagem|clutch)\b/,
    reason: 'Embreagem nova pede tambor e mola conferidos.',
    companions: [
      { heads: ['tambor', 'drum'], qualifiers: ['', 'embreagem', 'clutch', 'drum'], label: 'Tambor da embreagem' },
      { heads: ['mola', 'spring'], qualifiers: ['embreagem', 'clutch'], label: 'Mola da embreagem' },
    ],
  },
];

/** Candidato vindo do catálogo da mesma máquina. */
export type CompanionCandidate = {
  id: string;
  partNumber: string;
  name: string;
  section: string | null;
  position: string | null;
};

export type CompanionMatch = CompanionCandidate & { label: string };

export type CompanionResult = {
  reason: string;
  items: CompanionMatch[];
};

/**
 * Um candidato serve como este acompanhante?
 *
 * Exige o substantivo principal **e** um dos qualificadores, e os dois são
 * lidos **só da descrição da peça**.
 *
 * **A seção fica de fora de propósito**, e essa é a parte que erra fácil: na
 * 143RII a seção do desenho chama-se `143RII CARBURADOR`, então incluí-la faria
 * TODA peça daquela vista casar com o qualificador "carburador" — e a primeira
 * `JUNTA` sem qualificador nenhum viraria "Junta do carburador". Seria o defeito
 * original de volta com outra roupa. Eu cometi exatamente esse erro na primeira
 * versão deste arquivo, e o teste ao lado trava isso.
 */
function serve(candidate: CompanionCandidate, companion: Companion): boolean {
  const head = partHeadNoun(candidate.name);
  const descricao = normalizeText(candidate.name);

  // O substantivo principal tem que ser o do acompanhante. Casar por substring
  // da descrição inteira aceitaria "PARAFUSO, Junta" como se fosse a junta.
  const cabeca = head ? normalizeText(head) : descricao.split(/[\s,]/)[0];
  const cabecaBate = companion.heads.some(alvo => cabeca === normalizeText(alvo));
  if (!cabecaBate) return false;

  // Qualificador vazio na lista significa "o substantivo já basta".
  if (companion.qualifiers.some(q => q === '')) return true;
  return companion.qualifiers.some(q => q && descricao.includes(normalizeText(q)));
}

/** A peça aberta tem regra de acompanhante? Evita ir ao banco à toa. */
export function hasCompanionRule(partName: string | null | undefined): boolean {
  const head = partHeadNoun(partName || '');
  const texto = normalizeText(`${head || ''} ${partName || ''}`);
  return COMPANION_RULES.some(rule => rule.head.test(texto));
}

/**
 * Os acompanhantes da peça aberta, resolvidos no catálogo daquela máquina.
 *
 * Devolve no máximo um candidato por acompanhante — mostrar três juntas
 * diferentes para "Junta do carburador" devolveria o problema original.
 */
export function findCompanions(
  partName: string | null | undefined,
  candidates: CompanionCandidate[],
  limit = 4,
): CompanionResult {
  const head = partHeadNoun(partName || '');
  const texto = normalizeText(`${head || ''} ${partName || ''}`);

  const regra = COMPANION_RULES.find(rule => rule.head.test(texto));
  if (!regra) return { reason: '', items: [] };

  const items: CompanionMatch[] = [];
  const usados = new Set<string>();

  for (const companion of regra.companions) {
    if (items.length >= limit) break;
    const achado = candidates.find(candidate => !usados.has(candidate.partNumber) && serve(candidate, companion));
    if (!achado) continue; // Sem candidato específico, esta linha simplesmente não aparece.
    usados.add(achado.partNumber);
    items.push({ ...achado, label: companion.label });
  }

  // A razão só faz sentido acompanhada de pelo menos uma peça de verdade.
  return items.length ? { reason: regra.reason, items } : { reason: '', items: [] };
}
