import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { normalizeIdentifier } from '../utils/normalize';

/**
 * Aba "Tabela de preços": as máquinas da lista vigente da Husqvarna.
 *
 * Qualquer usuário logado lê (dono, 2026-10-07: "todos podem visualizar isso") e **só leitura**: a
 * tabela é gravada pelo importador (`scripts/import-machine-list-html.ts`), nunca por esta rota.
 * O preço é o da lista, sem a divisão por 0,92 que vale para peça.
 *
 * Devolve a lista inteira de uma vez (~150 máquinas) porque o filtro por categoria e a busca por
 * modelo acontecem na tela, sem nova ida ao Render free a cada tecla.
 */
export class MachineListingController {
  async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    try {
      const rows = await prisma.machineListing.findMany({
        where: { tenantId: req.user.tenantId },
        orderBy: [{ sortOrder: 'asc' }, { model: 'asc' }],
        select: {
          pnc: true,
          model: true,
          description: true,
          category: true,
          segment: true,
          technology: true,
          application: true,
          listPrice: true,
          discontinued: true,
          isNew: true,
          priceBefore: true,
          sortOrder: true,
          specs: true,
          details: true,
          listDate: true,
        },
      });

      // Quais máquinas têm foto (sem trazer os bytes): a tela só pede a foto de quem tem.
      const photos = await prisma.machineListingPhoto.findMany({
        where: { tenantId: req.user.tenantId },
        select: { normalizedPnc: true },
        take: 2000,
      });
      const withPhoto = new Set(photos.map(photo => photo.normalizedPnc));

      // A data é a mesma em todas as linhas (uma importação troca tudo).
      res.set('Cache-Control', 'private, max-age=300');
      res.json({
        listDate: rows[0]?.listDate ?? null,
        machines: rows.map(({ listDate: _listDate, ...machine }) => ({ ...machine, hasPhoto: withPhoto.has(normalizeIdentifier(machine.pnc)) })),
      });
    } catch (error) {
      // Banco fora não pode derrubar o processo (unhandledRejection desliga o servidor).
      console.error('❌ Erro ao listar a tabela de preços das máquinas:', error);
      res.set('Cache-Control', 'private, no-store');
      res.status(503).json({ error: 'Tabela de preços temporariamente indisponível.' });
    }
  }
}

/**
 * Foto da máquina para o orçamento (a da própria lista da Husqvarna). Só para quem está logado; os bytes vêm do banco
 * privado e são imagem comum (webp/png/jpeg), nunca texto, então não há o que executar no navegador.
 */
export async function machinePhoto(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) return;
  const key = normalizeIdentifier(String(req.params.pnc ?? '').slice(0, 40));
  if (!key) {
    res.status(400).json({ error: 'PNC inválido.' });
    return;
  }

  try {
    const photo = await prisma.machineListingPhoto.findUnique({
      where: { tenantId_normalizedPnc: { tenantId: req.user.tenantId, normalizedPnc: key } },
      select: { mime: true, data: true },
    });
    if (!photo) {
      res.status(404).json({ error: 'Esta máquina não tem foto na lista.' });
      return;
    }
    res.set({ 'Content-Type': photo.mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
    res.send(Buffer.from(photo.data));
  } catch (error) {
    console.error('❌ Erro ao ler a foto da máquina:', error);
    res.status(503).json({ error: 'Foto temporariamente indisponível.' });
  }
}

export const machineListingController = new MachineListingController();
