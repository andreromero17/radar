// Aplica as configurações visuais (cores, título, favicon) no documento.
const toRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (rgb) => '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');

/** amount < 0 escurece, > 0 clareia (ex.: -0.15 = 15% mais escuro) */
export const shade = (hex, amount) =>
  toHex(toRgb(hex).map((c) => (amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));

/** Texto escuro ou claro, o que contrastar mais com a cor de fundo */
export const contrastText = (hex) => {
  const [r, g, b] = toRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#1f2937' : '#ffffff';
};

export function applyTheme(s) {
  if (!s) return;
  const root = document.documentElement.style;
  const p = /^#[0-9a-f]{6}$/i.test(s.cor_primaria) ? s.cor_primaria : '#4f6ef7';
  const sec = /^#[0-9a-f]{6}$/i.test(s.cor_secundaria) ? s.cor_secundaria : '#7b4fd6';
  root.setProperty('--brand-1', p);
  root.setProperty('--brand-2', sec);
  root.setProperty('--brand-1-rgb', toRgb(p).join(', '));
  root.setProperty('--brand-1-dark', shade(p, -0.15));
  root.setProperty('--brand-1-soft', shade(p, 0.88));
  root.setProperty('--brand-contrast', contrastText(shade(p, -0.05)));

  if (s.nome_sistema) document.title = s.nome_sistema;

  // Favicon: o logo, se houver; senão um quadrado com o gradiente do tema
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href =
    s.logo ||
    'data:image/svg+xml,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><defs><linearGradient id="g" x2="0" y2="1"><stop offset="0" stop-color="${p}"/><stop offset="1" stop-color="${sec}"/></linearGradient></defs><rect width="16" height="16" rx="4" fill="url(#g)"/></svg>`,
      );
}
