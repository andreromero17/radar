// =============================================================================
// Conversão da instalação antiga (um banco só) para plataforma + espaços (Fase 5A).
// Roda UMA vez, no boot ou no `db:migrate`, quando o banco principal ainda não tem a
// tabela `espacos`:
//   1. backup do banco (data/backup-antes-dos-espacos-<data>.db)
//   2. cópia integral para data/espacos/1.db — os dados do sistema ficam intactos lá
//   3. no banco da plataforma: sai tudo o que é do sistema (tabelas do app, anexos,
//      logs dos dados, preferências, notificações, configurações do app)
//   4. cria o espaço 1 ("Pessoal"), com os usuários atuais como membros
// O espaço 1, ao abrir, perde senhas/sessões (só a plataforma guarda credenciais).
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from 'pino';
import { createDb, isSqlite, toDbValue, type Db } from '../db/knex';
import { migracoesDe, migrateLatest, withForeignKeysOff } from '../db/migrator';
import { nowLocal } from '../utils/time';

/** Tabelas que continuam na plataforma (o resto do banco antigo é do espaço) */
const DA_PLATAFORMA = new Set([
  'perfis',
  'usuarios',
  'sessoes',
  'tokens_senha',
  'logs',
  'configuracoes',
  'anexos',
  'preferencias',
  'notificacoes',
  'knex_migrations',
  'knex_migrations_lock',
  'espacos',
  'membros',
]);
/** Logs que são da plataforma (acesso, usuários, identidade); os demais são dos dados do espaço */
const LOGS_DA_PLATAFORMA = ['auth', 'usuarios', 'perfis', 'configuracoes'];

export async function precisaConverter(arquivo: string): Promise<boolean> {
  if (arquivo === ':memory:' || !fs.existsSync(arquivo)) return false;
  const db = createDb(arquivo);
  try {
    return (await db.schema.hasTable('usuarios')) && !(await db.schema.hasTable('espacos'));
  } finally {
    await db.destroy();
  }
}

export async function converterInstalacaoUnica(arquivo: string, dirEspacos: string, logger?: Logger) {
  if (!(await precisaConverter(arquivo))) return false;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const pasta = path.dirname(arquivo);

  // 1 e 2: backup e cópia para o espaço 1 (com o WAL já gravado no arquivo)
  let db = createDb(arquivo);
  if (!isSqlite(db)) throw new Error('Conversão automática disponível só para SQLite');
  await db.raw('PRAGMA wal_checkpoint(TRUNCATE)');
  await db.destroy();
  const backup = path.join(pasta, `backup-antes-dos-espacos-${stamp}.db`);
  fs.copyFileSync(arquivo, backup);
  fs.mkdirSync(dirEspacos, { recursive: true });
  const espaco1 = path.join(dirEspacos, '1.db');
  if (fs.existsSync(espaco1)) throw new Error(`Já existe ${espaco1}: confira antes de converter`);
  fs.copyFileSync(arquivo, espaco1);

  // 3: limpa a plataforma
  db = createDb(arquivo);
  try {
    const tabelas = (
      (await db('sqlite_master').where({ type: 'table' }).whereNot('name', 'like', 'sqlite_%').select('name')) as {
        name: string;
      }[]
    ).map((t) => t.name);
    const nomesPlataforma = new Set(migracoesDe('plataforma').map((m) => m.name));
    await withForeignKeysOff(db, async () => {
      for (const t of tabelas.filter((t) => !DA_PLATAFORMA.has(t))) await db.schema.dropTable(t);
      await db('knex_migrations')
        .whereNotIn('name', [...nomesPlataforma])
        .del();
      await db('anexos').del();
      await db('preferencias').del();
      await db('notificacoes').del();
      await db('logs').whereNotIn('entidade', LOGS_DA_PLATAFORMA).del();
      await db('configuracoes').where('chave', 'like', 'app.%').del();
    });
    await migrateLatest(db, 'plataforma');

    // 4: espaço 1 com os usuários de hoje (administradores = donos)
    const usuarios = (await db('usuarios as u')
      .join('perfis as p', 'p.id', 'u.perfil_id')
      .orderBy('u.id')
      .select('u.id', 'u.ativo', 'p.admin')) as { id: number; ativo: unknown; admin: unknown }[];
    const dono = usuarios.find((u) => u.admin && u.ativo) ?? usuarios[0];
    const agora = nowLocal();
    await db('espacos').insert({
      id: 1,
      nome: 'Pessoal',
      tipo: 'pessoal',
      dono_id: dono?.id ?? null,
      ativo: toDbValue(db, true),
      criado_em: agora,
    });
    for (const u of usuarios)
      await db('membros').insert({
        espaco_id: 1,
        usuario_id: u.id,
        papel: u.admin ? 'dono' : 'editor',
        ativo: toDbValue(db, true),
        criado_em: agora,
      });
    await db('logs').insert({
      entidade: 'sistema',
      acao: 'espaços',
      detalhe: `Instalação convertida para espaços: dados no espaço 1 (backup em ${path.basename(backup)})`,
      usuario: 'Sistema',
      criado_em: agora,
    });
  } finally {
    await db.destroy();
  }
  logger?.info({ backup, espaco: espaco1 }, 'instalação convertida para plataforma + espaços');
  return true;
}

/** Instalação nova (dev): garante um espaço para o primeiro administrador */
export async function garantirEspacoInicial(
  plataforma: Db,
  criar: (d: { nome: string; donoId: number }) => Promise<number>,
): Promise<number | null> {
  if (await plataforma('espacos').first('id')) return null;
  const admin = await plataforma('usuarios as u')
    .join('perfis as p', 'p.id', 'u.perfil_id')
    .whereIn('p.admin', [1, true])
    .orderBy('u.id')
    .first('u.id');
  if (!admin) return null;
  return criar({ nome: 'Pessoal', donoId: Number(admin.id) });
}
