// =============================================================================
// Validação gerada a partir das entidades. A MESMA função valida o formulário
// no navegador e a requisição na API, então as regras nunca divergem.
// =============================================================================
import { z } from 'zod';
import { defaultValue, editableFields, getEntity } from './entities';
import { isValidCNPJ, isValidCPF, isValidPhone, maskDocument, maskPhone, onlyDigits, parseMoney } from './masks';
import { ACTIONS, normalizePermissions, type Permissions } from './permissions';
import type { EntityDef, FieldDef, FieldErrors } from './types';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;

/** Política de senha (cadastro, troca e redefinição) */
export const passwordSchema = z
  .string({ error: 'Informe a senha' })
  .min(8, 'Mínimo de 8 caracteres')
  .max(128, 'Máximo de 128 caracteres')
  .regex(/[A-Za-z]/, 'Inclua ao menos uma letra')
  .regex(/\d/, 'Inclua ao menos um número');

/** Regras da senha, para exibir como checklist na interface */
export const PASSWORD_RULES: { label: string; test: (s: string) => boolean }[] = [
  { label: 'Mínimo de 8 caracteres', test: (s) => s.length >= 8 },
  { label: 'Ao menos uma letra', test: (s) => /[A-Za-z]/.test(s) },
  { label: 'Ao menos um número', test: (s) => /\d/.test(s) },
];

/** Aceita objeto ou JSON (como vem do banco) e normaliza */
export const permissionsSchema = z.preprocess(
  (v) => {
    if (v == null || v === '') return {};
    if (typeof v === 'string') {
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    }
    return v;
  },
  z
    .record(z.string(), z.array(z.enum(ACTIONS), { error: 'Ação inválida' }), { error: 'Permissões inválidas' })
    .transform((p) => normalizePermissions(p as Permissions)),
);
const EMAIL = /^\S+@\S+\.\S+$/;

/** '' / espaços / undefined viram null; strings são aparadas. */
const emptyToNull = (v: unknown) => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? null : t;
  }
  return v;
};

const toBool = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true';

const fmtLimit = (f: FieldDef, n: number) =>
  f.type === 'money'
    ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : f.type === 'percent'
      ? `${n.toLocaleString('pt-BR')}%`
      : n.toLocaleString('pt-BR');

/** Número com limites min/max; dinheiro aceita "1.234,56" e é arredondado a centavos */
function numberSchema(f: FieldDef): z.ZodType {
  let n = z.number({ error: 'Valor numérico inválido' }).refine(Number.isFinite, 'Valor numérico inválido');
  if (f.min !== undefined) n = n.refine((v) => v >= f.min!, `Mínimo: ${fmtLimit(f, f.min)}`);
  if (f.max !== undefined) n = n.refine((v) => v <= f.max!, `Máximo: ${fmtLimit(f, f.max)}`);
  const parse = (v: unknown) => {
    const x = f.type === 'money' || typeof v === 'string' ? parseMoney(v) : Number(v);
    return f.type === 'money' && Number.isFinite(x) ? Math.round(x * 100) / 100 : x;
  };
  return z.preprocess(parse, n);
}

function documentSchema(f: FieldDef): z.ZodType {
  const kind = f.docType ?? 'cpf_cnpj';
  const label = kind === 'cpf' ? 'CPF' : kind === 'cnpj' ? 'CNPJ' : 'CPF/CNPJ';
  return z
    .string()
    .refine((v) => {
      const d = onlyDigits(v);
      if (d.length === 11 && kind !== 'cnpj') return isValidCPF(d);
      if (d.length === 14 && kind !== 'cpf') return isValidCNPJ(d);
      return false;
    }, `${label} inválido`)
    .transform((v) => maskDocument(v, onlyDigits(v).length === 14 ? 'cnpj' : 'cpf'));
}

/** Aceita lista, JSON ou texto separado por vírgula; mantém a ordem das opções */
function multiselectSchema(f: FieldDef): z.ZodType {
  const options = (f.options ?? []) as [string, ...string[]];
  return z.preprocess(
    (v) => {
      if (v == null || v === '') return [];
      if (Array.isArray(v)) return v;
      const t = String(v).trim();
      if (t.startsWith('[')) {
        try {
          return JSON.parse(t);
        } catch {
          return t;
        }
      }
      return t.split(',').map((x) => x.trim());
    },
    z
      .array(z.enum(options, { error: 'Opção inválida' }), { error: 'Opções inválidas' })
      .transform((arr) => options.filter((o) => arr.includes(o))),
  );
}

