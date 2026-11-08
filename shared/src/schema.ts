// =============================================================================
// Validação gerada a partir das entidades. A MESMA função valida o formulário
// no navegador e a requisição na API, então as regras nunca divergem.
// =============================================================================
import { z } from 'zod';
import { editableFields } from './entities';
import type { EntityDef, FieldDef, FieldErrors } from './types';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
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
    default: {
      const s = z.string({ error: 'Texto inválido' });
      return f.maxLength ? s.max(f.maxLength, `Máximo de ${f.maxLength} caracteres`) : s;
    }
  }
}

/** Schema Zod de um campo, já normalizando a entrada (vazio → null, "1" → true...). */
export function fieldSchema(f: FieldDef): z.ZodType {
  if (f.type === 'boolean') return z.preprocess(toBool, z.boolean());
  const s = z.preprocess(emptyToNull, baseSchema(f).nullable());
  return f.required ? s.refine((v) => v !== null, { message: `${f.label} é obrigatório` }) : s;
}

/** Schema Zod do registro inteiro. Em `update`, todos os campos são opcionais. */
export function entitySchema(ent: EntityDef, mode: 'create' | 'update' = 'create') {
  const shape: Record<string, z.ZodType> = {};
  for (const f of editableFields(ent)) shape[f.name] = mode === 'update' ? fieldSchema(f).optional() : fieldSchema(f);
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
    for (const f of editableFields(ent)) if (src[f.name] === undefined && f.default !== undefined) src[f.name] = f.default;
  }
  const result = entitySchema(ent, mode).safeParse(src);
  if (!result.success) return { ok: false, errors: toFieldErrors(result.error) };
  const data = Object.fromEntries(Object.entries(result.data).filter(([, v]) => v !== undefined));
  return { ok: true, data };
}
