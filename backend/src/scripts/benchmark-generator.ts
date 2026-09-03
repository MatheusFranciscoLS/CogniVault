import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_FILE = path.resolve(__dirname, '../../benchmark_synthetic_cases.json');

const TARGET_MODELS = ['MZ54', '143R-II', '143RS', '125B', 'Z248F', 'TS114', 'TS217'];

const PARTS = [
  { term: 'carburador', slangs: ['bura', 'carbura', 'carburador completo'] },
  { term: 'virabrequim', slangs: ['eixo', 'vira', 'girabrequim'] },
  { term: 'bobina de ignição', slangs: ['bobina', 'faiscador', 'módulo de ignição'] },
  { term: 'cabo de acelerador', slangs: ['espia', 'cabo do acelerador'] },
  { term: 'filtro de ar', slangs: ['espuma do ar', 'elemento do ar', 'filtro'] },
  { term: 'pistão', slangs: ['pistao', 'cabeça'] },
  { term: 'jogo de anéis', slangs: ['aneis', 'segmentos', 'anéis de segmento'] },
  { term: 'vela de ignição', slangs: ['vela', 'vela de ignicao'] },
  { term: 'embreagem', slangs: ['patim', 'sapatas', 'conjunto de embreagem'] },
  { term: 'carretel', slangs: ['cabeçote de fio', 'cabeça de nylon', 'trimmy'] },
  { term: 'faca', slangs: ['lamina', 'faca de corte', 'hélice'] },
  { term: 'correia', slangs: ['correia de tração', 'correia da plataforma'] }
];

const INTROS = [
  "Preciso da", "Vê pra mim a", "Tem aí o", "Consegue", 
  "Estou precisando de um", "Me arruma a", "Estou com um", 
  "Quero comprar o", "Qual o valor da"
];

const OUTROS = [
  "pro meu cliente", "pra ontem", "urgente", "orig", "original", "", "", ""
];

async function main() {
  console.log('🤖 Gerador de Benchmarks Sintéticos para Husqvarna (Modo Procedural / Custo Zero)');
  
  const cases: any[] = [];
  let idCounter = 1;
  
  // Para alcançar ~500 casos, vamos gerar permutações e adicionar variações até bater 500
  while (cases.length < 500) {
    for (const model of TARGET_MODELS) {
      for (const part of PARTS) {
        if (cases.length >= 500) break;
        
        // Pick random intro
        const intro = INTROS[Math.floor(Math.random() * INTROS.length)];
        const outro = OUTROS[Math.floor(Math.random() * OUTROS.length)];
        
        // Pick random term (either official or slang)
        const allTerms = [part.term, ...part.slangs];
        const selectedTerm = allTerms[Math.floor(Math.random() * allTerms.length)];
        
        // Format query
        const query = `${intro} ${selectedTerm} da máquina ${model} ${outro}`.trim().replace(/\s+/g, ' ');
        
        cases.push({
          id: `synth_${idCounter.toString().padStart(3, '0')}`,
          query,
          model,
          expectedPartNumbers: [], // A ser preenchido pelos testes
          source: 'Geração Procedural por Templates'
        });
        
        idCounter++;
      }
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(cases, null, 2), 'utf-8');
  console.log(`✅ Foram gerados e salvos ${cases.length} casos hiper-realistas em ${OUTPUT_FILE}`);
}

main().catch(console.error);
