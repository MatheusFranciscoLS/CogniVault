/** Imagem pronta para o jsPDF: PNG em data URL, com o tamanho original para manter a proporção. */
export type PdfImage = { dataUrl: string; width: number; height: number };

let logoPromise: Promise<PdfImage | null> | null = null;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function measure(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('Logo ilegível.'));
    image.src = dataUrl;
  });
}

/**
 * Foto de um produto para o PDF: baixa a imagem, reduz para no máximo `maxWidth` px e grava em JPEG sobre fundo branco.
 * O PNG da Husqvarna passa de 2 MB e é transparente; assim o PDF cresce uns 50 KB e a foto não vira um quadrado preto.
 * Só aceita https. Devolve `null` se não carregar (rede, CDN fora): o orçamento sai sem a foto, nunca falha por ela.
 */
export async function loadProductImage(url: string, maxWidth = 640): Promise<PdfImage | null> {
  // https (CDN da Husqvarna) ou o caminho da própria API (foto da lista, com o cookie da sessão).
  if (!/^https:\/\//i.test(url) && !url.startsWith('/api/')) return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return null;
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxWidth / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.88), width, height };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Logo horizontal da Vardão (a mesma do login) para o cabeçalho do PDF. Carregada uma vez por sessão.
 * Devolve `null` se não carregar (offline, arquivo fora do ar): o PDF sai sem a imagem, com o nome da loja em
 * texto, em vez de falhar na frente do cliente.
 */
export function loadStoreLogo(): Promise<PdfImage | null> {
  logoPromise ??= (async () => {
    try {
      const response = await fetch('/brand/vardao-horizontal-azul.png');
      if (!response.ok) return null;
      const dataUrl = await readAsDataUrl(await response.blob());
      return { dataUrl, ...(await measure(dataUrl)) };
    } catch {
      return null;
    }
  })();
  // Falha não fica guardada: tenta de novo no próximo PDF.
  return logoPromise.then(image => {
    if (!image) logoPromise = null;
    return image;
  });
}
