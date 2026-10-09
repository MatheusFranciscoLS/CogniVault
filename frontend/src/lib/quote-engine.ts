/**
 * O motor da máquina dentro do orçamento (pedido do dono, 2026-10-08).
 *
 * O orçamento já guardava só o texto da máquina (`Quote.machineModel`). Em vez de abrir uma coluna nova no banco de produção, o motor
 * viaja nesse mesmo texto, com um separador fixo: "Z460 · Motor Kawasaki FX921V-ES06". A tela separa de novo ao ler, então o resto do
 * código só enxerga `machineModel` e `engine` como campos distintos.
 *
 * Motor NÃO é código de peça: é o modelo do motor, que o cliente conhece da própria plaqueta. Ele pode ir no que o cliente recebe.
 */

export type EngineBrandName = 'Kohler' | 'Kawasaki' | 'Briggs & Stratton' | 'Husqvarna';

const SHORT_BRAND: Record<EngineBrandName, string> = { Kohler: 'Kohler', Kawasaki: 'Kawasaki', 'Briggs & Stratton': 'Briggs', Husqvarna: 'Husqvarna' };

const SEPARATOR = ' · ';
const ENGINE_TAIL = /(?:^|\s·\s)Motor\s+(Kohler|Kawasaki|Briggs|Husqvarna)\s+(\S.*)$/;

/** "Kawasaki FX921V-ES06": a marca curta e o modelo, como o atendente fala. */
export function engineLabel(brand: EngineBrandName | null, model: string): string {
  const name = model.trim();
  if (!name) return '';
  return brand ? `${SHORT_BRAND[brand]} ${name}` : name;
}

/** Texto único guardado em `Quote.machineModel`. Sem motor, devolve a máquina como veio; sem máquina, só o motor. */
export function composeQuoteMachine(machine: string | null | undefined, engine: string | null | undefined): string {
  const base = String(machine ?? '').trim();
  const motor = String(engine ?? '').trim();
  if (!motor) return base;
  return base ? `${base}${SEPARATOR}Motor ${motor}` : `Motor ${motor}`;
}

/** Inverso de `composeQuoteMachine`. Texto sem o desenho "Motor <marca> <modelo>" no fim volta intacto, com `engine` vazio. */
export function splitQuoteMachine(text: string | null | undefined): { machine: string; engine: string } {
  const value = String(text ?? '').trim();
  const match = ENGINE_TAIL.exec(value);
  if (!match) return { machine: value, engine: '' };
  return { machine: value.slice(0, match.index).trim(), engine: `${match[1]} ${match[2].trim()}` };
}
