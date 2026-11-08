import { describe, expect, it } from 'vitest';
import { contrastText, shade, applyTheme } from '../src/lib/theme';
import { activeMenuPath } from '../src/config/menu';
import { fmtBytes, fmtMoney } from '../src/lib/format';

describe('tema', () => {
  it('escurece e clareia cores', () => {
    expect(shade('#808080', -0.5)).toBe('#404040');
    expect(shade('#000000', 1)).toBe('#ffffff');
  });
  it('escolhe texto com contraste', () => {
    expect(contrastText('#ffffff')).toBe('#1f2937');
    expect(contrastText('#1f2937')).toBe('#ffffff');
  });
  it('aplica variáveis CSS e título', () => {
    applyTheme({ cor_primaria: '#10b981', cor_secundaria: '#0f766e', nome_sistema: 'Finanças' });
    expect(document.documentElement.style.getPropertyValue('--brand-1')).toBe('#10b981');
    expect(document.title).toBe('Finanças');
  });
});

describe('menu', () => {
  it('marca o item mais específico', () => {
    expect(activeMenuPath('/')).toBe('/');
    expect(activeMenuPath('/chamados')).toBe('/chamados');
    expect(activeMenuPath('/chamados/12')).toBe('/chamados');
    expect(activeMenuPath('/chamados/novo')).toBe('/chamados/novo');
    expect(activeMenuPath('/clientes/3')).toBe('/clientes');
  });
});

describe('formatação', () => {
  it('formata moeda e bytes', () => {
    expect(fmtMoney(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50');
    expect(fmtBytes(2048)).toBe('2.0 KB');
  });
});

describe('menu por permissão', () => {
  it('esconde itens sem permissão e grupos vazios', async () => {
    const { menu, visibleMenu } = await import('../src/config/menu');
    const { can } = await import('@frame/shared');
    const leitura = { admin: false, permissoes: { chamados: ['ver'] as const } as never };
    const labels = (items: { label: string; children?: { label: string }[] }[]): string[] =>
      items.flatMap((m) => [m.label, ...labels(m.children ?? [])]);
    expect(labels(visibleMenu(menu, (r, a) => can(leitura, r, a)))).toEqual(['Dashboard', 'Chamados']);
    expect(labels(visibleMenu(menu, () => true))).toContain('Perfis de acesso');
  });
});
