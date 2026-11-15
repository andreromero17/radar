import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDb, createPgDb } from '../src/db/knex';
import { migrateLatest } from '../src/db/migrator';
import { seed } from '../src/db/seed';
import { abrirEspaco, adicionarMembro, configurarEspacos, criarEspaco, fecharEspacos } from '../src/espacos';
import { copiarParaPostgres } from '../src/db/paraPostgres';
import { nowLocal } from '../src/utils/time';
import { opcoesEspacosTeste, TESTE_PG_URL } from './helpers';
import { seedFixtureUsuarios } from './fixtures';

// Fase 6A: instalação em arquivos (SQLite) → Postgres, com os mesmos ids e as contagens conferidas
describe.runIf(!!TESTE_PG_URL)('cópia SQLite → Postgres', () => {
  it('copia plataforma e espaços, acerta sequências, recusa destino com dados', async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-copia-'));
    const arquivo = path.join(pasta, 'app.db');
    const dir = path.join(pasta, 'espacos');
    const plat = createDb(arquivo);
    await migrateLatest(plat, 'plataforma');
    await seed(plat);
    await seedFixtureUsuarios(plat);
    configurarEspacos({ plataforma: plat, dir, autoMigrar: true });
    const admin = (await plat('usuarios').where({ email: 'admin@sistema.com' }).first('id')).id;
    const ana = (await plat('usuarios').where({ email: 'ana@sistema.com' }).first('id')).id;
    const e1 = await criarEspaco({ nome: 'Um', donoId: admin });
    const e2 = await criarEspaco({ nome: 'Dois', donoId: ana });
    await adicionarMembro(e2, admin, 'leitor');
    const db1 = await abrirEspaco(e1);
    await db1('logs').insert({ entidade: 'x', acao: 'teste do um', criado_em: nowLocal() });
    await fecharEspacos();
    await plat.destroy();

    // banco de destino novo
    const nome = `frame_copia_${Math.random().toString(36).slice(2, 8)}`;
    const raiz = createPgDb(TESTE_PG_URL, 'public', { max: 1 });
    await raiz.raw('create database ??', [nome]);
    await raiz.destroy();
    const url = TESTE_PG_URL.replace(/\/[^/]+$/, `/${nome}`);
    try {
      const r = await copiarParaPostgres({ plataformaSqlite: arquivo, espacosDir: dir, pgUrl: url });
      expect(Object.keys(r)).toEqual(['plataforma', `espaco_${e1}`, `espaco_${e2}`]);
      const pg = createPgDb(url, 'public', { max: 1 });
      expect((await pg('usuarios').orderBy('id').pluck('email')).length).toBe(4);
      expect(await pg('membros').where({ espaco_id: e2, usuario_id: admin }).first('papel')).toEqual({
        papel: 'leitor',
      });
      // sequência continua depois do maior id copiado
      const [{ id: novo }] = await pg('espacos')
        .insert({ nome: 'Três', tipo: 'pessoal', dono_id: admin, ativo: true, criado_em: nowLocal() })
        .returning('id');
      expect(novo).toBe(e2 + 1);
      const um = createPgDb(url, `espaco_${e1}`, { max: 1 });
      expect(await um('logs').where({ acao: 'teste do um' }).first('id')).toBeTruthy();
      await um.destroy();
      await pg.destroy();
      // destino com dados: só substituindo
      await expect(copiarParaPostgres({ plataformaSqlite: arquivo, espacosDir: dir, pgUrl: url })).rejects.toThrow(
        /já tem dados/,
      );
    } finally {
      const r2 = createPgDb(TESTE_PG_URL, 'public', { max: 1 });
      await r2.raw('drop database if exists ?? with (force)', [nome]);
      await r2.destroy();
      fs.rmSync(pasta, { recursive: true, force: true });
      if (opcoesEspacosTeste) configurarEspacos(opcoesEspacosTeste);
    }
  }, 30_000); // migra a plataforma e dois espaços no Postgres: no CI passa dos 5 s padrão
});
