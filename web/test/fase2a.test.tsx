import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { EntityDef, FieldDef } from '@frame/shared';
import FieldInput from '../src/components/FieldInput';
import MoneyInput from '../src/components/MoneyInput';
import { renderCell, renderTotal } from '../src/components/list/cells';
import {
  activeFilters,
  asMonth,
  bulkEditableFields,
  filterableFields,
  listableFields,
  monthRange,
} from '../src/lib/listParams';

const ent: EntityDef = {
  label: 'Movimentos',
  singular: 'Movimento',
  icon: 'list',
  labelField: 'descricao',
  periodField: 'data',
  fields: [
    { name: 'descricao', label: 'Descrição', type: 'text', list: true },
    { name: 'data', label: 'Data', type: 'date', list: true },
    { name: 'tipo', label: 'Tipo', type: 'select', options: ['Receita', 'Despesa'] },
    { name: 'categoria_id', label: 'Categoria', type: 'relation', entity: 'cats', dependsOn: { field: 'tipo' } },
    { name: 'valor', label: 'Valor', type: 'money', signColors: true, total: 'sum' },
    { name: 'tags', label: 'Etiquetas', type: 'multiselect', options: ['A', 'B'] },
    { name: 'pago', label: 'Pago', type: 'boolean' },
    { name: 'obs', label: 'Obs', type: 'textarea' },
    { name: 'senha', label: 'Senha', type: 'password' },
  ],
};
const f = (n: string) => ent.fields.find((x) => x.name === n)! as FieldDef;

describe('listParams', () => {
  it('escolhe campos filtráveis, listáveis e editáveis em lote', () => {
    expect(filterableFields(ent).map((x) => x.name)).toEqual(['data', 'tipo', 'categoria_id', 'tags', 'pago']);
    expect(listableFields(ent).map((x) => x.name)).not.toContain('senha');
    expect(listableFields(ent).map((x) => x.name)).not.toContain('obs');
    // relação dependente fica de fora da edição em lote (precisa combinar com o pai)
    expect(bulkEditableFields(ent).map((x) => x.name)).toEqual(['data', 'tipo', 'tags', 'pago']);
  });

  it('descreve os filtros ativos, sem o período da entidade', () => {
    const p = new URLSearchParams(
      'tipo=Despesa&tipo=Receita&categoria_id=3&valor__de=10&pago=0&descricao__contem=luz&data__de=2026-11-01',
    );
    const txt = activeFilters(ent, p, { categoria_id: { '3': 'Mercado' } }).map((a) => a.text.replace(/\s/g, ' '));
    expect(txt).toEqual([
      'Descrição contém “luz”',
      'Tipo: Despesa ou Receita',
      'Categoria: Mercado',
      'Valor: de R$ 10,00',
      'Pago: Não',
    ]);
  });

  it('períodos mensais', () => {
    expect(monthRange(2026, 1)).toEqual({ de: '2026-02-01', ate: '2026-02-28' });
    expect(asMonth('2026-02-01', '2026-02-28')).toEqual({ year: 2026, month: 1 });
    expect(asMonth('2026-02-01', '2026-02-20')).toBeNull();
    expect(asMonth(null, '2026-02-28')).toBeNull();
  });
});

describe('células da listagem', () => {
  it('valor com cor pelo sinal e total', () => {
    const { container } = render(<div>{renderCell(f('valor'), { id: 1, valor: -12.5 })}</div>);
    expect(container.querySelector('.text-danger')?.textContent?.replace(/\s/g, ' ')).toBe('-R$ 12,50');
    render(<div data-testid="t">{renderTotal(f('valor'), 100)}</div>);
    expect(screen.getByTestId('t').textContent?.replace(/\s/g, ' ')).toContain('R$ 100,00');
  });

  it('multiselect vira etiquetas', () => {
    render(<div>{renderCell(f('tags'), { id: 1, tags: ['A', 'B'] })}</div>);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });
});

describe('campos novos do formulário', () => {
  it('MoneyInput digita como centavos e aceita negativo', () => {
    const onChange = vi.fn();
    render(<MoneyInput id="v" value={null} onChange={onChange} allowNegative />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '-12345' } });
    expect(onChange).toHaveBeenLastCalledWith(-123.45);
  });

  it('multiselect alterna opções', () => {
    const onChange = vi.fn();
    render(<FieldInput field={f('tags')} value={['A']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith('tags', ['A', 'B']);
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    expect(onChange).toHaveBeenCalledWith('tags', []);
  });

  it('documento e telefone recebem máscara', () => {
    const onChange = vi.fn();
    render(
      <>
        <FieldInput
          field={{ name: 'doc', label: 'CPF', type: 'document', docType: 'cpf' }}
          value=""
          onChange={onChange}
        />
        <FieldInput field={{ name: 'tel', label: 'Telefone', type: 'phone' }} value="" onChange={onChange} />
      </>,
    );
    fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '52998224725' } });
    expect(onChange).toHaveBeenCalledWith('doc', '529.982.247-25');
    fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '11987654321' } });
    expect(onChange).toHaveBeenCalledWith('tel', '(11) 98765-4321');
  });
});
