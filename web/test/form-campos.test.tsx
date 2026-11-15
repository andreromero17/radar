import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { registerFixtureEntities } from '../../shared/test/fixtures';
import CrudForm from '../src/pages/CrudForm';

// Frame 0.23.0: o sistema desenha um campo do formulário genérico (`campos`) e esconde campos conforme o que está
// preenchido (`ocultar`)
registerFixtureEntities();

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('../src/lib/api', () => ({
  api: { get: api.get, post: api.post, put: api.put, delete: vi.fn() },
  ApiError: class extends Error {},
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
  api.get.mockResolvedValue([]);
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

describe('CrudForm: campos próprios e campos ocultos', () => {
  it('desenha o campo do sistema, que pode preencher outros; esconde conforme os valores', async () => {
    render(
      <MemoryRouter initialEntries={['/clientes/novo']}>
        <Routes>
          <Route
            path="/clientes/novo"
            element={
              <CrudForm
                entity="clientes"
                campos={{
                  nome: ({ value, set }) => (
                    <button type="button" onClick={() => (set('nome', 'Ana'), set('ativo', false))}>
                      nome próprio: {String(value || '-')}
                    </button>
                  ),
                }}
                ocultar={(v) => (v.ativo ? [] : ['telefone'])}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    const botao = await screen.findByRole('button', { name: /nome próprio: -/ });
    expect(screen.getByLabelText(/Telefone/)).toBeTruthy();
    fireEvent.click(botao);
    expect(await screen.findByRole('button', { name: /nome próprio: Ana/ })).toBeTruthy();
    expect(screen.queryByLabelText(/Telefone/)).toBeNull();
  });
});
