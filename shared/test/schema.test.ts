import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, entities, settingsSchema, validateEntity } from '../src';

const clientes = entities.clientes;
const chamados = entities.chamados;

describe('validateEntity', () => {
  it('exige campos obrigatórios e valida e-mail', () => {
    const r = validateEntity(clientes, { nome: '  ', email: 'x' });
    expect(r).toEqual({ ok: false, errors: { nome: 'Nome é obrigatório', email: 'E-mail inválido' } });
  });

  it('normaliza: apara textos, vazio vira null, "1" vira true, aplica padrões', () => {
    const r = validateEntity(clientes, { nome: '  Ana ', email: '', ativo: '1' });
    expect(r).toEqual({
      ok: true,
      data: { nome: 'Ana', email: null, telefone: null, documento: null, ativo: true, observacoes: null },
    });
  });

  it('converte relação e valida opções de select', () => {
    expect(validateEntity(chamados, { assunto: 'A', cliente_id: '3' })).toMatchObject({
      ok: true,
      data: { cliente_id: 3, status: 'Aberto', prioridade: 'Média' },
    });
    expect(validateEntity(chamados, { assunto: 'A', cliente_id: 'abc', status: 'X' })).toEqual({
      ok: false,
      errors: { cliente_id: 'Seleção inválida', status: 'Opção inválida' },
    });
  });

  it('ignora campos gerados/somente leitura e desconhecidos', () => {
    const r = validateEntity(chamados, { assunto: 'A', cliente_id: 1, protocolo: 'HACK', id: 99, xyz: 1 });
    expect(r.ok && Object.keys(r.data)).not.toContain('protocolo');
    expect(r.ok && Object.keys(r.data)).not.toContain('xyz');
  });

  it('update é parcial: só valida o que veio', () => {
    expect(validateEntity(clientes, { telefone: '123' }, 'update')).toEqual({ ok: true, data: { telefone: '123' } });
  });

  it('respeita maxLength', () => {
    const r = validateEntity(clientes, { nome: 'x'.repeat(121) });
    expect(r.ok ? null : r.errors.nome).toBe('Máximo de 120 caracteres');
  });
});

describe('settingsSchema', () => {
  it('aceita os padrões', () => {
    expect(settingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });
  it('rejeita cor fora do formato', () => {
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, cor_primaria: '#fff' }).success).toBe(false);
  });
});
