import { describe, expect, it } from 'vitest';
import {
  can,
  canImport,
  computeFields,
  detailSums,
  editableFields,
  mainEntities,
  registerEntities,
  resources,
  validateDetails,
  validateEntity,
  type EntityDef,
} from '../src';

const pedidos: EntityDef = {
  label: 'Pedidos',
  singular: 'Pedido',
  icon: 'cart',
  labelField: 'numero',
  details: [{ entity: 't_pedido_itens', field: 'pedido_id', min: 1, sum: { total: 'valor' } }],
  fields: [
    { name: 'numero', label: 'Número', type: 'text' },
    { name: 'total', label: 'Total', type: 'money' },
  ],
};
const itens: EntityDef = {
  label: 'Itens',
  singular: 'Item',
  icon: 'list',
  labelField: 'produto',
  detailOf: 't_pedidos',
  fields: [
    { name: 'pedido_id', label: 'Pedido', type: 'relation', entity: 't_pedidos', required: true },
    { name: 'produto', label: 'Produto', type: 'text', required: true },
    { name: 'qtd', label: 'Qtd.', type: 'number', required: true },
    { name: 'preco', label: 'Preço', type: 'money', required: true },
    { name: 'valor', label: 'Valor', type: 'money', compute: (v) => Number(v.qtd) * Number(v.preco) },
  ],
};
registerEntities({ t_pedidos: pedidos, t_pedido_itens: itens });

describe('master-detail', () => {
  it('campos calculados e somas não são editáveis', () => {
    expect(editableFields(pedidos).map((f) => f.name)).toEqual(['numero']);
    expect(editableFields(itens).map((f) => f.name)).toEqual(['pedido_id', 'produto', 'qtd', 'preco']);
  });

  it('calcula (arredondando moeda) e soma', () => {
    expect(computeFields(itens, { qtd: 3, preco: 0.1 })).toEqual({ valor: 0.3 });
    expect(computeFields(itens, { qtd: 'x', preco: 1 })).toEqual({ valor: null });
    expect(detailSums(pedidos, { t_pedido_itens: [{ valor: 0.1 }, { valor: 0.2 }] })).toEqual({ total: 0.3 });
    expect(detailSums(pedidos, {})).toEqual({});
  });

  it('valida as linhas sem exigir o campo do pai, com erros indexados', () => {
    const ok = validateDetails(pedidos, { t_pedido_itens: [{ id: 7, produto: 'A', qtd: '2', preco: '1,50' }] });
    expect(ok).toEqual({ ok: true, data: { t_pedido_itens: [{ id: 7, produto: 'A', qtd: 2, preco: 1.5, valor: 3 }] } });

    const erro = validateDetails(pedidos, { t_pedido_itens: [{ produto: 'A', qtd: 1, preco: 1 }, { qtd: 1 }] });
    expect(erro.ok).toBe(false);
    if (!erro.ok) {
      expect(Object.keys(erro.errors).sort()).toEqual(['t_pedido_itens.1.preco', 't_pedido_itens.1.produto']);
    }
    const vazio = validateDetails(pedidos, { t_pedido_itens: [] });
    expect(!vazio.ok && vazio.errors.t_pedido_itens).toMatch(/ao menos 1/);
    expect(validateDetails(pedidos, {})).toEqual({ ok: true, data: {} });
  });

  it('sub-tabela segue as permissões do pai e some das listas', () => {
    const user = { admin: false, permissoes: { t_pedidos: ['ver' as const, 'editar' as const] } };
    expect(can(user, 't_pedido_itens', 'ver')).toBe(true);
    expect(can(user, 't_pedido_itens', 'excluir')).toBe(true); // = editar o pedido
    expect(can({ admin: false, permissoes: { t_pedidos: ['ver'] } }, 't_pedido_itens', 'criar')).toBe(false);
    expect(resources().map((r) => r.key)).not.toContain('t_pedido_itens');
    expect(mainEntities().map(([k]) => k)).not.toContain('t_pedido_itens');
    expect(canImport('t_pedido_itens', itens)).toBe(false);
    expect(canImport('t_pedidos', pedidos)).toBe(true);
    expect(canImport('usuarios', { ...pedidos })).toBe(false);
  });
});

describe('campos ocultos e só na criação', () => {
  const ent: EntityDef = {
    label: 'L',
    singular: 'L',
    icon: 'x',
    labelField: 'nome',
    fields: [
      { name: 'nome', label: 'Nome', type: 'text', required: true },
      { name: 'grupo', label: 'Grupo', type: 'text', hidden: true },
      { name: 'parcelas', label: 'Parcelas', type: 'number', createOnly: true, default: 1 },
    ],
  };

  it('oculto não é editável pela API; só-na-criação é ignorado na edição', () => {
    expect(editableFields(ent).map((f) => f.name)).toEqual(['nome', 'parcelas']);
    expect(validateEntity(ent, { nome: 'A', grupo: 'x', parcelas: 3 }, 'create')).toEqual({
      ok: true,
      data: { nome: 'A', parcelas: 3 },
    });
    expect(validateEntity(ent, { nome: 'B', parcelas: 5 }, 'update')).toEqual({ ok: true, data: { nome: 'B' } });
  });
});
