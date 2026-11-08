import type { Db } from '../db/knex';
import { deleteUserSessions } from '../auth/sessions';
import { badRequest, conflict, forbidden } from '../utils/http';
import type { EntityHooks } from './types';

const isAdminPerfil = async (db: Db, perfilId: unknown) =>
  !!(
    await db('perfis')
      .where({ id: Number(perfilId) })
      .first('admin')
  )?.admin;

/** Quantos administradores ativos existem (opcionalmente ignorando um usuário) */
export async function activeAdmins(db: Db, exceptUserId?: number): Promise<number> {
  const q = db('usuarios as u')
    .join('perfis as p', 'p.id', 'u.perfil_id')
    .whereIn('p.admin', [1, true])
    .whereIn('u.ativo', [1, true]);
  if (exceptUserId) q.whereNot('u.id', exceptUserId);
  const row = (await q.count({ n: '*' }).first()) as { n: number | string } | undefined;
  return Number(row?.n ?? 0);
}

const SEM_ADMIN = 'O sistema precisa de ao menos um administrador ativo.';

export const usuariosHooks: EntityHooks = {
  async beforeSave(data, { db, actor, mode, current }) {
    if (typeof data.email === 'string') data.email = data.email.trim().toLowerCase();

    if (data.email) {
      const dup = db('usuarios').where({ email: data.email });
      if (current) dup.whereNot({ id: current.id });
      if (await dup.first('id')) throw badRequest('Verifique os campos', { email: 'E-mail já cadastrado' });
    }
    if (data.perfil_id != null && !(await db('perfis').where({ id: data.perfil_id }).first('id'))) {
      throw badRequest('Verifique os campos', { perfil_id: 'Perfil inválido' });
    }

    // Só administradores atribuem o perfil de administrador ou mexem em outro administrador
    const novoPerfil = data.perfil_id ?? current?.perfil_id;
    const viraAdmin = await isAdminPerfil(db, novoPerfil);
    const eraAdmin = current ? await isAdminPerfil(db, current.perfil_id) : false;
    if (!actor.admin && (viraAdmin || eraAdmin)) {
      throw forbidden('Apenas administradores podem gerenciar usuários administradores.');
    }

    if (mode === 'update' && current) {
      if (current.id === actor.id && data.ativo === false) {
        throw badRequest('Verifique os campos', { ativo: 'Você não pode desativar o próprio usuário' });
      }
      const continuaAdminAtivo = viraAdmin && (data.ativo ?? !!current.ativo);
      if (eraAdmin && current.ativo && !continuaAdminAtivo && (await activeAdmins(db, current.id)) === 0) {
        throw conflict(SEM_ADMIN);
      }
    }
  },

  async afterSave(row, data, { db, actor, sessionId, mode }) {
    // Desativado ou com senha trocada: derruba as sessões abertas
    if (mode === 'update' && (data.ativo === false || 'senha' in data)) {
      await deleteUserSessions(db, row.id, row.id === actor.id ? sessionId : undefined);
    }
  },

  async beforeDelete(current, { db, actor }) {
    if (current.id === actor.id) throw conflict('Você não pode excluir o próprio usuário.');
    if (await isAdminPerfil(db, current.perfil_id)) {
      if (!actor.admin) throw forbidden('Apenas administradores podem gerenciar usuários administradores.');
      if (current.ativo && (await activeAdmins(db, current.id)) === 0) throw conflict(SEM_ADMIN);
    }
  },
};
