import { PDFParse } from 'pdf-parse';
import {
  analyzeBriggsIplText,
  briggsDeclineLabel,
  type BriggsDeclineReason,
  type BriggsIplPart,
} from '../utils/briggs-ipl-text';
import { BriggsManualsService } from './briggs-manuals.service';
import { OfficialSourceCacheService, buildOfficialSourceCacheKey } from './official-source-cache.service';
import { OfficialPartIndexService } from './official-part-index.service';

const TIMEOUT_MS = 30_000;
/**
 * Teto do PDF. Os reais têm 0,8–1,5 MB; 12 MB é folga larga e ainda protege o
 * Render free, que tem pouca memória, de baixar algo inesperado.
 */
const MAX_PDF_BYTES = 12 * 1024 * 1024;

/**
 * Lê a lista de peças da Briggs do PDF oficial.
 *
 * Pedido do dono: *"eu queria travar essa mesma lógica… só aceitar quando o
 * parser tiver certeza, e recusar em vez de chutar"*. A decisão toda mora em
 * `utils/briggs-ipl-text.ts`, que é regex puro e testável; aqui só o transporte
 * (baixar, extrair texto, cachear).
 *
 * **Não há IA nenhuma neste caminho.** É a camada de texto do PDF oficial da
 * Briggs, lida por regex, com o modelo do PDF conferido contra o pedido. Quando
 * qualquer coisa não fecha, a resposta é a recusa **com motivo** — e o link do
 * PDF continua valendo como vista explodida, que é a saída que o dono pediu.
 */

/** Cache longo: a lista de peças de um motor não muda. */
const FRESH_MS = 30 * 24 * 60 * 60 * 1000;
const STALE_MS = 180 * 24 * 60 * 60 * 1000;

export type BriggsIplOutcome =
  | { status: 'READ'; model: string; parts: BriggsIplPart[]; sourceUrl: string; language: string }
  | { status: 'DECLINED'; reason: BriggsDeclineReason; label: string; sourceUrl: string | null }
  | { status: 'NO_MANUAL' };

async function downloadPdf(url: string): Promise<Buffer | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) return null;

    const declared = Number(response.headers.get('content-length') || 0);
    if (declared && declared > MAX_PDF_BYTES) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_PDF_BYTES) return null;
    // Assinatura de PDF. Sem ela, o visualizador devolveu uma página de erro em
    // vez do arquivo, e passar isso ao parser só geraria recusa confusa.
    if (buffer.subarray(0, 5).toString() !== '%PDF-') return null;
    return buffer;
  } finally {
    clearTimeout(timeout);
  }
}

async function pdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text || '';
  } finally {
    // `destroy` libera o worker do pdf.js; sem isto o processo do Render fica
    // com o handle aberto a cada leitura.
    await (parser as { destroy?: () => Promise<void> }).destroy?.();
  }
}

export class BriggsIplService {
  /**
   * Peças do motor Briggs, quando o PDF permite ler com certeza.
   *
   * Prefere a lista em **inglês**: é a ordem que o dono pediu, e o PDF chinês é
   * recusado de qualquer forma (`NOT_LATIN`/`NO_MODEL`), porque o atendente não
   * consegue conferir a peça pela descrição.
   */
  static async forModel(rawModel: string | null | undefined): Promise<BriggsIplOutcome> {
    const manuals = await BriggsManualsService.forModel(rawModel);
    const manual = manuals.partsManuals[0];
    if (!manual) return { status: 'NO_MANUAL' };

    const key = buildOfficialSourceCacheKey('BRIGGS', 'IPL_PARTS', manual.url);

    const loader = async (): Promise<BriggsIplOutcome | null> => {
      const buffer = await downloadPdf(manual.url);
      if (!buffer) {
        return {
          status: 'DECLINED',
          reason: 'NO_TEXT_LAYER',
          label: briggsDeclineLabel('NO_TEXT_LAYER'),
          sourceUrl: manual.url,
        };
      }

      const text = await pdfText(buffer);
      const result = analyzeBriggsIplText(text, manuals.model);

      if (!result.ok) {
        // A recusa é resposta legítima e vai para o cache: o PDF não muda, e
        // reprocessar 1,5 MB a cada consulta para chegar na mesma recusa só
        // gastaria o Render.
        return {
          status: 'DECLINED',
          reason: result.reason,
          label: briggsDeclineLabel(result.reason),
          sourceUrl: manual.url,
        };
      }

      // Guarda as peças para poderem ser PESQUISADAS depois. Fica dentro do
      // loader de propósito: só roda quando o PDF foi lido de verdade, não a
      // cada consulta que o cache responde. Sem `await` porque é efeito
      // colateral — o balcão não pode esperar 283 gravações para ver a lista, e
      // `record` nunca lança.
      void OfficialPartIndexService.record('BRIGGS', result.model, result.parts.map(part => ({
        partNumber: part.partNumber,
        name: part.name,
        position: part.position,
        assembly: part.section,
        quantity: part.quantity,
      })));

      return {
        status: 'READ',
        model: result.model,
        parts: result.parts,
        sourceUrl: manual.url,
        language: manual.languageLabel,
      };
    };

    try {
      const cached = await OfficialSourceCacheService.get<BriggsIplOutcome>(
        key,
        {
          source: 'BRIGGS',
          resourceType: 'IPL_PARTS',
          resourceId: manuals.model,
          freshMs: FRESH_MS,
          staleMs: STALE_MS,
        },
        loader,
      );
      if (cached.value) return cached.value;
    } catch (cacheError) {
      console.warn(
        `[Briggs IPL] Cache indisponível para "${manuals.model}"; lendo direto.`,
        cacheError instanceof Error ? cacheError.message : cacheError,
      );
    }

    try {
      return (await loader()) ?? { status: 'NO_MANUAL' };
    } catch (error) {
      console.warn(
        `[Briggs IPL] Não foi possível ler o PDF de "${manuals.model}":`,
        error instanceof Error ? error.message : error,
      );
      // Falha de transporte não é "o PDF não serve": o link continua valendo.
      return {
        status: 'DECLINED',
        reason: 'NO_TEXT_LAYER',
        label: briggsDeclineLabel('NO_TEXT_LAYER'),
        sourceUrl: manual.url,
      };
    }
  }
}
