import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../config/prisma';
import { judgeTestDatabase } from '../utils/test-database-guard';
import { husqvarnaArticleIdCandidates } from '../utils/husqvarna-article-id';
import { HusqvarnaOfficialDetailService } from '../services/husqvarna-official-detail.service';
import {
  baseEnginesForMachine,
  engineBrandOf,
  enginesCitedByPortal,
  enginesFromListingSpec,
  mergeEngineHints,
  OWNER_BASE_ENGINES,
  type MachineEngineHint,
} from '../services/machine-base-engine';
import { ENGINE_APPLICATIONS } from '../services/husqvarna-domain-knowledge';
import { KohlerCatalogService } from '../services/kohler-catalog.service';
import { KawasakiPartStreamService } from '../services/kawasaki-partstream.service';
import { BriggsManualsService } from '../services/briggs-manuals.service';

/**
 * Auditoria máquina <-> motor (2026-10-08, "não podemos errar isso").
 *
 * Para cada máquina da lista vigente, monta o MESMO vínculo que o balcão mostra (Portal por PNC + ficha da lista de preços + IPL do
 * catálogo + pares da loja), aponta onde as fontes divergem e confere que o catálogo de cada motor nomeado de fato RESPONDE
 * (Kohler, Kawasaki, Briggs).
 *
 * É só leitura da lista de máquinas e das fontes oficiais. Usa o banco apontado por DATABASE_URL apenas como cache das consultas, e
 * RECUSA banco hospedado: rode contra a loja simulada (ver docs/loja-simulada). O relatório vai para fora do repositório
 * (`--out=`; padrão C:\DadosLoja\auditoria-motores.json): é leitura da lista da loja.
 *
 * Uso: DATABASE_URL=<banco local> npx tsx src/scripts/audit-machine-engines.ts [--only=Z460,R316TX] [--out=<arquivo>] [--concurrency=3]
 */

function argValue(name: string): string {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length).trim() || '';
}

type CatalogProbe = { brand: string; model: string; ok: boolean; detail: string };

type Verdict = 'SEM_MOTOR_NOMEADO' | 'ABRE' | 'ABRE_PELA_SERIE' | 'NAO_ABRE' | 'FONTES_DIVERGEM' | 'PORTAL_SEM_ARTIGO';

type Row = {
  model: string;
  category: string;
  pnc: string;
  portal: 'OK' | 'SEM_ARTIGO';
  shownToCounter: Array<Pick<MachineEngineHint, 'brand' | 'model' | 'machinePnc' | 'source' | 'precision'>>;
  verdict: Verdict;
  note: string;
};

const norm = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** A série Kawasaki de um modelo (FR730V-FS16 -> FR730V); outros modelos ficam como estão. */
const seriesOf = (model: string) => norm(model).replace(/^(F[A-Z]\d{3,4}V).*$/, '$1');

async function probeCatalog(brand: string | null, model: string): Promise<CatalogProbe | null> {
  const label = brand ?? '?';
  try {
    if (brand === 'Kohler') {
      const catalog = await KohlerCatalogService.forSpec(model);
      const ok = Boolean(catalog.description) && catalog.groups.length > 0;
      return { brand: label, model, ok, detail: ok ? `${catalog.groups.length} grupos · ${catalog.description}` : 'catálogo não conhece este spec' };
    }
    if (brand === 'Kawasaki') {
      const catalog = await KawasakiPartStreamService.forModel(model);
      const ok = catalog.assemblies.length > 0;
      return { brand: label, model, ok, detail: ok ? `${catalog.assemblies.length} conjuntos` : catalog.needsSpec.length ? `faltou o spec (${catalog.needsSpec.length} opções)` : 'sem catálogo' };
    }
    if (brand === 'Briggs & Stratton') {
      const manuals = await BriggsManualsService.forModel(model);
      const ok = manuals.partsManuals.length > 0;
      return { brand: label, model, ok, detail: ok ? manuals.partsManuals.map(item => item.languageLabel).join(' + ') : 'sem lista de peças' };
    }
  } catch (error) {
    return { brand: label, model, ok: false, detail: `erro: ${error instanceof Error ? error.message : String(error)}`.slice(0, 120) };
  }
  return null;
}

