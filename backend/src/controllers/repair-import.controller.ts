import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AuditService } from '../services/audit.service';
import {
  MAX_IMPORT_FILES_PER_BATCH,
  RepairImportApprovalError,
  applyRepairImport,
  previewRepairImport,
  type RepairImportFile,
} from '../services/repair-import.service';

/** 600 KB em bytes viram ~800 mil caracteres em base64; o teto protege a memória do Render free. */
const MAX_BASE64_LENGTH = 820_000;

function readFiles(body: unknown): RepairImportFile[] | null {
  const files = (body as { files?: unknown } | null)?.files;
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_IMPORT_FILES_PER_BATCH) return null;
  const parsed: RepairImportFile[] = [];
  for (const file of files) {
    const entry = file as Partial<RepairImportFile> | null;
    if (!entry || typeof entry.name !== 'string' || entry.name.length === 0 || entry.name.length > 260) return null;
    if (typeof entry.data !== 'string' || entry.data.length === 0 || entry.data.length > MAX_BASE64_LENGTH || !/^[A-Za-z0-9+/]+={0,2}$/.test(entry.data)) return null;
    const modifiedAt = Number(entry.modifiedAt);
    if (!Number.isFinite(modifiedAt)) return null;
    parsed.push({ name: entry.name, modifiedAt, data: entry.data });
  }
  return parsed;
}

/**
 * Importação dos orçamentos de conserto antigos pela tela do administrador (aba Conserto). Duas chamadas por lote de até 30 planilhas: `preview` só
 * LÊ; `apply` recalcula e só grava se o lote tem tantos orçamentos quanto o relatório aprovado mostrou. Só administrador.
 */
export class RepairImportController {
  async preview(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const files = readFiles(req.body);
    if (!files) {
      res.status(400).json({ error: `Envie de 1 a ${MAX_IMPORT_FILES_PER_BATCH} planilhas por vez (nome, data e conteúdo).` });
      return;
    }
    try {
      res.set('Cache-Control', 'no-store').json(await previewRepairImport(req.user.tenantId, files));
    } catch (error) {
      console.error('❌ Erro ao ler os orçamentos de conserto:', error);
      res.status(500).json({ error: 'Não foi possível ler as planilhas.' });
    }
  }

  async apply(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;
    const files = readFiles(req.body);
    const expect = Number(req.query.expect);
    if (!files || !Number.isInteger(expect) || expect < 0 || expect > MAX_IMPORT_FILES_PER_BATCH) {
      res.status(400).json({ error: 'Envie as planilhas e o número de orçamentos aprovado no relatório.' });
      return;
    }
    try {
      const result = await applyRepairImport(req.user.tenantId, files, expect);
      void AuditService.record({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        action: 'REPAIR_IMPORT',
        targetType: 'Quote',
        metadata: { created: result.created, exists: result.exists, skipped: result.skipped, problems: result.problems },
      });
      res.set('Cache-Control', 'no-store').json(result);
    } catch (error) {
      if (error instanceof RepairImportApprovalError) {
        res.status(409).json({ error: error.message });
        return;
      }
      console.error('❌ Erro ao gravar os orçamentos de conserto:', error);
      res.status(500).json({ error: 'Não foi possível gravar este lote. O que já foi gravado em lotes anteriores continua na pasta.' });
    }
  }
}

export const repairImportController = new RepairImportController();
