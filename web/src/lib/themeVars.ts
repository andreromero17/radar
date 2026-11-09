// Cores do tema para quem desenha em canvas (gráficos): lidas das variáveis CSS,
// para os gráficos acompanharem o tema e o modo escuro.
import { useEffect, useState } from 'react';

/** Valor atual de uma variável CSS do tema (ex.: cssVar('--positive')) */
export const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Paleta pronta para gráficos */
export const chartTheme = () => ({
  text: cssVar('--text-muted'),
  grid: cssVar('--border-soft'),
  positive: cssVar('--positive'),
  negative: cssVar('--negative'),
  brand: cssVar('--brand-1'),
  surface: cssVar('--surface'),
  font: cssVar('--font'),
});

/**
 * Muda quando o tema, a aparência ou as cores mudam — use como `key` do gráfico
 * (ou dependência) para redesenhar com as cores novas.
 */
export function useThemeVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => setV((x) => x + 1));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-tema', 'data-bs-theme', 'style'],
    });
    return () => obs.disconnect();
  }, []);
  return v;
}
