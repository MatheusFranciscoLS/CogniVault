import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  countNews,
  facetCounts,
  findListedMachine,
  portalPnc,
  matchesFilters,
  priceChange,
  searchKey,
  barLengthInches,
  sortMachines,
  technologyLabel,
  categoryLabel,
  type ListedMachine,
} from './machine-list';

// Máquinas inventadas: a lista real não entra no repositório.
const machine = (extra: Partial<ListedMachine>): ListedMachine => ({
  pnc: '900000001', model: 'X100', description: 'MOTOSSERRA X100', category: 'MOTOSSERRA', segment: null,
  technology: 'PRODUTOS A COMBUSTÃO', application: 'PROFISSIONAL', listPrice: 1000, discontinued: false, isNew: false,
  priceBefore: null, sortOrder: 0, specs: [], details: null, ...extra,
});

const lista = [
  machine({ pnc: '1', model: 'X100', category: 'MOTOSSERRA', listPrice: 1000, sortOrder: 1 }),
  machine({ pnc: '2', model: 'X20', category: 'MOTOSSERRA', listPrice: 500, isNew: true }),
  machine({ pnc: '3', model: '143R II', description: 'ROÇADEIRA 143R II', category: 'ROÇADEIRA', application: 'COMERCIAL', listPrice: 2000, priceBefore: 2500, sortOrder: 2 }),
  machine({ pnc: '4', model: 'B36', description: 'SOPRADOR A BATERIA', category: 'SOPRADOR', technology: 'BATERIA', application: 'OCASIONAL', listPrice: 900, sortOrder: 3 }),
];

describe('searchKey', () => {
  it('ignora acento, caixa e pontuação', () => {
    expect(searchKey('Roçadeira 143R-II')).toBe('rocadeira143rii');
    expect(searchKey('143 R II')).toBe('143rii');
  });
});

describe('matchesFilters', () => {
  it('busca por modelo, descrição, PNC e categoria, sem acento', () => {
    const ids = (text: string) => lista.filter(m => matchesFilters(m, { ...EMPTY_FILTERS, text })).map(m => m.pnc);
    expect(ids('143rii')).toEqual(['3']);
    expect(ids('rocadeira')).toEqual(['3']);
    expect(ids('soprador')).toEqual(['4']);
    expect(ids('4')).toContain('4');
    expect(ids('motosserra')).toEqual(['1', '2']);
  });

  it('várias palavras: todas precisam aparecer, em qualquer ordem e sem exigir que fiquem coladas', () => {
    const roc = machine({ pnc: '9', model: '143R II', description: 'ROCADEIRA MOD. 143R II', category: 'ROÇADEIRA' });
    const casa = (text: string) => matchesFilters(roc, { ...EMPTY_FILTERS, text });
    expect(casa('ROÇADEIRA 143R-II')).toBe(true);
    expect(casa('143r roçadeira')).toBe(true);
    expect(casa('roçadeira 999')).toBe(false);
  });

  it('combina filtros', () => {
    const run = (f: Partial<typeof EMPTY_FILTERS>) => lista.filter(m => matchesFilters(m, { ...EMPTY_FILTERS, ...f })).map(m => m.pnc);
    expect(run({ technology: 'BATERIA' })).toEqual(['4']);
    expect(run({ application: 'COMERCIAL' })).toEqual(['3']);
    expect(run({ category: 'MOTOSSERRA', application: 'PROFISSIONAL' })).toEqual(['1', '2']);
    expect(run({ onlyNews: true })).toEqual(['2', '3']);
  });
});

describe('sortMachines', () => {
  it('por categoria e depois modelo, com número natural (X20 antes de X100)', () => {
    expect(sortMachines(lista, 'category').map(m => m.pnc)).toEqual(['2', '1', '3', '4']);
  });
  it('por categoria usa a ordem da Husqvarna, não a alfabética', () => {
    const fora = [machine({ pnc: 'a', model: 'A1', category: 'APARADOR', sortOrder: 5 }), machine({ pnc: 'm', model: 'M1', category: 'MOTOSSERRA', sortOrder: 0 })];
    expect(sortMachines(fora, 'category').map(m => m.pnc)).toEqual(['m', 'a']);
  });
  it('por preço, nos dois sentidos', () => {
    expect(sortMachines(lista, 'price-asc').map(m => m.listPrice)).toEqual([500, 900, 1000, 2000]);
    expect(sortMachines(lista, 'price-desc').map(m => m.listPrice)).toEqual([2000, 1000, 900, 500]);
  });
  it('não altera a lista original', () => {
    const antes = lista.map(m => m.pnc);
    sortMachines(lista, 'price-desc');
    expect(lista.map(m => m.pnc)).toEqual(antes);
  });
});

