import { describe, expect, it } from 'vitest';
import { can, type AuthUser, type Papel } from '../src';
import { registerFixtureEntities } from './fixtures';

registerFixtureEntities();

const user = (papel: Papel | null, extra: Partial<AuthUser> = {}) =>
  ({
    admin: false,
    completo: false,
    permissoes: { clientes: ['ver', 'criar'] },
    espaco: papel ? { id: 1, nome: 'E', tipo: 'pessoal', papel } : undefined,
    ...extra,
  }) as AuthUser;

describe('can() com papel no espaço', () => {
  it('leitor só vê, mesmo administrador', () => {
    const u = user('leitor', { admin: true });
    expect(can(u, 'clientes', 'ver')).toBe(true);
    expect(can(u, 'clientes', 'criar')).toBe(false);
    expect(can(u, 'backup', 'ver')).toBe(false);
  });
  it('editor segue o perfil; perfil completo libera os dados', () => {
    expect(can(user('editor'), 'clientes', 'criar')).toBe(true);
    expect(can(user('editor'), 'clientes', 'excluir')).toBe(false);
    expect(can(user('editor', { completo: true }), 'clientes', 'excluir')).toBe(true);
    expect(can(user('editor', { completo: true }), 'configuracoes', 'editar')).toBe(false);
  });
  it('dono pode tudo no espaço, nada a mais na plataforma', () => {
    expect(can(user('dono'), 'backup', 'ver')).toBe(true);
    expect(can(user('dono'), 'membros', 'editar')).toBe(true);
    expect(can(user('dono'), 'usuarios', 'criar')).toBe(false);
    expect(can(user('dono'), 'perfis', 'editar')).toBe(false);
  });
  it('membros: todos veem, só o dono gerencia; fora de espaço, nada', () => {
    expect(can(user('leitor'), 'membros', 'ver')).toBe(true);
    expect(can(user('editor', { admin: true }), 'membros', 'editar')).toBe(false);
    expect(can(user(null, { admin: true }), 'membros', 'ver')).toBe(false);
  });
  it('fora de espaço vale só o perfil (como antes)', () => {
    expect(can(user(null), 'clientes', 'criar')).toBe(true);
    expect(can(user(null, { admin: true }), 'perfis', 'editar')).toBe(true);
  });
});

describe('can() na plataforma', () => {
  it('painel da plataforma só para administrador, com ou sem espaço', () => {
    expect(can(user('dono'), 'plataforma', 'ver')).toBe(false);
    expect(can(user(null, { admin: true }), 'plataforma', 'ver')).toBe(true);
    expect(can(user('leitor', { admin: true }), 'plataforma', 'ver')).toBe(true);
  });
});
