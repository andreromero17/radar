import type { EntityDef, Row } from '@frame/shared';
import type { Db } from '../db/knex';
import { daysAgo, nowLocal } from '../utils/time';

/** Quem executou a ação */
export interface Actor {
  id: number | null;
  nome: string;
  ip?: string | null;
}

export const SYSTEM_ACTOR: Actor = { id: null, nome: 'Sistema' };

export type Changes = Record<string, { de?: unknown; para?: unknown }>;

export async function addLog(
  db: Db,
  entry: {
    entidade: string;
    registro_id?: number | null;
    acao: string;
    detalhe?: string | null;
    alteracoes?: Changes | null;
  },
  actor: Actor = SYSTEM_ACTOR,
) {
  const alteracoes = entry.alteracoes && Object.keys(entry.alteracoes).length ? entry.alteracoes : null;
  await db('logs').insert({
    entidade: entry.entidade,
    registro_id: entry.registro_id ?? null,
    acao: entry.acao,
    detalhe: entry.detalhe ?? '',
    usuario_id: actor.id,
    usuario: actor.nome,
    ip: actor.ip ?? null,
    alteracoes: alteracoes ? JSON.stringify(alteracoes) : null,
    criado_em: nowLocal(),
  });
}

/** Valor comparável/legível para o log */
function normalize(type: string, v: unknown): unknown {
  if (v === undefined || v === '') return null;
  if (type === 'boolean') return v == null ? null : !!v;
  if (type === 'permissions') return typeof v === 'string' ? JSON.parse(v) : v;
  if (['number', 'money', 'relation'].includes(type) && v != null) return Number(v);
  return v;
}

const SENHA = '••••••';

/**
 * Diferença campo a campo para o log.
 * create: só `para`; delete: só `de`; update: só os campos que mudaram.
 * Senhas nunca vão para o log, só a indicação de que mudaram.
 */
export function diffRecord(ent: EntityDef, before: Row | null, after: Record<string, unknown> | null): Changes {
  const out: Changes = {};
  for (const f of ent.fields) {
    if (f.deRelacao) continue; // vem da relação, não é deste registro
    const inBefore = before != null && f.name in before;
    const inAfter = after != null && f.name in after;
    if (!inBefore && !inAfter) continue;
    if (before && after && !inAfter) continue; // update parcial: campo não enviado
    if (f.type === 'password') {
      if (inAfter && after?.[f.name]) out[f.name] = before ? { de: SENHA, para: '(alterada)' } : { para: SENHA };
      continue;
    }
    if (f.type === 'image') {
      // a imagem inteira (base64) não vai para o log
      const tem = (v: unknown) => (v ? '(imagem)' : null);
      const [a, b] = [inBefore ? before?.[f.name] : undefined, inAfter ? after?.[f.name] : undefined];
      if (before && after) {
        if (a !== b) out[f.name] = { de: tem(a), para: b ? '(alterada)' : null };
      } else if (after) {
        if (b) out[f.name] = { para: '(imagem)' };
      } else if (a) out[f.name] = { de: '(imagem)' };
      continue;
    }
    const de = inBefore ? normalize(f.type, before?.[f.name]) : undefined;
    const para = inAfter ? normalize(f.type, after?.[f.name]) : undefined;
    if (before && after) {
      if (JSON.stringify(de) !== JSON.stringify(para)) out[f.name] = { de, para };
    } else if (after) {
      if (para != null && para !== false) out[f.name] = { para };
    } else if (de != null) {
      out[f.name] = { de };
    }
  }
  return out;
}

/** Remove logs mais antigos que `dias` (0 = mantém tudo). Retorna quantos removeu. */
export async function purgeLogs(db: Db, dias: number): Promise<number> {
  if (!dias) return 0;
  return db('logs').where('criado_em', '<', daysAgo(dias)).del();
}
