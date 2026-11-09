import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@frame/shared';
import MonthPicker from '../src/components/MonthPicker';
import { mesIso, nomeMes } from '../src/lib/meses';
import { applyFonte, faceFontePropria } from '../src/lib/fontes';
import { renderCell } from '../src/components/list/cells';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import PeriodNav from '../src/components/list/PeriodNav';
import { normalizarIntervalo, rotuloPeriodo } from '../src/lib/periodo';
import { lembrarLista, paginacao, urlLista } from '../src/lib/listParams';

describe('seletor de mês', () => {
  it('meses e nomes', () => {
    expect(mesIso(2025, -1)).toBe('2024-12');
    expect(mesIso(2025, 12)).toBe('2026-01');
    expect(nomeMes('2025-01')).toBe('Janeiro 2025');
  });

  it('setas mudam um mês; a grade pula para qualquer mês de outro ano', () => {
    const onChange = vi.fn();
    render(<MonthPicker value="2025-01" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Mês anterior'));
    expect(onChange).toHaveBeenLastCalledWith('2024-12');
    fireEvent.click(screen.getByLabelText('Próximo mês'));
    expect(onChange).toHaveBeenLastCalledWith('2025-02');
    fireEvent.click(screen.getByLabelText('Escolher mês'));
    expect(screen.getByText('2025')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jan' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByLabelText('Próximo ano'));
    fireEvent.click(screen.getByRole('button', { name: 'Mar' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-03');
  });

  it('sem mês, mostra o texto do período e os atalhos', () => {
    render(
      <MonthPicker
        value={null}
        placeholder="Todo o período"
        onChange={() => {}}
        extras={(ano) => <span>Ano {ano}</span>}
      />,
    );
    expect(screen.getByText('Todo o período')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Escolher mês'));
    expect(screen.getByText(`Ano ${new Date().getFullYear()}`)).toBeInTheDocument();
  });
});

describe('período personalizado', () => {
  it('rótulo e normalização das datas', () => {
    expect(rotuloPeriodo(null, null)).toBe('Todo o período');
    expect(rotuloPeriodo('2025-01-01', '2025-12-31')).toBe('Ano de 2025');
    expect(rotuloPeriodo('2025-01-10', '2025-03-15')).toBe('10/01/2025 a 15/03/2025');
    expect(rotuloPeriodo('2025-01-10', null)).toBe('A partir de 10/01/2025');
    expect(rotuloPeriodo(null, '2025-03-15')).toBe('Até 15/03/2025');
    expect(normalizarIntervalo('2025-03-15', '2025-01-10')).toEqual({ de: '2025-01-10', ate: '2025-03-15' });
    expect(normalizarIntervalo('', '2025-03-15')).toEqual({ de: null, ate: '2025-03-15' });
    expect(normalizarIntervalo('', '')).toBeNull();
  });

  it('De/Até vão para a URL e o botão mostra o intervalo; setas partem do mês do início', () => {
    let atual = new URLSearchParams();
    function Tela() {
      const [params, setParams] = useSearchParams();
      atual = params;
      return <PeriodNav field="data" params={params} setParams={setParams} />;
    }
    render(
      <MemoryRouter initialEntries={['/?data__de=2025-01-01&data__ate=2025-01-31&page=3']}>
        <Tela />
      </MemoryRouter>,
    );
    expect(screen.getByText('Janeiro 2025')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Escolher mês'));
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2025-03-15' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2025-01-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar período' }));
    expect(atual.get('data__de')).toBe('2025-01-10');
    expect(atual.get('data__ate')).toBe('2025-03-15');
    expect(atual.get('page')).toBeNull();
    expect(screen.getByText('10/01/2025 a 15/03/2025')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Próximo mês'));
    expect(atual.get('data__de')).toBe('2025-02-01');
    expect(atual.get('data__ate')).toBe('2025-02-28');
  });
});

describe('listagem: volta do formulário e paginação', () => {
  it('o formulário volta para a URL que a listagem guardou (mês, filtros, página)', () => {
    expect(urlLista('nada')).toBe('/nada');
    lembrarLista('lancamentos', 'data__de=2025-01-01&data__ate=2025-01-31&page=2');
    expect(urlLista('lancamentos')).toBe('/lancamentos?data__de=2025-01-01&data__ate=2025-01-31&page=2');
  });

  it('opções de registros por página da entidade, com padrão próprio', () => {
    expect(paginacao(undefined, null)).toEqual({ opcoes: [10, 25, 50, 100], pageSize: 10 });
    expect(paginacao(undefined, '50').pageSize).toBe(50);
    const ent = { pageSizes: [100, 150, 200], pageSize: 200 };
    expect(paginacao(ent, null)).toEqual({ opcoes: [100, 150, 200], pageSize: 200 });
    expect(paginacao(ent, '150').pageSize).toBe(150);
    expect(paginacao(ent, '10').pageSize).toBe(200);
  });
});

describe('fonte própria no navegador', () => {
  it('@font-face com a versão na URL; negrito separado quando enviado', () => {
    const css = faceFontePropria({ fonte_propria_arquivos: 'regular,negrito', fonte_propria_versao: '42' });
    expect(css).toContain("url('/api/settings/fonte/regular?v=42')");
    expect(css).toContain("url('/api/settings/fonte/negrito?v=42')");
    expect(faceFontePropria({ fonte_propria_arquivos: 'regular', fonte_propria_versao: '1' })).toContain(
      'font-weight:100 900',
    );
  });

  it('sem arquivo enviado, "própria" cai na fonte do tema', () => {
    applyFonte('propria', 'minimalista', { ...DEFAULT_SETTINGS, fonte_propria_arquivos: '' });
    expect(document.documentElement.dataset.fonte).toBe('inter');
    applyFonte('propria', 'vibrante', { fonte_propria_arquivos: 'regular', fonte_propria_versao: '7' });
    expect(document.documentElement.dataset.fonte).toBe('propria');
    expect(document.getElementById('fonte-propria')?.textContent).toContain('?v=7');
    expect(document.getElementById('fonte-sistema')).toBeNull();
  });
});

describe('campo imagem na listagem', () => {
  it('mostra a miniatura', () => {
    render(
      <div>
        {renderCell({ name: 'logo', label: 'Logo', type: 'image' }, { id: 1, logo: 'data:image/png;base64,AA' })}
      </div>,
    );
    expect(document.querySelector('img.cell-image')).toHaveAttribute('src', 'data:image/png;base64,AA');
  });
});
