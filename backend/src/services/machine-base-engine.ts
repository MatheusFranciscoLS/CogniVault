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
  source: 'IPL' | 'DONO';
};

const OWNER_BASE_ENGINES: ReadonlyArray<{ machineModel: string; engineModel: string }> = [
  { machineModel: 'LTH1842', engineModel: 'SV540-3212' },
  { machineModel: 'R316TX', engineModel: 'FS481V-CS55' },
  { machineModel: 'TS138', engineModel: 'HS452' },
];

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
    add({ brand: engineBrandOf(app.engineModel), model: searchTerm, searchTerm, machinePnc: app.machinePnc ?? null, source: 'IPL' });
  }

  for (const base of OWNER_BASE_ENGINES) {
    if (!matches(base.machineModel)) continue;
    const covered = hints.some(hint => normalizeIdentifier(hint.searchTerm).startsWith(normalizeIdentifier(base.engineModel)));
    if (covered) continue;
    add({ brand: engineBrandOf(base.engineModel), model: base.engineModel, searchTerm: base.engineModel, machinePnc: null, source: 'DONO' });
  }

  return hints;
}
