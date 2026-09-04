import { normalizeIdentifier, normalizeText } from '../utils/normalize';

export type EquipmentFamily =
  | 'BRUSHCUTTER'
  | 'CHAINSAW'
  | 'GARDEN_TRACTOR'
  | 'WALK_MOWER'
  | 'BLOWER'
  | 'HEDGE_TRIMMER'
  | 'COMBI'
  | 'ZERO_TURN'
  | 'RIDER'
  | 'ENGINE'
  | 'POLE_PRUNER'
  | 'MANUAL_SPRAYER'
  | 'POWER_SPRAYER'
  | 'AUTOMOWER'
  | 'TRIMMER'
  | 'TILLER'
  | 'EARTH_AUGER'
  | 'POWER_CUTTER'
  | 'BATTERY';

export type DomainSearchGroup = {
  key: string;
  variants: string[];
};

type DomainRule = {
  key: string;
  families: EquipmentFamily[];
  triggers: string[];
  technicalTerms: string[];
  suppressKeys?: string[];
};

type ModelFamilyEntry = {
  model: string;
  family: EquipmentFamily;
};

export type EngineCatalogRoute =
  | {
      status: 'ROUTE';
      machineModel: string;
      engineModel: string;
      engineArticle: string | null;
    }
  | {
      status: 'PNC_REQUIRED';
      machineModel: string;
      knownPncs: string[];
    };

type EngineApplication = {
  machineModel: string;
  machinePnc?: string;
  engineModel: string;
  engineArticle?: string;
};

const MODEL_FAMILIES: ModelFamilyEntry[] = [
  // Roçadeiras
  { model: '128R', family: 'BRUSHCUTTER' },
  { model: '131R', family: 'BRUSHCUTTER' },
  { model: '142R', family: 'BRUSHCUTTER' },
  { model: '143RII', family: 'BRUSHCUTTER' },
  { model: '143RS', family: 'BRUSHCUTTER' },
  { model: '226R', family: 'BRUSHCUTTER' },
  { model: '236R', family: 'BRUSHCUTTER' },
  { model: '321R', family: 'BRUSHCUTTER' },
  { model: '345FR', family: 'BRUSHCUTTER' },
  { model: '545RX', family: 'BRUSHCUTTER' },

  // Aparadores
  { model: '110IL', family: 'TRIMMER' },
  { model: '115IL', family: 'TRIMMER' },
  { model: '122C', family: 'TRIMMER' },
  { model: '129C', family: 'TRIMMER' },
  { model: '322L', family: 'TRIMMER' },

  // Motosserras
  { model: '120', family: 'CHAINSAW' },
  { model: '125', family: 'CHAINSAW' },
  { model: '236', family: 'CHAINSAW' },
  { model: '135', family: 'CHAINSAW' },
  { model: '135MARKII', family: 'CHAINSAW' },
  { model: '445', family: 'CHAINSAW' },
  { model: '450', family: 'CHAINSAW' },
  { model: '61', family: 'CHAINSAW' },
  { model: '272XP', family: 'CHAINSAW' },
  { model: '281XP', family: 'CHAINSAW' },
  { model: '288XP', family: 'CHAINSAW' },
  { model: '353', family: 'CHAINSAW' },
  { model: '365SPECIAL', family: 'CHAINSAW' },
  { model: '372XP', family: 'CHAINSAW' },
  { model: '390XP', family: 'CHAINSAW' },
  { model: '395XP', family: 'CHAINSAW' },
  { model: '550XP', family: 'CHAINSAW' },
  { model: '572XP', family: 'CHAINSAW' },
  { model: '564XP', family: 'CHAINSAW' },
  { model: '550IXP', family: 'CHAINSAW' },

  // Automowers
  { model: '105', family: 'AUTOMOWER' },
  { model: '310', family: 'AUTOMOWER' },
  { model: '315', family: 'AUTOMOWER' },
  { model: '430X', family: 'AUTOMOWER' },
  { model: '450X', family: 'AUTOMOWER' },
  { model: '435XAWD', family: 'AUTOMOWER' },
  { model: '405VE', family: 'AUTOMOWER' },
  { model: '410VE', family: 'AUTOMOWER' },
  { model: '430V', family: 'AUTOMOWER' },
  { model: '450V', family: 'AUTOMOWER' },
  { model: 'R6V', family: 'AUTOMOWER' },
  { model: '308V', family: 'AUTOMOWER' },
  { model: '312V', family: 'AUTOMOWER' },
  { model: '540EPOS', family: 'AUTOMOWER' },
  { model: '560', family: 'AUTOMOWER' },
  { model: '580', family: 'AUTOMOWER' },
  { model: '580L', family: 'AUTOMOWER' },
  { model: '535AWDEPOS', family: 'AUTOMOWER' },

  // Tratores
  { model: 'TS114', family: 'GARDEN_TRACTOR' },
  { model: 'TS138', family: 'GARDEN_TRACTOR' },
  { model: 'TS138L', family: 'GARDEN_TRACTOR' },
  { model: 'TC138', family: 'GARDEN_TRACTOR' },
  { model: 'TC238', family: 'GARDEN_TRACTOR' },
  { model: 'TS142', family: 'GARDEN_TRACTOR' },
  { model: 'TS148', family: 'GARDEN_TRACTOR' },
  { model: 'TS217TM', family: 'GARDEN_TRACTOR' },
  { model: 'TS254G', family: 'GARDEN_TRACTOR' },
  { model: 'TS354D', family: 'GARDEN_TRACTOR' },
  { model: 'LTH1738', family: 'GARDEN_TRACTOR' },

  // Cortadores Manuais
  { model: 'HU725AWD', family: 'WALK_MOWER' },
  { model: 'J55SL', family: 'WALK_MOWER' },
  { model: 'LB155S', family: 'WALK_MOWER' },
  { model: 'LB146', family: 'WALK_MOWER' },
  { model: 'LB256SP', family: 'WALK_MOWER' },
  { model: 'LC121P', family: 'WALK_MOWER' },
  { model: 'LC140S', family: 'WALK_MOWER' },
  { model: 'LC151', family: 'WALK_MOWER' },
  { model: 'LC151S', family: 'WALK_MOWER' },
  { model: 'LC153S', family: 'WALK_MOWER' },
  { model: 'LC353AWD', family: 'WALK_MOWER' },
  { model: 'GX560', family: 'WALK_MOWER' },
  { model: 'HU550FH', family: 'WALK_MOWER' },

  // Automower
  { model: '105', family: 'AUTOMOWER' },
  { model: '310', family: 'AUTOMOWER' },
  { model: '315', family: 'AUTOMOWER' },
  { model: '430X', family: 'AUTOMOWER' },
  { model: '450X', family: 'AUTOMOWER' },
  { model: '435XAWD', family: 'AUTOMOWER' },

  // Sopradores
  { model: '125B', family: 'BLOWER' },
  { model: '125BVX', family: 'BLOWER' },
  { model: '340BT', family: 'BLOWER' },
  { model: '350BT', family: 'BLOWER' },
  { model: '570BTS', family: 'BLOWER' },
  { model: '580BTS', family: 'BLOWER' },
  { model: '578BTF', family: 'BLOWER' },

  { model: '122HD60', family: 'HEDGE_TRIMMER' },
  { model: '226HD60S', family: 'HEDGE_TRIMMER' },
  { model: '525LK', family: 'COMBI' },

  // Giro zero
  { model: 'MZ54', family: 'ZERO_TURN' },
  { model: 'MZ61', family: 'ZERO_TURN' },
  { model: 'Z242F', family: 'ZERO_TURN' },
  { model: 'Z246', family: 'ZERO_TURN' },
  { model: 'Z248F', family: 'ZERO_TURN' },
  { model: 'Z254', family: 'ZERO_TURN' },
  { model: 'Z254F', family: 'ZERO_TURN' },
  { model: 'Z354F', family: 'ZERO_TURN' },
  { model: 'Z448', family: 'ZERO_TURN' },
  { model: 'Z454', family: 'ZERO_TURN' },
  { model: 'Z454X', family: 'ZERO_TURN' },
  { model: 'Z460', family: 'ZERO_TURN' },
  { model: 'Z460X', family: 'ZERO_TURN' },
  { model: 'Z554X', family: 'ZERO_TURN' },
  { model: 'Z560X', family: 'ZERO_TURN' },
  { model: 'V548', family: 'ZERO_TURN' },
  { model: 'V554', family: 'ZERO_TURN' },

  { model: 'R112C', family: 'RIDER' },
  { model: 'R214TC', family: 'RIDER' },
  { model: 'R316TX', family: 'RIDER' },
  { model: 'P524', family: 'RIDER' },

  // Motores
  { model: 'HS166A', family: 'ENGINE' },
  { model: 'HS452AE', family: 'ENGINE' },
  { model: 'HS608', family: 'ENGINE' },
  { model: 'HV586AE', family: 'ENGINE' },
  { model: 'HV764', family: 'ENGINE' },
  { model: 'FR691V', family: 'ENGINE' },
  { model: 'FR691', family: 'ENGINE' },
  { model: 'FR730V', family: 'ENGINE' },
  { model: 'FR730', family: 'ENGINE' },
  { model: 'FR651V', family: 'ENGINE' },
  { model: 'FR651', family: 'ENGINE' },
  { model: 'FX921V', family: 'ENGINE' },
  { model: 'FX921', family: 'ENGINE' },
  { model: 'FX730V', family: 'ENGINE' },
  { model: 'FX751V', family: 'ENGINE' },
  { model: 'FX850V', family: 'ENGINE' },
  { model: 'FS730V', family: 'ENGINE' },

  // Podadores de Galho
  { model: '525P5S', family: 'POLE_PRUNER' },
  { model: '525PT5S', family: 'POLE_PRUNER' },

  // Pulverizadores
  { model: '320SM20L', family: 'MANUAL_SPRAYER' },
  { model: '320SM', family: 'MANUAL_SPRAYER' },
  { model: '321S25', family: 'POWER_SPRAYER' },

  // Motocultivadores e Tobatas
  { model: 'TF230', family: 'TILLER' },
  { model: 'TF338', family: 'TILLER' },
  { model: 'TR348', family: 'TILLER' },

  // Perfuradores
  { model: '143AE15', family: 'EARTH_AUGER' },

  // Cortadoras de disco (Policorte)
  { model: 'K770', family: 'POWER_CUTTER' },
  { model: 'K970', family: 'POWER_CUTTER' },
];

