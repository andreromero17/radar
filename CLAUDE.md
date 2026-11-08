# CLAUDE.md — contexto do projeto para o Claude Code

## O que é

Frame genérico de aplicação web responsiva (menu, CRUD dirigido por configuração, dashboard,
configurações) que serve de base para vários sistemas. Primeiro sistema em cima dele: gestão de
finanças pessoais. Interface, mensagens e nomes de tabelas/campos em português do Brasil.
Roadmap em `ROADMAP.md` (Fase 0 concluída).

## Stack

- Monorepo com npm workspaces: `shared/`, `server/`, `web/` — tudo em TypeScript (strict)
- Front: React 19 + Vite, react-bootstrap (Bootstrap 5), Bootstrap Icons, Chart.js, react-router-dom 7
- Back: Node.js ≥ 22 + Express 5, Knex (query builder + migrações), better-sqlite3, pino, Zod
- Banco: SQLite em `server/data/app.db` (Postgres previsto na Fase 6 — por isso tudo passa pelo Knex)

## Comandos (na raiz)

- `npm run setup` — instala, cria `server/.env`, migra e popula
- `npm run dev` — API em :3001 (tsx watch) + Vite em :5173 (proxy /api → 3001)
- `npm run check` — lint + formatação + tipos + testes (rode antes de dar algo por pronto)
- `npm test` / `npm run lint` / `npm run typecheck` / `npm run format`
- `npm run db:migrate | db:rollback | db:status | db:diff -- descricao | db:seed | db:reset`
- `npm run build` + `npm start` — produção (Express serve a API e o front buildado)

## Arquitetura (importante)

- **Dirigido por configuração.** `shared/src/entities.ts` é a fonte da verdade: define campos,
  validações, rotas CRUD (`/api/:entity`) e as telas genéricas. É importado direto pelo server e pelo web.
- **Validação única:** `shared/src/schema.ts` gera schemas Zod a partir das entidades
  (`validateEntity`). O form valida antes de enviar e a API valida de novo com a mesma função.
  Configurações usam `settingsSchema` (`shared/src/settings.ts`) do mesmo jeito.
- **Nova entidade/campo:** editar `entities.ts` → `npm run db:diff -- descricao` (gera a migração em
  `server/src/db/migrations/` e registra no `index.ts`) → revisar → `npm run db:migrate` → item em
  `web/src/config/menu.ts`. Não criar telas específicas se a genérica atende.
- **Migrações:** nunca editar migração já aplicada; criar nova. O diff só gera tabela/coluna nova;
  renomear/remover é escrito à mão (o diff avisa colunas órfãs). Migrações ficam registradas em código
  (`migrations/index.ts`), não lidas da pasta. No SQLite as FKs são desligadas durante a migração
  (`withForeignKeysOff`) porque o Knex recria tabelas e o `ON DELETE SET NULL` apagaria vínculos.
- **Acesso a dados só via Knex** (nada de SQL específico de SQLite). Datas gravadas pela aplicação
  como texto local `YYYY-MM-DD HH:MM:SS` (`server/src/utils/time.ts`). Booleanos passam por `toDbValue`.
- **Server:** `app.ts` monta o Express (`createApp`, usado também nos testes); `index.ts` só faz boot.
  Rotas de sistema (`routes/system.ts`: meta, settings, dashboard, logs, backup) ficam antes do CRUD.
  Regras de negócio em `services/`. Express 5 já repassa erros de handlers async.
- **Config:** `server/.env` validado por Zod em `server/src/config.ts`; servidor não sobe se inválido.
  Em produção não aplica migração sozinho (recusa subir com migração pendente).
- **Identidade visual** (nome, ícone/logo, cores, organização, retenção de logs): tela de Configurações,
  tabela `configuracoes`. O front aplica via `web/src/lib/theme.ts` nas variáveis CSS `--brand-*`.
  Nunca usar cor de marca fixa no CSS: `var(--brand-1)`, `var(--brand-2)`, `rgba(var(--brand-1-rgb), x)`.
- **Segredos** (SMTP, tokens) vão no `.env`, nunca na tabela de configurações nem no git.

## Testes

- Vitest em cada workspace. API testada com Supertest sobre SQLite em memória (`server/test/helpers.ts`).
- Todo comportamento novo de API/validação vem com teste. Bug corrigido ganha teste de regressão.

## Convenções

- Tabelas/campos em português, snake_case (`cliente_id`, `criado_em`).
- Relacionamentos: campo `xxx_id`, `type: 'relation'`, `entity`; a API devolve `xxx_id__label`.
- Erros da API: `{ error, errors?: { campo: mensagem } }`; 422 para validação, 404, 400 (JSON inválido).
- Commits: Conventional Commits em português (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
  O pre-commit roda ESLint + Prettier nos arquivos alterados.
