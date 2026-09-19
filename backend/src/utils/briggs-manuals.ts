/**
 * Lista de peças da Briggs, resolvida pela API deles.
 *
 * **Isto substitui um link que funcionava mas não servia.** O botão antigo
 * abria a busca de manuais (`/support/manuals/results?search=<modelo>`), e a
 * validação registrada dizia "devolveu 16 resultados reais" — confundindo
 * *funcionar* com *servir*. Medido na página: os dois `PARTS MANUAL` que o
 * balcão quer aparecem em ÚLTIMO, depois de 14 linhas chamadas só
 * `MANUAL, ILLUSTRATED` / `MANUAL, OPERATOR'S`, sem modelo e sem número para
 * distinguir uma da outra. O atendente abria PDF errado até achar.
 *
 * Palavras do dono sobre o que ele precisa: *"Se eu escrevi o código
 * 12J902-0118-01, eu vou entrar em: PARTS MANUAL - 12J902-0118-01, Idioma:
 * English. E é aí que eu vejo a página. SEMPRE VOU DAR PRIORIDADE PRO INGLÊS,
 * mas se não tiver o inglês e outra língua eu tenho que abrir igual para ver o
 * código e ver o preço."*
 *
 * A lista daquela página é montada por JavaScript a partir de
 * `GET /_hcms/api/manual-search?partNumber=<modelo>` — um índice Azure Search,
 * JSON, **sem chave e sem login**. Então isto não é scraping nem custo novo: é
 * o mesmo padrão do GraphQL do Portal Husqvarna.
 *
 * ## Por que o idioma NÃO é deduzido
 *
 * O `CLAUDE.md` registrava dois exemplos como prova de que o link do IPL era
 * indeduzível:
 *
 *     103M02-0027-H1  ->  md=103M020027H1~ZH_IPLURL_LO.pdf   (chinês)
 *     12J902-0118-01  ->  md=12J902011801~_IPLURL_LO.pdf     (idioma vazio)
 *
 * Medindo 8 modelos, eles não se contradizem: o segmento é o código do idioma
 * (`ZH` chinês, `JA` japonês, **vazio** inglês), e o `103M02-0027-H1`
 * simplesmente **não tem IPL em inglês** — só chinês. A advertência estava
 * certa na conclusão prática e errada no motivo.
 *
 * Nada aqui deduz esse segmento de qualquer forma. `tc_RelativePath` vem da
 * resposta, e é ele que vira o link. Deduzir é o que produz link quebrado, e
 * link quebrado no balcão é pior que link nenhum.
 */

/** Visualizador de IPL da Briggs. O `md` é o `tc_RelativePath` da resposta. */
const IPL_VIEWER = 'https://www.thepowerportal.com/ipls/ipl.htm?md=';

export type BriggsManual = {
  /** `English`, `Chinese`, `Japanese`… como a Briggs rotula. */
  language: string;
  /** Rótulo em português para a tela do balcão. */
  languageLabel: string;
  /** Link direto para o PDF da lista de peças. */
  url: string;
};

export type BriggsManualsResult = {
  model: string;
  /** Listas de peças, **inglês primeiro**. */
  partsManuals: BriggsManual[];
  /** Verdadeiro quando existe versão em inglês. */
  hasEnglish: boolean;
};

/**
 * Rótulos em português só para os idiomas que este catálogo realmente produz.
 * Idioma desconhecido cai no próprio nome da Briggs em vez de virar "—": saber
 * que existe um PDF em turco é melhor que não saber que existe PDF.
 */
const LANGUAGE_LABELS: Record<string, string> = {
  English: 'inglês',
  Chinese: 'chinês',
  Japanese: 'japonês',
  Spanish: 'espanhol',
  French: 'francês',
  Portuguese: 'português',
  German: 'alemão',
  Italian: 'italiano',
  Turkish: 'turco',
  Arabic: 'árabe',
  Ukrainian: 'ucraniano',
  Serbian: 'sérvio',
  Slovakian: 'eslovaco',
};

