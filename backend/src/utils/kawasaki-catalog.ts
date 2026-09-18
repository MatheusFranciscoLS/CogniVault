/**
 * Link direto para a vista explodida da Kawasaki, no catálogo oficial dela.
 *
 * O catálogo é servido por ARI PartStream dentro da página da Kawasaki. O
 * caminho que o balcão faz à mão é: digitar o modelo na busca rápida, **clicar
 * na opção do autocompletar** e cair na grade de conjuntos.
 *
 * Percorri esse caminho no navegador e a URL resultante revelou a receita:
 *
 *     /parts-lookup?aribrand=kwe#/Kawasaki_Engine/<RÓTULO>/<GUID_DO_MODELO>
 *
 *     RÓTULO = "FX921V-ES06 4 Stroke Engine FX921V" com espaço -> underscore
 *     GUID   = 63e707fb-f388-4087-95ee-f0dbb8238447
 *
 * Testado: abrir essa URL carrega direto a vista do conjunto, com os códigos
 * (`11009-2056` GASKET,SCREW-CARBURETOR, `11061-7038` GASKET,CARBURETOR, …).
 * O mesmo GUID aparece em conjuntos diferentes do mesmo motor, então ele
 * identifica o **modelo**, não o conjunto.
 *
 * ## Por que um mapa, e não uma consulta
 *
 * A API do PartStream existe (`partstream.arinet.com`, rotas `/Search`,
 * `/Parts/GetAssembly`, `/Parts/GetDetails`) mas exige a **chave de aplicação
 * da Kawasaki**, publicada na página dela para uso dela. Usar credencial de
 * terceiro no nosso servidor pode ser revogado sem aviso e provavelmente
 * contraria os termos da ARI — o mesmo tipo de decisão que o dono já tomou ao
 * escolher NÃO automatizar o login do Portal Parceiro.
 *
 * O link direto não usa chave nenhuma: é a mesma URL que o navegador do balcão
 * abriria. O custo é manter o GUID dos motores que a loja atende, que é um
 * punhado — e o caminho sem GUID continua funcionando, só pede um clique a mais.
 */

const LOOKUP_BASE = 'https://kawasakienginesusa.com/parts-lookup?aribrand=kwe';

export interface KawasakiCatalogModel {
  /** Modelo como está na plaqueta: série + spec. */
  model: string;
  /** Rótulo exato que o autocompletar da Kawasaki devolve. */
  label: string;
  /** GUID do modelo dentro do PartStream. */
  guid: string;
}

/**
 * Modelos com GUID confirmado percorrendo o catálogo no navegador.
 *
 * **Só entra aqui o que foi verificado de ponta a ponta.** Um GUID errado abre
 * a vista de outro motor, e peça de outro motor é devolução no balcão — o
 * contrário do que este produto existe para fazer. Sem confirmação, o motor
 * cai no caminho sem GUID, que é um clique a mais e nunca está errado.
 */
const CONFIRMED_MODELS: KawasakiCatalogModel[] = [
  {
    model: 'FX921V-ES06',
    label: 'FX921V-ES06 4 Stroke Engine FX921V',
    guid: '63e707fb-f388-4087-95ee-f0dbb8238447',
  },
];

function normalize(value: string): string {
  return (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** O rótulo do autocompletar vira segmento de URL: espaço -> underscore. */
export function kawasakiLabelToUrlSegment(label: string): string {
  return label.trim().replace(/\s+/g, '_');
}

/**
 * Link para o catálogo da Kawasaki.
 *
 * Com o modelo confirmado, abre **direto** na vista explodida. Sem ele, abre a
 * busca do catálogo para o atendente colar o modelo — nunca um link que
 * aparenta funcionar e abre vazio.
 */
export function kawasakiCatalogUrl(modelInput?: string | null): { url: string; direct: boolean; model: string | null } {
  const wanted = normalize(modelInput || '');
  if (!wanted) return { url: LOOKUP_BASE, direct: false, model: null };

  const match = CONFIRMED_MODELS.find(item => normalize(item.model) === wanted);
  if (!match) return { url: LOOKUP_BASE, direct: false, model: null };

  const segment = kawasakiLabelToUrlSegment(match.label);
  return {
    url: `${LOOKUP_BASE}#/Kawasaki_Engine/${segment}/${match.guid}`,
    direct: true,
    model: match.model,
  };
}

/** Os modelos que já abrem direto, para a tela poder dizer isso ao atendente. */
export function kawasakiDirectModels(): string[] {
  return CONFIRMED_MODELS.map(item => item.model);
}