const MODEL_FAMILY = new Map(MODEL_FAMILIES.map(entry => [normalizeIdentifier(entry.model), entry]));

const FAMILY_SYSTEMS: Record<EquipmentFamily, string[]> = {
  BRUSHCUTTER: ['motor 2T', 'combustível', 'ignição', 'partida', 'embreagem', 'tubo/eixo', 'caixa angular', 'conjunto de corte', 'comandos'],
  TRIMMER: ['motor', 'ignição', 'partida', 'tubo', 'cabeçote de fio de nylon', 'protetor', 'acelerador'],
  CHAINSAW: ['motor 2T', 'combustível', 'partida', 'embreagem', 'pinhão', 'bomba de óleo', 'sabre/corrente', 'tensor', 'freio da corrente', 'antivibração'],
  GARDEN_TRACTOR: ['motor', 'PTO/embreagem elétrica', 'transmissão', 'direção', 'freio', 'deck', 'correias/polias', 'descarga/coleta', 'elevação', 'elétrica'],
  WALK_MOWER: ['motor', 'chassi', 'lâmina/adaptador', 'descarga/mulch/coleta', 'regulagem de altura', 'tração', 'rodas'],
  AUTOMOWER: ['placa principal', 'display', 'motor da roda', 'motor de corte', 'disco de corte', 'chassi', 'roda', 'bateria', 'estação de carga'],
  BLOWER: ['motor 2T', 'combustível', 'partida', 'impulsor/ventoinha', 'voluta', 'tubos', 'bocal', 'estrutura costal'],
  HEDGE_TRIMMER: ['motor 2T', 'embreagem', 'caixa de engrenagens', 'bielas', 'barra de corte', 'lâminas'],
  COMBI: ['unidade motriz', 'motor 2T', 'embreagem', 'tubo/acoplamento', 'implemento'],
  ZERO_TURN: ['motor', 'PTO', 'controles LH/RH', 'transmissões hidrostáticas LH/RH', 'freio de estacionamento', 'caster', 'deck', 'elevação', 'ROPS'],
  RIDER: ['motor', 'transmissão', 'tensor/correia', 'articulação', 'direção', 'chassi', 'unidade de corte', 'elétrica'],
  ENGINE: ['admissão/combustível', 'cabeçote/válvulas', 'pistão/virabrequim', 'comando/governador', 'lubrificação', 'ignição', 'arranque', 'carga elétrica'],
  POLE_PRUNER: ['motor 2T', 'embreagem', 'tubo/eixo motriz', 'cabeça de corte', 'pinhão', 'sabre', 'corrente'],
  MANUAL_SPRAYER: ['reservatório', 'bomba manual', 'alavanca/agitador', 'mangueira', 'lança', 'válvula', 'bico'],
  POWER_SPRAYER: ['motor 2T', 'embreagem', 'reservatório', 'caixa da bomba', 'bomba', 'pistão da bomba', 'mangueira de pressão', 'lança', 'válvula', 'bico'],
  TILLER: ['motor 4T', 'transmissão', 'caixa de engrenagens', 'enxadas rotativas', 'correia', 'guidão'],
  EARTH_AUGER: ['motor 2T', 'caixa de redução', 'embreagem', 'broca', 'ponta', 'comandos'],
  POWER_CUTTER: ['motor 2T', 'correia trapezoidal', 'braço de corte', 'proteção do disco', 'válvula de descompressão', 'filtro active air'],
  BATTERY: ['células', 'placa bms', 'conector', 'carcaça', 'led de status'],
};

