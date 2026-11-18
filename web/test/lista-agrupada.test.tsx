import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { registerEntities } from '@frame/shared';
import CrudList from '../src/pages/CrudList';

// Frame 0.27.0: EntityDef.agrupar — listagem com um título por grupo, que abre e fecha (lembrado por usuário)
registerEntities({
  g_ativos: {
    label: 'Ativos',
    singular: 'Ativo',
    icon: 'collection',
    labelField: 'nome',
    agrupar: 'classe',
    fields: [
      { name: 'nome', label: 'Nome', type: 'text', required: true, list: true },
      { name: 'classe', label: 'Classe', type: 'select', options: ['Ações', 'FIIs', 'Stocks'], list: true },
    ],
  },
});

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('../src/lib/api', () => ({
  api: { get: api.get, put: api.put, post: vi.fn(), delete: vi.fn() },
  download: vi.fn(),
  errorMessage: (e: unknown) => String(e),
}));
vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ can: () => true, user: { id: 1, admin: true, permissoes: {} } }),
}));
const toast = vi.hoisted(() => ({ success: () => {}, error: () => {}, info: () => {}, warning: () => {} }));
vi.mock('../src/context/ToastContext', () => ({ useToast: () => toast }));
const settings = vi.hoisted(() => ({ settings: {} }));
vi.mock('../src/context/SettingsContext', () => ({ useSettings: () => settings }));

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

describe('lista agrupada', () => {
  it('grupos na ordem das opções, com a quantidade; fechar esconde as linhas e é lembrado', async () => {
    api.get.mockImplementation((url: string) =>
      Promise.resolve(
        url.startsWith('/g_ativos?')
          ? {
              rows: [
                { id: 1, nome: 'KO', classe: 'Stocks' },
                { id: 2, nome: 'PETR4', classe: 'Ações' },
                { id: 3, nome: 'VALE3', classe: 'Ações' },
                { id: 4, nome: 'Sem classe', classe: null },
              ],
              total: 4,
            }
          : url.startsWith('/preferencias/')
            ? { valor: null }
            : [],
      ),
    );
    api.put.mockResolvedValue({});
    render(
      <MemoryRouter initialEntries={['/g_ativos']}>
        <CrudList entity="g_ativos" />
      </MemoryRouter>,
    );
    const titulos = await screen.findAllByRole('button', { name: /^(Recolher|Expandir)/ });
    expect(titulos.map((b) => b.textContent)).toEqual(['Ações', 'Stocks', 'Sem classe']);
    const acoes = titulos[0].closest('tr')!;
    expect(within(acoes).getByText('· 2')).toBeInTheDocument();
    expect(screen.getByText('VALE3')).toBeInTheDocument();

    fireEvent.click(acoes);
    await waitFor(() => expect(screen.queryByText('VALE3')).toBeNull());
    expect(screen.queryByText('PETR4')).toBeNull();
    expect(screen.getByText('KO')).toBeInTheDocument();
    expect(acoes.getAttribute('aria-expanded')).toBe('false');
    expect(api.put).toHaveBeenCalledWith('/preferencias/lista.g_ativos.recolhidos', { valor: ['Ações'] });
  });
});
