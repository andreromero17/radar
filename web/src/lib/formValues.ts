// Valores iniciais do formulário genérico
import { defaultValue, type EntityDef } from '@frame/shared';
import type { FormValue } from '../components/FieldInput';

export type Values = Record<string, FormValue>;

export const empty = (type: string): FormValue =>
  type === 'boolean' ? false : type === 'permissions' ? {} : type === 'multiselect' ? [] : '';

/**
 * Valores iniciais de um registro novo: padrões da entidade, sobrepostos pelos da URL
 * (/lancamentos/novo?tipo=Receita&conta_id=3) — atalhos e links já preenchidos.
 */
export const defaults = (ent: EntityDef, preset?: URLSearchParams): Values =>
  Object.fromEntries(
    ent.fields.map((f) => {
      const vindo = !f.readonly && !f.auto && preset?.has(f.name);
      if (!vindo) return [f.name, defaultValue(f) ?? empty(f.type)];
      if (f.type === 'boolean') return [f.name, ['1', 'true', 'sim'].includes(preset!.get(f.name)!.toLowerCase())];
      if (f.type === 'multiselect') return [f.name, preset!.getAll(f.name)];
      return [f.name, preset!.get(f.name)!];
    }),
  );
