import { defineConfig } from 'tsup';

// Build de produção: gera dist/index.js (servidor) e dist/cli.js (migrações/seed).
// O pacote @frame/shared é embutido no bundle; o resto vem do node_modules.
export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/db/cli.ts' },
  format: 'esm',
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  noExternal: ['@frame/shared'],
});
