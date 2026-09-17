// Leitura do preço no Portal Parceiro Husqvarna (parceirohusqvarna.com).
//
// Este arquivo só sabe INTERPRETAR a resposta do endpoint de detalhe de
// produto — não faz login, não guarda sessão, não decide quando chamar. Essa
// separação é deliberada: a parte que fala com o portal fica pequena e fácil
// de auditar; toda a lógica de extrair o preço fica aqui, testável sem
// nenhuma credencial nem chamada de rede.
//
// GET https://parceirohusqvarna.com/Product/ProductDetail
//     ?ProductId=<código>&ProductBusinessUnit=<unidade>&_=<cache-buster>
//
// A resposta é um JSON { Status, Html, Message } — Html é um fragmento HTML
// (o conteúdo da telinha de preço) que contém um campo oculto com o preço em
// JSON, codificado em base64:
//   <input type="hidden" id="inputFullProduct" value="BASE64(...)" />
// Decodificar esse campo é mais confiável do que ler a tabela renderizada:
// o número já vem pronto (sem vírgula decimal pra interpretar) e não depende
// da ordem das colunas da tabela mudar num redesign do portal.
export interface ParceiroProductDetailResponse {
  Status: boolean;
  Html: string | null;
  Message: string | null;
}

/**
 * Extrai o preço de consumidor (ConsumerPrice) da resposta do Portal
 * Parceiro. Nunca lança exceção — qualquer formato inesperado (portal fora
 * do ar, layout mudou, sessão expirou) retorna `null` em vez de derrubar
 * quem chamou. Uma consulta de preço que falha silenciosamente é sempre
 * preferível a uma que quebra o atendimento no balcão.
 */
export function parseConsumerPriceFromProductDetail(
  response: ParceiroProductDetailResponse,
): number | null {
  if (!response.Status || typeof response.Html !== 'string') return null;

  // Busca a tag <input> inteira primeiro, depois o atributo value dentro
  // dela — assim não importa se "value" vem antes ou depois de "id" na tag.
  const inputTagMatch = response.Html.match(/<input[^>]*\bid="inputFullProduct"[^>]*>/);
  if (!inputTagMatch) return null;

  const valueMatch = inputTagMatch[0].match(/\bvalue="([^"]*)"/);
  if (!valueMatch) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(valueMatch[1], 'base64').toString('utf8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const price = (parsed as Record<string, unknown>).ConsumerPrice;
  return typeof price === 'number' && Number.isFinite(price) ? price : null;
}

/**
 * Monta a URL de consulta. `productBusinessUnit` normalmente vem junto do
 * código quando a peça aparece numa busca no próprio portal (endpoint
 * ProductsByIdOrDescription) — não é um valor fixo, então precisa ser obtido
 * antes de chamar esta função, não adivinhado.
 */
export function buildProductDetailUrl(productId: string, productBusinessUnit: string): string {
  const params = new URLSearchParams({
    ProductId: productId,
    ProductBusinessUnit: productBusinessUnit,
    _: String(Date.now()),
  });
  return `https://parceirohusqvarna.com/Product/ProductDetail?${params.toString()}`;
}
