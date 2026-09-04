import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../lib';
import type { HomeData } from '../types';
import { useQuoteCart } from '../context/QuoteCartContext';
import { toast } from 'sonner';
import { playCopySound } from '../lib/sound';

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="cv-empty">
      <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-400" aria-hidden="true">⌕</div>
      <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-400">{description}</div>
    </div>
  );
}

const CURVA_A_MODELS = [
  {
    model: '143RII',
    name: 'Roçadeira 143R-II',
    tag: 'Campeã de Vendas',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    chips: [
      { label: 'Filtro de ar', q: 'filtro ar 143RII' },
      { label: 'Carburador', q: 'carburador 143RII' },
      { label: 'Corda arranque', q: 'arranque 143RII' },
      { label: 'Cabeçote T35', q: 'cabecote 143RII' },
      { label: 'Embreagem', q: 'embreagem 143RII' },
    ],
  },
  {
    model: '120 Mark II',
    name: 'Motosserra 120 Mark II',
    tag: 'Alta Demanda',
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    chips: [
      { label: 'Sabre 16"', q: 'sabre 120 mark' },
      { label: 'Corrente', q: 'corrente 120 mark' },
      { label: 'Vela Champion', q: 'vela 120 mark' },
      { label: 'Filtro comb.', q: 'combustivel 120 mark' },
      { label: 'Bomba óleo', q: 'bomba oleo 120 mark' },
    ],
  },
  {
    model: '345FR',
    name: 'Roçadeira 345FR',
    tag: 'Florestal',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    chips: [
      { label: 'Lâmina 3P', q: 'lamina 345fr' },
      { label: 'Carretel T45X', q: 't45x 345fr' },
      { label: 'Amortecedor', q: 'amortecedor 345fr' },
      { label: 'Eixo flexível', q: 'eixo 345fr' },
    ],
  },
  {
    model: '272XP',
    name: 'Motosserra 272XP / 61',
    tag: 'Clássicas',
    badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    chips: [
      { label: 'Pistão / Anel', q: 'pistao 272xp' },
      { label: 'Carburador', q: 'carburador 272xp' },
      { label: 'Cilindro', q: 'cilindro 272xp' },
      { label: 'Mola partida', q: 'mola 272xp' },
    ],
  },
  {
    model: '125B',
    name: 'Soprador 125B / 125BVX',
    tag: 'Jardim',
    badgeClass: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
    chips: [
      { label: 'Voluta (Caracol)', q: 'voluta 125b' },
      { label: 'Bomba purga', q: 'purga 125b' },
      { label: 'Tubo soprador', q: 'tubo 125b' },
      { label: 'Rotor ventoinha', q: 'rotor 125b' },
    ],
  },
];

const JARGÕES_BALCAO = [
  { slang: 'Cordinha de puxar', tech: 'Corda / Mola de arranque', q: 'arranque corda' },
  { slang: 'Cebolinha / Pera injetora', tech: 'Bomba de purga / Primer', q: 'purga primer' },
  { slang: 'Tampa da cordinha', tech: 'Conjunto de partida montado', q: 'conjunto partida' },
  { slang: 'Caracol do soprador', tech: 'Voluta / Carcaça do rotor', q: 'voluta soprador' },
  { slang: 'Caximbo da vela', tech: 'Terminal / Coifa de vela', q: 'terminal vela' },
  { slang: 'Membrana do carburador', tech: 'Kit reparo / Diafragma', q: 'reparo carburador' },
  { slang: 'Retentor e junta', tech: 'Kit vedação de cárter', q: 'vedacao retentor' },
  { slang: 'Pinhão da corrente', tech: 'Tambor de embreagem', q: 'tambor embreagem' },
];

const DIAGNOSTIC_SYMPTOMS = [
  {
    id: 'sem-partida',
    title: '🚫 Motor não dá partida / Sem faísca',
    shortLabel: 'Sem partida / faísca',
    symptom: 'Ao puxar a cordinha de arranque, o motor gira livremente mas não dá sinal de combustão nem fumaça.',
    checks: [
      'Chave liga/desliga: verificar se o botão de parada não está em curto com a carcaça ou fio terra rompido.',
      'Centelha da vela: retirar a vela, encostar a rosca na carcaça e puxar o arranque (verificar centelha azul forte).',
      'Entreferro da bobina: regular a folga do módulo de ignição em 0,3 mm (espessura de cartão padrão).',
      'Motor afogado: se a vela estiver encharcada de gasolina, retire-a e puxe o arranque 10x com o afogador aberto.',
    ],
    recommendedParts: [
      { name: 'Vela de Ignição Husqvarna (RCJ7Y / CMR7H)', code: '503235111', query: 'vela ignicao' },
      { name: 'Módulo / Bobina de Ignição Eletrônica', code: '544127001', query: 'modulo ignicao' },
      { name: 'Cachimbo e Mola Terminal de Vela', code: '501485402', query: 'terminal vela' },
    ],
  },
  {
    id: 'afoga-alta',
    title: '⛽ Falta combustível ou engasga na aceleração',
    shortLabel: 'Engasga na aceleração',
    symptom: 'O motor dá a partida normalmente na marcha lenta, mas morre, engasga ou perde força ao acelerar.',
    checks: [
      'Filtro de combustível (pescador): puxar com um arame pelo bocal do tanque e checar se o feltro está escurecido ou entupido.',
      'Mangueiras de combustível: examinar se há ressecamento, furos ou dobras impedindo a passagem da gasolina.',
      'Diafragma / membranas do carburador: gasolina velha endurece as membranas, travando a agulha de admissão.',
      'Respirador do tanque: se o tanque criar vácuo após alguns minutos de funcionamento, desobstrua o respirador.',
    ],
    recommendedParts: [
      { name: 'Filtro de Combustível Feltro Poroso', code: '503443201', query: '503443201' },
      { name: 'Kit de Membranas e Reparo do Carburador', code: '531004561', query: 'reparo carburador' },
      { name: 'Mangueira de Combustível Tygon Original', code: '581756202', query: 'mangueira combustivel' },
    ],
  },
  {
    id: 'dispara-lenta',
    title: '🌪️ Marcha lenta irregular ou disparando',
    shortLabel: 'Disparando na lenta',
    symptom: 'A máquina fica acelerada sozinha, gira a lâmina/corrente na lenta e não aceita regulagem pelo parafuso T.',
    checks: [
      'Entrada falsa de ar: retentores de virabrequim com vazamento de ar desregulam a mistura ar/combustível.',
      'Flange de admissão / baquelite: checar se há trincas ou folga nos parafusos de fixação ao cilindro.',
      'Mangueira de vácuo / pulso: se solta ou ressecada, a bomba do carburador não pulsa corretamente.',
      'Parafuso L muito fechado: abra 1 volta completa a partir do encosto suave para estabilizar a marcha lenta.',
    ],
    recommendedParts: [
      { name: 'Jogo de Retentores do Virabrequim', code: '503260204', query: 'retentor virabrequim' },
      { name: 'Flange / Coletor de Admissão', code: '503496901', query: 'flange admissao' },
      { name: 'Kit Juntas de Vedação do Cilindro e Cárter', code: '503946001', query: 'jogo junta' },
    ],
  },
  {
    id: 'corrente-seca',
    title: '🪚 Corrente da motosserra seca (sem óleo)',
    shortLabel: 'Corrente sem óleo',
    symptom: 'Sabre e corrente esquentam, saem fumaça e esticam excessivamente. O tanque de óleo não baixa.',
    checks: [
      'Canaleta do sabre: usar raspador para limpar pó de serra compactado na canaleta e no orifício de entrada.',
      'Rosca sem-fim da bomba de óleo: engrenagem de acoplamento com dentes gastos não gira o pistão injetor.',
      'Filtro pescador de óleo: verificar se o filtro interno do tanque está colmatado por óleo grosso ou resíduos.',
      'Qualidade do óleo de corrente: nunca utilizar óleo queimado ou óleo de motor 2T no reservatório de corrente.',
    ],
    recommendedParts: [
      { name: 'Engrenagem Sem-Fim da Bomba de Óleo', code: '537110501', query: 'engrenagem sem fim' },
      { name: 'Conjunto Pistão / Bomba de Lubrificação', code: '544180104', query: 'bomba de oleo' },
      { name: 'Filtro Pescador de Óleo de Sabre', code: '503507001', query: 'filtro oleo' },
    ],
  },
  {
    id: 'arranque-travado',
    title: '⚡ Corda de arranque pesada ou que não recolhe',
    shortLabel: 'Arranque não recolhe',
    symptom: 'A corda de partida fica solta para fora, o carretel emperra ou o conjunto trava ao puxar.',
    checks: [
      'Mola espiral de partida: mola partida ou desenganchada da carcaça plástica impede o recuo da corda.',
      'Corda desgastada / mordida: se a corda tiver nós ou diâmetro incorreto, ela se sobrepõe no carretel.',
      'Garras plásticas de partida: trincas ou desgaste nas aletas que engatam no volante magnético.',
      'Cuidado: se o motor não girar nem sem a vela de ignição, há risco de travamento de pistão ou biela.',
    ],
    recommendedParts: [
      { name: 'Mola de Partida / Retorno Espiral', code: '503859901', query: 'mola partida' },
      { name: 'Corda de Arranque Husqvarna 3,5mm', code: '505305125', query: 'corda arranque' },
      { name: 'Garras / Travas de Partida do Volante', code: '503873305', query: 'trava partida' },
    ],
  },
];

