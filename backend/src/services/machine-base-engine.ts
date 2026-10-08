import { normalizeIdentifier } from '../utils/normalize';
import { ENGINE_APPLICATIONS } from './husqvarna-domain-knowledge';

/**
 * Motor "de base" de cada máquina, para o painel da máquina dizer qual é.
 *
 * Duas fontes, e a diferença importa:
 *  - `ENGINE_APPLICATIONS`: o IPL da máquina cita o motor (às vezes por PNC). É a evidência forte.
 *  - `OWNER_BASE_ENGINES`: o dono informou o par (2026-10-08, "se só tiver uma base"). Serve de ponto de partida, não de garantia:
 *    o motor muda com o ano da máquina, e por isso a tela sempre manda conferir a plaqueta ou o número de série do motor.
 *
 * Este mapa só alimenta a EXIBIÇÃO. Ele não entra em `resolveEngineCatalogRoute`, que decide qual catálogo de motor responde uma
 * pergunta de peça e precisa de evidência por PNC: acrescentar aqui uma entrada sem PNC para TS138 (que varia por PNC) faria aquela
 * rota resolver direto e errar.
 */
export type EngineBrand = 'Kohler' | 'Kawasaki' | 'Briggs & Stratton' | 'Husqvarna';

export type MachineEngineHint = {
  brand: EngineBrand | null;
  /** Como o motor se chama na plaqueta/catálogo. */
  model: string;
  /** Texto que o balcão busca para abrir o catálogo desse motor. */
  searchTerm: string;
  /** Preenchido quando o motor vale só para um PNC da máquina. */
  machinePnc: string | null;
  /**
   * De onde vem o vínculo, e é o que o balcão precisa para saber quanto confiar:
   *  - `PORTAL`: o IPL do Portal Husqvarna cita este motor para o PNC aberto (a evidência mais forte, e por PNC);
   *  - `LISTA`: a ficha da lista de preços vigente traz o campo "Motor" da máquina (linha atual, vinda da Husqvarna);
   *  - `IPL`: o IPL de catálogo da máquina cita (às vezes por PNC, e pode ser de OUTRO ANO da máquina);
   *  - `DONO`: par informado pela loja, uma base.
   */
  source: 'PORTAL' | 'LISTA' | 'IPL' | 'DONO';
  /**
   * Quão específico é o dado: `MODELO` (catálogo abre), `SERIE` (Kawasaki sem o spec da plaqueta: o catálogo pergunta o spec) ou
   * `SO_MARCA` (o Portal diz a marca e manda ler o modelo na plaqueta; não há o que abrir).
   */
  precision: 'MODELO' | 'SERIE' | 'SO_MARCA';
};

export const OWNER_BASE_ENGINES: ReadonlyArray<{ machineModel: string; engineModel: string }> = [
  { machineModel: 'LTH1842', engineModel: 'SV540-3212' },
  { machineModel: 'R316TX', engineModel: 'FS481V-CS55' },
  { machineModel: 'TS138', engineModel: 'HS452' },
];

/** Série Kawasaki sem o spec (FX730V): o catálogo tem vários specs por série, e cada um é um motor diferente. */
function precisionOf(brand: EngineBrand | null, model: string): MachineEngineHint['precision'] {
  if (!model) return 'SO_MARCA';
  return (brand === 'Kawasaki' || brand === 'Kohler') && !model.includes('-') ? 'SERIE' : 'MODELO';
}

export function engineBrandOf(engineModel: string): EngineBrand | null {
  const raw = engineModel.trim();
  if (/briggs|stratton/i.test(raw) || /^\d{2,3}[A-Z]\d{2}-?\d{4}/i.test(raw.replace(/^motor\s+/i, ''))) return 'Briggs & Stratton';
  const model = raw.replace(/^motor\s+/i, '').toUpperCase().replace(/\s+/g, '');
  if (/^(FR|FX|FS|FH|FD|FJ|FE|FC|FA|FB)\d{3,4}/.test(model)) return 'Kawasaki';
  if (/^(SV|CH|CV|KT|XT|CS|ECV|ECH|ZT|KD)\d/.test(model)) return 'Kohler';
  if (/^H[SV]\d/.test(model)) return 'Husqvarna';
  return null;
}

/** "Motor Briggs 104M02-0002-F1" -> "104M02-0002-F1"; o resto fica como está. */
function searchTermOf(engineModel: string): string {
  return engineModel.replace(/^motor\s+(?:briggs(?:\s*&\s*stratton)?\s+)?/i, '').trim();
}