describe('facetCounts', () => {
  it('categorias e tecnologias saem na ordem da Husqvarna', () => {
    const lote = [
      machine({ pnc: 'a', category: 'APARADOR', technology: 'BATERIA', sortOrder: 9 }),
      machine({ pnc: 'm', category: 'MOTOSSERRA', technology: 'PRODUTOS A COMBUSTÃO', sortOrder: 0 }),
    ];
    expect(facetCounts(lote, EMPTY_FILTERS, 'category').map(o => o.value)).toEqual(['MOTOSSERRA', 'APARADOR']);
    expect(facetCounts(lote, EMPTY_FILTERS, 'technology').map(o => o.value)).toEqual(['PRODUTOS A COMBUSTÃO', 'BATERIA']);
  });
  it('conta cada opção respeitando os OUTROS filtros, não o próprio', () => {
    const filtros = { ...EMPTY_FILTERS, technology: 'BATERIA' };
    // Com tecnologia = bateria, a categoria só oferece SOPRADOR…
    expect(facetCounts(lista, filtros, 'category')).toEqual([{ value: 'SOPRADOR', count: 1 }]);
    // …mas a própria tecnologia continua mostrando todas as opções (senão não dá para trocar).
    expect(facetCounts(lista, filtros, 'technology').map(o => o.value).sort()).toEqual(['BATERIA', 'PRODUTOS A COMBUSTÃO']);
  });
});

describe('priceChange e novidades', () => {
  it('direção da mudança de preço', () => {
    expect(priceChange(lista[2])).toEqual({ direction: 'down', before: 2500 });
    expect(priceChange({ priceBefore: 100, listPrice: 150 })).toEqual({ direction: 'up', before: 100 });
    expect(priceChange(lista[0])).toBeNull();
  });
  it('novidades = nova ou com preço alterado', () => {
    expect(countNews(lista)).toBe(2);
  });
});

describe('rótulos', () => {
  it('a lista vem em caixa-alta; a tela mostra em frase', () => {
    expect(technologyLabel('PRODUTOS A COMBUSTÃO')).toBe('Combustão');
    expect(technologyLabel(null)).toBe('Outros');
    expect(categoryLabel('ROÇADEIRA COSTAL')).toBe('Roçadeira costal');
  });
});

describe('findListedMachine', () => {
  const lote = [
    machine({ pnc: '967332901', model: '143R II' }),
    machine({ pnc: '96041044000', model: 'TS 142' }),
    machine({ pnc: '970592606CJ', model: 'Kit' }),
  ];
  it('PNC igual, com ou sem espaço e traço', () => {
    expect(findListedMachine(lote, '967 33 29-01')?.model).toBe('143R II');
  });
  it('etiqueta de 11 dígitos acha o artigo de 9, e o contrário', () => {
    expect(findListedMachine(lote, '960410440')?.model).toBe('TS 142');
    expect(findListedMachine(lote, '96733290100')?.model).toBe('143R II');
  });
  it('o BR da versão brasileira é o mesmo artigo; CJ e outros sufixos não', () => {
    const brasil = [machine({ pnc: '970743401BR', model: '143RST' }), machine({ pnc: '970592606CJ', model: 'Kit' })];
    expect(findListedMachine(brasil, '970743401')?.model).toBe('143RST');
    expect(findListedMachine(brasil, '970743401BR')?.model).toBe('143RST');
    expect(findListedMachine(brasil, '970592606')).toBeNull();
    expect(portalPnc('970743401BR')).toBe('970743401');
    expect(portalPnc('970592606CJ')).toBe('970592606CJ');
    expect(portalPnc('967332901')).toBe('967332901');
  });
  it('não casa por semelhança: outro artigo, sufixo de letras ou texto vazio', () => {
    expect(findListedMachine(lote, '967332902')).toBeNull();
    expect(findListedMachine(lote, '970592606')).toBeNull();
    expect(findListedMachine(lote, '')).toBeNull();
  });
});

describe('tamanho do sabre dentro do mesmo modelo', () => {
  const serra = (pnc: string, model: string, description: string, sortOrder: number) => machine({ pnc, model, description, sortOrder, category: 'MOTOSSERRA' });

  it('lê a polegada da descrição', () => {
    expect(barLengthInches('MOTOSSERRA MOD.61 13"PD 3/8"')).toBe(13);
    expect(barLengthInches('MOTOSSERRA 450II 18".325"1,3MM')).toBe(18);
    expect(barLengthInches('MOTOSSERRA MOD 542i 16\'\' 325\'')).toBe(16);
    expect(barLengthInches('APARADOR 60 CM')).toBeNull();
  });

  it('a lista traz 13, 18, 15; a tabela mostra 13, 15, 18, sem tirar o modelo do lugar', () => {
    const lista = [
      serra('a', '120', 'MOTOSSERRA MOD 120 14" PR 3/8"', 1),
      serra('b', '61', 'MOTOSSERRA MOD.61 13"PD 3/8"', 2),
      serra('c', '61', 'MOTOSSERRA MOD.61 18"PD 3/8', 3),
      serra('d', '61', 'MOTOSSERRA MOD.61 15"PD 3/8"', 4),
      serra('e', '272XP', 'MOTOSSERRA MOD272XP 20"PD 3/8"', 5),
      serra('f', '272XP', 'MOTOSSERRA MOD272XP 13"PD 3/8"', 6),
    ];
    expect(sortMachines(lista, 'category').map(m => m.pnc)).toEqual(['a', 'b', 'd', 'c', 'f', 'e']);
  });

  it('se alguma linha do modelo não traz o tamanho, a ordem da lista fica como está', () => {
    const lista = [
      serra('x', 'T1', 'MOTOSSERRA T1 18"', 1),
      serra('y', 'T1', 'MOTOSSERRA T1 CONJUNTO', 2),
      serra('z', 'T1', 'MOTOSSERRA T1 12"', 3),
    ];
    expect(sortMachines(lista, 'category').map(m => m.pnc)).toEqual(['x', 'y', 'z']);
  });
});
