export function pdfPageUrl(url: string, page?: number | null): string {
  const cleanUrl = url.split('#')[0];
  const normalizedPage = Number(page);
  if (!Number.isInteger(normalizedPage) || normalizedPage <= 0) return cleanUrl;
  return `${cleanUrl}#page=${normalizedPage}&zoom=page-width`;
}
