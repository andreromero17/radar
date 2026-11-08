// =============================================================================
// Comandos do banco:  npm run db:<comando>  (na raiz do projeto)
//   migrate   aplica as migrações pendentes
//   rollback  desfaz o último lote de migrações
//   status    lista migrações aplicadas e pendentes
//   diff      compara entidades × banco e gera a migração (ex.: npm run db:diff -- add cidade)
//   seed      popula com dados de exemplo (só se o banco estiver vazio)
//   reset     apaga tudo, recria e popula (CUIDADO: perde os dados)
//   admin     cria/recupera um administrador com senha provisória
//             ex.: npm run db:admin -- voce@email.com "Seu Nome"
// =============================================================================
import fs from 'node:fs';
import { entities } from '@frame/shared';
import { hashPassword, randomPassword } from '../auth/password';
import { deleteUserSessions } from '../auth/sessions';
import { addLog } from '../services/logs';
import { nowLocal } from '../utils/time';
import { config } from '../config';
import { createDb } from './knex';
import { computeDiff, isEmptyDiff, writeMigration } from './diff';
import { migrateLatest, migrationStatus, rollback } from './migrator';
import { seed, SEED_LOGINS } from './seed';
import { setupDemo } from '../demo/setup';

const [command = 'status', ...args] = process.argv.slice(2);
let db = createDb(config.dbFile);
const list = (items: string[]) => (items.length ? items.map((i) => `   • ${i}`).join('\n') : '   (nenhuma)');

try {
  switch (command) {
    case 'migrate': {
      const applied = await migrateLatest(db);
      console.log(applied.length ? `✔ Migrações aplicadas:\n${list(applied)}` : '✔ Banco já está atualizado');
      break;
    }
    case 'rollback': {
      const reverted = await rollback(db);
      console.log(`↩ Revertidas:\n${list(reverted)}`);
      break;
    }
    case 'status': {
      const s = await migrationStatus(db);
      console.log(`Banco: ${config.dbFile}\n\nAplicadas:\n${list(s.done)}\n\nPendentes:\n${list(s.pending)}`);
      break;
    }
    case 'diff': {
      const { pending } = await migrationStatus(db);
      if (pending.length) {
        console.error(`✖ Há migrações pendentes. Rode \`npm run db:migrate\` antes do diff:\n${list(pending)}`);
        process.exitCode = 1;
        break;
      }
      const diff = await computeDiff(db, entities);
      for (const o of diff.orphanColumns)
        console.warn(`⚠ ${o.table}.${o.column} existe no banco mas não na entidade (renomear/remover é manual)`);
      if (isEmptyDiff(diff)) {
        console.log('✔ Entidades e banco estão em sincronia. Nada a gerar.');
        break;
      }
      const name = writeMigration(diff, args.join(' ') || 'ajustes');
      console.log(
        `✔ Migração criada: server/src/app/migrations/${name}.ts\n` +
          `  ${diff.createTables.length} tabela(s) nova(s), ${diff.addColumns.length} coluna(s) nova(s).\n` +
          '  Revise o arquivo e rode `npm run db:migrate`.',
      );
      break;
    }
    case 'seed': {
      if (config.demo && (await setupDemo(db))) console.log('🌱 Módulo de demonstração populado');
      if (await seed(db)) {
        console.log('🌱 Dados de exemplo inseridos. Acessos de teste:');
        for (const l of SEED_LOGINS) console.log(`   • ${l.email.padEnd(20)} ${l.senha.padEnd(10)} (${l.perfil})`);
      } else {
        console.log('ℹ Banco já tem dados; seed ignorado');
      }
      break;
    }
    case 'reset': {
      if (config.NODE_ENV === 'production') throw new Error('reset bloqueado em produção');
      // SQLite: apaga o arquivo (funciona mesmo se o histórico de migrações mudou)
      if (config.dbFile !== ':memory:') {
        await db.destroy();
        for (const f of [config.dbFile, `${config.dbFile}-wal`, `${config.dbFile}-shm`]) fs.rmSync(f, { force: true });
        fs.rmSync(config.uploadDir, { recursive: true, force: true }); // anexos do banco apagado
        db = createDb(config.dbFile);
      } else {
        await rollback(db, true);
      }
      await migrateLatest(db);
      await seed(db);
      if (config.demo) await setupDemo(db);
      console.log(`✔ Banco recriado com dados de exemplo${config.demo ? ' (+ demonstração)' : ''}. Acessos de teste:`);
      for (const l of SEED_LOGINS) console.log(`   • ${l.email.padEnd(20)} ${l.senha.padEnd(10)} (${l.perfil})`);
      break;
    }
    case 'admin': {
      const [rawEmail, ...nomeParts] = args;
      const email = rawEmail?.trim().toLowerCase();
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        console.error('Uso: npm run db:admin -- voce@email.com "Seu Nome"');
        process.exitCode = 1;
        break;
      }
      const perfil = await db('perfis').whereIn('admin', [1, true]).orderBy('id').first('id', 'nome');
      if (!perfil) throw new Error('Nenhum perfil de administrador encontrado. Rode `npm run db:migrate`.');
      const senha = randomPassword();
      const dados = {
        perfil_id: perfil.id,
        senha: await hashPassword(senha),
        trocar_senha: 1,
        ativo: 1,
        atualizado_em: nowLocal(),
      };
      const existente = await db('usuarios').where({ email }).first('id');
      let id: number;
      if (existente) {
        id = existente.id;
        await db('usuarios').where({ id }).update(dados);
        await deleteUserSessions(db, id);
      } else {
        const [ins] = await db('usuarios')
          .insert({ nome: nomeParts.join(' ') || 'Administrador', email, ...dados, criado_em: nowLocal() })
          .returning('id');
        id = typeof ins === 'object' ? ins.id : ins;
      }
      await addLog(db, {
        entidade: 'usuarios',
        registro_id: id,
        acao: existente ? 'acesso recuperado' : 'criação',
        detalhe: `${email} (via linha de comando)`,
      });
      console.log(
        `✔ Administrador ${existente ? 'atualizado' : 'criado'}: ${email}\n` +
          `  Senha provisória: ${senha}\n` +
          '  A troca da senha será exigida no primeiro acesso.',
      );
      break;
    }
    default:
      console.error(`Comando desconhecido: ${command}\nUse: migrate | rollback | status | diff | seed | reset | admin`);
      process.exitCode = 1;
  }
} catch (err) {
  console.error('✖', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
