// =============================================================================
// Validação gerada a partir das entidades. A MESMA função valida o formulário
// no navegador e a requisição na API, então as regras nunca divergem.
// =============================================================================
import { z } from 'zod';
import { editableFields } from './entities';
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

function baseSchema(f: FieldDef): z.ZodType {
  switch (f.type) {
    case 'email':
      return z.string().regex(EMAIL, 'E-mail inválido');
    case 'number':
    case 'money':
      return z.coerce.number({ error: 'Valor numérico inválido' });
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
  for (const f of editableFields(ent))
    shape[f.name] = mode === 'update' ? fieldSchema(f, mode).optional() : fieldSchema(f, mode);
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
      if (src[f.name] === undefined && f.default !== undefined) src[f.name] = f.default;
  }
  const result = entitySchema(ent, mode).safeParse(src);
  if (!result.success) return { ok: false, errors: toFieldErrors(result.error) };
  const data = Object.fromEntries(Object.entries(result.data).filter(([, v]) => v !== undefined));
  return { ok: true, data };
}