export const DOMAIN_RULES: DomainRule[] = [
  // Conhecimento de motor 4T observado nos IPLs Husqvarna HS/HV.
  { key: 'rocker-arm', families: ['ENGINE', 'GARDEN_TRACTOR', 'ZERO_TURN'], triggers: ['balancim', 'balancins', 'rocker arm'], technicalTerms: ['rocker arm', 'rocker arm kit', 'kit da valvula rocker arm'] },
  { key: 'push-rod', families: ['ENGINE', 'GARDEN_TRACTOR', 'ZERO_TURN'], triggers: ['vareta de valvula', 'vareta da valvula', 'haste de valvula', 'push rod'], technicalTerms: ['push rod', 'push rod set', 'biela push rod'] },
  { key: 'camshaft', families: ['ENGINE', 'GARDEN_TRACTOR', 'ZERO_TURN'], triggers: ['arvore de cames', 'arvore do comando', 'eixo comando', 'comando de valvulas', 'camshaft'], technicalTerms: ['camshaft', 'camshaft kit', 'arvore de cames'] },
  { key: 'governor', families: ['ENGINE', 'GARDEN_TRACTOR', 'ZERO_TURN'], triggers: ['governador', 'regulador de giro', 'regulador de rotacao', 'governor'], technicalTerms: ['governor', 'governor gear', 'speed regulating arm'] },
  { key: 'oil-strainer', families: ['ENGINE', 'GARDEN_TRACTOR', 'ZERO_TURN'], triggers: ['peneira de oleo', 'pescador de oleo', 'tela de oleo', 'oil strainer'], technicalTerms: ['oil strainer', 'peneira de oleo', 'strainer'] },
  { key: 'voltage-rectifier', families: ['ENGINE', 'GARDEN_TRACTOR', 'ZERO_TURN'], triggers: ['retificador', 'regulador de tensao', 'regulador de voltagem', 'voltage rectifier'], technicalTerms: ['voltage rectifier', 'rectifier kit', 'rectifier support'] },
  
  // Nomes genéricos comuns e gírias em todas as máquinas a combustão 
  { key: 'starter-cord', families: ['CHAINSAW', 'BRUSHCUTTER', 'BLOWER', 'POWER_CUTTER', 'EARTH_AUGER', 'TRIMMER', 'POWER_SPRAYER'], triggers: ['cordinha', 'corda', 'cordinha de puxar', 'corda de puxar', 'corda de partida', 'cordinha da partida', 'cordinha de arranque', 'corda de arranque', 'starter cord', 'rope'], technicalTerms: ['starter cord', 'corda de arranque', 'rope', 'starter rope'] },
  { key: 'starter-housing-counter', families: ['BRUSHCUTTER', 'CHAINSAW', 'BLOWER', 'POWER_CUTTER', 'EARTH_AUGER', 'TRIMMER', 'POWER_SPRAYER'], triggers: ['tampa da cordinha', 'tampa do arranque', 'tampa de partida', 'conjunto da cordinha', 'conjunto de partida'], technicalTerms: ['starter assy', 'starter assembly', 'recoil starter', 'starter complete', 'conjunto de partida', 'tampa de partida'], suppressKeys: ['cover', 'starter-rope', 'starter-cord'] },
  { key: 'air-purge-counter', families: ['BRUSHCUTTER', 'CHAINSAW', 'BLOWER', 'POWER_SPRAYER', 'TRIMMER', 'POLE_PRUNER', 'HEDGE_TRIMMER'], triggers: ['cebolinha', 'pera injetora', 'pêra injetora', 'pera de combustivel', 'chupeta', 'bulbo primer', 'primer', 'air purge'], technicalTerms: ['air purge', 'purge bulb', 'bomba de purga', 'primer bulb', 'primer', 'purge pump'] },
  { key: 'spark-plug-cap-counter', families: ['BRUSHCUTTER', 'CHAINSAW', 'BLOWER', 'POWER_SPRAYER', 'TRIMMER', 'POLE_PRUNER', 'HEDGE_TRIMMER', 'POWER_CUTTER', 'EARTH_AUGER'], triggers: ['caximbo', 'caximbo da vela', 'cachimbo da vela', 'terminal da vela', 'pito da vela', 'capa da vela'], technicalTerms: ['spark plug cap', 'plug cap', 'terminal da vela', 'capuz da vela', 'spark plug connector'] },
  { key: 'starter-handle', families: ['CHAINSAW', 'BRUSHCUTTER', 'BLOWER', 'POWER_CUTTER'], triggers: ['puxador', 'pegador', 'manopla da partida', 'starter handle'], technicalTerms: ['starter handle', 'handle', 'manipulo'] },
  { key: 'fuel-hose', families: ['CHAINSAW', 'BRUSHCUTTER', 'BLOWER', 'POWER_CUTTER', 'EARTH_AUGER'], triggers: ['macarrao', 'mangueirinha', 'mangueira de combustivel', 'fuel hose'], technicalTerms: ['fuel hose', 'mangueira do combustivel', 'hose', 'pipe', 'fuel pipe'] },
  { key: 'carburetor', families: ['CHAINSAW', 'BRUSHCUTTER', 'BLOWER', 'POWER_CUTTER'], triggers: ['carburador', 'carburadorzinho', 'bura', 'carburettor', 'carburetor'], technicalTerms: ['carburetor', 'carburettor', 'carburador'] },

  // Roçadeiras: componente funcional dentro do conjunto de embreagem.
  { key: 'clutch-shoe', families: ['BRUSHCUTTER', 'CHAINSAW', 'POLE_PRUNER'], triggers: ['sapata da embreagem', 'sapata de embreagem', 'clutch shoe'], technicalTerms: ['clutch shoe', 'shoe clutch', 'shoe'] },
  { key: 'trimmer-head', families: ['BRUSHCUTTER', 'TRIMMER'], triggers: ['carretel', 'cabeçote de fio', 'fio de nylon', 'trimmer head'], technicalTerms: ['trimmer head', 'cabecote de recorte', 'trimmer'] },

  // Motosserras e podadores: “lâmina” é linguagem de balcão para o sabre apenas nestas famílias.
  { key: 'guide-bar-shop', families: ['CHAINSAW', 'POLE_PRUNER'], triggers: ['lamina', 'sabre', 'barra guia', 'guide bar'], technicalTerms: ['lamina', 'lam', 'guide bar', 'bar', 'sabre', 'barra guia'], suppressKeys: ['blade'] },
  { key: 'brake-band', families: ['CHAINSAW'], triggers: ['cinta do freio', 'cinta de freio', 'faixa do freio', 'faixa de freio', 'cinta do travao', 'brake band'], technicalTerms: ['brake band', 'band brake', 'cinta de freio', 'faixa de travao', 'band'], suppressKeys: ['chain-brake'] },
  { key: 'bar-adjuster', families: ['CHAINSAW', 'POLE_PRUNER'], triggers: ['ajustador do sabre', 'regulador do sabre', 'bar adjuster', 'esticador'], technicalTerms: ['bar adjuster', 'chain adjuster', 'chain tensioner', 'esticador de corrente'] },
  { key: 'rim-sprocket', families: ['CHAINSAW'], triggers: ['rim', 'anel flutuante'], technicalTerms: ['rim', 'rim sprocket'] },
  { key: 'spur-sprocket', families: ['CHAINSAW'], triggers: ['spur', 'pinhao fixo'], technicalTerms: ['spur', 'spur sprocket'] },
  { key: 'bumper-spike', families: ['CHAINSAW'], triggers: ['unha', 'garra', 'garrinha', 'encosto', 'bumper spike'], technicalTerms: ['bumper spike', 'encosto', 'garra', 'spike'] },

  // Cortadores de grama: descarga, tração e ajuste são conjuntos distintos.
  { key: 'rear-baffle', families: ['WALK_MOWER'], triggers: ['defletor traseiro', 'chapa traseira', 'rear baffle'], technicalTerms: ['rear baffle', 'baffle rear', 'defletor rear'] },
  { key: 'mulcher-door', families: ['WALK_MOWER'], triggers: ['porta mulch', 'porta do mulch', 'porta de mulch', 'mulcher door'], technicalTerms: ['mulcher door', 'mulch door'], suppressKeys: ['mulch-plug'] },
  { key: 'wheel-pawl', families: ['WALK_MOWER'], triggers: ['catraca da roda', 'trava da roda', 'pawl da roda', 'drive pawl'], technicalTerms: ['pawl', 'drive pawl', 'pawl drive'], suppressKeys: ['wheel'] },
  { key: 'mower-transmission', families: ['WALK_MOWER'], triggers: ['cambio da tracao', 'cambio de tracao', 'caixa de tracao', 'transmissao da tracao', 'transmissao'], technicalTerms: ['transmission', 'rear transmission', 'front transmission', 'gearcase assembly', 'gearbox'] },
  { key: 'height-adjustment', families: ['WALK_MOWER'], triggers: ['regulagem de altura', 'regulador de altura', 'ajuste de altura', 'height adjustment'], technicalTerms: ['height adjustment', 'height adjust', 'wheel adjuster'] },

  // Tratores/Rider/giro zero: “faixa” é correia nos catálogos enviados.
  { key: 'belt-faixa', families: ['GARDEN_TRACTOR', 'ZERO_TURN', 'RIDER'], triggers: ['faixa', 'faixa do deck', 'faixa da tracao'], technicalTerms: ['belt', 'drive belt', 'deck drive', 'ground drive', 'correia trapezoidal', 'v-belt'] },
  { key: 'pto-shop-switch', families: ['GARDEN_TRACTOR', 'ZERO_TURN', 'RIDER'], triggers: ['botao que liga as facas', 'botao das facas', 'chave das facas', 'interruptor das facas'], technicalTerms: ['pto switch', 'switch pto', 'blade engagement switch'], suppressKeys: ['blade', 'switch'] },
  { key: 'blade-electric-clutch', families: ['GARDEN_TRACTOR', 'ZERO_TURN', 'RIDER'], triggers: ['embreagem das facas', 'embreagem das laminas', 'embreagem do deck'], technicalTerms: ['electromagnetic clutch', 'electric clutch', 'pto clutch', 'clutch ogura'], suppressKeys: ['blade', 'clutch'] },

  // Giro zero: lado esquerdo/direito é parte da aplicação técnica.
  { key: 'zero-turn-hydro', families: ['ZERO_TURN'], triggers: ['transmissao', 'cambio', 'hidrostatica', 'hidrostatico', 'hydro', 'bomba hidrostatica'], technicalTerms: ['transmission', 'transmission complete', 'hydrostatic', 'hte', 'ezt', 'transaxle'] },
  { key: 'motion-control', families: ['ZERO_TURN'], triggers: ['alavanca de movimento', 'alavanca de direcao', 'controle de movimento', 'motion control'], technicalTerms: ['motion control', 'control lever', 'steering lever', 'control arm'] },
  { key: 'parking-brake-caliper', families: ['ZERO_TURN'], triggers: ['pinca do freio', 'pinca de freio', 'caliper do freio', 'caliper'], technicalTerms: ['caliper brake', 'brake caliper', 'caliper brake park'] },
  { key: 'parking-brake-rotor', families: ['ZERO_TURN'], triggers: ['disco do freio', 'rotor do freio', 'rotor brake'], technicalTerms: ['rotor brake', 'brake rotor'] },
  { key: 'caster-fork', families: ['ZERO_TURN'], triggers: ['garfo caster', 'garfo da roda dianteira', 'suporte da rodinha dianteira', 'caster fork'], technicalTerms: ['caster fork', 'fork caster', 'fork'] },

  // Rider: articulação do chassi é um conjunto próprio.
  { key: 'rider-articulation', families: ['RIDER'], triggers: ['articulacao central', 'articulacao do rider', 'pivo central', 'pendulum'], technicalTerms: ['pendulum', 'pivot', 'articulation'] },

  // Automower
  { key: 'automower-blade', families: ['AUTOMOWER'], triggers: ['laminazinha', 'faca do robo', 'facas de corte', 'automower blade'], technicalTerms: ['blade', 'endurance blade', 'lamina de corte'] },
  { key: 'automower-wheel-motor', families: ['AUTOMOWER'], triggers: ['motor da roda', 'motor de tracao', 'wheel motor'], technicalTerms: ['wheel motor', 'motor wheel', 'motor de roda'] },
  { key: 'automower-cutting-motor', families: ['AUTOMOWER'], triggers: ['motor de corte', 'motor do disco', 'cutting motor'], technicalTerms: ['cutting motor', 'motor cutting'] },

  // Sopradores: ventoinha e voluta/caracol são peças funcionalmente diferentes.
  { key: 'blower-volute', families: ['BLOWER'], triggers: ['caracol', 'voluta', 'carcaca da turbina', 'carcaca da ventoinha', 'scroll'], technicalTerms: ['volute', 'scroll', 'outer scroll', 'inner scroll', 'fan housing', 'blower housing'] },
  { key: 'blower-flex-tube', families: ['BLOWER'], triggers: ['mangueira sanfonada', 'tubo sanfonado', 'tubo flexivel', 'mangueira do soprador'], technicalTerms: ['flex tube', 'tube flex', 'flexible tube', 'hose', 'blower hose'] },
  { key: 'blower-backpack-strap', families: ['BLOWER'], triggers: ['alca do costal', 'cinta do costal', 'correia do costal', 'suspensorio do soprador'], technicalTerms: ['harness', 'strap', 'shoulder strap', 'backpack strap'], suppressKeys: ['drive-belt'] },

  // Aparador de cerca viva dedicado.
  { key: 'hedge-connecting-rod', families: ['HEDGE_TRIMMER'], triggers: ['biela da lamina', 'biela das laminas', 'biela do corte', 'connecting rod'], technicalTerms: ['connecting rod', 'rod cutter', 'biela'] },

  // Multifuncional: unidade motriz não deve ser confundida com o implemento.
  { key: 'power-unit', families: ['COMBI'], triggers: ['unidade motriz', 'unidade de motor', 'engine unit'], technicalTerms: ['engine unit', 'power unit', 'motor unit'] },

  // Pulverizador manual.
  { key: 'manual-sprayer-pump', families: ['MANUAL_SPRAYER'], triggers: ['bomba', 'bomba manual', 'pump kit'], technicalTerms: ['pump kit', 'pump'] },
  { key: 'sprayer-agitator', families: ['MANUAL_SPRAYER'], triggers: ['agitador', 'alavanca do agitador'], technicalTerms: ['agitator', 'control lever'] },
  { key: 'spray-lance', families: ['MANUAL_SPRAYER', 'POWER_SPRAYER'], triggers: ['lanca', 'lanca de pulverizacao', 'spray lance'], technicalTerms: ['spray lance', 'lance'] },
  { key: 'spray-nozzle', families: ['MANUAL_SPRAYER', 'POWER_SPRAYER'], triggers: ['bico do pulverizador', 'bocal do pulverizador', 'bico de pulverizacao'], technicalTerms: ['nozzle', 'bocal', 'conj do bocal'] },

  // Pulverizador motorizado: motor e bomba têm componentes homônimos.
  { key: 'pump-piston', families: ['POWER_SPRAYER'], triggers: ['pistao da bomba', 'pistao de bomba', 'pump piston'], technicalTerms: ['pump piston', 'pistao da bomba'] },
  { key: 'engine-piston-context', families: ['POWER_SPRAYER'], triggers: ['pistao do motor', 'pistao de motor'], technicalTerms: ['piston assy', 'conj do pistao', 'pistao'] },
  { key: 'sprayer-pump-gearbox', families: ['POWER_SPRAYER'], triggers: ['caixa da bomba', 'cambio da bomba', 'caixa de engrenagem da bomba', 'gearbox da bomba'], technicalTerms: ['gearbox assy pump', 'gearbox pump', 'gearbox body clutch side'] },
  { key: 'sprayer-pressure-hose', families: ['POWER_SPRAYER'], triggers: ['mangueira de pressao', 'tubo de pressao', 'tubo de alta pressao', 'high pressure pipe'], technicalTerms: ['pressure hose', 'high pressure pipe', 'pressure pipe'] },

  // Motocultivadores
  { key: 'tiller-tines', families: ['TILLER'], triggers: ['faca do tobata', 'enxada', 'rotativa', 'faca rotativa', 'tine'], technicalTerms: ['tine', 'faca rotativa', 'conjunto de enxadas', 'enxada rotativa'] },

  // Cortadoras de disco
  { key: 'power-cutter-drive-belt', families: ['POWER_CUTTER'], triggers: ['correia de tracao', 'correia do disco', 'drive belt'], technicalTerms: ['drive belt', 'correia trapezoidal', 'v-belt'] },
];

