import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { EntityDef } from '@frame/shared';
import FilterPanel from '../src/components/list/FilterPanel';
import { activeFilters } from '../src/lib/listParams';

// Frame 0.28.0: EntityDef.filtrosExtras — filtro que não é campo (para as linhas extras do sistema)
const ent: EntityDef = {
  label: 'Movimentos',
  singular: 'Movimento',
  icon: 'list',
  labelField: 'descricao',
  fields: [{ name: 'descricao', label: 'Descrição', type: 'text', required: true }],
  filtrosExtras: [
    {
      name: 'investimentos',
      label: 'Operações de investimento',
      padrao: 'Ocultar',
      opcoes: [{ value: '1', label: 'Mostrar' }],
      help: 'Compras, vendas e proventos',
    },
  ],
};

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

describe('filtros extras', () => {
  it('aparecem nos filtros ativos com o rótulo da opção', () => {
    expect(activeFilters(ent, new URLSearchParams('investimentos=1&q=x'))).toEqual([
      { keys: ['investimentos'], text: 'Operações de investimento: Mostrar' },
    ]);
    expect(activeFilters(ent, new URLSearchParams('investimentos=9'))).toEqual([]);
  });

  it('o painel mostra o padrão e aplica a opção na URL, mantendo a busca', () => {
    const onApply = vi.fn();
    render(
      <FilterPanel
        show
        onHide={() => {}}
        ent={ent}
        params={new URLSearchParams('q=mercado')}
        onApply={onApply}
        relOptions={{}}
      />,
    );
    const sel = screen.getByLabelText('Operações de investimento') as HTMLSelectElement;
    expect(sel.value).toBe('');
    expect(screen.getByRole('option', { name: 'Ocultar' })).toBeInTheDocument();
    fireEvent.change(sel, { target: { value: '1' } });
    fireEvent.click(screen.getByText('Aplicar'));
    expect(onApply.mock.calls[0][0].toString()).toBe('q=mercado&investimentos=1');
  });
});
