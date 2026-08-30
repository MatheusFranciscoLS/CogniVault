import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHusqvarnaIplText } from './catalog-extractor';

test('Portal 321R vence comentário interno assy 321S e infere MUFFLER', () => {
  const rows = Array.from({length:10},(_,i)=>`${i+1} ${590211101+i} ${i===0?'CONJ SILENCIADOR muffler assy 321S sprayer':'MUFFLER GASKET Muffler gasket'} 1`).join('\n');
  const text=`
03/04/2025, 14:42 Roçadeira Roçadeira Husqvarna 321R Husqvarna | Husqvarna Portal BR
https://portal.husqvarnagroup.com/br/rocadeiras/rocadeira-husqvarna-321r/?printipl=true&iplId=HVA_PL-000030899 1/2
${rows}
Referência Número do artigo Nome do artigo Quantidade Comentário
03/04/2025, 14:42 Roçadeira Roçadeira Husqvarna 321R Husqvarna | Husqvarna Portal BR
https://portal.husqvarnagroup.com/br/rocadeiras/rocadeira-husqvarna-321r/?printipl=true&iplId=HVA_PL-000030899 2/2`;
  const extraction=parseHusqvarnaIplText(text,{model:'assy 321S',filename:'Roçadeira Husqvarna 321R.pdf'});
  assert.ok(extraction);
  assert.deepEqual(extraction.models,['321R']);
  assert.ok(extraction.parts.every(part=>part.model==='321R'));
  assert.ok(extraction.parts.every(part=>part.section==='MUFFLER'));
});

test('mantém quantidade de linhas com Part Number, não inventa callouts sem artigo',()=>{
  const rows=['1 531147357 CRANKCASE KIT 1','2 531147387 VEDAÇÃO 1','3 503251701 ROLAMENTO DE ESFERAS 1','4 589536501 JUNTA 1','5 589539401 PONTE 1','6 531147364 VOLANTE Flywheel 1','7 538936801 PORCA 1','9 538946401 BOBINA DE IGNIÇÃO 1','10 589877401 SCREW 1','11 531147356 CONJ DE EMBRAIAGEM 1','12 589539601 EMBRAIAGEM 1','13 538934101 ANILHA 1'].join('\n');
  const text=`HUSQVARNA PORTAL\n321 R BRUSHCUTTER\nReferência Número do artigo Nome do artigo Quantidade Comentário\n${rows}`;
  const extraction=parseHusqvarnaIplText(text,{filename:'Roçadeira Husqvarna 321R.pdf'});
  assert.ok(extraction);
  assert.equal(extraction.parts.length,12);
  assert.equal(extraction.parts.some(part=>part.position==='8'),false);
});