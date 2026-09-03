import type { PartBenchmarkCase } from './part-benchmark';

export const TOP_50_BALCAO_HUSQVARNA: Omit<PartBenchmarkCase, 'source'>[] = [
  // Roçadeiras - Desgaste e Manutenção
  { id: '143rii-carretel', query: 'qual o carretel de fio de nylon da 143?', model: '143RII', expectedPartNumbers: ['578446301'] },
  { id: '143rii-carburador', query: 'carburador da rocadeira 143r-ii', model: '143RII', expectedPartNumbers: ['587106701'] },
  { id: '143rii-bobina', query: 'bobina de ignicao da 143r', model: '143RII', expectedPartNumbers: ['505298301'] },
  { id: '143rii-embreagem', query: 'embreagem completa 143rii', model: '143RII', expectedPartNumbers: ['599764701'] },
  { id: '143rii-cabo-acelerador', query: 'cabo do acelerador da roçadeira 143', model: '143RII', expectedPartNumbers: ['522036601'] },
  
  { id: '226r-filtro-ar', query: 'filtro de ar da 226r', model: '226R', expectedPartNumbers: ['585061601'] },
  { id: '226r-carburador', query: 'carburador 226r', model: '226R', expectedPartNumbers: ['585060701'] },
  { id: '345fr-embreagem', query: 'embreagem completa rocadeira 345fr', model: '345FR', expectedPartNumbers: ['503879102'] },
  
  // Motosserras
  { id: '236-corrente', query: 'corrente pra motosserra 236', model: '236', expectedPartNumbers: ['501847052'] },
  { id: '236-sabre', query: 'sabre 14 polegadas da 236e', model: '236e', expectedPartNumbers: ['501959252'] },
  { id: '236-carburador', query: 'carburador motosserra 236', model: '236', expectedPartNumbers: ['586936202'] },
  { id: '236-bobina', query: 'modulo bobina 236', model: '236', expectedPartNumbers: ['575803501'] },

  // Tratores Cortadores de Grama
  { id: 'ts148-correia-deck', query: 'correia da faca do trator ts148', model: 'TS148', expectedPartNumbers: ['592855201'] },
  { id: 'ts148-lamina', query: 'faca de corte trator 148', model: 'TS148', expectedPartNumbers: ['581116301'] },
  { id: 'tc138-recolhedor', query: 'cesto coletor de grama tc138', model: 'TC138', expectedPartNumbers: ['532439600'] },

  // Sopradores
  { id: '125b-carburador', query: 'carburador soprador 125', model: '125B', expectedPartNumbers: ['590460102'] },
  { id: '125b-filtro', query: 'filtro de ar do soprador 125b', model: '125B', expectedPartNumbers: ['545112101'] }
];
