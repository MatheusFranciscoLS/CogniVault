import { createHash } from 'node:crypto';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';

const gunzipAsync = promisify(gunzip);

export class GzipJsonError extends Error {}

/**
 * Lê um corpo `gzip(JSON)` e devolve o objeto e o SHA-256 do JSON já descomprimido.
 *
 * A lista de preços é lida no navegador do administrador e enviada comprimida: descomprimida passa dos 2 MB que o `express.json` aceita, e comprimida
 * cabe com folga nos limites do proxy. O teto de saída (`maxBytes`) é a proteção contra um arquivo pequeno que vira gigante ao descomprimir.
 */
export async function decodeGzipJson(body: unknown, maxBytes: number): Promise<{ value: Record<string, unknown>; hash: string }> {
  if (!Buffer.isBuffer(body) || body.length === 0) throw new GzipJsonError('Nenhum arquivo foi enviado.');
  let raw: Buffer;
  try {
    raw = await gunzipAsync(body, { maxOutputLength: maxBytes });
  } catch (error) {
    const tooBig = error instanceof RangeError || (error as { code?: string })?.code === 'ERR_BUFFER_TOO_LARGE';
    throw new GzipJsonError(tooBig ? 'O arquivo é maior do que o aceito.' : 'O arquivo enviado está corrompido.');
  }
  let value: unknown;
  try {
    value = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new GzipJsonError('O arquivo enviado não é um JSON válido.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GzipJsonError('O arquivo enviado não tem o formato esperado.');
  return { value: value as Record<string, unknown>, hash: createHash('sha256').update(raw).digest('hex') };
}
