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
