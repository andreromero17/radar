import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeMigration } from '../src/db/diff';
import { allMigrations } from '../src/db/migrator';
import { VERSION } from '../src/version';

// Separação núcleo × aplicação que permite derivar sistemas do frame sem conflitos
describe('sistema derivado do frame', () => {
  it('migrações do núcleo e da aplicação rodam juntas, em ordem', () => {
    const nomes = allMigrations().map((m) => m.name);
    expect(nomes).toContain('20261108000000_nucleo');
    expect(nomes).toEqual([...nomes].sort());
  });

  it('db:diff grava e registra a migração no índice da aplicação', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-mig-'));
    fs.copyFileSync(path.resolve(__dirname, '../src/app/migrations/index.ts'), path.join(dir, 'index.ts'));
    const name = writeMigration({ createTables: [], addColumns: [], orphanColumns: [] }, 'cria contas', dir);
    expect(name).toMatch(/^\d{14}_cria_contas$/);
    const index = fs.readFileSync(path.join(dir, 'index.ts'), 'utf8');
    expect(index).toContain(`from './${name}'`);
    expect(index).toMatch(/appMigrations: Migration\[\] = \[\n {2}m\d{14},\n {2}\/\/ @diff:list/);
  });

  it('versão informa a do frame separada', () => {
    expect(VERSION.frame).toMatch(/^\d+\.\d+\.\d+/);
    expect(VERSION.version).toBe(VERSION.frame); // sem app/info.ts preenchido, é o próprio frame
  });
});
