import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@frame/shared';
import MonthPicker from '../src/components/MonthPicker';
import { mesIso, nomeMes } from '../src/lib/meses';
import { applyFonte, faceFontePropria } from '../src/lib/fontes';
import { renderCell } from '../src/components/list/cells';

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
