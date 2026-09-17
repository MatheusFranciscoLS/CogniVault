import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { normalizeIdentifier } from '../utils/normalize';
import { auditPortalModels, PORTAL_BR_SITE } from '../services/portal-model-audit.service';

function argValue(name: string): string {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length).trim() || '';
}

function parseModels(raw: string): string[] {
  const unique = new Map<string, string>();
  for (const value of raw.split(/[,;\n]+/)) {
    const model = value.trim();
    const normalized = normalizeIdentifier(model);
    if (!normalized || normalized.length > 40 || unique.has(normalized)) continue;
    unique.set(normalized, model);
  }
  return [...unique.values()];
}

async function main() {
  const models = parseModels(argValue('models'));
  if (!models.length) throw new Error('Informe --models=323R,P12597,...');

  const requestedConcurrency = Number(argValue('concurrency') || '2');
  const concurrency = Number.isFinite(requestedConcurrency)
    ? Math.max(1, Math.min(4, Math.trunc(requestedConcurrency)))
    : 2;

  const results = await auditPortalModels(models, concurrency);
  const report = {
    generatedAt: new Date().toISOString(),
    site: PORTAL_BR_SITE,
    models: results,
  };

  const output = argValue('output');
  if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error('❌ Auditoria focada do Portal não executada:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
