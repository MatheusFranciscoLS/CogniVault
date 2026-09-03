import fs from 'node:fs';
import path from 'node:path';

// Base truth parts
const BASE_PARTS = [
  { model: '143RII', name: 'Carburador', part: '587106701', synonyms: ['carburador', 'bura', 'carburador original', 'carburacao', 'carburador zama'] },
  { model: '143RII', name: 'Embreagem', part: '503600402', synonyms: ['embreagem completa', 'patim de embreagem', 'conjunto de embreagem', 'embreagem centrifugo'] },
  { model: '143RII', name: 'Mola da Embreagem', part: '505297801', synonyms: ['mola da embreagem', 'molinha', 'mola do patim', 'mola de retorno'] },
  { model: '143RII', name: 'Filtro de Ar', part: '505309201', synonyms: ['filtro de ar', 'espuma do ar', 'elemento filtrante', 'esponja do ar'] },
  
  { model: '125B', name: 'Carburador', part: '545081811', synonyms: ['carburador', 'bura', 'carburador original', 'carburador zama c1q'] },
  { model: '125B', name: 'Caracol', part: '545114101', synonyms: ['caracol', 'voluta', 'carcaca do ventilador', 'scroll', 'caixa do vento'] },
  { model: '125B', name: 'Tubo do Soprador', part: '545140201', synonyms: ['tubo do soprador', 'cano', 'bocal longo', 'ponteira'] },
  
  { model: 'MZ54', name: 'Lâmina', part: '532187256', synonyms: ['lamina', 'faca de corte', 'lamina hi-lift', 'faca'] },
  { model: 'MZ54', name: 'Correia da Plataforma', part: '539114557', synonyms: ['correia da plataforma', 'correia do deck', 'correia de corte', 'correia das facas'] },
  { model: 'MZ54', name: 'Filtro de Óleo', part: '539102606', synonyms: ['filtro de oleo', 'filtro do motor', 'filtro lubrificante'] },
  
  { model: 'Z248F', name: 'Lâmina', part: '539113425', synonyms: ['lamina', 'faca', 'lamina de corte', 'faca original'] },
  { model: 'Z248F', name: 'Correia de Tração', part: '539110411', synonyms: ['correia de tracao', 'correia do hidromatico', 'correia do motor pra caixa', 'correia de movimento'] },
  { model: 'Z248F', name: 'Roldana', part: '539110311', synonyms: ['roldana', 'polia', 'polia esticadora', 'polia louca'] },
  
  { model: 'TS114', name: 'Lâmina', part: '537674410', synonyms: ['lamina', 'faca', 'lamina de reciclagem', 'faca mulching'] },
  { model: 'TS114', name: 'Correia de Corte', part: '531147906', synonyms: ['correia do deck', 'correia das laminas', 'correia de corte'] },
  { model: 'TS114', name: 'Cabo de Aceleração', part: '581562901', synonyms: ['cabo de aceleracao', 'espião', 'cabo do acelerador'] },
  
  { model: '143RS', name: 'Cilindro e Pistão', part: '503609102', synonyms: ['kit cilindro', 'kit motor', 'cilindro e pistao', 'camisa e pistao'] },
  { model: '143RS', name: 'Vela', part: '503235111', synonyms: ['vela', 'vela de ignicao', 'vela do motor', 'vela original'] },
  
  { model: 'TS217', name: 'Filtro de Ar', part: '590825601', synonyms: ['filtro de ar', 'elemento filtrante', 'filtro de papel', 'filtro principal'] },
  { model: 'TS217', name: 'Bateria', part: '594891101', synonyms: ['bateria', 'acumulador', 'bateria 12v'] },
];

const INTENTS = [
  "preciso do {part} da {model}",
  "qual o codigo do {part} p/ {model}?",
  "quero comprar {part} {model}",
  "tem {part} pro {model}?",
  "me arruma o pn do {part} do {model}",
  "{part} {model} husqvarna",
  "codigo husqvarna {part} {model}",
  "{model} {part}",
  "cliente quer {part} da maquina {model}",
  "buscando o codigo de fabrica do {part} da {model}",
  "vende {part} do {model}?",
  "código de reposição {part} para o {model}",
  "qual a numeração do {part} - {model}?",
  "preciso da peça {part} que vai na {model}",
  "alguém sabe o cod do {part} do trator {model}?",
  "orçamento de {part} p/ roçadeira {model}",
  "vê pra mim o preço do {part} da {model} (só código por favor)",
  "peça original husqvarna {model} {part}",
  "preciso substituir o {part} que quebrou no {model}",
  "{part} para {model}, qual o part number?",
  "numero da peça {part} {model}",
  "codigo de vista explodida do {part} {model}",
  "me passa a referencia do {part} do {model}",
  "catalogo {model} {part}",
  "onde acho {part} do {model}?"
];

const cases: any[] = [];
let idCounter = 1;

for (const base of BASE_PARTS) {
  for (const synonym of base.synonyms) {
    for (const intent of INTENTS) {
      if (cases.length >= 500) break;
      
      const query = intent.replace('{part}', synonym).replace('{model}', base.model);
      const id = `${base.model.toLowerCase()}-${base.name.toLowerCase().replace(/ /g, '-')}-${idCounter}`;
      
      cases.push({
        id,
        query,
        model: base.model,
        expectedPartNumbers: [base.part],
        source: `Golden Set 500 (${base.name})`
      });
      
      idCounter++;
    }
  }
}

// Shuffle the array to mix models
for (let i = cases.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [cases[i], cases[j]] = [cases[j], cases[i]];
}

// Slice to exactly 500
const finalCases = cases.slice(0, 500);

const outFile = path.resolve(__dirname, '500_benchmarks.json');
fs.writeFileSync(outFile, JSON.stringify(finalCases, null, 2), 'utf-8');
console.log(`Gerou ${finalCases.length} casos sintéticos em ${outFile}`);
