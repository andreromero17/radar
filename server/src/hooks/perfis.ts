import { badRequest, conflict, forbidden } from '../utils/http';
import type { EntityHooks } from './types';

export const perfisHooks: EntityHooks = {
  async beforeSave(data, { db, actor, mode, current }) {
    // Também garantido por can() (ADMIN_ONLY), mas a regra mora aqui
    if (!actor.admin) throw forbidden('Apenas administradores podem alterar perfis.');

    if (typeof data.nome === 'string') {
      const dup = db('perfis').whereRaw('lower(nome) = ?', [data.nome.toLowerCase()]);
      if (current) dup.whereNot({ id: current.id });
      if (await dup.first('id')) throw badRequest('Verifique os campos', { nome: 'Já existe um perfil com esse nome' });
    }

    // Tirar o "acesso total" de um perfil não pode deixar o sistema sem administrador
    if (mode === 'update' && current?.admin && data.admin === false) {
      const outros = await db('usuarios as u')
        .join('perfis as p', 'p.id', 'u.perfil_id')
        .whereIn('p.admin', [1, true])
        .whereIn('u.ativo', [1, true])
        .whereNot('p.id', current.id)
        .count({ n: '*' })
        .first();
      if (Number(outros?.n ?? 0) === 0) throw conflict('O sistema precisa de ao menos um administrador ativo.');
    }
  },

  async beforeDelete(current, { db, actor }) {
    if (!actor.admin) throw forbidden('Apenas administradores podem alterar perfis.');
    const emUso = await db('usuarios').where({ perfil_id: current.id }).count({ n: '*' }).first();
    const n = Number(emUso?.n ?? 0);
    if (n) throw conflict(`Perfil em uso por ${n} usuário(s). Troque o perfil deles antes de excluir.`);
  },
};
