import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { getEntity } from '@frame/shared';
import { registerFixtureEntities } from '../../shared/test/fixtures';
import CrudList from '../src/pages/CrudList';

// Frame 0.22.1: depois de ligar/desligar na linha, o que depende dela (linhas extras como saldos, cards do
// `before`) é recalculado; e o "Novo" de uma lista filtrada já vem com os filtros de um valor só.
registerFixtureEntities();

const api = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}));
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
  const ativo = getEntity('clientes')!.fields.find((f) => f.name === 'ativo')!;
  ativo.inlineEdit = true;
});

describe('lista: novo pré-preenchido e recarga depois de mudar uma linha', () => {
  it('o Novo leva o filtro de um valor só', async () => {
    api.get.mockResolvedValue({ rows: [], total: 0 });
    render(
      <MemoryRouter initialEntries={['/clientes?ativo=1&q=ana']}>
        <CrudList entity="clientes" />
      </MemoryRouter>,
    );
    const novo = await screen.findByRole('link', { name: /novo/i });
    expect(novo.getAttribute('href')).toBe('/clientes/novo?ativo=1');
  });

  it('ligar/desligar recarrega a lista e avisa quem depende dela', async () => {
    api.get.mockImplementation((url: string) =>
      Promise.resolve(url.startsWith('/clientes?') ? { rows: [{ id: 7, nome: 'Ana', ativo: false }], total: 1 } : []),
    );
    api.put.mockResolvedValue({ id: 7, nome: 'Ana', ativo: true });
    const onAlterado = vi.fn();
    render(
      <MemoryRouter initialEntries={['/clientes']}>
        <CrudList entity="clientes" onAlterado={onAlterado} />
      </MemoryRouter>,
    );
    const sw = await screen.findByRole('switch');
    const antes = api.get.mock.calls.filter(([u]) => String(u).startsWith('/clientes?')).length;
    fireEvent.click(sw);
    await waitFor(() => expect(onAlterado).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith('/clientes/7', { ativo: true });
    const depois = api.get.mock.calls.filter(([u]) => String(u).startsWith('/clientes?')).length;
    expect(depois).toBe(antes + 1);
  });
});
