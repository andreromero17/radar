// =============================================================================
// Acesso de suporte com consentimento (Fase 5C). O DONO libera o suporte por um prazo (24 h, 3 ou 7 dias), como
// leitor (padrão) ou editor; pode revogar quando quiser — quem estiver dentro sai na hora. Só ADMINISTRADORES da
// plataforma entram, e só enquanto houver liberação. Entrar, sair, liberar e revogar ficam no log do espaço (o dono
// vê); o que o suporte alterar aparece no log com "(suporte)" no nome. O suporte não vira membro.
// =============================================================================
import type { EspacoDoUsuario, LiberacaoSuporte } from '@frame/shared';
import { z } from 'zod';
import { toDbValue } from '../db/knex';
import { addLog, type Actor } from '../services/logs';
import { conflict, HttpError } from '../utils/http';
import { nowLocal } from '../utils/time';
import { abrirEspaco, comEspaco, espacosDoUsuario, plataformaDb } from '.';

export const PRAZOS_SUPORTE_HORAS = [24, 72, 168] as const;
export const liberacaoSchema = z.object({
  horas: z.union([z.literal(24), z.literal(72), z.literal(168)], { message: 'Prazo inválido' }),
  papel: z.enum(['leitor', 'editor'], { message: 'Papel inválido' }),
});

const p = () => plataformaDb();
const SUFIXO = ' (suporte)';
export const nomeDeSuporte = (nome: string) => (nome.endsWith(SUFIXO) ? nome : nome + SUFIXO);

async function logEspaco(espacoId: number, acao: string, detalhe: string, actor: Actor) {
  await comEspaco(espacoId, (db) => addLog(db, { entidade: 'suporte', acao, detalhe }, actor));
}

/** Liberação em vigor no espaço (não revogada e no prazo), ou null */
export async function liberacaoAtiva(espacoId: number): Promise<LiberacaoSuporte | null> {
  const l = await p()('acessos_suporte as a')
    .leftJoin('usuarios as u', 'u.id', 'a.liberado_por')
    .where('a.espaco_id', espacoId)
    .whereNull('a.revogado_em')
    .where('a.expira_em', '>', nowLocal())
    .orderBy('a.id', 'desc')
    .first('a.id', 'a.papel', 'u.nome as liberado_por', 'a.liberado_em', 'a.expira_em');
  return (l as LiberacaoSuporte | undefined) ?? null;
}

/** Encerra as sessões de suporte de um espaço (revogação, espaço desativado) */
async function derrubarSuporte(espacoId: number) {
  const ids = (await p()('acessos_suporte').where({ espaco_id: espacoId }).select('id')).map((r) => Number(r.id));
  if (ids.length) await p()('sessoes').whereIn('suporte_id', ids).update({ suporte_id: null, espaco_id: null });
}

export async function liberarSuporte(
  espacoId: number,
  dados: { horas: number; papel: 'leitor' | 'editor' },
  actor: Actor & { id: number },
) {
  const agora = nowLocal();
  // uma liberação por vez: a nova substitui a anterior
  await p()('acessos_suporte')
    .where({ espaco_id: espacoId })
    .whereNull('revogado_em')
    .update({ revogado_em: agora, revogado_por: actor.id });
  await p()('acessos_suporte').insert({
    espaco_id: espacoId,
    papel: dados.papel,
    liberado_por: actor.id,
    liberado_em: agora,
    expira_em: nowLocal(new Date(Date.now() + dados.horas * 3_600_000)),
  });
  const l = (await liberacaoAtiva(espacoId))!;
  // a sessão de suporte aberta passa a valer pela liberação nova
  await p()('sessoes')
    .whereIn('suporte_id', p()('acessos_suporte').where({ espaco_id: espacoId }).select('id'))
    .update({ suporte_id: l.id });
  await logEspaco(espacoId, 'suporte liberado', `como ${dados.papel}, até ${l.expira_em.slice(0, 16)}`, actor);
  return l;
}

export async function revogarSuporte(espacoId: number, actor: Actor & { id: number }) {
  const n = await p()('acessos_suporte')
    .where({ espaco_id: espacoId })
    .whereNull('revogado_em')
    .where('expira_em', '>', nowLocal())
    .update({ revogado_em: nowLocal(), revogado_por: actor.id });
  await derrubarSuporte(espacoId);
  if (n) await logEspaco(espacoId, 'suporte revogado', 'acesso do suporte encerrado pelo dono', actor);
}

/** O espaço de uma sessão de suporte, se ainda vale (liberação em vigor, espaço ativo, usuário administrador) */
export async function espacoDeSuporte(
  suporteId: number,
  user: { admin: boolean },
): Promise<(EspacoDoUsuario & { suporte: { ate: string } }) | null> {
  if (!user.admin) return null;
  const l = await p()('acessos_suporte as a')
    .join('espacos as e', 'e.id', 'a.espaco_id')
    .where('a.id', suporteId)
    .whereNull('a.revogado_em')
    .where('a.expira_em', '>', nowLocal())
    .whereIn('e.ativo', [1, true])
    .first('e.id', 'e.nome', 'e.tipo', 'a.papel', 'a.expira_em');
  if (!l) return null;
  return { id: l.id, nome: l.nome, tipo: l.tipo, papel: l.papel, suporte: { ate: l.expira_em } };
}

export async function entrarComoSuporte(
  user: { id: number; nome: string; admin: boolean },
  espacoId: number,
  sessionId: string,
  ip?: string,
) {
  if (!user.admin) throw new HttpError(403, 'Apenas administradores dão suporte.');
  if ((await espacosDoUsuario(user.id)).some((e) => e.id === espacoId))
    throw conflict('Você participa deste espaço: use o seletor de espaços.');
  const l = await liberacaoAtiva(espacoId);
  if (!l) throw new HttpError(403, 'O dono deste espaço não liberou o acesso do suporte (ou o prazo acabou).');
  await p()('sessoes').where({ id: sessionId }).update({ suporte_id: l.id, espaco_id: espacoId });
  // cópia leve no banco do espaço (nomes nos logs/registros); fica inativa: não é membro
  const db = await abrirEspaco(espacoId);
  const u = await p()('usuarios').where({ id: user.id }).first('id', 'nome', 'email', 'criado_em');
  if (!(await db('usuarios').where({ id: user.id }).first('id'))) {
    const perfil = await db('perfis').orderBy('id').first('id');
    await db('usuarios').insert({
      id: u.id,
      nome: nomeDeSuporte(u.nome),
      email: u.email,
      perfil_id: perfil?.id,
      senha: '!',
      ativo: toDbValue(db, false),
      trocar_senha: toDbValue(db, false),
      criado_em: u.criado_em ?? nowLocal(),
    });
  }
  const actor = { id: user.id, nome: nomeDeSuporte(user.nome), ip };
  await logEspaco(espacoId, 'suporte entrou', `como ${l.papel}`, actor);
  await addLog(
    p(),
    { entidade: 'suporte', registro_id: espacoId, acao: 'entrou no espaço', detalhe: `espaço ${espacoId}` },
    actor,
  );
  return l;
}

export async function sairDoSuporte(user: { id: number; nome: string }, sessionId: string, ip?: string) {
  const s = await p()('sessoes').where({ id: sessionId }).first('suporte_id', 'espaco_id');
  if (!s?.suporte_id) return;
  await p()('sessoes').where({ id: sessionId }).update({ suporte_id: null, espaco_id: null });
  if (s.espaco_id)
    await logEspaco(Number(s.espaco_id), 'suporte saiu', '', { id: user.id, nome: nomeDeSuporte(user.nome), ip });
}

export { derrubarSuporte };
