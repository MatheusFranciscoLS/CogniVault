// Gera o orçamento-modelo (PDF) de TODAS as máquinas da Tabela de preços, com a mesma lógica da gaveta: descrição da ficha,
// complemento sugerido pelo Portal, foto, "o que acompanha" nas roçadeiras. Preço = o da lista (o atendente ajusta ao usar).
// Saída em C:\DadosLoja\Orcamentos-modelo\<Categoria>\ (FORA do repositório e do OneDrive: a lista de preços da Husqvarna
// tem aviso de propriedade intelectual e o repositório é público).
//
// Pré-requisito: loja simulada de pé com a lista de máquinas importada. Uso (de dentro de frontend/):
//   node ../docs/loja-simulada/gerar-orcamentos-modelo.mjs [pasta-de-saida]
import fs from 'node:fs';
import path from 'node:path';
import { open } from './_t.mjs';

const SAIDA = process.argv[2] ?? 'C:/DadosLoja/Orcamentos-modelo';
const TEMP = path.resolve('src/__lote.ts');

// Módulo temporário dentro do front, só para o Vite resolver jspdf e os módulos do app; é apagado no fim.
fs.writeFileSync(TEMP, `
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { apiJson } from './lib';
import { machinePhotoUrl, portalPnc, type ListedMachine } from './lib/machine-list';
import { buildMachineQuotePdf, defaultHighlight, defaultIncludeEquipment, machineQuoteDescription, machineVariantNote, suggestComplement, type MachineQuoteFields } from './lib/machine-quote';
import { loadProductImage, loadStoreLogo } from './lib/pdf-assets';

type Detail = { equipment?: { included: Array<{ name: string; value: string | null }>; notIncluded: Array<{ name: string; value: string | null }> } | null; imageUrl?: string | null; features?: Array<{ name: string }>; specifications?: Array<{ group: string; name: string; value: string }> };

export async function listar(): Promise<ListedMachine[]> {
  const data = await apiJson<{ machines: ListedMachine[] }>('/api/machine-list', { timeoutMs: 30000 });
  return data.machines;
}

export async function gerar(machine: ListedMachine, todas: ListedMachine[]) {
  let detail: Detail | null = null;
  try {
    const data = await apiJson<{ product?: Detail }>('/api/husqvarna/products/' + encodeURIComponent(portalPnc(machine.pnc)) + '/details', { timeoutMs: 25000 });
    detail = data.product ?? null;
  } catch { detail = null; }
  const equipment = detail?.equipment ?? null;
  const includeEquipment = defaultIncludeEquipment(machine, equipment);
  const fields: MachineQuoteFields = {
    customerName: '', price: machine.listPrice, payment: 'A combinar', leadTime: 'Imediato',
    observation: 'Preços para produto a serem faturados no estado de São Paulo',
    complement: suggestComplement(machine, detail ? { features: detail.features, specifications: detail.specifications } : null),
    highlight: defaultHighlight(machine.application), includeEquipment,
  };
  // Portal primeiro (qualidade), pelo PNC e pelo nome; a foto da lista é a reserva.
  let photoUrl = detail?.imageUrl ?? null;
  if (!photoUrl) {
    try {
      const found = await apiJson<{ results?: Array<{ imageUrl: string | null }> }>('/api/husqvarna/products/search?q=' + encodeURIComponent(machine.model) + '&exact=1', { timeoutMs: 20000 });
      photoUrl = found.results?.find(item => item.imageUrl)?.imageUrl ?? null;
    } catch { photoUrl = null; }
  }
  if (!photoUrl && machine.hasPhoto) photoUrl = machinePhotoUrl(machine.pnc);
  const photo = photoUrl ? await loadProductImage(photoUrl) : null;
  const doc = buildMachineQuotePdf({ doc: new jsPDF('p', 'pt', 'a4'), autoTable, machine, equipment, fields, variant: machineVariantNote(machine, todas), logo: await loadStoreLogo(), photo });
  const base64 = (doc.output('datauristring') as string).split(',')[1];
  const descricao = machineQuoteDescription(machine, fields.complement, machineVariantNote(machine, todas));
  return { base64, descricao, comPortal: Boolean(detail), comFoto: Boolean(photo), fonteFoto: photo ? (photoUrl && photoUrl.startsWith("/api/") ? "lista" : "portal") : null, complemento: fields.complement, equipamento: includeEquipment };
}
`);