interface BarSpec {
  lengthInches: number;
  lengthCm: number;
  pitch: string;
  gauge: string;
  driveLinks: number;
  fileDiameter: string;
  chainModel: string;
  chainPartNumber: string;
  barModel: string;
  barPartNumber: string;
  isStandard?: boolean;
}

interface ChainsawGuideModel {
  id: string;
  name: string;
  displacement: string;
  popularUses: string;
  bars: BarSpec[];
}

const CHAINSAW_GUIDE_MODELS: ChainsawGuideModel[] = [
  {
    id: '272xp',
    name: '272XP / 61 / 268',
    displacement: '72.2 cc · 3.6 kW',
    popularUses: 'Reflorestamento, carvoaria e toras pesadas',
    bars: [
      {
        lengthInches: 18,
        lengthCm: 45,
        pitch: '3/8" Standard',
        gauge: '1.5 mm (.058")',
        driveLinks: 68,
        fileDiameter: '5.5 mm (7/32")',
        chainModel: 'H42 / C85 (Semi-Quadrada)',
        chainPartNumber: '501 84 14-68',
        barModel: 'X-Force Ponta Rolante 18"',
        barPartNumber: '508 91 21-68',
        isStandard: true,
      },
      {
        lengthInches: 20,
        lengthCm: 50,
        pitch: '3/8" Standard',
        gauge: '1.5 mm (.058")',
        driveLinks: 72,
        fileDiameter: '5.5 mm (7/32")',
        chainModel: 'H42 / C85 (Semi-Quadrada)',
        chainPartNumber: '501 84 14-72',
        barModel: 'X-Force Ponta Rolante 20"',
        barPartNumber: '508 91 21-72',
      },
      {
        lengthInches: 24,
        lengthCm: 60,
        pitch: '3/8" Standard',
        gauge: '1.5 mm (.058")',
        driveLinks: 84,
        fileDiameter: '5.5 mm (7/32")',
        chainModel: 'H42 / C85 (Semi-Quadrada)',
        chainPartNumber: '501 84 14-84',
        barModel: 'Ponta Dura Sólido 24"',
        barPartNumber: '501 95 69-84',
      },
      {
        lengthInches: 28,
        lengthCm: 70,
        pitch: '3/8" Standard',
        gauge: '1.5 mm (.058")',
        driveLinks: 92,
        fileDiameter: '5.5 mm (7/32")',
        chainModel: 'H42 / C85 (Semi-Quadrada)',
        chainPartNumber: '501 84 14-92',
        barModel: 'Ponta Dura Sólido 28"',
        barPartNumber: '501 95 69-92',
      },
    ],
  },
  {
    id: '120mark2',
    name: '120 Mark II / 236 / 135',
    displacement: '38.2 cc · 1.4 kW',
    popularUses: 'Poda residencial, lenha, sítios e chácaras',
    bars: [
      {
        lengthInches: 14,
        lengthCm: 35,
        pitch: '3/8" LP (Picco)',
        gauge: '1.3 mm (.050")',
        driveLinks: 52,
        fileDiameter: '4.0 mm (5/32")',
        chainModel: 'S93G / H37 (Semi-Chisel)',
        chainPartNumber: '585 42 21-52',
        barModel: 'Ponta Rolante Laminada 14"',
        barPartNumber: '585 95 08-52',
      },
      {
        lengthInches: 16,
        lengthCm: 40,
        pitch: '3/8" LP (Picco)',
        gauge: '1.3 mm (.050")',
        driveLinks: 56,
        fileDiameter: '4.0 mm (5/32")',
        chainModel: 'S93G / H37 (Semi-Chisel)',
        chainPartNumber: '585 42 21-56',
        barModel: 'Ponta Rolante Laminada 16"',
        barPartNumber: '585 95 08-56',
        isStandard: true,
      },
    ],
  },
  {
    id: '353',
    name: '353 / 55 / 450',
    displacement: '51.7 cc · 2.4 kW',
    popularUses: 'Agropecuária intensiva, desgalhe e corte médio',
    bars: [
      {
        lengthInches: 15,
        lengthCm: 38,
        pitch: '.325"',
        gauge: '1.5 mm (.058")',
        driveLinks: 64,
        fileDiameter: '4.8 mm (3/16")',
        chainModel: 'H25 / SP33G (Pixel)',
        chainPartNumber: '501 84 04-64',
        barModel: 'Ponta Rolante Laminada 15"',
        barPartNumber: '508 92 61-64',
      },
      {
        lengthInches: 18,
        lengthCm: 45,
        pitch: '.325"',
        gauge: '1.5 mm (.058")',
        driveLinks: 72,
        fileDiameter: '4.8 mm (3/16")',
        chainModel: 'H25 / SP33G (Pixel)',
        chainPartNumber: '501 84 04-72',
        barModel: 'Ponta Rolante Laminada 18"',
        barPartNumber: '508 92 61-72',
        isStandard: true,
      },
      {
        lengthInches: 20,
        lengthCm: 50,
        pitch: '.325"',
        gauge: '1.5 mm (.058")',
        driveLinks: 78,
        fileDiameter: '4.8 mm (3/16")',
        chainModel: 'H25 / SP33G (Pixel)',
        chainPartNumber: '501 84 04-78',
        barModel: 'Ponta Rolante Laminada 20"',
        barPartNumber: '508 92 61-78',
      },
    ],
  },
  {
    id: '372xp',
    name: '365 / 372XP / 390XP',
    displacement: '70.7 cc · 3.9 kW',
    popularUses: 'Florestal pesado contínuo e madeireiras',
    bars: [
      {
        lengthInches: 18,
        lengthCm: 45,
        pitch: '3/8" Standard',
        gauge: '1.5 mm (.058")',
        driveLinks: 68,
        fileDiameter: '5.5 mm (7/32")',
        chainModel: 'H42 / C85 (Semi-Quadrada)',
        chainPartNumber: '501 84 14-68',
        barModel: 'X-Force Ponta Rolante 18"',
        barPartNumber: '508 91 21-68',
      },
      {
        lengthInches: 20,
        lengthCm: 50,
        pitch: '3/8" Standard',
        gauge: '1.5 mm (.058")',
        driveLinks: 72,
        fileDiameter: '5.5 mm (7/32")',
        chainModel: 'H42 / C85 (Semi-Quadrada)',
        chainPartNumber: '501 84 14-72',
        barModel: 'X-Force Ponta Rolante 20"',
        barPartNumber: '508 91 21-72',
        isStandard: true,
      },
      {
        lengthInches: 24,
        lengthCm: 60,
        pitch: '3/8" Standard',
        gauge: '1.5 mm (.058")',
        driveLinks: 84,
        fileDiameter: '5.5 mm (7/32")',
        chainModel: 'H42 / C85 (Semi-Quadrada)',
        chainPartNumber: '501 84 14-84',
        barModel: 'Ponta Dura Sólido 24"',
        barPartNumber: '501 95 69-84',
      },
    ],
  },
  {
    id: 't435',
    name: 'T435 (Poda no Alto)',
    displacement: '35.2 cc · 1.5 kW',
    popularUses: 'Arboricultura, poda em altura com escalada',
    bars: [
      {
        lengthInches: 12,
        lengthCm: 30,
        pitch: '3/8" LP (Picco)',
        gauge: '1.3 mm (.050")',
        driveLinks: 45,
        fileDiameter: '4.0 mm (5/32")',
        chainModel: 'S93G / H37',
        chainPartNumber: '585 42 21-45',
        barModel: 'Ponta Rolante 12"',
        barPartNumber: '585 95 08-45',
        isStandard: true,
      },
      {
        lengthInches: 14,
        lengthCm: 35,
        pitch: '3/8" LP (Picco)',
        gauge: '1.3 mm (.050")',
        driveLinks: 52,
        fileDiameter: '4.0 mm (5/32")',
        chainModel: 'S93G / H37',
        chainPartNumber: '585 42 21-52',
        barModel: 'Ponta Rolante 14"',
        barPartNumber: '585 95 08-52',
      },
    ],
  },
];

