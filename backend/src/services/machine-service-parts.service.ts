import { prisma } from '../config/prisma';

/**
 * Peças de revisão de uma máquina (campo "reparo" da lista de preços, gravado pela atualização da lista). Só leitura.
 * Aceita o PNC como o balcão o escreve (com espaço, traço, 11 dígitos ou sufixo BR): vale a chave de 9 dígitos que o Portal usa.
 */
export type MachineServicePartRow = { partNumber: string; name: string; kind: 'PREVENTIVO' | 'CONSUMIVEL' | 'PREDITIVO' };

const KIND_ORDER: Record<string, number> = { PREVENTIVO: 0, CONSUMIVEL: 1, PREDITIVO: 2 };

export function servicePncKey(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 11 ? digits.slice(0, 9) : null;
}

export class MachineServicePartsService {
  static async forPnc(tenantId: string, rawPnc: unknown): Promise<MachineServicePartRow[]> {
    const pnc = servicePncKey(rawPnc);
    if (!pnc) return [];
    const rows = await prisma.machineServicePart.findMany({
      where: { tenantId, pnc },
      select: { partNumber: true, name: true, kind: true },
    });
    return rows
      .map(row => ({ partNumber: row.partNumber, name: row.name, kind: row.kind as MachineServicePartRow['kind'] }))
      .sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a.name.localeCompare(b.name, 'pt-BR'));
  }
}
