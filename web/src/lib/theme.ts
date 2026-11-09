// Aplica as configurações visuais (cores, título, favicon) no documento.
import type { Aparencia, Settings } from '@frame/shared';

const HEX = /^#[0-9a-f]{6}$/i;

const toRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (rgb: number[]) => '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');

/** amount < 0 escurece, > 0 clareia (ex.: -0.15 = 15% mais escuro) */
export const shade = (hex: string, amount: number) =>
  toHex(toRgb(hex).map((c) => (amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));

/** Texto escuro ou claro, o que contrastar mais com a cor de fundo */
export const contrastText = (hex: string) => {
  const [r, g, b] = toRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#1f2937' : '#ffffff';
};

export function applyTheme(s: Partial<Settings> | null | undefined) {
  if (!s) return;
  const root = document.documentElement.style;
  const p = s.cor_primaria && HEX.test(s.cor_primaria) ? s.cor_primaria : '#4f6ef7';
  const sec = s.cor_secundaria && HEX.test(s.cor_secundaria) ? s.cor_secundaria : '#7b4fd6';
  root.setProperty('--brand-1', p);
  root.setProperty('--brand-2', sec);
  root.setProperty('--brand-1-rgb', toRgb(p).join(', '));
  root.setProperty('--brand-1-dark', shade(p, -0.15));
  root.setProperty('--brand-1-soft', shade(p, 0.88));
  root.setProperty('--brand-contrast', contrastText(shade(p, -0.05)));
  document.documentElement.dataset.tema = s.tema === 'minimalista' ? 'minimalista' : 'vibrante';

  if (s.nome_sistema) document.title = s.nome_sistema;

  // Favicon: o logo, se houver; senão um quadrado com o gradiente do tema
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
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

// ---------------------------------------------------------------- aparência
const APARENCIA_KEY = 'aparencia';
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');
let atual: Aparencia = 'sistema';

const sistemaEscuro = () => typeof window.matchMedia === 'function' && darkQuery().matches;
const resolve = (a: Aparencia) => (a === 'escuro' || (a === 'sistema' && sistemaEscuro()) ? 'dark' : 'light');

/**
 * Modo claro/escuro do usuário. Fica no <html> como data-bs-theme (liga também o
 * modo escuro do Bootstrap) e num cache local, para a tela de login já abrir certa.
 */
export function applyAparencia(a: Aparencia | undefined) {
  atual = a ?? 'sistema';
  document.documentElement.dataset.bsTheme = resolve(atual);
  try {
    localStorage.setItem(APARENCIA_KEY, atual);
  } catch {
    /* armazenamento indisponível */
  }
}

/** Aparência guardada neste navegador (antes do login) */
export function cachedAparencia(): Aparencia {
  try {
    const v = localStorage.getItem(APARENCIA_KEY);
    return v === 'claro' || v === 'escuro' ? v : 'sistema';
  } catch {
    return 'sistema';
  }
}

// "seguir o sistema": acompanha a troca do aparelho sem recarregar
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  darkQuery().addEventListener('change', () => {
    if (atual === 'sistema') applyAparencia('sistema');
  });
}