// Relações explícitas observadas nos catálogos de máquina enviados. Nunca inferimos
// um motor por semelhança de nome: a ponte só existe quando o IPL da máquina o cita.
export const ENGINE_APPLICATIONS: EngineApplication[] = [
  // Tratores de jardim
  { machineModel: 'TS148', engineModel: 'HV764', engineArticle: '598632101' },
  { machineModel: 'TS254G', engineModel: 'HV764', engineArticle: '598632103' },
  { machineModel: 'TS142', machinePnc: '96041043000', engineModel: 'HS608', engineArticle: '593230101' },
  { machineModel: 'TS142', machinePnc: '96041044000', engineModel: 'HS608', engineArticle: '598693901' },
  { machineModel: 'TS138', machinePnc: '96041042900', engineModel: 'HS452AE' },
  { machineModel: 'TS138', machinePnc: '96041045600', engineModel: 'HS608', engineArticle: '598693901' },

  // Cortadores Giro Zero (Zero Turn)
  // Z248F: equipado com motor Kawasaki FR691V (artigo Kawasaki / Husqvarna 548448013)
  { machineModel: 'Z248F', engineModel: 'FR691V', engineArticle: '548448013' },
  // Z254F: equipado com motor Kawasaki FR691V (artigo 548448013)
  { machineModel: 'Z254F', engineModel: 'FR691V', engineArticle: '548448013' },
  // Z242F: equipado com motor Kawasaki FR651V
  { machineModel: 'Z242F', engineModel: 'FR651V' },
  // Z354F: equipado com motor Kawasaki FR730V
  { machineModel: 'Z354F', engineModel: 'FR730V' },
  // Z448: equipado com motor Kawasaki FX691V
  { machineModel: 'Z448', engineModel: 'FX691V' },
  // Z454: equipado com motor Kawasaki FX730V
  { machineModel: 'Z454', engineModel: 'FX730V' },
  // Z460: equipado com motor Kawasaki FX730V (26HP KAW FX651V-730V)
  { machineModel: 'Z460', engineModel: 'FX730V' },
  // MZ54: motor varia por PNC (PNC 967696101-00 cita Kawasaki FR730V-FS00-S 24 HP; PNC 967696001 cita Kohler)
  { machineModel: 'MZ54', machinePnc: '96769610100', engineModel: 'FR730V' },
  { machineModel: 'MZ54', machinePnc: '967696101', engineModel: 'FR730V' },
  { machineModel: 'MZ54', machinePnc: '96769600100', engineModel: 'KT740' },
  { machineModel: 'MZ54', machinePnc: '967696001', engineModel: 'KT740' },
  // Z560X: motor varia por PNC (PNCs 96766970100/96766970300 citam FX921V artigo 548448033; PNC 96767880100 cita FX751V)
  { machineModel: 'Z560X', machinePnc: '96766970100', engineModel: 'FX921V', engineArticle: '548448033' },
  { machineModel: 'Z560X', machinePnc: '96766970300', engineModel: 'FX921V', engineArticle: '548448033' },
  { machineModel: 'Z560X', machinePnc: '96766970301', engineModel: 'FX921V', engineArticle: '548448033' },
  { machineModel: 'Z560X', machinePnc: '96767880100', engineModel: 'FX751V' },
  { machineModel: 'Z560X', machinePnc: '96767880101', engineModel: 'FX751V' },
  // V548 / V554 (Stand-on)
  { machineModel: 'V548', engineModel: 'FX730V' },
  { machineModel: 'V554', engineModel: 'FX850V' },
];

