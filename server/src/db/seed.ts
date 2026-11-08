import { seedApp } from '../app/seed';
import { hashPassword } from '../auth/password';
import { nowLocal } from '../utils/time';
import { count, toDbValue, type Db } from './knex';

/** Acessos de exemplo criados pelo seed (somente desenvolvimento!) */
export const SEED_LOGINS = [{ email: 'admin@sistema.com', senha: 'admin123', perfil: 'Administrador' }] as const;

/**
 * Popula o banco com dados de exemplo: administrador de teste (núcleo) e os
 * dados da aplicação (server/src/app/seed.ts). Não faz nada se já houver usuários.
 */
export async function seed(db: Db): Promise<boolean> {
  if ((await count(db('usuarios'))) > 0) return false;
  const admin = await db('perfis').whereIn('admin', [1, true]).orderBy('id').first('id');
  const agora = nowLocal();
  await db('usuarios').insert({
    nome: 'Usuário Administrador',
    email: SEED_LOGINS[0].email,
    perfil_id: admin.id,
    senha: await hashPassword(SEED_LOGINS[0].senha),
    ativo: toDbValue(db, true),
    trocar_senha: toDbValue(db, false),
    criado_em: agora,
  });
  await seedApp(db);
  await db('logs').insert({
    entidade: 'sistema',
    acao: 'seed',
    detalhe: 'Banco populado com dados de exemplo',
    usuario: 'Sistema',
    criado_em: agora,
  });
  return true;
}
