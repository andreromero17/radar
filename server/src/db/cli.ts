// =============================================================================
// Comandos do banco:  npm run db:<comando>  (na raiz do projeto)
//   migrate   aplica as migrações pendentes
//   rollback  desfaz o último lote de migrações
//   status    lista migrações aplicadas e pendentes
//   diff      compara entidades × banco e gera a migração (ex.: npm run db:diff -- add cidade)
//   seed      popula com dados de exemplo (só se o banco estiver vazio)
//   reset     apaga tudo, recria e popula (CUIDADO: perde os dados)
// =============================================================================
import { entities } from '@frame/shared';
import { config } from '../config';
import { createDb } from './knex';
import { computeDiff, isEmptyDiff, writeMigration } from './diff';
import { migrateLatest, migrationStatus, rollback } from './migrator';
import { seed } from './seed';

const [command = 'status', ...args] = process.argv.slice(2);
const db = createDb(config.dbFile);
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
        `✔ Migração criada: server/src/db/migrations/${name}.ts\n` +
          `  ${diff.createTables.length} tabela(s) nova(s), ${diff.addColumns.length} coluna(s) nova(s).\n` +
          '  Revise o arquivo e rode `npm run db:migrate`.',
      );
      break;
    }
    case 'seed': {
      console.log((await seed(db)) ? '🌱 Dados de exemplo inseridos' : 'ℹ Banco já tem dados; seed ignorado');
      break;
    }
    case 'reset': {
      if (config.NODE_ENV === 'production') throw new Error('reset bloqueado em produção');
      await rollback(db, true);
      await migrateLatest(db);
      await seed(db);
      console.log('✔ Banco recriado com dados de exemplo');
      break;
    }
    default:
      console.error(`Comando desconhecido: ${command}\nUse: migrate | rollback | status | diff | seed | reset`);
      process.exitCode = 1;
  }
} catch (err) {
  console.error('✖', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