const ENGINE_INTERNAL_TERMS = [
  'virabrequim', 'cambota', 'crankshaft', 'pistao', 'pistão', 'piston', 'anel do pistao', 'anel de pistao',
  'cilindro', 'cylinder', 'cabecote', 'cabeçote', 'cylinder head', 'valvula', 'válvula',
  'balancim', 'rocker arm', 'push rod', 'vareta de valvula', 'arvore de cames', 'camshaft',
  'carburador', 'carburettor', 'bobina de ignicao', 'bobina', 'ignition coil', 'vela de ignicao', 'vela', 'spark plug',
  'starter motor', 'motor de partida', 'motor de arranque', 'arranque', 'motor partida', 'bomba de oleo', 'oil pump', 'governador', 'governor',
  'retificador', 'rectifier', 'vareta de oleo', 'dipstick', 'peneira de oleo', 'oil strainer',
  'filtro de oleo', 'filtro de óleo', 'oil filter',
  'filtro de ar', 'filtro do ar', 'air filter', 'pre filtro', 'pré-filtro', 'pre-filtro', 'elemento filtrante',
  'filtro de combustivel', 'filtro de combustível', 'bomba de combustivel', 'bomba de combustível', 'bomba de gasolina', 'fuel pump',
  'junta do cabecote', 'junta do cabeçote', 'head gasket', 'junta da tampa de valvula', 'junta do carter', 'junta do cárter',
  'tampa de valvula', 'tampa de válvula', 'valve cover',
  'biela', 'connecting rod', 'volante do motor', 'volante magnetico', 'flywheel',
  'carter', 'cárter', 'bloco do motor', 'carcaça do motor', 'crankcase', 'solenoide', 'solenoid',
  'termostato', 'thermostat', 'respiro', 'breather',
];