async function main() {
  const verdict = judgeTestDatabase(process.env.DATABASE_URL);
  if (!verdict.allowed) throw new Error(`Recusado: ${verdict.reason} Aponte DATABASE_URL para o banco da loja simulada.`);

  const only = new Set(argValue('only').split(',').map(item => norm(item)).filter(Boolean));
  const concurrency = Math.max(1, Math.min(4, Number(argValue('concurrency')) || 3));
  const outFile = argValue('out') || 'C:\\DadosLoja\\auditoria-motores.json';

  const machines = (await prisma.machineListing.findMany({ select: { model: true, pnc: true, category: true, specs: true }, orderBy: { sortOrder: 'asc' } }))
    .filter(machine => !only.size || only.has(norm(machine.model)));
  console.log(`Máquinas na lista: ${machines.length}`);

  const rows: Row[] = [];
  const cursor = { index: 0 };

  async function worker() {
    while (cursor.index < machines.length) {
      const machine = machines[cursor.index++];
      let details = null;
      for (const candidate of husqvarnaArticleIdCandidates(machine.pnc.replace(/BR$/i, ''))) {
        details = await HusqvarnaOfficialDetailService.getProductDetails(candidate).catch(() => null);
        if (details) break;
      }
      const motor = Array.isArray(machine.specs) ? (machine.specs as Array<{ label?: string; value?: string }>).find(spec => spec.label === 'Motor')?.value : null;
      const shown = mergeEngineHints(enginesCitedByPortal(details, machine.pnc), enginesFromListingSpec(motor), baseEnginesForMachine(machine.model));

      // Fontes que citam séries diferentes da MESMA marca (ex.: a lista diz FR691V e o IPL antigo diz FX730V).
      const seriesByBrand = new Map<string, Set<string>>();
      for (const item of shown.filter(hint => hint.model)) {
        const key = item.brand ?? '?';
        seriesByBrand.set(key, (seriesByBrand.get(key) ?? new Set<string>()).add(seriesOf(item.model)));
      }
      const diverge = [...seriesByBrand.values()].some(set => set.size > 1);

      let label: Verdict = 'ABRE'; // refinado depois da checagem dos catálogos
      let note = '';
      if (!details) { label = 'PORTAL_SEM_ARTIGO'; note = 'o Portal não devolveu o artigo desta máquina'; }
      else if (!shown.length) label = 'SEM_MOTOR_NOMEADO';
      else if (diverge) { label = 'FONTES_DIVERGEM'; note = 'duas fontes citam séries diferentes da mesma marca: a plaqueta decide'; }

      rows.push({
        model: machine.model,
        category: machine.category,
        pnc: machine.pnc,
        portal: details ? 'OK' : 'SEM_ARTIGO',
        shownToCounter: shown.map(item => ({ brand: item.brand, model: item.model, machinePnc: item.machinePnc, source: item.source, precision: item.precision })),
        verdict: label,
        note,
      });
      process.stdout.write('.');
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  console.log('');

  // Confere cada catálogo de motor mostrado, uma vez por (marca, modelo).
  const toProbe = new Map<string, { brand: string | null; model: string }>();
  for (const row of rows) {
    for (const engine of row.shownToCounter) if (engine.model) toProbe.set(`${engine.brand}|${norm(engine.model)}`, { brand: engine.brand, model: engine.model });
  }
  const probes: CatalogProbe[] = [];
  for (const item of toProbe.values()) {
    const probe = await probeCatalog(item.brand, item.model);
    if (probe) probes.push(probe);
    process.stdout.write('+');
  }
  console.log('');

  const probeOf = (brand: string | null, model: string) => probes.find(p => p.brand === (brand ?? '?') && norm(p.model) === norm(model));
  for (const row of rows) {
    if (row.verdict !== 'ABRE') continue;
    const checked = row.shownToCounter
      .filter(item => item.model && item.precision !== 'SO_MARCA')
      .map(item => ({ item, probe: probeOf(item.brand, item.model) }));
    if (!checked.length) { row.verdict = 'SEM_MOTOR_NOMEADO'; row.note = 'só a marca (ver plaqueta)'; }
    else if (checked.some(entry => entry.probe?.ok)) row.verdict = 'ABRE';
    else if (checked.some(entry => entry.item.precision === 'SERIE' && /spec/.test(entry.probe?.detail ?? ''))) { row.verdict = 'ABRE_PELA_SERIE'; row.note = 'o catálogo pergunta o spec da plaqueta'; }
    else { row.verdict = 'NAO_ABRE'; row.note = checked.map(entry => `${entry.item.model}: ${entry.probe?.detail ?? 'não conferido'}`).join(' | '); }
  }

  rows.sort((a, b) => a.model.localeCompare(b.model));
  const count = (v: Verdict) => rows.filter(row => row.verdict === v).length;
  console.log('\n=== Resultado ===');
  for (const v of ['ABRE', 'ABRE_PELA_SERIE', 'NAO_ABRE', 'FONTES_DIVERGEM', 'SEM_MOTOR_NOMEADO', 'PORTAL_SEM_ARTIGO'] as const) console.log(`${String(count(v)).padStart(4)}  ${v}`);

  console.log('\n-- Máquinas com motor nomeado (o que o balcão mostra)');
  for (const row of rows.filter(r => r.shownToCounter.length)) {
    const engines = row.shownToCounter.map(e => `${e.brand ?? '?'} ${e.model || '(plaqueta)'} <${e.source}${e.precision === 'MODELO' ? '' : `/${e.precision}`}>`).join('; ');
    console.log(`  [${row.verdict}] ${row.model} (${row.category}): ${engines}${row.note ? ` — ${row.note}` : ''}`);
  }

  console.log('\n-- Catálogos de motor conferidos');
  for (const probe of probes.sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model))) {
    console.log(`  ${probe.ok ? 'OK    ' : 'FALHOU'} ${probe.brand} ${probe.model} — ${probe.detail}`);
  }
  // Máquinas com vínculo fora da lista vigente (tratores, cortadores e giro zero de linhas antigas): o catálogo do motor também tem que abrir.
  const listed = new Set(rows.map(row => norm(row.model)));
  const outside = [...new Set([...ENGINE_APPLICATIONS.map(app => app.machineModel), ...OWNER_BASE_ENGINES.map(base => base.machineModel)])]
    .filter(model => !listed.has(norm(model)));
  console.log(`\n-- Vínculos de máquinas fora da lista vigente (${outside.length})`);
  const outsideFailures: string[] = [];
  for (const machineModel of outside) {
    for (const hint of baseEnginesForMachine(machineModel)) {
      if (!hint.model || hint.precision === 'SO_MARCA') continue;
      const probe = await probeCatalog(hint.brand, hint.model);
      const state = !probe ? 'sem leitor para a marca' : probe.ok ? 'OK' : /spec/.test(probe.detail) ? 'pela série' : 'NÃO ABRE';
      if (state === 'NÃO ABRE') outsideFailures.push(`${machineModel}: ${hint.brand} ${hint.model}`);
      console.log(`  ${state.padEnd(8)} ${machineModel} -> ${hint.brand ?? '?'} ${hint.model} <${hint.source}${hint.machinePnc ? ` PNC ${hint.machinePnc}` : ''}> ${probe ? `— ${probe.detail}` : ''}`);
    }
  }
  console.log(`  Não abrem: ${outsideFailures.length}`);

  const wrongBrand = rows.flatMap(row => row.shownToCounter).filter(engine => engine.model && engine.brand !== engineBrandOf(engine.model));
  console.log(`\nMarca do vínculo diferente da marca do formato do modelo: ${wrongBrand.length}`);

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), rows, probes }, null, 2));
  console.log(`\nRelatório completo: ${outFile}`);
}

main()
  .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