function baseSchema(f: FieldDef): z.ZodType {
  switch (f.type) {
    case 'email':
      return z.string().regex(EMAIL, 'E-mail inválido');
    case 'number':
    case 'money':
    case 'percent':
      return numberSchema(f);
    case 'document':
      return documentSchema(f);
    case 'phone':
      return z
        .string()
        .refine(isValidPhone, 'Telefone inválido (use DDD + número)')
        .transform((v) => maskPhone(v));
    case 'color':
      return z
        .string()
        .regex(/^#[0-9a-f]{6}$/i, 'Use o formato #RRGGBB')
        .transform((v) => v.toLowerCase());
    case 'relation':
      return z.coerce.number({ error: 'Seleção inválida' }).int('Seleção inválida').positive('Seleção inválida');
    case 'select':
      return z.enum((f.options ?? []) as [string, ...string[]], { error: 'Opção inválida' });
    case 'date':
      return z.string().regex(DATE, 'Data inválida');
    case 'datetime':
      return z
        .string()
        .regex(DATETIME, 'Data/hora inválida')
        .transform((v) => (v.length === 16 ? `${v}:00` : v).replace('T', ' '));
    default: {
      const s = z.string({ error: 'Texto inválido' });
      return f.maxLength ? s.max(f.maxLength, `Máximo de ${f.maxLength} caracteres`) : s;
    }
  }
}

/** Schema Zod de um campo, já normalizando a entrada (vazio → null, "1" → true...). */
export function fieldSchema(f: FieldDef, mode: 'create' | 'update' = 'create'): z.ZodType {
  if (f.type === 'boolean') return z.preprocess(toBool, z.boolean());
  if (f.type === 'permissions') return permissionsSchema;
  if (f.type === 'multiselect') {
    const m = multiselectSchema(f);
    return f.required ? m.refine((v) => (v as string[]).length > 0, { message: `Escolha ao menos uma opção` }) : m;
  }
  if (f.type === 'password') {
    // vazio = "não informar" (na edição, mantém a senha atual)
    const clean = (v: unknown) => (v == null || v === '' ? undefined : v);
    // Atenção: não usar .optional() no caso obrigatório: o Zod pula campos opcionais ausentes
    return f.required && mode === 'create'
      ? z.preprocess(clean, z.string({ error: `${f.label} é obrigatória` }).pipe(passwordSchema))
      : z.preprocess(clean, passwordSchema.optional());
  }
  const s = z.preprocess(emptyToNull, baseSchema(f).nullable());
  return f.required ? s.refine((v) => v !== null, { message: `${f.label} é obrigatório` }) : s;
}

/** Schema Zod do registro inteiro. Em `update`, todos os campos são opcionais. */
export function entitySchema(ent: EntityDef, mode: 'create' | 'update' = 'create') {
  const shape: Record<string, z.ZodType> = {};
  for (const f of editableFields(ent)) {
    if (mode === 'update' && f.createOnly) continue; // ignorado na edição
    shape[f.name] = mode === 'update' ? fieldSchema(f, mode).optional() : fieldSchema(f, mode);
  }
  return z.object(shape);
}

/** Converte os erros do Zod em { campo: mensagem } (primeira mensagem de cada campo). */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_');
    out[key] ??= issue.message;
  }
  return out;
}

export type ValidationResult = { ok: true; data: Record<string, unknown> } | { ok: false; errors: FieldErrors };

/**
 * Valida um registro. Na criação, aplica os valores padrão dos campos ausentes.
 * Retorna os dados normalizados (prontos para gravar) ou os erros por campo.
 */
export function validateEntity(
  ent: EntityDef,
  input: Record<string, unknown>,
  mode: 'create' | 'update' = 'create',
): ValidationResult {
  const src: Record<string, unknown> = { ...input };
  if (mode === 'create') {
    for (const f of editableFields(ent))
      if (src[f.name] === undefined && f.default !== undefined) src[f.name] = defaultValue(f);
  }
  const result = entitySchema(ent, mode).safeParse(src);
  if (!result.success) return { ok: false, errors: toFieldErrors(result.error) };
  const data = Object.fromEntries(Object.entries(result.data).filter(([, v]) => v !== undefined));
  return { ok: true, data };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Valores dos campos calculados (`compute`) a partir dos demais valores do registro */
export function computeFields(ent: EntityDef, values: Record<string, unknown>): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const f of ent.fields) {
    if (!f.compute) continue;
    const v = f.compute({ ...values, ...out });
    out[f.name] = v == null || !Number.isFinite(v) ? null : f.type === 'money' ? round2(v) : v;
  }
  return out;
}

/** Somas das sub-tabelas que vão para o "pai" (`DetailDef.sum`) */
export function detailSums(ent: EntityDef, details: Record<string, Record<string, unknown>[]>) {
  const out: Record<string, number> = {};
  for (const d of ent.details ?? []) {
    const rows = details[d.entity];
    if (!rows) continue;
    for (const [to, from] of Object.entries(d.sum ?? {}))
      out[to] = round2(rows.reduce((acc, r) => acc + (Number(r[from]) || 0), 0));
  }
  return out;
}

/** Entidade das linhas sem o campo que aponta para o "pai" (preenchido pela API) */
export function detailEntity(d: { entity: string; field: string }): EntityDef | undefined {
  const child = getEntity(d.entity);
  return child && { ...child, fields: child.fields.filter((f) => f.name !== d.field) };
}

export type DetailsResult =
  { ok: true; data: Record<string, Record<string, unknown>[]> } | { ok: false; errors: FieldErrors };

/**
 * Valida as sub-tabelas enviadas junto com o registro ({ [entidade]: linhas[] }).
 * Erros vêm como "entidade.índice.campo" (ou "entidade" para o mínimo de linhas).
 * Sub-tabela ausente do input = não mexer nela.
 */
export function validateDetails(ent: EntityDef, input: Record<string, unknown>): DetailsResult {
  const data: Record<string, Record<string, unknown>[]> = {};
  const errors: FieldErrors = {};
  for (const d of ent.details ?? []) {
    if (!(d.entity in input)) continue;
    const child = detailEntity(d);
    const raw = input[d.entity];
    if (!child || !Array.isArray(raw)) {
      errors[d.entity] = 'Lista de linhas inválida';
      continue;
    }
    const titulo = d.label ?? child.label;
    if (d.min && raw.length < d.min) errors[d.entity] = `Inclua ao menos ${d.min} linha(s) em ${titulo}`;
    if (raw.length > 1000) errors[d.entity] = `No máximo 1000 linhas em ${titulo}`;
    data[d.entity] = raw.map((r, i) => {
      const row = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
      const v = validateEntity(child, row, 'create');
      if (!v.ok) {
        for (const [k, msg] of Object.entries(v.errors)) errors[`${d.entity}.${i}.${k}`] = msg;
        return {};
      }
      const id = Number(row.id);
      return { ...(id > 0 && { id }), ...v.data, ...computeFields(child, v.data) };
    });
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}
