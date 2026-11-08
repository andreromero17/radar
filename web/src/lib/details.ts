// Linhas das sub-tabelas (master-detail) no formulário
import type { FieldDef, Row } from '@frame/shared';
import type { FormValue } from '../components/FieldInput';

export type DetailRow = Record<string, FormValue> & { id?: number; _key: string };

let seq = 0;
/** Chave estável para o React (linhas novas ainda não têm id) */
export const rowKey = () => `n${++seq}`;

const emptyValue = (f: FieldDef): FormValue =>
  f.default ?? (f.type === 'boolean' ? false : f.type === 'multiselect' ? [] : '');

export function newDetailRow(fields: FieldDef[]): DetailRow {
  return { _key: rowKey(), ...Object.fromEntries(fields.map((f) => [f.name, emptyValue(f)])) };
}

/** Linhas vindas da API → linhas do formulário */
export const fromApiRows = (rows: unknown): DetailRow[] =>
  Array.isArray(rows)
    ? (rows as Row[]).map((r) => ({ ...(r as Record<string, FormValue>), id: r.id, _key: `r${r.id}` }))
    : [];

/** Linhas do formulário → corpo da API (sem a chave interna nem os nomes das relações) */
export const toApiRows = (rows: DetailRow[]) =>
  rows.map(({ _key, ...r }) => {
    void _key;
    return Object.fromEntries(Object.entries(r).filter(([k]) => !k.endsWith('__label')));
  });