export function briggsLanguageLabel(language: string): string {
  return LANGUAGE_LABELS[language] || language.toLocaleLowerCase('pt-BR');
}

/**
 * Monta o link do visualizador a partir do caminho que a API devolveu.
 *
 * O caminho chega **já percent-encoded** (`12J902011801%7E_IPLURL_LO.pdf`). O
 * `~` tem que chegar literal no `md`, e passar o valor encodado adiante
 * produziria `%257E` — conferido: o visualizador não acha o arquivo assim.
 */
export function briggsIplUrl(relativePath: string | null | undefined): string | null {
  const raw = String(relativePath ?? '').trim();
  if (!raw) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Caminho com `%` solto não é decodificável. Melhor não gerar link que
    // gerar um quebrado.
    return null;
  }

  // Só o que este índice publica como IPL. Qualquer outra coisa não é a lista
  // de peças, e mandar o atendente para lá é o defeito que isto conserta.
  if (!/^[A-Za-z0-9~_.-]+\.pdf$/.test(decoded)) return null;
  if (!/_IPLURL_/i.test(decoded)) return null;

  return `${IPL_VIEWER}${decoded}`;
}

type RawManual = {
  tc_DocType?: unknown;
  tc_LanguageCode?: unknown;
  tc_RelativePath?: unknown;
  tc_PartNumber?: unknown;
};

/**
 * Lê a resposta da API e devolve só as listas de peças, inglês primeiro.
 *
 * Separado do fetch de propósito: a forma da resposta é o que pode mudar do
 * lado da Briggs, e é o que os testes travam sem depender da rede.
 */
export function parseBriggsManuals(model: string, payload: unknown): BriggsManualsResult {
  const value = (payload as { value?: unknown })?.value;
  const rows: RawManual[] = Array.isArray(value) ? (value as RawManual[]) : [];

  const partsManuals: BriggsManual[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    // `Illustrated Parts List` é como o índice chama o que a tela mostra como
    // `PARTS MANUAL`. `Operator's Manual` é o outro tipo e não serve aqui: ele
    // não traz código de peça, que é o que o balcão precisa.
    if (!/illustrated parts list/i.test(String(row.tc_DocType ?? ''))) continue;

    const url = briggsIplUrl(typeof row.tc_RelativePath === 'string' ? row.tc_RelativePath : null);
    if (!url || seen.has(url)) continue;

    // `tc_LanguageCode` é um array — um PDF pode cobrir vários idiomas.
    const codes = Array.isArray(row.tc_LanguageCode)
      ? row.tc_LanguageCode.map(item => String(item)).filter(Boolean)
      : [];
    const language = codes.find(code => /english/i.test(code)) || codes[0] || 'Desconhecido';

    seen.add(url);
    partsManuals.push({ language, languageLabel: briggsLanguageLabel(language), url });
  }

  // Inglês primeiro, por ordem explícita do dono. Os outros mantêm a ordem que
  // a Briggs devolveu — não há critério melhor, e inventar um só embaralharia.
  partsManuals.sort((a, b) => Number(/english/i.test(b.language)) - Number(/english/i.test(a.language)));

  return {
    model,
    partsManuals,
    hasEnglish: partsManuals.some(item => /english/i.test(item.language)),
  };
}

/**
 * Verdadeiro só para URL do visualizador de IPL da Briggs.
 *
 * Existe porque o servidor **redireciona** para esse endereço, e redirecionar
 * para o que vier é open redirect. A URL aqui sempre nasce de `briggsIplUrl`
 * (que usa uma constante), mas a checagem fica no caminho de saída de propósito:
 * é o último ponto antes de o navegador do balcão seguir o link.
 */
export function isBriggsIplUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return String(url).startsWith(IPL_VIEWER);
}

/** Endpoint da busca de manuais. Sem chave: é o mesmo que a página usa. */
export function briggsManualSearchEndpoint(model: string): string {
  return `https://www.briggsandstratton.com/_hcms/api/manual-search?partNumber=${encodeURIComponent(model)}`;
}
