// Redução de imagens no navegador antes de enviar (campo type 'image')
/** Lado máximo da imagem guardada: logos e ícones não precisam de mais que isso */
const MAX_LADO = 256;

/** Reduz (PNG/JPG/WebP) para no máximo 256 px e devolve data URL; SVG vai como está */
export async function reduzirImagem(file: File): Promise<string> {
  const original = await new Promise<string>((ok, err) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => err(new Error('Não foi possível ler o arquivo'));
    r.readAsDataURL(file);
  });
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return original;
  const img = await new Promise<HTMLImageElement>((ok, err) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => err(new Error('Arquivo de imagem inválido'));
    i.src = original;
  });
  const escala = Math.min(1, MAX_LADO / Math.max(img.width, img.height));
  if (escala === 1 && original.length < 150 * 1024) return original;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * escala));
  canvas.height = Math.max(1, Math.round(img.height * escala));
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  // PNG mantém transparência (logos); se ficar grande, WebP
  const png = canvas.toDataURL('image/png');
  return png.length < 150 * 1024 ? png : canvas.toDataURL('image/webp', 0.85);
}
