import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { registerEntities, type EntityDef } from '@frame/shared';
import DetailTable from '../src/components/DetailTable';
import { fromApiRows, newDetailRow, toApiRows } from '../src/lib/details';
import { customPages, registerPage, registerScreens, screensOf } from '../src/lib/screens';

const itens: EntityDef = {
  label: 'Itens',
  singular: 'Item',
  icon: 'list',
  labelField: 'produto',
  detailOf: 'w_pedidos',
  fields: [
    { name: 'pedido_id', label: 'Pedido', type: 'relation', entity: 'w_pedidos', required: true },
    { name: 'produto', label: 'Produto', type: 'text', required: true },
    { name: 'qtd', label: 'Qtd.', type: 'number', required: true },
    { name: 'preco', label: 'Preço', type: 'number' },
    { name: 'valor', label: 'Valor', type: 'number', total: 'sum', compute: (v) => Number(v.qtd) * Number(v.preco) },
  ],
};
registerEntities({ w_itens: itens });
const detail = { entity: 'w_itens', field: 'pedido_id', label: 'Itens do pedido' };

describe('DetailTable', () => {
  it('mostra as colunas sem o campo do pai, calcula a linha e adiciona/remove', () => {
    const onChange = vi.fn();
    const rows = [{ ...newDetailRow(itens.fields), produto: 'A', qtd: 2, preco: 5, valor: 10 }];
    render(<DetailTable detail={detail} rows={rows} onChange={onChange} errors={{}} options={{}} />);
    expect(screen.queryByText('Pedido')).toBeNull();
    expect(screen.getByText('Itens do pedido')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Qtd.'), { target: { value: '3' } });
    expect(onChange.mock.calls[0][0][0]).toMatchObject({ qtd: 3, valor: 15 });

    fireEvent.click(screen.getByText('Adicionar linha'));
    expect(onChange.mock.calls[1][0]).toHaveLength(2);
    fireEvent.click(screen.getByLabelText('Remover linha 1'));
    expect(onChange.mock.calls[2][0]).toHaveLength(0);
  });

  it('mostra os erros por linha e campo', () => {
    const rows = [newDetailRow(itens.fields)];
    render(
      <DetailTable
        detail={detail}
        rows={rows}
        onChange={() => {}}
        errors={{ 'w_itens.0.produto': 'Produto é obrigatório', w_itens: 'Inclua ao menos 1 linha' }}
        options={{}}
      />,
    );
    expect(screen.getByText('Produto é obrigatório')).toBeInTheDocument();
    expect(screen.getByText('Inclua ao menos 1 linha')).toBeInTheDocument();
  });
});

describe('linhas e telas plugáveis', () => {
  it('converte linhas da API e de volta, sem chave interna nem nomes de relação', () => {
    const rows = fromApiRows([{ id: 4, produto: 'A', pedido_id__label: 'P1' }]);
    expect(rows[0]._key).toBe('r4');
    expect(toApiRows(rows)).toEqual([{ id: 4, produto: 'A' }]);
  });

  it('registra telas por entidade e páginas novas', () => {
    const Lista = () => null;
    registerScreens('w_pedidos', { list: Lista });
    expect(screensOf('w_pedidos').list).toBe(Lista);
    expect(screensOf('outra')).toEqual({});
    registerPage({ path: 'w/relatorio', component: Lista });
    expect(customPages().map((p) => p.path)).toContain('w/relatorio');
    expect(() => registerPage({ path: 'w/relatorio', component: Lista })).toThrow(/já registrada/);
  });
});

describe('valores iniciais do formulário', () => {
  it('padrões da entidade, sobrepostos pela URL', async () => {
    const { defaults } = await import('../src/lib/formValues');
    const ent: EntityDef = {
      label: 'L',
      singular: 'L',
      icon: 'x',
      labelField: 'a',
      fields: [
        { name: 'tipo', label: 'Tipo', type: 'select', options: ['A', 'B'], default: 'A' },
        { name: 'pago', label: 'Pago', type: 'boolean', default: true },
        { name: 'tags', label: 'Tags', type: 'multiselect', options: ['x', 'y'] },
        { name: 'codigo', label: 'Código', type: 'text', readonly: true },
      ],
    };
    expect(defaults(ent)).toEqual({ tipo: 'A', pago: true, tags: [], codigo: '' });
    expect(defaults(ent, new URLSearchParams('tipo=B&pago=0&tags=x&tags=y&codigo=hack'))).toEqual({
      tipo: 'B',
      pago: false,
      tags: ['x', 'y'],
      codigo: '',
    });
  });
});
