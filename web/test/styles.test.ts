import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Regressão: um token que aponta para ele mesmo (--x: var(--x)) é inválido e some no tema Vibrante claro
describe('tokens do CSS', () => {
  const css = readFileSync(resolve(__dirname, '../src/styles.css'), 'utf8');

  it('nenhum token se referencia', () => {
    const ruins = [...css.matchAll(/--([\w-]+):\s*var\(--([\w-]+)\)/g)].filter((m) => m[1] === m[2]).map((m) => m[0]);
    expect(ruins).toEqual([]);
  });

  it('o tema padrão (:root) define os tokens que os componentes usam', () => {
    const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
    for (const t of ['surface', 'surface-2', 'border', 'text', 'text-muted', 'positive', 'negative', 'warning'])
      expect(root).toMatch(new RegExp(`--${t}:\\s*[#a-z0-9(]`));
  });
});
