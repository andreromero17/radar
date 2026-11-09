import { describe, expect, it } from 'vitest';
import { novoRotulo } from '../src/entities';

describe('rótulo de novo registro', () => {
  it('masculino por padrão, "Nova" com feminino', () => {
    expect(novoRotulo({ singular: 'Cliente' })).toBe('Novo cliente');
    expect(novoRotulo({ singular: 'Categoria', feminino: true })).toBe('Nova categoria');
  });
});
