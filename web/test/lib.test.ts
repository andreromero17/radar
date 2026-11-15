import { describe, expect, it } from 'vitest';
import { contrastText, shade, applyTheme } from '../src/lib/theme';
import { activeMenuPath } from '../src/config/menu';
import { fmtBytes, fmtMoney } from '../src/lib/format';
import { listableFields, presetDoFiltro } from '../src/lib/listParams';
import type { EntityDef } from '@frame/shared';

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

describe('datas no fuso do Brasil (regressão)', () => {
  it('data sem hora não vira o dia anterior', async () => {
    const tz = process.env.TZ;
    process.env.TZ = 'America/Sao_Paulo';
    try {
      const { fmtDate } = await import('../src/lib/format');
      expect(fmtDate('2026-10-28')).toBe('28/10/2026');
      expect(fmtDate('2026-01-01')).toBe('01/01/2026');
      expect(fmtDate('2026-10-28 23:30:00', true)).toBe('28/10/2026, 23:30');
    } finally {
      process.env.TZ = tz;
    }
  });
});

describe('presetDoFiltro (novo a partir da lista filtrada)', () => {
  const ent = {
    name: 'movs',
    label: 'Movs',
    singular: 'Mov',
    periodField: 'data',
    fields: [
      { name: 'descricao', label: 'Descrição', type: 'text' },
      { name: 'data', label: 'Data', type: 'date' },
      { name: 'conta_id', label: 'Conta', type: 'relation', entity: 'contas' },
      { name: 'tipo', label: 'Tipo', type: 'select', options: ['A', 'B'] },
      { name: 'pago', label: 'Pago', type: 'boolean' },
      { name: 'codigo', label: 'Código', type: 'text', auto: 'code' },
      { name: 'saldo', label: 'Saldo', type: 'money', readonly: true },
    ],
  } as unknown as EntityDef;

  it('leva os filtros de um valor só', () => {
    const p = new URLSearchParams('conta_id=3&tipo=A&pago=1&page=2&sort=data&q=mercado&data__de=2026-11-01');
    expect(presetDoFiltro(ent, p)).toBe('conta_id=3&tipo=A&pago=1');
  });
  it('deixa de fora "A ou B", período, automáticos e somente leitura', () => {
    const p = new URLSearchParams('conta_id=3&conta_id=4&tipo=A,B&data=2026-11-01&codigo=X&saldo=10');
    expect(presetDoFiltro(ent, p)).toBe('');
  });
});

describe('listableFields (ordem das colunas)', () => {
  const base = {
    name: 'x',
    label: 'X',
    singular: 'X',
    fields: [
      { name: 'a', label: 'A', type: 'text' },
      { name: 'b', label: 'B', type: 'text' },
      { name: 'c', label: 'C', type: 'text' },
      { name: 'd', label: 'D', type: 'text' },
    ],
  };
  it('sem listOrder: a ordem dos campos', () => {
    expect(listableFields(base as unknown as EntityDef).map((f) => f.name)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('com listOrder: os citados primeiro, o resto depois', () => {
    const ent = { ...base, listOrder: ['c', 'a'] } as unknown as EntityDef;
    expect(listableFields(ent).map((f) => f.name)).toEqual(['c', 'a', 'b', 'd']);
  });
});