const DIRECTION_QUALIFIERS = new Set([
  'esquerda', 'esquerdo', 'left', 'lh', 'direita', 'direito', 'right', 'rh',
  'dianteira', 'dianteiro', 'frente', 'front', 'traseira', 'traseiro', 'tras', 'rear',
]);

function searchable(value?: string | null): string {
  return normalizeText(value || '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function words(value?: string | null): string[] {
  return searchable(value).split(/\s+/).filter(Boolean);
}

function containsPhrase(value: string, phrase: string): boolean {
  const haystack = ` ${searchable(value)} `;
  const needle = searchable(phrase);
  return Boolean(needle) && haystack.includes(` ${needle} `);
}

function containsAny(value: string, terms: string[]): boolean {
  return terms.some(term => containsPhrase(value, term));
}

function normalizedVariants(values: string[]): string[] {
  return [...new Set(values.flatMap(value => {
    const plain = normalizeText(value);
    const spaced = searchable(value);
    return plain === spaced ? [plain] : [plain, spaced];
  }).filter(Boolean))];
}

function knownModelFromText(value: string): ModelFamilyEntry | null {
  const text = searchable(value);
  const identifier = normalizeIdentifier(value);

  const sortedFamilies = [...MODEL_FAMILIES].sort(
    (a, b) => normalizeIdentifier(b.model).length - normalizeIdentifier(a.model).length
  );

  for (const entry of sortedFamilies) {
    if (/^\d+$/.test(entry.model)) {
      if (new RegExp(`(^|\\s)${entry.model}(?=\\s|$)`, 'i').test(text)) return entry;
    } else {
      if (identifier.includes(normalizeIdentifier(entry.model))) return entry;
    }
  }

  return null;
}

export function extractKnownHusqvarnaModel(value: string): string {
  return knownModelFromText(value)?.model || '';
}

export function inferEquipmentFamily(question: string, modelHint = ''): EquipmentFamily | null {
  const explicit = MODEL_FAMILY.get(normalizeIdentifier(modelHint)) || knownModelFromText(modelHint) || knownModelFromText(question);
  if (explicit) return explicit.family;

  const text = searchable(question);
  if (containsPhrase(text, 'giro zero') || containsPhrase(text, 'zero turn')) return 'ZERO_TURN';
  if (containsPhrase(text, 'cortador frontal') || containsPhrase(text, 'rider')) return 'RIDER';
  if (containsPhrase(text, 'motosserra')) return 'CHAINSAW';
  if (containsPhrase(text, 'rocadeira')) return 'BRUSHCUTTER';
  if (containsPhrase(text, 'soprador')) return 'BLOWER';
  if (containsPhrase(text, 'cerca viva')) return 'HEDGE_TRIMMER';
  if (containsPhrase(text, 'podador de galhos') || containsPhrase(text, 'pole pruner')) return 'POLE_PRUNER';
  if (containsPhrase(text, 'multifuncional') || containsPhrase(text, 'combi')) return 'COMBI';
  if (containsPhrase(text, 'trator')) return 'GARDEN_TRACTOR';
  if (containsPhrase(text, 'cortador de grama')) return 'WALK_MOWER';
  return null;
}

function matchingRules(question: string, modelHint = ''): DomainRule[] {
  const family = inferEquipmentFamily(question, modelHint);
  if (!family) return [];
  const rawRules = DOMAIN_RULES.filter(rule => rule.families.includes(family) && containsAny(question, rule.triggers));
  const suppressed = new Set(rawRules.flatMap(rule => rule.suppressKeys || []));
  return rawRules.filter(rule => !suppressed.has(rule.key) && !suppressed.has(`domain:${rule.key}`));
}

export function hasDomainKnowledge(question: string, modelHint = ''): boolean {
  return matchingRules(question, modelHint).length > 0;
}

export function applyDomainSearchKnowledge<T extends DomainSearchGroup>(
  groups: T[],
  question: string,
  modelHint = '',
): DomainSearchGroup[] {
  const rules = matchingRules(question, modelHint);
  if (!rules.length) return groups;

  const suppressed = new Set(rules.flatMap(rule => rule.suppressKeys || []));
  const coveredLiteralWords = new Set(rules.flatMap(rule => rule.triggers.filter(term => containsPhrase(question, term)).flatMap(words)));
  const base = groups.filter(group => {
    if (suppressed.has(group.key)) return false;
    if (!group.key.startsWith('literal:')) return true;
    const literal = group.key.slice('literal:'.length);
    if (DIRECTION_QUALIFIERS.has(literal)) return false;
    return !coveredLiteralWords.has(literal);
  });

  const byKey = new Map<string, DomainSearchGroup>(base.map(group => [group.key, { key: group.key, variants: [...group.variants] }]));
  for (const rule of rules) {
    const key = `domain:${rule.key}`;
    const existing = byKey.get(key);
    const variants = normalizedVariants([...rule.technicalTerms, ...rule.triggers]);
    byKey.set(key, {
      key,
      variants: [...new Set([...(existing?.variants || []), ...variants])],
    });
  }

  return [...byKey.values()].slice(0, 10);
}

export function domainSemanticHint(question: string, modelHint = ''): string {
  const family = inferEquipmentFamily(question, modelHint);
  const rules = matchingRules(question, modelHint);
  if (!family && !rules.length) return '';

  const systems = family ? FAMILY_SYSTEMS[family].slice(0, 10).join(', ') : '';
  const interpretations = rules.map(rule => `${rule.triggers.find(term => containsPhrase(question, term)) || rule.key} => ${rule.technicalTerms.slice(0, 5).join(', ')}`);
  return [
    family ? `Família mecânica: ${family}. Sistemas típicos: ${systems}.` : '',
    interpretations.length ? `Conhecimento de balcão: ${interpretations.join(' | ')}` : '',
  ].filter(Boolean).join('\n');
}

function textHasQualifier(text: string, variants: string[]): boolean {
  return variants.some(variant => containsPhrase(text, variant));
}

function requestedSide(question: string): 'LH' | 'RH' | null {
  if (containsAny(question, ['esquerda', 'esquerdo', 'left', 'lh'])) return 'LH';
  if (containsAny(question, ['direita', 'direito', 'right', 'rh'])) return 'RH';
  return null;
}

function requestedEnd(question: string): 'FRONT' | 'REAR' | null {
  if (containsAny(question, ['dianteira', 'dianteiro', 'frente', 'front'])) return 'FRONT';
  if (containsAny(question, ['traseira', 'traseiro', 'tras', 'rear'])) return 'REAR';
  return null;
}

export function domainCandidateBonus(
  question: string,
  candidate: { name: string; section?: string | null; aliases?: string[]; notes?: string | null },
  modelHint = '',
): number {
  const candidateText = [candidate.name, candidate.section || '', ...(candidate.aliases || []), candidate.notes || ''].join(' ');
  let bonus = 0;

  for (const rule of matchingRules(question, modelHint)) {
    if (containsAny(candidateText, rule.technicalTerms)) bonus += 0.08;
  }

  const side = requestedSide(question);
  if (side === 'LH') {
    if (textHasQualifier(candidateText, ['lh', 'left', 'esquerda', 'esquerdo'])) bonus += 0.24;
    if (textHasQualifier(candidateText, ['rh', 'right', 'direita', 'direito'])) bonus -= 0.3;
  } else if (side === 'RH') {
    if (textHasQualifier(candidateText, ['rh', 'right', 'direita', 'direito'])) bonus += 0.24;
    if (textHasQualifier(candidateText, ['lh', 'left', 'esquerda', 'esquerdo'])) bonus -= 0.3;
  }

  const end = requestedEnd(question);
  if (end === 'FRONT') {
    if (textHasQualifier(candidateText, ['front', 'dianteira', 'dianteiro'])) bonus += 0.2;
    if (textHasQualifier(candidateText, ['rear', 'traseira', 'traseiro'])) bonus -= 0.24;
  } else if (end === 'REAR') {
    if (textHasQualifier(candidateText, ['rear', 'traseira', 'traseiro'])) bonus += 0.2;
    if (textHasQualifier(candidateText, ['front', 'dianteira', 'dianteiro'])) bonus -= 0.24;
  }

  if (containsPhrase(question, 'rim')) {
    if (containsPhrase(candidateText, 'rim')) bonus += 0.2;
    if (containsPhrase(candidateText, 'spur')) bonus -= 0.3;
  }
  if (containsPhrase(question, 'spur')) {
    if (containsPhrase(candidateText, 'spur')) bonus += 0.2;
    if (containsPhrase(candidateText, 'rim')) bonus -= 0.3;
  }

  if (containsPhrase(question, 'awd') && containsPhrase(candidateText, 'awd')) bonus += 0.12;

  const teeth = searchable(question).match(/\b(\d{1,2})\s*(?:t|dentes?)\b/);
  if (teeth) {
    const requested = teeth[1];
    if (new RegExp(`\\b${requested}t\\b`, 'i').test(searchable(candidateText))) bonus += 0.1;
  }
  if (/\b3\s*\/\s*8\b/.test(normalizeText(question)) && /3\s*\/\s*8/.test(normalizeText(candidateText))) bonus += 0.08;

  // No pulverizador motorizado, “pistão do motor” e “pistão da bomba” são conjuntos distintos.
  if (containsAny(question, ['pistao do motor', 'pistao de motor'])) {
    if (containsAny(candidateText, ['pump piston', 'pistao da bomba', 'bomba'])) bonus -= 0.35;
    if (containsAny(candidateText, ['cylinder', 'cilindro', 'crankshaft', 'virabrequim', 'piston assy'])) bonus += 0.15;
  }

  return Math.max(-0.5, Math.min(0.5, bonus));
}

/**
 * Aliases de busca inferidos pela família. Não são nomes oficiais e nunca alteram
 * Part Number, PNC ou aplicação. Podem ser usados no texto de recuperação/embedding.
 */
export function domainIndexAliases(
  name: string,
  section = '',
  model = '',
  aliases: string[] = [],
): string[] {
  const family = inferEquipmentFamily('', model);
  if (!family) return [];
  const technicalText = [name, section, ...aliases].join(' ');
  const values = new Set<string>();

  for (const rule of DOMAIN_RULES.filter(item => item.families.includes(family))) {
    if (!containsAny(technicalText, rule.technicalTerms)) continue;
    for (const value of [...rule.triggers, ...rule.technicalTerms]) values.add(normalizeText(value));
  }
  return [...values].filter(Boolean).slice(0, 60);
}

export function familySystems(family: EquipmentFamily): string[] {
  return [...FAMILY_SYSTEMS[family]];
}

export function isEngineInternalQuery(question: string): boolean {
  return containsAny(question, ENGINE_INTERNAL_TERMS);
}

export function resolveEngineCatalogRoute(
  model: string,
  pnc: string,
  question: string,
): EngineCatalogRoute | null {
  if (!model || !isEngineInternalQuery(question)) return null;
  const machineModel = normalizeIdentifier(model);
  const applications = ENGINE_APPLICATIONS.filter(item => normalizeIdentifier(item.machineModel) === machineModel);
  if (!applications.length) return null;

  const normalizedPnc = normalizeIdentifier(pnc);
  if (normalizedPnc) {
    const match = applications.find(item => !item.machinePnc || normalizeIdentifier(item.machinePnc) === normalizedPnc);
    if (!match) return null;
    return {
      status: 'ROUTE',
      machineModel: match.machineModel,
      engineModel: match.engineModel,
      engineArticle: match.engineArticle || null,
    };
  }

  const unconditional = applications.filter(item => !item.machinePnc);
  if (unconditional.length === 1) {
    const match = unconditional[0];
    return {
      status: 'ROUTE',
      machineModel: match.machineModel,
      engineModel: match.engineModel,
      engineArticle: match.engineArticle || null,
    };
  }

  return {
    status: 'PNC_REQUIRED',
    machineModel: applications[0].machineModel,
    knownPncs: [...new Set(applications.map(item => item.machinePnc).filter((value): value is string => Boolean(value)))],
  };
}

export function findEngineApplications(machineModel: string, pnc?: string): EngineApplication[] {
  if (!machineModel) return [];
  const normMachine = normalizeIdentifier(machineModel);
  const apps = ENGINE_APPLICATIONS.filter(a => normalizeIdentifier(a.machineModel) === normMachine);
  if (!apps.length) return [];
  if (pnc) {
    const normPnc = normalizeIdentifier(pnc);
    const filtered = apps.filter(a => !a.machinePnc || normalizeIdentifier(a.machinePnc) === normPnc);
    if (filtered.length) return filtered;
  }
  return apps;
}

export function isMachineEngineInquiry(question: string): boolean {
  const norm = normalizeText(question);
  return (
    /\bqual\s+(?:e\s+o\s+|o\s+)?motor\b/.test(norm) ||
    /\bqual\s+motor\s+(?:vai|usa|equipa|tem)\b/.test(norm) ||
    /\bque\s+motor\s+(?:vai|usa|equipa|tem)\b/.test(norm) ||
    /\bqual\s+o\s+modelo\s+do\s+motor\b/.test(norm) ||
    /\bqual\s+o\s+motor\s+desse\b/.test(norm) ||
    /\bqual\s+o\s+motor\s+deste\b/.test(norm)
  ) && !/\b(?:partida|arranque|eletrico|elétrico|ventilador|tracao|tração|roda|lamina|lâmina|corte)\b/.test(norm);
}
