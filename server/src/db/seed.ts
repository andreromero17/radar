import { seedApp } from '../app/seed';
import { hashPassword } from '../auth/password';
import { nowLocal } from '../utils/time';
import { count, toDbValue, type Db } from './knex';

/** Acessos de exemplo criados pelo seed (somente desenvolvimento!) */
export const SEED_LOGINS = [{ email: 'admin@sistema.com', senha: 'admin123', perfil: 'Administrador' }] as const;

/**
 * Popula a PLATAFORMA com o administrador de teste. Não faz nada se já houver usuários.
 * Os dados de exemplo do sistema vão para o banco de um espaço: `seedEspaco`.
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
  await db('logs').insert({
    entidade: 'sistema',
    acao: 'seed',
    detalhe: 'Banco populado com dados de exemplo',
    usuario: 'Sistema',
    criado_em: agora,
  });
  return true;
}

/** Dados de exemplo da aplicação (server/src/app/seed.ts) no banco de um espaço */
export const seedEspaco = (db: Db) => seedApp(db);
