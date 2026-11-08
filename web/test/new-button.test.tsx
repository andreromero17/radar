import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { can, type Permissions } from '@frame/shared';
import { registerFixtureEntities } from '../../shared/test/fixtures';
import NewButton from '../src/components/NewButton';

registerFixtureEntities();

const mockAuth = vi.hoisted(() => ({ user: null as null | { admin: boolean; permissoes: Permissions } }));
vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ can: (r: string, a: 'criar') => can(mockAuth.user, r, a) }),
}));

const renderBtn = () =>
  render(
    <MemoryRouter>
      <NewButton collapsed={false} />
    </MemoryRouter>,
  );

describe('Botão + Novo', () => {
  it('lista só o que o usuário pode criar, aplicação antes do núcleo', () => {
    mockAuth.user = { admin: true, permissoes: {} };
    renderBtn();
    fireEvent.click(screen.getByRole('button', { name: /novo/i }));
    const itens = screen
      .getAllByRole('button')
      .map((b) => b.textContent?.trim())
      .filter(Boolean);
    expect(itens.slice(1)).toEqual(['Cliente', 'Chamado', 'Usuário', 'Perfil']);
  });

  it('com uma opção só vira link direto', () => {
    mockAuth.user = { admin: false, permissoes: { clientes: ['ver', 'criar'] } };
    renderBtn();
    expect(screen.getByRole('link', { name: /novo/i })).toHaveAttribute('href', '/clientes/novo');
  });

  it('sem permissão de criar nada, não aparece', () => {
    mockAuth.user = { admin: false, permissoes: { clientes: ['ver'] } };
    const { container } = renderBtn();
    expect(container).toBeEmptyDOMElement();
  });
});