interface TrimmerBladeSpec {
  type: string;
  name: string;
  diameter: string;
  hole: string;
  idealFor: string;
  partNumber: string;
  isRecommended?: boolean;
}

interface TrimmerGuideModel {
  id: string;
  name: string;
  power: string;
  thread: string;
  popularUses: string;
  headModel: string;
  headPartNumber: string;
  headCordRange: string;
  headFeatures: string;
  recommendedCord: {
    name: string;
    spec: string;
    partNumber: string;
  };
  blades: TrimmerBladeSpec[];
  fixingKit: {
    nut: string;
    nutPartNumber: string;
    skidCup: string;
    skidCupPartNumber: string;
  };
}

const TRIMMER_GUIDE_MODELS: TrimmerGuideModel[] = [
  {
    id: '143rii',
    name: '143R-II / 236R / 553RS',
    power: '41.5 cc · 1.5 kW',
    thread: 'M12 x 1.75 Esquerda (Fêmea)',
    popularUses: 'Manutenção de pastagens, capim alto, rodovias e sítios',
    headModel: 'Cabeçote T35 M12 Semi-Automático',
    headPartNumber: '578 44 64-01',
    headCordRange: '2.4 mm a 2.7 mm (até 8.5 m)',
    headFeatures: 'Sistema Tap\'n Go para liberação do fio no solo sem desmontar',
    recommendedCord: {
      name: 'Fio Whisper X Bicolor 2.7 mm (70m)',
      spec: 'Perfil aerodinâmico silencioso, alta durabilidade',
      partNumber: '597 66 91-21',
    },
    blades: [
      {
        type: '3 Pontas',
        name: 'Lâmina Multi 300-3 (3 Pontas)',
        diameter: '300 mm (12")',
        hole: '25.4 mm (1")',
        idealFor: 'Capim denso, braquiária alta e capoeira fina sem embuchar',
        partNumber: '578 44 49-01',
        isRecommended: true,
      },
      {
        type: '2 Pontas',
        name: 'Lâmina Grass 300-2 (Faca Dupla)',
        diameter: '300 mm (12")',
        hole: '25.4 mm (1")',
        idealFor: 'Capim fibroso e roçadas rápidas de pasto limpo',
        partNumber: '578 44 37-01',
      },
      {
        type: '4 Pontas',
        name: 'Lâmina Grass 255-4 (Gramados Densos)',
        diameter: '255 mm (10")',
        hole: '25.4 mm (1")',
        idealFor: 'Gramados resistentes, margens de lago e juncos',
        partNumber: '578 44 38-01',
      },
    ],
    fixingKit: {
      nut: 'Porca Flangeada M12 Rosca Esquerda',
      nutPartNumber: '503 89 01-01',
      skidCup: 'Prato Giratório com Rolamento (Copo Deslizante)',
      skidCupPartNumber: '503 89 01-02',
    },
  },
  {
    id: '345fr',
    name: '345FR / 545FR (Florestal)',
    power: '45.7 cc · 2.1 kW',
    thread: 'M12 x 1.75 Esquerda (Fêmea)',
    popularUses: 'Desbaste florestal pesado, corte de cana e mato grosso',
    headModel: 'Cabeçote T45X M12 com Rolamento de Esferas',
    headPartNumber: '578 44 68-01',
    headCordRange: '2.7 mm a 3.3 mm (reforçado)',
    headFeatures: 'Botão com rolamento de esferas de aço que reduz atrito e desgaste no solo',
    recommendedCord: {
      name: 'Fio Whisper X Bicolor 3.0 mm (56m)',
      spec: 'Resistência extrema contra quebras e soldagem interna',
      partNumber: '597 66 91-31',
    },
    blades: [
      {
        type: 'Serra Circular',
        name: 'Lâmina Serra Maxi 200-26 (Dentes Travados)',
        diameter: '200 mm (8")',
        hole: '25.4 mm (1")',
        idealFor: 'Troncos lenhosos e eucaliptos finos de até 6 a 8 cm de diâmetro',
        partNumber: '578 44 27-01',
        isRecommended: true,
      },
      {
        type: '3 Pontas',
        name: 'Lâmina Multi 300-3 (3 Pontas Florestal)',
        diameter: '300 mm (12")',
        hole: '25.4 mm (1")',
        idealFor: 'Mato pesado entrelaçado e capoeira grossa',
        partNumber: '578 44 49-01',
      },
    ],
    fixingKit: {
      nut: 'Porca M12 Rosca Esquerda de Alta Pressão',
      nutPartNumber: '503 89 01-01',
      skidCup: 'Prato de Proteção Reforçado',
      skidCupPartNumber: '503 89 01-02',
    },
  },
  {
    id: '128r',
    name: '128R / 129R / 525RJX (Jardim)',
    power: '28.0 cc · 0.8 kW',
    thread: 'M10 x 1.25 Esquerda (Fêmea)',
    popularUses: 'Gramados residenciais, acabamentos em muros e canteiros',
    headModel: 'Cabeçote T25 M10 Tap\'n Go',
    headPartNumber: '578 44 61-01',
    headCordRange: '2.0 mm a 2.4 mm (até 6.5 m)',
    headFeatures: 'Perfil compacto leve para não sobrecarregar a embreagem do motor leve',
    recommendedCord: {
      name: 'Fio Opti Round 2.4 mm (15m)',
      spec: 'Polímero flexível ideal para roçadeiras menores',
      partNumber: '597 66 88-01',
    },
    blades: [
      {
        type: '4 Pontas',
        name: 'Lâmina Grass 255-4 (4 Pontas Leve)',
        diameter: '255 mm (10")',
        hole: '25.4 mm (1")',
        idealFor: 'Gramas altas e talos sem sobrecarregar o motor',
        partNumber: '578 44 38-01',
        isRecommended: true,
      },
      {
        type: '3 Pontas',
        name: 'Lâmina Multi 255-3 (3 Pontas Compacta)',
        diameter: '255 mm (10")',
        hole: '25.4 mm (1")',
        idealFor: 'Mato rasteiro em quintais e sítios',
        partNumber: '578 44 45-01',
      },
    ],
    fixingKit: {
      nut: 'Porca Flangeada M10 Rosca Esquerda',
      nutPartNumber: '503 85 80-01',
      skidCup: 'Prato Deslizante 128R',
      skidCupPartNumber: '503 85 80-02',
    },
  },
  {
    id: '535rxt',
    name: '535RXT / 535FBX (Costal)',
    power: '34.6 cc · 1.6 kW',
    thread: 'M12 x 1.75 Esquerda (Fêmea)',
    popularUses: 'Terrenos íngremes, cafezais, encostas e pastagens onduladas',
    headModel: 'Cabeçote T35X M12 com Rolamento',
    headPartNumber: '578 44 66-01',
    headCordRange: '2.4 mm a 2.7 mm',
    headFeatures: 'Equilíbrio perfeito de peso e durabilidade para roçadeiras costais e ergonômicas',
    recommendedCord: {
      name: 'Fio Whisper X Bicolor 2.7 mm (70m)',
      spec: 'Menor vibração para operação prolongada',
      partNumber: '597 66 91-21',
    },
    blades: [
      {
        type: '3 Pontas',
        name: 'Lâmina Multi 300-3 (3 Pontas)',
        diameter: '300 mm (12")',
        hole: '25.4 mm (1")',
        idealFor: 'Roçadas entre ruas de cafezais e pastos',
        partNumber: '578 44 49-01',
        isRecommended: true,
      },
      {
        type: '2 Pontas',
        name: 'Lâmina Grass 300-2 (Faca Dupla)',
        diameter: '300 mm (12")',
        hole: '25.4 mm (1")',
        idealFor: 'Gramas e capins eretos',
        partNumber: '578 44 37-01',
      },
    ],
    fixingKit: {
      nut: 'Porca M12 Rosca Esquerda',
      nutPartNumber: '503 89 01-01',
      skidCup: 'Prato Giratório com Rolamento',
      skidCupPartNumber: '503 89 01-02',
    },
  },
];

