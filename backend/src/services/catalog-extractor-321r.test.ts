import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHusqvarnaIplText } from './catalog-extractor';

const footer = (page: number) => `03/04/2025, 14:42 Roçadeira Roçadeira Husqvarna 321R Husqvarna | Husqvarna Portal BR\nhttps://portal.husqvarnagroup.com/br/rocadeiras/rocadeira-husqvarna-321r/?printipl=true&iplId=HVA_PL-000030899 ${page}/21`;

function rows(count: number, seed: number, anchors: Record<number, string> = {}, positions?: number[]): string {
  const actualPositions = positions || Array.from({ length: count }, (_, index) => index + 1);
  return actualPositions.map((position, index) => {
    const code = String(500000000 + seed * 100 + index + 1);
    return `${position} ${code} ${anchors[position] || `SCREW M5x${10 + index}`} 1`;
  }).join('\n');
}

function page(pageNumber: number, body: string): string {
  return `${body}\nReferê\nncia\nNúmero do\nartigo\nNome do artigo Quanti\ndade\nComentário\n${footer(pageNumber)}`;
}

test('321R portal catalog keeps the published model, 81 real rows and intentional position gaps', () => {
  const text = [
    `03/04/2025\nT25, BR;PY\n${footer(1)}`,
    footer(2),
    page(3, rows(10, 3, {
      1: 'CONJ DO CILINDRO Cylinder',
      4: 'CONJ. DO PISTÃO kit 321S sprayer',
      5: 'ANEL DO PISTÃO Piston ring',
      7: 'CONJ DA VIRABREQUIM Crankshaft',
      9: 'VELA DE IGNIÇÃO Spark plug',
    })),
    footer(4),
    page(5, rows(7, 5, {
      1: 'CONJUNTO DO FILTRO DE AR Air filter',
      3: 'FILTRO DE AR Air filter',
      4: 'CARBURADOR Carburettor',
    })),
    footer(6),
    page(7, rows(3, 7, {
      1: 'CONJ SILENCIADOR muffler assy 321S sprayer',
      2: 'MUFFLER GASKET',
      3: 'SILENCIADOR Muffler',
    })),
    footer(8),
    page(9, rows(8, 9, {
      2: 'PUNHO Left Handle',
      3: 'PUNHO Right handle',
      5: 'CONTROLE DO ACELERADOR Throttle Control',
      8: 'INTERRUPTOR switch assembly',
    })),
    footer(10),
    page(11, rows(5, 11, {
      1: 'CONJ DO DEPÓSITO DE COMBUSTÍVEL Fuel tank assy',
      2: 'ANEL and fuel hose assy 321S sprayer',
      3: 'FILTRO DE COMBUSTÍVEL Fuel filter',
      4: 'CONJ. DA TAMPA DO DEPÓSITO Tank cap assy',
    })),
    footer(12),
    page(13, rows(1, 13, { 1: 'COBERTURA Housing' })),
    footer(14),
    page(15, rows(19, 15, {
      1: 'TUBE ASSY Tube Assembly',
      2: 'EIXO Drive Shaft',
      5: 'PROTEÇÃO Guard',
      6: 'ENGRENAGEM Gear Box',
      8: 'LÂMINA Blade',
      11: 'CABEÇOTE DO APARADOR Trimmer head',
      15: 'EIXO Shaft',
    })),
    footer(16),
    page(17, rows(12, 17, {
      1: 'CRANKCASE KIT',
      3: 'ROLAMENTO DE ESFERAS Ball bearing',
      6: 'VOLANTE Flywheel',
      9: 'BOBINA DE IGNIÇÃO Ignition coil',
      11: 'CONJ DE EMBRAIAGEM Clutch Assy',
    }, [1,2,3,4,5,6,7,9,10,11,12,13])),
    footer(18),
    page(19, rows(8, 19, {
      1: 'CONJ. DO DISPOSITIVO DE ARRANQUE Starter',
      2: 'CONJ. DA ROLDANA Starter pulley 321S sprayer',
      4: 'MOLA DA BOBINA Coil Spring',
      5: 'GANCHO PAWL',
      7: 'PUNHO DE ARRANQUE STARTER HANDLE',
      8: 'PULLEY KIT',
      9: 'MOLA DA BOBINA Coil spring',
      10: 'CONDUTOR Driver',
    }, [1,2,4,5,7,8,9,10])),
    footer(20),
    page(21, rows(8, 21, {
      1: 'CONJ DE EMBRAIAGEM Clutch Assy',
      3: 'TAMBOR DE EMBRAIAGEM Clutch Drum',
      4: 'ANEL DE RETENÇÃO Retainer Ring',
      5: 'ROLAMENTO Bearing',
      7: 'ELEMENTO ANTI-VIBRATÓRIO Vibration Damping',
    })),
  ].join('\n');

  const extraction = parseHusqvarnaIplText(text, { filename: 'Roçadeira Husqvarna 321R.pdf' });
  assert.ok(extraction);
  assert.deepEqual(extraction.models, ['321R']);
  assert.equal(extraction.parts.length, 81);
  assert.ok(extraction.parts.every(part => part.model === '321R'));

  const bySection = new Map<string, number>();
  for (const part of extraction.parts) bySection.set(part.section, (bySection.get(part.section) || 0) + 1);
  assert.equal(bySection.get('CYLINDER PISTON'), 10);
  assert.equal(bySection.get('AIR FILTER'), 7);
  assert.equal(bySection.get('MUFFLER'), 3);
  assert.equal(bySection.get('HANDLE'), 8);
  assert.equal(bySection.get('FUEL SYSTEM'), 5);
  assert.equal(bySection.get('HOUSING'), 1);
  assert.equal(bySection.get('SHAFT'), 19);
  assert.equal(bySection.get('CRANKCASE & CLUTCHDRUM'), 12);
  assert.equal(bySection.get('STARTER'), 8);
  assert.equal(bySection.get('CLUTCH'), 8);

  const crankcasePositions = extraction.parts.filter(part => part.page === 17).map(part => part.position);
  assert.equal(crankcasePositions.includes('8'), false);
  const starterPositions = extraction.parts.filter(part => part.page === 19).map(part => part.position);
  assert.equal(starterPositions.includes('3'), false);
  assert.equal(starterPositions.includes('6'), false);
});
