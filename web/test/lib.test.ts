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
    expect(activeMenuPath('/usuarios')).toBe('/usuarios');
    expect(activeMenuPath('/usuarios/12')).toBe('/usuarios');
    expect(activeMenuPath('/perfis/novo')).toBe('/perfis');
  });
});

describe('formatação', () => {
  it('formata moeda e bytes', () => {
    expect(fmtMoney(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50');
    expect(fmtBytes(2048)).toBe('2 KB');
    expect(fmtBytes(2.5 * 1024 * 1024)).toBe('2,5 MB');
  });
});

describe('menu por permissão', () => {
  it('esconde itens sem permissão e grupos vazios', async () => {
    const { menu, visibleMenu } = await import('../src/config/menu');
    const { can } = await import('@frame/shared');
    const leitura = { admin: false, permissoes: { logs: ['ver'] as const } as never };
    const labels = (items: { label: string; children?: { label: string }[] }[]): string[] =>
      items.flatMap((m) => [m.label, ...labels(m.children ?? [])]);
    expect(labels(visibleMenu(menu, (r, a) => can(leitura, r, a)))).toEqual(['Dashboard', 'Administração', 'Logs']);
    expect(labels(visibleMenu(menu, () => false))).toEqual(['Dashboard']);
    expect(labels(visibleMenu(menu, () => true))).toContain('Perfis de acesso');
  });
});

describe('versão e dispositivo', () => {
  it('rótulo da versão', async () => {
    const { versionLabel } = await import('../src/lib/version');
    expect(versionLabel({ version: '1.2.3', commit: 'abc1234' })).toBe('v1.2.3 · abc1234');
  });
  it('descreve o navegador', async () => {
    const { describeUserAgent } = await import('../src/lib/userAgent');
    const mac =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
    const iphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    expect(describeUserAgent(mac)).toBe('Chrome no macOS');
    expect(describeUserAgent(iphone)).toBe('Safari no iPhone');
    expect(describeUserAgent(null)).toBe('Dispositivo desconhecido');
  });
});