export default function HomePanel({ onSearch, onCatalogs }: { onSearch: (query: string) => void; onCatalogs: (filter?: string) => void }) {
  const [query, setQuery] = useState('');
  const quoteCart = useQuoteCart();
  const [fuelLiters, setFuelLiters] = useState<number>(5);
  const [fuelRatio, setFuelRatio] = useState<50 | 33 | 25>(50);
  const [activeSymptom, setActiveSymptom] = useState<string>('sem-partida');
  const [selectedChainsawId, setSelectedChainsawId] = useState<string>('272xp');
  const [selectedBarLength, setSelectedBarLength] = useState<number>(18);
  const [selectedTrimmerId, setSelectedTrimmerId] = useState<string>('143rii');
  const [trimmerCuttingMode, setTrimmerCuttingMode] = useState<'nylon' | 'blade'>('nylon');
  const oilMl = Math.round((fuelLiters * 1000) / fuelRatio);

  const currentChainsaw = CHAINSAW_GUIDE_MODELS.find(m => m.id === selectedChainsawId) || CHAINSAW_GUIDE_MODELS[0];
  const currentBar = currentChainsaw.bars.find(b => b.lengthInches === selectedBarLength) || currentChainsaw.bars[0];
  const currentTrimmer = TRIMMER_GUIDE_MODELS.find(m => m.id === selectedTrimmerId) || TRIMMER_GUIDE_MODELS[0];

  const changeChainsawModel = (newId: string) => {
    setSelectedChainsawId(newId);
    const target = CHAINSAW_GUIDE_MODELS.find(m => m.id === newId);
    if (target) {
      const std = target.bars.find(b => b.isStandard) || target.bars[0];
      setSelectedBarLength(std.lengthInches);
    }
  };

  const copyChainsawSpec = () => {
    const text = `*Especificação de Sabre e Corrente Husqvarna - Vardão Máquinas*\n\n` +
      `🌲 *Motosserra:* Husqvarna ${currentChainsaw.name}\n` +
      `📏 *Sabre:* ${currentBar.lengthInches}" (${currentBar.lengthCm} cm) - ${currentBar.barModel}\n` +
      `⚙️ *Passo da Corrente:* ${currentBar.pitch}\n` +
      `📐 *Calibre da Canaleta:* ${currentBar.gauge}\n` +
      `🔗 *Quantidade de Elos de Tração (DL):* ${currentBar.driveLinks} elos\n` +
      `🪚 *Corrente Recomendada:* ${currentBar.chainModel}\n` +
      `🔘 *Lima de Afiação Redonda:* ${currentBar.fileDiameter}\n\n` +
      `📦 *Códigos Originais Husqvarna:*\n` +
      `• Sabre: ${currentBar.barPartNumber}\n` +
      `• Corrente: ${currentBar.chainPartNumber}\n\n` +
      `_Atendimento Técnico Vardão Máquinas_`;
    void navigator.clipboard.writeText(text);
    playCopySound();
    toast.success('Especificação do sabre e corrente copiada para WhatsApp!');
  };

  const copyTrimmerSpec = () => {
    const text = `*Especificação de Cabeçote e Lâminas Husqvarna - Vardão Máquinas*\n\n` +
      `🌿 *Roçadeira:* Husqvarna ${currentTrimmer.name}\n` +
      `🔩 *Rosca do Eixo:* ${currentTrimmer.thread}\n` +
      `📦 *Cabeçote de Fio:* ${currentTrimmer.headModel} (Cód: ${currentTrimmer.headPartNumber})\n` +
      `🧵 *Capacidade de Fio:* ${currentTrimmer.headCordRange}\n` +
      `⭐ *Fio Recomendado:* ${currentTrimmer.recommendedCord.name} (Cód: ${currentTrimmer.recommendedCord.partNumber})\n\n` +
      `🗡️ *Lâminas Oficiais (Furo 1" / 25.4mm):*\n` +
      currentTrimmer.blades.map(b => `• ${b.name}: ${b.partNumber} (${b.idealFor})`).join('\n') +
      `\n\n🔩 *Kit de Fixação da Lâmina:*\n` +
      `• Porca: ${currentTrimmer.fixingKit.nut} (Cód: ${currentTrimmer.fixingKit.nutPartNumber})\n` +
      `• Prato Giratório: ${currentTrimmer.fixingKit.skidCup} (Cód: ${currentTrimmer.fixingKit.skidCupPartNumber})\n\n` +
      `_Atendimento Técnico Vardão Máquinas_`;
    void navigator.clipboard.writeText(text);
    playCopySound();
    toast.success('Especificação da roçadeira copiada para WhatsApp!');
  };

  const currentSymptom = DIAGNOSTIC_SYMPTOMS.find(s => s.id === activeSymptom) || DIAGNOSTIC_SYMPTOMS[0];

  const copyFuelInstruction = () => {
    const text = `*Recomendação de Mistura 2T Husqvarna - Vardão Máquinas*\n\n` +
      `⛽ *Gasolina:* ${fuelLiters} Litro(s) de gasolina comum limpa\n` +
      `🧴 *Óleo 2T:* Adicionar exatamente *${oilMl} ml* de Óleo 2T Husqvarna PRO (Proporção ${fuelRatio}:1)\n\n` +
      `⚠️ *Cuidados Essenciais:*\n` +
      `• Agite bem o galão antes de abastecer o tanque da máquina.\n` +
      `• Não utilize mistura parada com mais de 15 dias no galão ou tanque.\n` +
      `• Nunca use óleo de motor 4T ou óleo náutico TC-W3. Use sempre padrão JASO FD / ISO-L-EGD.`;
    void navigator.clipboard.writeText(text);
    toast.success('Instrução de mistura 2T copiada para a área de transferência!');
  };

  const { data, isLoading } = useQuery({
    queryKey: ['home'],
    queryFn: () => apiJson<{ home: HomeData }>('/api/home').then(res => res.home),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  const examples = ['carburador 143RII', 'sabre motosserra 120', 'filtro de ar 353', '587106701'];
  const formatCount = (value: number | undefined) => value === undefined ? '—' : new Intl.NumberFormat('pt-BR').format(value);

  return (
    <section className="space-y-6">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-[30px] bg-[#0b1d3a] px-6 py-8 text-white shadow-[0_22px_70px_rgba(15,35,72,.18)] md:px-9 md:py-10 lg:px-11">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_25%,rgba(45,105,178,.34),transparent_32%),radial-gradient(circle_at_78%_110%,rgba(226,174,71,.13),transparent_28%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[.04] [background-image:linear-gradient(rgba(255,255,255,.25)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.25)_1px,transparent_1px)] [background-size:58px_58px]" />
        <div className="relative z-10 grid items-center gap-9 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="max-w-3xl">
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-200">Vardão Máquinas · Operação de Balcão & Oficina</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-.045em] md:text-[2.65rem]">Qual peça você precisa encontrar hoje?</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Pesquise por código Husqvarna, modelo, PNC ou descrição. Monte orçamentos rápidos para balcão e WhatsApp sem consultar PDFs externos.
            </p>
            <form onSubmit={submit} className="mt-6 flex items-center gap-2 rounded-2xl bg-white dark:bg-slate-800 p-2 shadow-2xl shadow-black/10">
              <label htmlFor="home-search" className="sr-only">Pesquisar peça, modelo ou PNC</label>
              <input
                id="home-search"
                autoFocus
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Ex.: carburador 143RII ou 537 29 58-02"
                className="min-w-0 flex-1 rounded-xl border-0 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="flex items-center rounded-xl px-2.5 sm:px-3 text-xs font-semibold text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:text-slate-300"
                >
                  Limpar
                </button>
              ) : null}
              <button className="cv-primary px-5 text-sm font-semibold">Pesquisar</button>
            </form>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span className="mr-1">Exemplos:</span>
              {examples.map(example => (
                <button
                  type="button"
                  key={example}
                  onClick={() => onSearch(example)}
                  className="rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 font-medium text-slate-200 transition hover:bg-white/[.12]"
                >
                  {example}
                </button>
              ))}
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 font-medium text-emerald-100">
                Português + inglês · tolera pequenos erros
              </span>
              <span className="ml-auto hidden items-center gap-1.5 text-slate-400 sm:flex">
                <kbd className="rounded border border-white/15 bg-white/[.06] px-1.5 py-0.5 text-[9px] text-slate-200">Ctrl K</kbd> busca rápida
              </span>
            </div>
          </div>
          <div className="hidden rounded-[24px] border border-white/10 bg-white/[.06] p-5 backdrop-blur-sm lg:block">
            <div className="flex items-center gap-3">
              <img src="/husqvarna-logo.webp" alt="Husqvarna" className="h-11 w-11 rounded-xl object-cover ring-1 ring-white/10" />
              <div>
                <div className="text-xs font-semibold">Representante Husqvarna</div>
                <div className="mt-1 text-[10px] text-slate-400">Vardão Máquinas · Concessionária</div>
              </div>
            </div>
            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="text-[10px] font-bold uppercase tracking-[.13em] text-amber-200">Orçamento Ágil</div>
              <p className="mt-2 text-xs leading-5 text-slate-300">
                Monte listas de peças durante o atendimento e exporte com 1 clique para o WhatsApp do cliente.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats & Quick Action Bar */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="cv-stat">
          <div className="flex items-center justify-between">
            <div className="cv-stat-label">Peças indexadas</div>
            <span className="cv-stat-icon" aria-hidden="true">#</span>
          </div>
          <div className="cv-stat-value">
            {isLoading ? <span className="inline-block h-8 w-20 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" /> : formatCount(data?.counts.parts)}
          </div>
          <div className="cv-stat-caption">Peças ativas na base local</div>
        </div>

        <div className="cv-stat">
          <div className="flex items-center justify-between">
            <div className="cv-stat-label">Catálogos de Fábrica</div>
            <span className="cv-stat-icon" aria-hidden="true">▤</span>
          </div>
          <div className="cv-stat-value">
            {isLoading ? <span className="inline-block h-8 w-16 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" /> : formatCount(data?.counts.documents)}
          </div>
          <div className="cv-stat-caption">Modelos processados (PDF)</div>
        </div>

        <button type="button" onClick={() => onSearch('carburador 143RII')} className="cv-quick-action">
          <span className="cv-stat-icon" aria-hidden="true">⌕</span>
          <span>
            <strong>Pesquisar por descrição</strong>
            <small>Encontre peças sem saber o código</small>
          </span>
          <span aria-hidden="true" className="ml-auto text-lg text-slate-300">→</span>
        </button>

        {quoteCart.totalItems > 0 ? (
          <button
            type="button"
            onClick={() => quoteCart.setIsOpen(true)}
            className="cv-quick-action border-amber-300 dark:border-amber-700/60 bg-amber-50/80 dark:bg-amber-950/40"
          >
            <span className="cv-stat-icon text-amber-600 dark:text-amber-400 font-bold" aria-hidden="true">🛒</span>
            <span>
              <strong className="text-amber-900 dark:text-amber-200">Orçamento ativo ({quoteCart.totalItems} {quoteCart.totalItems === 1 ? 'peça' : 'peças'})</strong>
              <small className="text-amber-700 dark:text-amber-400">Ver itens e exportar WhatsApp</small>
            </span>
            <span aria-hidden="true" className="ml-auto text-lg text-amber-600">→</span>
          </button>
        ) : (
          <button type="button" onClick={() => onCatalogs()} className="cv-quick-action">
            <span className="cv-stat-icon" aria-hidden="true">▱</span>
            <span>
              <strong>Explorar Catálogos</strong>
              <small>Consulte diagramas e vistas explodidas</small>
            </span>
            <span aria-hidden="true" className="ml-auto text-lg text-slate-300">→</span>
          </button>
        )}
      </div>

      {/* Curva A: Peças de Alto Giro por Máquina */}
      <div className="cv-surface rounded-[24px] p-6 shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">⭐</span>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Peças de Alto Giro (Curva A de Balcão)</h2>
              <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                Acesso Rápido
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Atenda os modelos mais frequentes da oficina e balcão com um único clique.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {CURVA_A_MODELS.map(card => (
            <div
              key={card.model}
              className="flex flex-col justify-between rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/60 dark:bg-slate-800/40 p-3.5 shadow-sm transition hover:border-blue-300 dark:hover:border-blue-700"
            >
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-xs text-slate-800 dark:text-slate-200 truncate">{card.name}</span>
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${card.badgeClass}`}>
                    {card.tag}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {card.chips.map(chip => (
                    <button
                      type="button"
                      key={chip.q}
                      onClick={() => onSearch(chip.q)}
                      className="rounded-lg bg-slate-100 dark:bg-slate-700/60 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-[#123867] hover:text-[#1d4f91] dark:hover:text-blue-300 transition"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSearch(card.model)}
                className="mt-4 text-[11px] font-semibold text-[#1d4f91] dark:text-blue-400 hover:underline text-left flex items-center gap-1"
              >
                <span>Ver todas de {card.model}</span>
                <span>→</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Dicionário de Balcão e Jargões */}
      <div className="cv-surface rounded-[24px] p-6 shadow-sm border border-slate-200 dark:border-slate-800 bg-gradient-to-r from-blue-50/40 via-white to-indigo-50/30 dark:from-slate-800/40 dark:via-slate-800/20 dark:to-indigo-950/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">🗣️</span>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Sinônimos & Jargões de Balcão</h2>
              <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 border border-blue-500/20">
                Fale como o mecânico
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              O cliente pediu pelo nome popular? Clique para consultar o termo técnico correspondente na base oficial:
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {JARGÕES_BALCAO.map(item => (
            <button
              type="button"
              key={item.slang}
              onClick={() => onSearch(item.q)}
              className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-3 text-left transition hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-slate-700/60 shadow-xs group"
            >
              <div className="min-w-0 pr-2">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-[#1d4f91] dark:group-hover:text-blue-300 truncate">
                  &ldquo;{item.slang}&rdquo;
                </div>
                <div className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-400 truncate">
                  ➔ {item.tech}
                </div>
              </div>
              <span className="text-xs text-slate-300 group-hover:text-blue-500 transition">⌕</span>
            </button>
          ))}
        </div>
      </div>

      {/* Ferramentas de Oficina & Balcão */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* Calculadora de Mistura 2T */}
        <div className="cv-surface rounded-[24px] p-6 shadow-sm border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-amber-50/40 via-white to-amber-50/10 dark:from-slate-800/60 dark:via-slate-800/40 dark:to-amber-950/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🧴</span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Calculadora de Mistura 2 Tempos</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Dosagem oficial recomendada Husqvarna</p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-amber-500/10 dark:bg-amber-950/60 border border-amber-500/20 rounded-xl p-1">
              {([50, 33, 25] as const).map(ratio => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setFuelRatio(ratio)}
                  className={`rounded-lg px-2 py-0.5 text-[10px] font-bold transition ${
                    fuelRatio === ratio
                      ? 'bg-amber-500 text-slate-950 shadow-2xs'
                      : 'text-amber-800 dark:text-amber-300 hover:bg-amber-500/20'
                  }`}
                >
                  {ratio}:1
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                Gasolina Comum Limpa
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0.5}
                  max={100}
                  step={0.5}
                  value={fuelLiters}
                  onChange={e => setFuelLiters(Math.max(0.1, Number(e.target.value)))}
                  className="w-24 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-amber-500/30"
                />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Litros</span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {[1, 2, 5, 10, 20].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setFuelLiters(val)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition active:scale-95 ${
                      fuelLiters === val
                        ? 'bg-amber-500 text-slate-950 shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {val}L
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-2xl bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/20 p-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  Óleo 2T Husqvarna ({fuelRatio}:1):
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-amber-600 dark:text-amber-400">{oilMl}</span>
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-300">ml de óleo</span>
                </div>
                <div className="text-[10px] text-amber-700/80 dark:text-amber-300/70 mt-1">
                  {fuelRatio === 50 ? 'Padrão Husqvarna PRO (20ml / Litro)' : fuelRatio === 33 ? 'Amaciamento / 3% (30ml / Litro)' : 'Motores antigos / 4% (40ml / Litro)'}
                </div>
              </div>
              <button
                type="button"
                onClick={copyFuelInstruction}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-100 transition active:scale-95"
              >
                <span>📋</span>
                <span className="underline">Copiar instrução p/ WhatsApp</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tabela de Especificações da Oficina */}
        <div className="cv-surface rounded-[24px] p-6 shadow-sm border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="text-2xl">🔧</span>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Guia Rápido da Oficina Husqvarna</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Folgas, torques e regulagens recomendadas</p>
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 text-xs">
            <div className="rounded-xl border border-slate-100 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/60 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Folga do Eletrodo da Vela</span>
              <strong className="text-slate-800 dark:text-slate-200 text-sm">0,5 mm</strong>
              <span className="block text-[10px] text-slate-400 mt-0.5">Vela Champion RCJ7Y / NGK CMR7H</span>
            </div>

            <div className="rounded-xl border border-slate-100 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/60 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Entreferro da Bobina</span>
              <strong className="text-slate-800 dark:text-slate-200 text-sm">0,3 mm</strong>
              <span className="block text-[10px] text-slate-400 mt-0.5">Espessura de cartão de visita padrão</span>
            </div>

            <div className="rounded-xl border border-slate-100 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/60 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Marcha Lenta Padrão</span>
              <strong className="text-slate-800 dark:text-slate-200 text-sm">2.700 – 3.000 RPM</strong>
              <span className="block text-[10px] text-slate-400 mt-0.5">Sem engate da embreagem / lâmina</span>
            </div>

            <div className="rounded-xl border border-slate-100 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/60 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Ajuste H & L Carburador</span>
              <strong className="text-slate-800 dark:text-slate-200 text-sm">1 volta aberta</strong>
              <span className="block text-[10px] text-slate-400 mt-0.5">Ponto de partida do encosto suave</span>
            </div>
          </div>
        </div>
      </div>

      {/* Diagnóstico Rápido de Falhas 2 Tempos */}
      <div className="cv-surface rounded-[26px] p-6 shadow-sm border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-800/50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-rose-500/10 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 text-xl font-bold">
              🩺
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Guia de Diagnóstico & Sintomas da Oficina</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Identifique o defeito relatado pelo cliente e cote as peças corretas no balcão</p>
            </div>
          </div>
          <span className="rounded-full bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 px-3 py-1 text-[11px] font-bold text-rose-800 dark:text-rose-300">
            Motores 2T Husqvarna
          </span>
        </div>

        {/* Sintomas Selecionáveis */}
        <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1 cv-scrollbar">
          {DIAGNOSTIC_SYMPTOMS.map(s => {
            const active = s.id === activeSymptom;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSymptom(s.id)}
                className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition flex items-center gap-2 active:scale-95 ${
                  active
                    ? 'bg-[#123867] text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>{s.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Detalhe do Sintoma e Peças */}
        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] rounded-2xl bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/80 p-5">
          <div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{currentSymptom.title}</div>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed italic bg-white dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
              “{currentSymptom.symptom}”
            </p>

            <div className="mt-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">Checklist de Verificação Técnica na Bancada:</span>
              <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                {currentSymptom.checks.map((check, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">✓</span>
                    <span>{check}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2.5">
              Peças Mais Prováveis para Substituição:
            </span>
            <div className="space-y-2.5">
              {currentSymptom.recommendedParts.map(part => {
                const inCart = quoteCart.items.find(i => i.partNumber === part.code);
                return (
                  <div
                    key={part.code}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-2xs flex flex-col justify-between gap-2"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-snug">
                        {part.name}
                      </div>
                      <div className="mt-1 flex items-baseline gap-2 font-mono text-xs font-bold text-[#1d4f91] dark:text-blue-300">
                        <span>{part.code}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/60">
                      <button
                        type="button"
                        onClick={() => {
                          quoteCart.addItem({
                            partNumber: part.code,
                            name: part.name,
                            model: 'Husqvarna 2T',
                          });
                          toast.success(`${part.name} adicionada ao orçamento!`);
                        }}
                        className={`flex-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition flex items-center justify-center gap-1 active:scale-95 ${
                          inCart
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                            : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 text-slate-950 shadow-2xs'
                        }`}
                      >
                        <span>{inCart ? '✓' : '+'}</span>
                        <span>{inCart ? `No Orçamento (${inCart.quantity}x)` : 'Orçamento'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onSearch(part.query)}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 transition"
                      >
                        🔍 Buscar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Guia & Seletor de Sabres, Correntes e Limas Husqvarna */}
      <div className="cv-surface rounded-[26px] p-6 shadow-sm border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-emerald-50/20 via-white to-slate-50/30 dark:from-slate-850 dark:via-slate-800/60 dark:to-emerald-950/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-500/10 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 text-xl font-bold">
              🪵
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Guia & Seletor de Sabres, Correntes e Limas</h2>
                <span className="rounded-full bg-emerald-500/10 dark:bg-emerald-950/60 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                  Tabela Oficial Husqvarna
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Consulte o passo, calibre, quantidade de elos (DL), diâmetro de lima e cote sabre e corrente com 1 clique
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={copyChainsawSpec}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition shadow-2xs active:scale-95"
          >
            <span>📋</span>
            <span>Copiar Especificação p/ WhatsApp</span>
          </button>
        </div>

        {/* Seleção de Motosserra */}
        <div className="mt-5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
            1. Selecione o Modelo da Motosserra:
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 cv-scrollbar">
            {CHAINSAW_GUIDE_MODELS.map(m => {
              const active = m.id === selectedChainsawId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => changeChainsawModel(m.id)}
                  className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition flex items-center gap-2 active:scale-95 ${
                    active
                      ? 'bg-[#123867] text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>🪚</span>
                  <span>{m.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Seleção de Comprimento de Sabre */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/80 p-3.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              2. Comprimento do Sabre:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {currentChainsaw.bars.map(b => {
                const active = b.lengthInches === selectedBarLength;
                return (
                  <button
                    key={b.lengthInches}
                    type="button"
                    onClick={() => setSelectedBarLength(b.lengthInches)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 active:scale-95 ${
                      active
                        ? 'bg-amber-500 text-slate-950 shadow-2xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-amber-400'
                    }`}
                  >
                    <span>{b.lengthInches}&quot; ({b.lengthCm} cm)</span>
                    {b.isStandard && (
                      <span className={`rounded-md px-1 py-0.2 text-[9px] font-black uppercase ${
                        active ? 'bg-slate-950 text-amber-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}>
                        Padrão
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {currentChainsaw.displacement} · <span className="italic">{currentChainsaw.popularUses}</span>
          </div>
        </div>

        {/* Especificações Técnicas e Peças Originais */}
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          {/* Card Esquerdo: Geometria da Corrente e Lima */}
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-850 p-4 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
                <span>Geometria da Corrente & Afiação</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">{currentBar.lengthInches}&quot; / {currentBar.lengthCm}cm</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Passo da Corrente</span>
                  <span className="text-sm font-black text-slate-800 dark:text-slate-100">{currentBar.pitch}</span>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Calibre (Canaleta)</span>
                  <span className="text-sm font-black text-slate-800 dark:text-slate-100">{currentBar.gauge}</span>
                </div>
                <div className="rounded-xl bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/20 p-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block">Elos de Tração (DL)</span>
                  <span className="text-sm font-black text-emerald-700 dark:text-emerald-300">{currentBar.driveLinks} Elos (DL)</span>
                </div>
                <div className="rounded-xl bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/20 p-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 block">Lima Redonda Recomendada</span>
                  <span className="text-sm font-black text-amber-700 dark:text-amber-300">{currentBar.fileDiameter}</span>
                </div>
              </div>

              <div className="mt-3 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/50">
                <strong>Modelo da Corrente:</strong> {currentBar.chainModel} · Sabre com montagem para flange da série {currentChainsaw.name.split(' ')[0]}.
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Pronto para atendimento no balcão</span>
              <button
                type="button"
                onClick={copyChainsawSpec}
                className="text-xs font-bold text-[#1d4f91] dark:text-blue-300 hover:underline inline-flex items-center gap-1"
              >
                <span>📋 Copiar mensagem formatada</span>
              </button>
            </div>
          </div>

          {/* Card Direito: Códigos Oficiais e Ações de Orçamento */}
          <div className="space-y-3">
            {/* Sabre */}
            {(() => {
              const barInCart = quoteCart.items.find(i => i.partNumber.replace(/\s+/g, '') === currentBar.barPartNumber.replace(/\s+/g, ''));
              return (
                <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-850 p-4 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="rounded-md bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase">
                        Sabre Oficial Husqvarna
                      </span>
                      <div className="mt-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                        {currentBar.barModel} ({currentBar.lengthInches}&quot; - {currentBar.lengthCm} cm)
                      </div>
                      <div className="mt-0.5 font-mono text-sm font-black text-[#1d4f91] dark:text-blue-300">
                        {currentBar.barPartNumber}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        quoteCart.addItem({
                          partNumber: currentBar.barPartNumber,
                          name: `Sabre ${currentBar.lengthInches}" (${currentBar.lengthCm}cm) ${currentBar.barModel}`,
                          model: `Husqvarna ${currentChainsaw.name}`,
                        });
                        toast.success(`Sabre ${currentBar.lengthInches}" adicionado ao orçamento!`);
                      }}
                      className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-95 ${
                        barInCart
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                          : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 text-slate-950 shadow-2xs'
                      }`}
                    >
                      <span>{barInCart ? '✓' : '+'}</span>
                      <span>{barInCart ? `Sabre no Orçamento (${barInCart.quantity}x)` : '+ Orçar Sabre'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSearch(currentBar.barPartNumber)}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                    >
                      🔍 Buscar
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Corrente */}
            {(() => {
              const chainInCart = quoteCart.items.find(i => i.partNumber.replace(/\s+/g, '') === currentBar.chainPartNumber.replace(/\s+/g, ''));
              return (
                <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-850 p-4 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase">
                        Corrente Oficial Husqvarna
                      </span>
                      <div className="mt-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                        Corrente {currentBar.chainModel} ({currentBar.driveLinks} DL · {currentBar.pitch})
                      </div>
                      <div className="mt-0.5 font-mono text-sm font-black text-[#1d4f91] dark:text-blue-300">
                        {currentBar.chainPartNumber}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        quoteCart.addItem({
                          partNumber: currentBar.chainPartNumber,
                          name: `Corrente ${currentBar.lengthInches}" (${currentBar.driveLinks}DL - ${currentBar.pitch}) ${currentBar.chainModel}`,
                          model: `Husqvarna ${currentChainsaw.name}`,
                        });
                        toast.success(`Corrente ${currentBar.driveLinks}DL adicionada ao orçamento!`);
                      }}
                      className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-95 ${
                        chainInCart
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                          : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 text-slate-950 shadow-2xs'
                      }`}
                    >
                      <span>{chainInCart ? '✓' : '+'}</span>
                      <span>{chainInCart ? `Corrente no Orçamento (${chainInCart.quantity}x)` : '+ Orçar Corrente'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSearch(currentBar.chainPartNumber)}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                    >
                      🔍 Buscar
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Guia & Seletor de Cabeçotes de Fio, Lâminas e Roçadeiras Husqvarna */}
      <div className="cv-surface rounded-[26px] p-6 shadow-sm border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-lime-50/30 via-white to-slate-50/30 dark:from-slate-850 dark:via-slate-800/60 dark:to-lime-950/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-500/10 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 text-xl font-bold">
              🌿
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Guia de Cabeçotes de Fio, Lâminas e Roçadeiras</h2>
                <span className="rounded-full bg-emerald-500/10 dark:bg-emerald-950/60 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                  Roçadeiras Husqvarna
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Consulte a rosca do eixo, cabeçotes Tap&apos;n Go compatíveis, lâminas 2, 3 e 4 pontas e kits de fixação
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={copyTrimmerSpec}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition shadow-2xs active:scale-95"
          >
            <span>📋</span>
            <span>Copiar Especificação p/ WhatsApp</span>
          </button>
        </div>

        {/* Seleção de Roçadeira */}
        <div className="mt-5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
            1. Selecione o Modelo da Roçadeira:
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 cv-scrollbar">
            {TRIMMER_GUIDE_MODELS.map(m => {
              const active = m.id === selectedTrimmerId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedTrimmerId(m.id)}
                  className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition flex items-center gap-2 active:scale-95 ${
                    active
                      ? 'bg-[#123867] text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>🌿</span>
                  <span>{m.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Barra de Especificação do Eixo & Modo de Corte */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/80 p-3.5">
          <div className="flex items-center gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Rosca do Eixo da Transmissão</span>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 font-mono">
                🔩 {currentTrimmer.thread}
              </span>
            </div>
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
            <div className="flex items-center rounded-xl bg-white dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setTrimmerCuttingMode('nylon')}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition flex items-center gap-1.5 ${
                  trimmerCuttingMode === 'nylon'
                    ? 'bg-amber-500 text-slate-950 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                <span>🧵</span>
                <span>Cabeçote & Fio</span>
              </button>
              <button
                type="button"
                onClick={() => setTrimmerCuttingMode('blade')}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition flex items-center gap-1.5 ${
                  trimmerCuttingMode === 'blade'
                    ? 'bg-amber-500 text-slate-950 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                <span>🗡️</span>
                <span>Lâminas Metálicas</span>
              </button>
            </div>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {currentTrimmer.power} · <span className="italic">{currentTrimmer.popularUses}</span>
          </div>
        </div>

        {/* Detalhes Técnicos & Peças Originais */}
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          {trimmerCuttingMode === 'nylon' ? (
            <>
              {/* Card Esquerdo: Cabeçote de Fio */}
              {(() => {
                const headInCart = quoteCart.items.find(i => i.partNumber.replace(/\s+/g, '') === currentTrimmer.headPartNumber.replace(/\s+/g, ''));
                return (
                  <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-850 p-4 shadow-2xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase">
                          Cabeçote de Nylon Oficial
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">{currentTrimmer.thread.split(' ')[0]}</span>
                      </div>
                      <div className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                        {currentTrimmer.headModel}
                      </div>
                      <div className="mt-0.5 font-mono text-base font-black text-[#1d4f91] dark:text-blue-300">
                        {currentTrimmer.headPartNumber}
                      </div>

                      <div className="mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-700/60">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Espessura do fio:</span>
                          <strong className="text-slate-800 dark:text-slate-200">{currentTrimmer.headCordRange}</strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Sistema:</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">Tap&apos;n Go (Alimentação por impacto)</span>
                        </div>
                        <div className="pt-1 text-[11px] text-slate-400 border-t border-slate-200/60 dark:border-slate-700/60">
                          {currentTrimmer.headFeatures}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          quoteCart.addItem({
                            partNumber: currentTrimmer.headPartNumber,
                            name: currentTrimmer.headModel,
                            model: `Husqvarna ${currentTrimmer.name}`,
                          });
                          toast.success(`${currentTrimmer.headModel} adicionado ao orçamento!`);
                        }}
                        className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-95 ${
                          headInCart
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                            : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 text-slate-950 shadow-2xs'
                        }`}
                      >
                        <span>{headInCart ? '✓' : '+'}</span>
                        <span>{headInCart ? `Cabeçote no Orçamento (${headInCart.quantity}x)` : '+ Orçar Cabeçote'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSearch(currentTrimmer.headPartNumber)}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                      >
                        🔍 Buscar
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Card Direito: Fio de Nylon Recomendado */}
              {(() => {
                const cordInCart = quoteCart.items.find(i => i.partNumber.replace(/\s+/g, '') === currentTrimmer.recommendedCord.partNumber.replace(/\s+/g, ''));
                return (
                  <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-850 p-4 shadow-2xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase">
                          Fio de Nylon Oficial Husqvarna
                        </span>
                        <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">Linha Whisper X / Opti</span>
                      </div>
                      <div className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                        {currentTrimmer.recommendedCord.name}
                      </div>
                      <div className="mt-0.5 font-mono text-base font-black text-[#1d4f91] dark:text-blue-300">
                        {currentTrimmer.recommendedCord.partNumber}
                      </div>

                      <div className="mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-300 bg-amber-50/40 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-200/40 dark:border-amber-800/40">
                        <div>
                          <strong>Características de Trabalho:</strong>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {currentTrimmer.recommendedCord.spec}. O núcleo tenaz evita que o fio se solde dentro do cabeçote sob altas rotações.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          quoteCart.addItem({
                            partNumber: currentTrimmer.recommendedCord.partNumber,
                            name: currentTrimmer.recommendedCord.name,
                            model: `Husqvarna ${currentTrimmer.name}`,
                          });
                          toast.success(`${currentTrimmer.recommendedCord.name} adicionado ao orçamento!`);
                        }}
                        className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-95 ${
                          cordInCart
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                            : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 text-slate-950 shadow-2xs'
                        }`}
                      >
                        <span>{cordInCart ? '✓' : '+'}</span>
                        <span>{cordInCart ? `Fio no Orçamento (${cordInCart.quantity}x)` : '+ Orçar Rolo de Fio'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSearch(currentTrimmer.recommendedCord.partNumber)}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                      >
                        🔍 Buscar
                      </button>
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <>
              {/* Card Esquerdo: Lista de Lâminas */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-850 p-4 shadow-2xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2.5">
                  Lâminas Compatíveis (Furo de Fixação 1&quot; / 25.4 mm):
                </span>
                <div className="space-y-2.5">
                  {currentTrimmer.blades.map(blade => {
                    const bladeInCart = quoteCart.items.find(i => i.partNumber.replace(/\s+/g, '') === blade.partNumber.replace(/\s+/g, ''));
                    return (
                      <div
                        key={blade.partNumber}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 p-3 flex flex-col justify-between gap-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                              {blade.name}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                              Ø {blade.diameter} · Furo {blade.hole} · <span className="italic">{blade.idealFor}</span>
                            </div>
                            <div className="mt-1 font-mono text-xs font-bold text-[#1d4f91] dark:text-blue-300">
                              {blade.partNumber}
                            </div>
                          </div>
                          {blade.isRecommended && (
                            <span className="shrink-0 rounded-md bg-emerald-500/10 dark:bg-emerald-950/60 border border-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:text-emerald-300 uppercase">
                              Mais Vendida
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                          <button
                            type="button"
                            onClick={() => {
                              quoteCart.addItem({
                                partNumber: blade.partNumber,
                                name: blade.name,
                                model: `Husqvarna ${currentTrimmer.name}`,
                              });
                              toast.success(`${blade.name} adicionada ao orçamento!`);
                            }}
                            className={`flex-1 rounded-lg px-2 py-1 text-[11px] font-bold transition flex items-center justify-center gap-1 active:scale-95 ${
                              bladeInCart
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                                : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 text-slate-950 shadow-2xs'
                            }`}
                          >
                            <span>{bladeInCart ? '✓' : '+'}</span>
                            <span>{bladeInCart ? `No Orçamento (${bladeInCart.quantity}x)` : '+ Orçar Lâmina'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onSearch(blade.partNumber)}
                            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                          >
                            🔍 Buscar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Card Direito: Kit de Fixação da Lâmina */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-850 p-4 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase">
                      Itens de Fixação da Lâmina
                    </span>
                    <span className="text-[11px] text-slate-400">Reposição frequente</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Ao trocar o cabeçote de nylon pela lâmina metálica, é obrigatório utilizar o prato de proteção e porca com rosca esquerda.
                  </p>

                  <div className="mt-3 space-y-2.5">
                    {/* Porca */}
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-2.5 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{currentTrimmer.fixingKit.nut}</div>
                        <div className="font-mono text-xs font-bold text-[#1d4f91] dark:text-blue-300">{currentTrimmer.fixingKit.nutPartNumber}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          quoteCart.addItem({
                            partNumber: currentTrimmer.fixingKit.nutPartNumber,
                            name: currentTrimmer.fixingKit.nut,
                            model: `Husqvarna ${currentTrimmer.name}`,
                          });
                          toast.success('Porca de fixação adicionada ao orçamento!');
                        }}
                        className="rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 px-2.5 py-1 text-[11px] font-bold transition shadow-2xs"
                      >
                        + Orçar
                      </button>
                    </div>

                    {/* Prato Giratório */}
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-2.5 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{currentTrimmer.fixingKit.skidCup}</div>
                        <div className="font-mono text-xs font-bold text-[#1d4f91] dark:text-blue-300">{currentTrimmer.fixingKit.skidCupPartNumber}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          quoteCart.addItem({
                            partNumber: currentTrimmer.fixingKit.skidCupPartNumber,
                            name: currentTrimmer.fixingKit.skidCup,
                            model: `Husqvarna ${currentTrimmer.name}`,
                          });
                          toast.success('Prato giratório adicionado ao orçamento!');
                        }}
                        className="rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 px-2.5 py-1 text-[11px] font-bold transition shadow-2xs"
                      >
                        + Orçar
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Atendimento Vardão Máquinas</span>
                  <button
                    type="button"
                    onClick={copyTrimmerSpec}
                    className="text-xs font-bold text-[#1d4f91] dark:text-blue-300 hover:underline inline-flex items-center gap-1"
                  >
                    <span>📋 Copiar mensagem p/ WhatsApp</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Recentes & Favoritos */}
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="cv-surface rounded-[22px] p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">Pesquisas recentes</div>
              <div className="mt-1 text-xs text-slate-400">Continue de onde o balcão parou.</div>
            </div>
            <span className="cv-soft-badge">Histórico</span>
          </div>
          <div className="mt-4 grid gap-2">
            {isLoading ? (
              <div className="grid gap-2">
                <div className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />
                <div className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />
              </div>
            ) : data?.recentSearches.length ? (
              data.recentSearches.map(item => (
                <button
                  key={item.id}
                  onClick={() => onSearch(item.resultCode || item.query)}
                  className="cv-list-row"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{item.query}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {item.resultCode ? `${item.resultCode} · ${item.resultModel || ''}` : item.status.replaceAll('_', ' ')}
                    </div>
                  </div>
                  <span aria-hidden="true" className="text-slate-300">→</span>
                </button>
              ))
            ) : (
              <Empty title="Sem pesquisas ainda" description="As consultas feitas pela equipe aparecerão aqui." />
            )}
          </div>
        </div>

        <div className="cv-surface rounded-[22px] p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">Favoritos salvos</div>
              <div className="mt-1 text-xs text-slate-400">Peças e catálogos marcados com estrela.</div>
            </div>
            <span className="cv-soft-badge">★ Salvos</span>
          </div>
          <div className="mt-4 grid gap-2">
            {isLoading ? (
              <div className="grid gap-2">
                <div className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />
                <div className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />
              </div>
            ) : data?.favorites.length ? (
              data.favorites.map(item => (
                <button
                  key={item.id}
                  onClick={() => item.reference ? onSearch(item.reference) : onCatalogs()}
                  className="cv-list-row"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{item.label}</div>
                    <div className="mt-1 text-xs text-slate-400">{item.reference || item.model || 'Catálogo salvo'}</div>
                  </div>
                  <span aria-hidden="true" className="text-amber-400 font-bold">★</span>
                </button>
              ))
            ) : (
              <Empty title="Nenhum favorito" description="Salve peças frequentes para ganhar tempo no atendimento." />
            )}
          </div>
        </div>
      </div>

      {/* Catálogos Recentes */}
      <div className="cv-surface rounded-[22px] p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-900 dark:text-slate-100">Catálogos técnicos indexados</div>
            <div className="mt-1 text-xs text-slate-400">Últimos manuais de peças Husqvarna processados.</div>
          </div>
          <button type="button" onClick={() => onCatalogs()} className="cv-link font-semibold">Ver todos os catálogos →</button>
        </div>
        {isLoading ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
            <div className="h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
            <div className="h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data?.recentDocuments.map(document => (
              <button
                type="button"
                onClick={() => onCatalogs(document.model || document.filename)}
                key={document.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-md group"
              >
                <div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-blue-50 dark:bg-[#123867] text-sm font-bold text-[#1d4f91] dark:text-blue-300 group-hover:bg-blue-600 group-hover:text-white transition" aria-hidden="true">
                  PDF
                </div>
                <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">{document.filename}</div>
                <div className="mt-2 text-xs leading-5 text-slate-400">
                  {document.manufacturer || 'Husqvarna'} · {document.model || 'Modelo não informado'}<br />
                  PNC {document.pnc || '—'} · {formatCount(document.partCount)} peças
                </div>
              </button>
            ))}
          </div>
        )}
        {data && !data.recentDocuments.length && !isLoading && (
          <div className="mt-4">
            <Empty title="Nenhum catálogo recente" description="Os novos PDFs processados aparecerão aqui." />
          </div>
        )}
      </div>
    </section>
  );
}
