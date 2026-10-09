/**
 * Última vista explodida aberta em cada máquina, por aparelho.
 *
 * O balcão atende a mesma máquina várias vezes (o cliente volta pedir outra peça) e quase sempre na mesma vista (o carburador, o cabeçote). Reabrir na
 * primeira vista da lista obriga a achar a de novo com o cliente esperando. Só guarda o id da vista; se ele não existir mais (a Husqvarna renomeou), o
 * painel cai na primeira vista como sempre caiu. Armazenamento bloqueado ou cheio nunca atrapalha: só se perde o atalho.
 */
const PREFIX = 'cognivault_last_view:';

/** O Portal usa os 9 primeiros dígitos do PNC; é a chave da máquina. */
function keyFor(pnc: string | null | undefined): string | null {
  const digits = String(pnc ?? '').replace(/\D/g, '');
  return digits.length >= 9 ? PREFIX + digits.slice(0, 9) : null;
}

export function readLastView(pnc: string | null | undefined): string {
  const key = keyFor(pnc);
  if (!key) return '';
  try {
    const value = localStorage.getItem(key);
    return typeof value === 'string' && value.length <= 120 ? value : '';
  } catch {
    return '';
  }
}

export function writeLastView(pnc: string | null | undefined, sectionId: string): void {
  const key = keyFor(pnc);
  if (!key || !sectionId || sectionId.length > 120) return;
  try {
    localStorage.setItem(key, sectionId);
  } catch {
    // Modo privativo ou sem espaço: o atalho some, e mais nada.
  }
}
