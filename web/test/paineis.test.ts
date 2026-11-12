import { describe, expect, it } from 'vitest';
import { estaOculto, montarLink, ordenar, parteDe, type WidgetDef } from '../src/lib/paineis';

const w = (id: string, oculto?: boolean): WidgetDef => ({ id, titulo: id, tipo: 'card', oculto });

describe('painéis: preferências do usuário', () => {
  const lista = [w('a'), w('b'), w('c'), w('d', true)];

  it('sem preferência: ordem do código; oculto por padrão fica oculto', () => {
    expect(ordenar(lista, null).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(estaOculto(lista[3], null)).toBe(true);
    expect(estaOculto(lista[0], null)).toBe(false);
  });

  it('ordem escolhida; widgets novos (fora da preferência) vão para o fim na ordem do código', () => {
    const pref = { ocultos: ['b'], ordem: ['c', 'a'], mostrados: ['d'] };
    expect(ordenar(lista, pref).map((x) => x.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(estaOculto(lista[1], pref)).toBe(true);
    expect(estaOculto(lista[3], pref)).toBe(false);
  });

  it('link com período e parte da fonte', () => {
    expect(montarLink('/x?de={de}&ate={ate}', '2026-01-01', '2026-01-31')).toBe('/x?de=2026-01-01&ate=2026-01-31');
    expect(montarLink(null, 'a', 'b')).toBeNull();
    const partes = { tipo: 'partes' as const, partes: { t: { tipo: 'valores' as const, valores: { x: 1 } } } };
    expect(parteDe(partes, 't')).toEqual({ tipo: 'valores', valores: { x: 1 } });
    expect(parteDe(partes)).toBeUndefined();
  });
});