/**
 * O nome que o Portal dá à máquina é a descrição inteira, com o modelo em qualquer ponto e espaçado:
 * "Cortador de Grama frontal com operador embarcado Husqvarna R 316TX", "TS 138", "LTH1842 (2018)".
 * O modelo vale quando 1 a 3 palavras SEGUIDAS, juntas, são ele: "R 316TX" casa R316TX, mas "TS 1385" nunca casa TS138 (palavra
 * inteira, não pedaço de palavra). O casamento é sempre contra modelos conhecidos, então uma janela qualquer não vira vínculo.
 */
function modelKeysIn(machineModel: string): Set<string> {
  const words = machineModel.replace(/[(),]/g, ' ').trim().split(' ').filter(Boolean).slice(0, 40);
  const keys = new Set<string>();
  for (let start = 0; start < words.length; start += 1) {
    for (let size = 1; size <= 3 && start + size <= words.length; size += 1) {
      const key = normalizeIdentifier(words.slice(start, start + size).join(''));
      if (key) keys.add(key);
    }
  }
  return keys;
}

export function baseEnginesForMachine(machineModel: string): MachineEngineHint[] {
  const keys = modelKeysIn(machineModel);
  if (!keys.size) return [];
  const matches = (candidate: string) => keys.has(normalizeIdentifier(candidate));

  const hints: MachineEngineHint[] = [];
  const seen = new Set<string>();
  const add = (hint: MachineEngineHint) => {
    const key = `${normalizeIdentifier(hint.searchTerm)}|${hint.machinePnc ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    hints.push(hint);
  };

  for (const app of ENGINE_APPLICATIONS) {
    if (!matches(app.machineModel)) continue;
    const searchTerm = searchTermOf(app.engineModel);
    // O catálogo guarda o mesmo motor de três jeitos (com "Motor Briggs", só o código e só a série): fica o mais completo.
    const redundantShort = ENGINE_APPLICATIONS.some(other => other !== app
      && normalizeIdentifier(other.machineModel) === normalizeIdentifier(app.machineModel)
      && normalizeIdentifier(searchTermOf(other.engineModel)).startsWith(normalizeIdentifier(searchTerm))
      && normalizeIdentifier(searchTermOf(other.engineModel)).length > normalizeIdentifier(searchTerm).length);
    if (redundantShort) continue;
    const brand = engineBrandOf(app.engineModel);
    add({ brand, model: searchTerm, searchTerm, machinePnc: app.machinePnc ?? null, source: 'IPL', precision: precisionOf(brand, searchTerm) });
  }

  for (const base of OWNER_BASE_ENGINES) {
    if (!matches(base.machineModel)) continue;
    const covered = hints.some(hint => normalizeIdentifier(hint.searchTerm).startsWith(normalizeIdentifier(base.engineModel)));
    if (covered) continue;
    const brand = engineBrandOf(base.engineModel);
    add({ brand, model: base.engineModel, searchTerm: base.engineModel, machinePnc: null, source: 'DONO', precision: precisionOf(brand, base.engineModel) });
  }

  return hints;
}

/** Marca do texto do Portal (`HUSQVARNA`, `BRIGGS`...) para a marca que o balcão mostra. */
const PORTAL_BRANDS: Record<string, EngineBrand> = { HUSQVARNA: 'Husqvarna', BRIGGS: 'Briggs & Stratton', KAWASAKI: 'Kawasaki', KOHLER: 'Kohler' };

type PortalEngineSource = { iplSections?: Array<{ parts: Array<{ servesThisPnc?: boolean; engine?: { brand: string | null; model: string | null; modelOnPlate: boolean } | null }> }> };

/**
 * Motores que o IPL do Portal cita PARA ESTE PNC (só as linhas que servem a ele). É a fonte mais forte do vínculo e a única por PNC:
 * a mesma máquina muda de motor com o PNC, e o texto do Portal diz qual. Nada é deduzido: sem modelo no texto, vira `SO_MARCA`
 * ("Kawasaki, leia o modelo na plaqueta"), nunca um palpite.
 */
export function enginesCitedByPortal(details: PortalEngineSource | null | undefined, machinePnc: string | null): MachineEngineHint[] {
  const found = new Map<string, MachineEngineHint>();
  for (const section of details?.iplSections ?? []) {
    for (const part of section.parts) {
      const engine = part.engine;
      if (!engine || part.servesThisPnc === false) continue;
      const brand = engine.brand ? (PORTAL_BRANDS[engine.brand] ?? null) : null;
      const model = (engine.model ?? '').trim();
      if (!model && !(engine.modelOnPlate && brand)) continue;
      const key = model ? `M|${normalizeIdentifier(model)}` : `B|${brand}`;
      if (found.has(key)) continue;
      found.set(key, { brand: brand ?? engineBrandOf(model), model, searchTerm: model, machinePnc, source: 'PORTAL', precision: precisionOf(brand ?? engineBrandOf(model), model) });
    }
  }
  return [...found.values()];
}

/**
 * Junta, por ordem de força: o que o Portal cita (por PNC), a ficha da lista de preços e o vínculo da loja (IPL de catálogo e pares do dono). O Portal vem primeiro; o que a loja sabe e o Portal não cita continua,
 * porque o Portal só cita o motor quando há um item de motor no IPL, e esconder o vínculo da loja seria perder informação.
 * Motor já citado pelo Portal não repete.
 */
export function mergeEngineHints(...groups: MachineEngineHint[][]): MachineEngineHint[] {
  const [portal = [], ...rest] = groups;
  const stored = rest.flat();
  const result = [...portal];
  const key = (value: string) => normalizeIdentifier(value);
  for (const hint of stored) {
    if (!hint.model) {
      if (!result.some(item => !item.model && item.brand === hint.brand)) result.push(hint);
      continue;
    }
    // O mesmo motor em dois graus de detalhe (série FS481V e modelo FS481V-CS55): fica o MAIS ESPECÍFICO, que é o que abre o catálogo.
    const sameEngine = result.findIndex(item => item.model && (key(item.model).startsWith(key(hint.model)) || key(hint.model).startsWith(key(item.model))));
    if (sameEngine === -1) result.push(hint);
    else if (key(hint.model).length > key(result[sameEngine].model).length) result[sameEngine] = hint;
  }
  return result;
}

/**
 * O campo "Motor" da ficha da lista de preços, quando ele NOMEIA um motor Kawasaki ou Kohler. Exemplos do desenho do texto:
 *   "Kawasaki FR Series - FR730V - FR730VFS16S"   -> série FR730V e código completo FR730V + FS16 (+ S)
 *   "Kawasaki FS481V - FS Series V-Twin"           -> só a série FS481V
 * O código completo se divide em série + spec de 4 caracteres (dois letras e dois dígitos) mais uma letra final que o catálogo não usa:
 * `FR730VFS16S` abre como `FR730V-FS16`. Quando a ficha cita DUAS séries (o texto da própria Husqvarna às vezes escreve FR691V e
 * FS691V na mesma linha), as duas aparecem: a plaqueta decide, e esconder uma seria escolher por ela.
 * "2 tempos", "Combustão interna", "BLDC" não nomeiam motor e devolvem lista vazia.
 */
export function enginesFromListingSpec(motor: string | null | undefined): MachineEngineHint[] {
  const text = String(motor ?? '').toUpperCase();
  if (!/KAWASAKI|KOHLER/.test(text)) return [];
  const hints: MachineEngineHint[] = [];
  const seen = new Set<string>();
  const add = (brand: EngineBrand, model: string, precision: MachineEngineHint['precision']) => {
    const key = normalizeIdentifier(model);
    if (seen.has(key)) return;
    seen.add(key);
    hints.push({ brand, model, searchTerm: model, machinePnc: null, source: 'LISTA', precision });
  };

  if (/KAWASAKI/.test(text)) {
    for (const match of text.matchAll(/\b(F[A-Z]\d{3,4}V)([A-Z]{2}\d{2})[A-Z]?\b/g)) add('Kawasaki', `${match[1]}-${match[2]}`, 'MODELO');
    for (const match of text.matchAll(/\b(F[A-Z]\d{3,4}V)\b/g)) {
      if (![...seen].some(key => key.startsWith(match[1]))) add('Kawasaki', match[1], 'SERIE');
    }
  }
  if (/KOHLER/.test(text)) {
    for (const token of text.split(/[^A-Z0-9-]+/)) {
      const spec = token && /^[A-Z]{2,3}\d{2,4}[A-Z]?-\d{4}$/.test(token) ? token : null;
      if (spec) add('Kohler', spec, 'MODELO');
    }
  }
  return hints;
}
