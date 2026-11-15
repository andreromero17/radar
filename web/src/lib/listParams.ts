// Ajudantes da listagem: quais campos filtram, que filtros estão ativos, períodos.
import type { EntityDef, FieldDef } from '@frame/shared';
import { fmtDate, fmtMoney, fmtPercent } from './format';

/** Parâmetros da URL que não são filtros */
export const RESERVED = new Set(['q', 'page', 'pageSize', 'sort', 'dir', 'lixeira', 'periodo']);

const DEFAULT_FILTER_TYPES = new Set(['select', 'multiselect', 'boolean', 'relation', 'date', 'datetime']);
const HIDDEN = new Set(['password', 'permissions']);

/** Campos que aparecem no painel de filtros */
export const filterableFields = (ent: EntityDef) =>
  ent.fields.filter((f) => !HIDDEN.has(f.type) && !f.hidden && (f.filter ?? DEFAULT_FILTER_TYPES.has(f.type)));

/** Campos que podem virar coluna na listagem, na ordem de `listOrder` (os citados primeiro) e depois na dos campos */
export const listableFields = (ent: EntityDef) => {
  const campos = ent.fields.filter((f) => !HIDDEN.has(f.type) && !f.hidden && f.type !== 'textarea');
  const ordem = ent.listOrder ?? [];
  const pos = (n: string) => (ordem.includes(n) ? ordem.indexOf(n) : ordem.length);
  return campos
    .map((f, i) => ({ f, i }))
    .sort((a, b) => pos(a.f.name) - pos(b.f.name) || a.i - b.i)
    .map((x) => x.f);
};

const BULK_TYPES = new Set(['select', 'boolean', 'relation', 'multiselect', 'date']);

/** Campos que fazem sentido alterar em lote (categoria, status, situação...) */
export const bulkEditableFields = (ent: EntityDef) =>
  ent.fields.filter((f) => BULK_TYPES.has(f.type) && !f.readonly && !f.hidden && !f.createOnly && !f.dependsOn);

export const isRangeType = (f: FieldDef) => ['date', 'datetime', 'number', 'money', 'percent'].includes(f.type);

const fmtRangeValue = (f: FieldDef, v: string) =>
  f.type === 'money'
    ? fmtMoney(v)
    : f.type === 'percent'
      ? fmtPercent(v)
      : ['date', 'datetime'].includes(f.type)
        ? fmtDate(v)
        : v;

export interface ActiveFilter {
  /** parâmetros da URL que este filtro ocupa (para remover) */
  keys: string[];
  text: string;
}

/** Filtros ativos legíveis ("Status: Aberto", "Valor: de R$ 10,00") — exceto o período da entidade */
export function activeFilters(
  ent: EntityDef,
  params: URLSearchParams,
  labels: Record<string, Record<string, string>> = {},
) {
  const out: ActiveFilter[] = [];
  for (const f of ent.fields) {
    if (HIDDEN.has(f.type)) continue;
    const eq = params.getAll(f.name).filter(Boolean);
    if (eq.length) {
      const nomes = eq.map((v) =>
        f.type === 'boolean'
          ? v === '1' || v === 'true'
            ? 'Sim'
            : 'Não'
          : f.type === 'relation'
            ? (labels[f.name]?.[v] ?? `#${v}`)
            : v,
      );
      out.push({ keys: [f.name], text: `${f.label}: ${nomes.join(' ou ')}` });
    }
    if (isRangeType(f) && f.name !== ent.periodField) {
      const de = params.get(`${f.name}__de`);
      const ate = params.get(`${f.name}__ate`);
      if (de || ate) {
        const partes = [de && `de ${fmtRangeValue(f, de)}`, ate && `até ${fmtRangeValue(f, ate)}`].filter(Boolean);
        out.push({ keys: [`${f.name}__de`, `${f.name}__ate`], text: `${f.label}: ${partes.join(' ')}` });
      }
    }
    const contem = params.get(`${f.name}__contem`);
    if (contem) out.push({ keys: [`${f.name}__contem`], text: `${f.label} contém “${contem}”` });
  }
  return out;
}

// ---------------------------------------------------------------- volta para a listagem
// A listagem guarda a sua URL (período, filtros, página) para o formulário voltar para o mesmo lugar
const chaveLista = (entity: string) => `lista:${entity}`;
export function lembrarLista(entity: string, search: string) {
  try {
    sessionStorage.setItem(chaveLista(entity), search);
  } catch {
    /* sem storage: volta para a listagem padrão */
  }
}
export function urlLista(entity: string): string {
  let search = '';
  try {
    search = sessionStorage.getItem(chaveLista(entity)) ?? '';
  } catch {
    /* idem */
  }
  return `/${entity}${search && !search.startsWith('?') ? '?' : ''}${search}`;
}

// ---------------------------------------------------------------- paginação
export const PAGE_SIZES_PADRAO = [10, 25, 50, 100];
/** Opções e tamanho inicial de página da entidade */
export function paginacao(ent: { pageSizes?: number[]; pageSize?: number } | undefined, pedido: string | null) {
  const opcoes = ent?.pageSizes?.length ? ent.pageSizes : PAGE_SIZES_PADRAO;
  const padrao = ent?.pageSize && opcoes.includes(ent.pageSize) ? ent.pageSize : opcoes[0];
  const n = Number(pedido);
  return { opcoes, pageSize: opcoes.includes(n) ? n : padrao };
}

// ---------------------------------------------------------------- períodos
const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function monthRange(year: number, month: number) {
  const ini = new Date(year, month, 1);
  const fim = new Date(year, month + 1, 0);
  return { de: isoDate(ini), ate: isoDate(fim) };
}

/** Se o intervalo é um mês inteiro, devolve { ano, mês } */
export function asMonth(de: string | null, ate: string | null) {
  if (!de || !ate) return null;
  const [y, m, d] = de.split('-').map(Number);
  const r = monthRange(y, m - 1);
  return d === 1 && r.ate === ate ? { year: y, month: m - 1 } : null;
}

export const monthLabel = (year: number, month: number) => {
  const s = new Date(year, month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * "Novo" a partir de uma listagem filtrada: os filtros de UM valor viram o preenchimento do formulário
 * (ex.: lista da conta Itaú → novo lançamento já na conta Itaú). Filtro com vários valores ("A ou B"), faixas,
 * busca e o período ficam de fora; campos que o formulário não edita também.
 */
export function presetDoFiltro(ent: EntityDef, params: URLSearchParams): string {
  const out = new URLSearchParams();
  for (const f of ent.fields) {
    if (HIDDEN.has(f.type) || f.readonly || f.auto || f.compute || f.name === ent.periodField) continue;
    const vals = params.getAll(f.name).filter(Boolean);
    if (vals.length !== 1 || vals[0].includes(',')) continue;
    out.set(f.name, vals[0]);
  }
  return out.toString();
}
