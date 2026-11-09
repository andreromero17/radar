import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS, FONTES, type FieldDef } from '@frame/shared';
import { applyAparencia, applyTamanho, applyTheme, cachedAparencia, cachedTamanho } from '../src/lib/theme';
import { FONTES_DEF, fonteEfetiva } from '../src/lib/fontes';
import { canInline, renderCell } from '../src/components/list/cells';
import { menu, tabItems, visibleMenu } from '../src/config/menu';

describe('tema e aparência', () => {
  afterEach(() => {
    delete document.documentElement.dataset.tema;
    delete document.documentElement.dataset.bsTheme;
  });

  it('tema do sistema vai para o <html>', () => {
    applyTheme({ ...DEFAULT_SETTINGS, tema: 'minimalista' });
    expect(document.documentElement.dataset.tema).toBe('minimalista');
    applyTheme({ ...DEFAULT_SETTINGS, tema: 'vibrante' });
    expect(document.documentElement.dataset.tema).toBe('vibrante');
  });

  it('aparência do usuário liga o modo escuro e fica guardada para a tela de login', () => {
    applyAparencia('escuro');
    expect(document.documentElement.dataset.bsTheme).toBe('dark');
    expect(cachedAparencia()).toBe('escuro');
    applyAparencia('claro');
    expect(document.documentElement.dataset.bsTheme).toBe('light');
  });

  it('"sistema" segue o aparelho', () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: () => {} }) as never;
    applyAparencia('sistema');
    expect(document.documentElement.dataset.bsTheme).toBe('dark');
    window.matchMedia = original;
  });
});

describe('liga/desliga na listagem', () => {
  const pago: FieldDef = { name: 'pago', label: 'Pago', type: 'boolean', inlineEdit: (r) => !r.cartao };

  it('decide por registro', () => {
    expect(canInline(pago, { id: 1 })).toBe(true);
    expect(canInline(pago, { id: 2, cartao: 3 })).toBe(false);
    expect(canInline({ ...pago, inlineEdit: undefined }, { id: 1 })).toBe(false);
  });

  it('chama a troca sem abrir o registro e trava quando não pode', () => {
    const onToggle = vi.fn();
    const abrir = vi.fn();
    render(
      <table>
        <tbody>
          <tr onClick={abrir}>
            <td>{renderCell(pago, { id: 1, pago: false }, { onToggle })}</td>
            <td>{renderCell(pago, { id: 2, pago: true, cartao: 1 }, { onToggle })}</td>
          </tr>
        </tbody>
      </table>,
    );
    const [livre, travado] = screen.getAllByRole('switch');
    fireEvent.click(livre);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(abrir).not.toHaveBeenCalled();
    expect(travado).toBeDisabled();
    // sem permissão (sem handler): continua etiqueta Sim/Não
    render(<div>{renderCell(pago, { id: 3, pago: true })}</div>);
    expect(screen.getByText('Sim')).toBeInTheDocument();
  });
});

describe('abas no celular', () => {
  it('só itens com tab, visíveis ao usuário, no máximo 4', () => {
    const tudo = () => true;
    const abas = tabItems(visibleMenu(menu, tudo));
    expect(abas.length).toBeGreaterThan(0);
    expect(abas.length).toBeLessThanOrEqual(4);
    expect(abas[0].to).toBe('/');
    const nada = () => false;
    expect(tabItems(visibleMenu(menu, nada)).every((m) => !m.perm)).toBe(true);
  });
});

describe('fonte e tamanho do texto', () => {
  afterEach(() => {
    document.getElementById('fonte-sistema')?.remove();
    document.documentElement.style.removeProperty('--font');
    delete document.documentElement.dataset.texto;
  });

  it('"do tema" usa Nunito no Vibrante e Inter no Minimalista, baixando só ela', () => {
    applyTheme({ ...DEFAULT_SETTINGS, tema: 'vibrante', fonte: 'tema' });
    expect(document.documentElement.style.getPropertyValue('--font')).toMatch(/^'Nunito'/);
    expect((document.getElementById('fonte-sistema') as HTMLLinkElement).href).toMatch(/family=Nunito/);
    applyTheme({ ...DEFAULT_SETTINGS, tema: 'minimalista', fonte: 'tema' });
    expect(document.documentElement.style.getPropertyValue('--font')).toMatch(/^'Inter'/);
    expect(document.querySelectorAll('#fonte-sistema')).toHaveLength(1);
  });

  it('fonte escolhida vale para qualquer tema; a do aparelho não baixa nada', () => {
    applyTheme({ ...DEFAULT_SETTINGS, tema: 'minimalista', fonte: 'roboto' });
    expect(document.documentElement.dataset.fonte).toBe('roboto');
    expect((document.getElementById('fonte-sistema') as HTMLLinkElement).href).toMatch(/family=Roboto/);
    applyTheme({ ...DEFAULT_SETTINGS, fonte: 'sistema' });
    expect(document.getElementById('fonte-sistema')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--font')).toMatch(/system-ui/);
  });

  it('cada fonte do catálogo tem definição', () => {
    for (const f of FONTES) expect(FONTES_DEF[fonteEfetiva(f, 'vibrante')]).toBeTruthy();
  });

  it('tamanho do texto vai para o <html> e fica guardado', () => {
    applyTamanho('grande');
    expect(document.documentElement.dataset.texto).toBe('grande');
    expect(cachedTamanho()).toBe('grande');
    applyTamanho(undefined);
    expect(document.documentElement.dataset.texto).toBe('normal');
  });
});