const { browser, page } = await open({ theme: 'light' });
const limpar = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
const resumo = [];
try {
  await page.getByRole('button', { name: 'Tabela de preços', exact: true }).click();
  const maquinas = await page.evaluate(async () => (await import('/src/__lote.ts')).listar());
  console.log(`${maquinas.length} máquinas na lista`);

  const vistos = new Map();
  for (const m of maquinas) vistos.set(m.model, (vistos.get(m.model) ?? 0) + 1);
  let feito = 0;
  const fila = [...maquinas];
  const trabalhar = async () => {
    for (let m = fila.shift(); m; m = fila.shift()) {
      try {
        const r = await page.evaluate(async ([x, todas]) => (await import('/src/__lote.ts')).gerar(x, todas), [m, maquinas]);
        const pasta = path.join(SAIDA, limpar(m.category) || 'Outros');
        fs.mkdirSync(pasta, { recursive: true });
        const sufixo = vistos.get(m.model) > 1 ? `-${m.pnc.replace(/[^A-Za-z0-9]/g, '')}` : '';
        const arquivo = path.join(pasta, `Orcamento-${limpar(m.model)}${sufixo}.pdf`);
        fs.writeFileSync(arquivo, Buffer.from(r.base64, 'base64'));
        resumo.push({ modelo: m.model, categoria: m.category, preco: m.listPrice, descricao: r.descricao, foto: r.comFoto, fonteFoto: r.fonteFoto, portal: r.comPortal, complemento: Boolean(r.complemento), acompanha: r.equipamento });
      } catch (erro) {
        resumo.push({ modelo: m.model, categoria: m.category, erro: String(erro).slice(0, 120) });
      }
      feito += 1;
      if (feito % 10 === 0) console.log(`  ${feito}/${maquinas.length}`);
    }
  };
  await Promise.all([trabalhar(), trabalhar(), trabalhar()]);
} finally {
  fs.rmSync(TEMP, { force: true });
  await browser.close();
}

const erros = resumo.filter(r => r.erro);
const comFoto = resumo.filter(r => r.foto).length;
const semPortal = resumo.filter(r => !r.erro && !r.portal);
const linhas = [
  `Orçamentos-modelo gerados em ${new Date().toLocaleString('pt-BR')}`,
  `Total: ${resumo.length - erros.length} PDFs (${erros.length} com erro)`,
  `Com foto da máquina: ${comFoto} (Portal: ${resumo.filter(r => r.fonteFoto === "portal").length}, lista: ${resumo.filter(r => r.fonteFoto === "lista").length})`,
  `Com complemento sugerido pelo Portal: ${resumo.filter(r => r.complemento).length}`,
  `Com "conjunto composto por": ${resumo.filter(r => r.acompanha).length}`,
  `Sem resposta do Portal (sem foto e sem complemento): ${semPortal.length} - ${semPortal.map(r => r.modelo).join(', ')}`,
  '',
  'O preço de cada PDF é o da lista vigente; ajuste ao usar. A/C e ATT. ficam em branco.',
  ...erros.map(r => `ERRO ${r.modelo}: ${r.erro}`),
];
fs.writeFileSync(path.join(SAIDA, 'LEIA-ME.txt'), linhas.join('\n'), 'utf8');

// Índice para abrir no Excel: uma linha por máquina, com a frase "01-)" que saiu no PDF.
const aspas = valor => `"${String(valor).replace(/"/g, '""')}"`;
const indice = resumo
  .filter(r => !r.erro)
  .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.modelo.localeCompare(b.modelo))
  .map(r => [r.modelo, r.categoria, String(r.preco).replace('.', ','), r.foto ? 'sim' : 'não', r.descricao].map(aspas).join(';'));
fs.writeFileSync(path.join(SAIDA, 'INDICE.csv'), '﻿' + ['Modelo;Categoria;Preço da lista;Foto;Descrição', ...indice].join('\r\n'), 'utf8');
console.log(linhas.join('\n'));
process.exit(erros.length ? 1 : 0);
