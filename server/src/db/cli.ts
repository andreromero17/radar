// =============================================================================
// Comandos do banco:  npm run db:<comando>  (na raiz do projeto)
//   migrate   aplica as migrações pendentes (plataforma + todos os espaços)
//   rollback  desfaz o último lote de migrações dos espaços (rollback plataforma = da plataforma)
//   status    lista migrações aplicadas e pendentes (plataforma + resumo dos espaços)
//   diff      compara entidades × banco de um espaço e gera a migração (ex.: npm run db:diff -- add cidade)
//   seed      popula com dados de exemplo (só se estiver vazio)
//   reset     apaga tudo (plataforma, espaços e anexos), recria e popula (CUIDADO: perde os dados)
//   admin     cria/recupera um administrador com senha provisória (e garante um espaço para ele)
//             ex.: npm run db:admin -- voce@email.com "Seu Nome"
// Fase 5A: o banco principal (DB_PATH) é a PLATAFORMA; cada espaço tem o seu em ESPACOS_DIR. Uma instalação
// antiga (um banco só) é convertida aqui também, com backup (espacos/conversao.ts).
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword, randomPassword } from '../auth/password';
import { deleteUserSessions } from '../auth/sessions';
import { addLog } from '../services/logs';
import { nowLocal } from '../utils/time';
import { config } from '../config';
import { createDb } from './knex';
import { computeDiff, entidadesDe, isEmptyDiff, writeMigration } from './diff';
import { migrateLatest, migrationStatus, rollback } from './migrator';
import { seed, seedEspaco, SEED_LOGINS } from './seed';
import { setupDemo } from '../demo/setup';
import {
  abrirEspaco,
  adicionarMembro,
  comEspaco,
  configurarEspacos,
  criarEspaco,
  espacosDoUsuario,
  fecharEspacos,
  idsEspacosAtivos,
  migrarTodos,
} from '../espacos';
import { converterInstalacaoUnica, garantirEspacoInicial } from '../espacos/conversao';

const [command = 'status', ...args] = process.argv.slice(2);
if (command !== 'reset') await converterInstalacaoUnica(config.dbFile, config.espacosDir);
let db = createDb(config.dbFile);
const prepararEspacos = () => configurarEspacos({ plataforma: db, dir: config.espacosDir, autoMigrar: true });
prepararEspacos();
const list = (items: string[]) => (items.length ? items.map((i) => `   • ${i}`).join('\n') : '   (nenhuma)');

try {
  switch (command) {
    case 'migrate': {
      const applied = await migrateLatest(db, 'plataforma');
      console.log(
        applied.length ? `✔ Plataforma — migrações aplicadas:\n${list(applied)}` : '✔ Plataforma já está atualizada',
      );
      for (const e of await migrarTodos())
        console.log(
          e.aplicadas.length
            ? `✔ Espaço ${e.id} — migrações aplicadas:\n${list(e.aplicadas)}`
            : `✔ Espaço ${e.id} já está atualizado`,
        );
      break;
    }
    case 'rollback': {
      if (args[0] === 'plataforma') {
        console.log(`↩ Plataforma — revertidas:\n${list(await rollback(db, false, 'plataforma'))}`);
        break;
      }
      for (const id of await idsEspacosAtivos()) {
        const espaco = createDb(path.join(config.espacosDir, `${id}.db`));
        try {
          console.log(`↩ Espaço ${id} — revertidas:\n${list(await rollback(espaco))}`);
        } finally {
          await espaco.destroy();
        }
      }
      break;
    }
    case 'status': {
      const s = await migrationStatus(db, 'plataforma');
      console.log(`Plataforma: ${config.dbFile}\n\nAplicadas:\n${list(s.done)}\n\nPendentes:\n${list(s.pending)}`);
      for (const id of await idsEspacosAtivos()) {
        const espaco = createDb(path.join(config.espacosDir, `${id}.db`));
        try {
          const e = await migrationStatus(espaco);
          console.log(
            `\nEspaço ${id}: ${e.done.length} aplicadas, ${e.pending.length} pendentes${e.pending.length ? `\n${list(e.pending)}` : ''}`,
          );
        } finally {
          await espaco.destroy();
        }
      }
      break;
    }
    case 'diff': {
      // compara com o banco de um espaço (todos têm o mesmo esquema)
      await migrateLatest(db, 'plataforma');
      const [primeiro] = await idsEspacosAtivos();
      if (!primeiro) throw new Error('Nenhum espaço para comparar. Rode `npm run db:seed` (ou db:admin) antes.');
      const espaco = await abrirEspaco(primeiro);
      const diff = await computeDiff(espaco, entidadesDe('espaco'));
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
      await migrateLatest(db, 'plataforma');
      const novo = await seed(db);
      const criado = await garantirEspacoInicial(db, criarEspaco);
      const [primeiro] = await idsEspacosAtivos();
      if (primeiro && criado) await comEspaco(primeiro, (e) => seedEspaco(e));
      if (primeiro && config.demo && (await comEspaco(primeiro, (e) => setupDemo(e))))
        console.log('🌱 Módulo de demonstração populado');
      if (novo) {
        console.log('🌱 Dados de exemplo inseridos. Acessos de teste:');
        for (const l of SEED_LOGINS) console.log(`   • ${l.email.padEnd(20)} ${l.senha.padEnd(10)} (${l.perfil})`);
      } else {
        console.log('ℹ Banco já tem dados; seed ignorado');
      }
      break;
    }
    case 'reset': {
      if (config.NODE_ENV === 'production') throw new Error('reset bloqueado em produção');
      // SQLite: apaga os arquivos (funciona mesmo se o histórico de migrações mudou)
      await fecharEspacos();
      await db.destroy();
      if (config.dbFile !== ':memory:')
        for (const f of [config.dbFile, `${config.dbFile}-wal`, `${config.dbFile}-shm`]) fs.rmSync(f, { force: true });
      fs.rmSync(config.espacosDir, { recursive: true, force: true });
      fs.rmSync(config.uploadDir, { recursive: true, force: true }); // anexos dos bancos apagados
      db = createDb(config.dbFile);
      prepararEspacos();
      await migrateLatest(db, 'plataforma');
      await seed(db);
      const espaco = await garantirEspacoInicial(db, criarEspaco);
      if (espaco) {
        await comEspaco(espaco, (e) => seedEspaco(e));
        if (config.demo) await comEspaco(espaco, (e) => setupDemo(e));
      }
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
        // recuperar acesso também desliga a verificação em duas etapas (celular perdido): configura de novo ao entrar
        dois_fatores: 0,
        segredo_2fa: null,
        segredo_2fa_pendente: null,
        segredo_2fa_recuperacao: null,
        segredo_2fa_passo: null,
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
      // sem espaço, o administrador não entra: dono do primeiro espaço (ou de um novo, se não houver)
      if (!(await espacosDoUsuario(id)).length) {
        const [primeiro] = await idsEspacosAtivos();
        if (primeiro) await adicionarMembro(primeiro, id, 'dono');
        else await criarEspaco({ nome: 'Pessoal', donoId: id });
      }
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
  await fecharEspacos();
  await db.destroy();
}
