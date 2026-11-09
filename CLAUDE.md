# CLAUDE.md — contexto do projeto para o Claude Code

## O que é

Frame genérico de aplicação web responsiva (menu, CRUD dirigido por configuração, dashboard,
configurações) que serve de base para vários sistemas. Primeiro sistema em cima dele: gestão de
finanças pessoais. Interface, mensagens e nomes de tabelas/campos em português do Brasil.
Roadmap em `ROADMAP.md` (Fases 0, 1 e 2 concluídas).

Cada sistema é um repositório derivado deste (remoto `upstream` = frame-app). Regras e contexto do sistema
derivado ficam em `docs/app/CLAUDE.md`, importado aqui: @docs/app/CLAUDE.md

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
- `npm run db:admin -- email "Nome"` — cria/recupera administrador (senha provisória)
- Login de dev (seed): admin@sistema.com / admin123
- `npm run build` + `npm start` — produção (Express serve a API e o front buildado)

## Arquitetura (importante)

- **Núcleo × aplicação.** O frame (núcleo) não tem regra de negócio. O sistema construído sobre ele vive só nas
  pastas `app/`: `shared/src/app/entities.ts`, `server/src/app/` (hooks.ts, routes.ts, seed.ts, maintenance.ts) e `web/src/app/`
  (menu.ts, dashboard.tsx, screens.ts), mais `shared/src/app/info.ts` (nome/versão do sistema),
  `server/src/app/migrations/` e `docs/app/`. Não coloque nada de negócio no núcleo; se algo genérico faltar,
  evolua o núcleo **no repositório do frame** (PR lá) e traga com `git pull upstream main`.
- **Dirigido por configuração.** `shared/src/entities.ts` (= app + core) é a fonte da verdade: define campos,
  validações, rotas CRUD (`/api/:entity`) e as telas genéricas. É importado direto pelo server e pelo web.
- **Validação única:** `shared/src/schema.ts` gera schemas Zod a partir das entidades
  (`validateEntity`). O form valida antes de enviar e a API valida de novo com a mesma função.
  Configurações usam `settingsSchema` (`shared/src/settings.ts`) do mesmo jeito.
- **Nova entidade/campo:** editar `shared/src/app/entities.ts` → `npm run db:diff -- descricao` (gera a migração em
  `server/src/app/migrations/` e registra no `index.ts`) → revisar → `npm run db:migrate` → item em
  `web/src/app/menu.ts` (com `perm`). Não criar telas específicas se a genérica atende.
- **Migrações:** núcleo em `server/src/db/migrations/` (à mão), aplicação em `server/src/app/migrations/`
  (geradas pelo `db:diff`); `allMigrations()` junta as duas em ordem de nome. Nunca editar migração já aplicada; criar nova. O diff só gera tabela/coluna nova;
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
  Nunca usar cor fixa no CSS: marca em `var(--brand-1)`, `var(--brand-2)`, `rgba(var(--brand-1-rgb), x)`; o resto em
  tokens (`--surface`, `--text`, `--text-muted`, `--border`, `--positive`, `--negative`…) de `web/src/styles.css`.
- **Temas:** `tema` (vibrante/minimalista) é configuração do sistema → `data-tema` no `<html>`; `aparencia`
  (sistema/claro/escuro) é do usuário (`usuarios.aparencia`, `PUT /api/auth/perfil`) → `data-bs-theme`. Os
  componentes são os mesmos; o tema muda tokens e poucos detalhes de layout (Minimalista: título no topo via
  portal do `PageHeader`). Gráficos: `chartTheme()`/`useThemeVersion()` (`lib/themeVars.ts`). Abas no celular:
  `tab: true` no item de menu. Booleano editável na listagem: `inlineEdit` no campo.
- **Segredos** (SMTP, tokens) vão no `.env`, nunca na tabela de configurações nem no git.
- **Acesso:** toda rota de `/api` exige login, exceto `/api/health`, `/api/settings/publicas` e `/api/auth/*`
  (ordem em `app.ts`: helmet → originGuard → authenticate → públicas → requireAuth → system → CRUD).
  Sessão em cookie `sid` httpOnly; tabela `sessoes` guarda só o hash do token. Senhas: scrypt
  (`server/src/auth/password.ts`), política em `passwordSchema` (shared). `requireAuth` bloqueia com
  403 `code: TROCAR_SENHA` quem precisa trocar a senha.
- **Permissões:** `shared/src/permissions.ts` — recursos = entidades + `SYSTEM_RESOURCES`; `can(user, recurso, ação)`
  usado no servidor (`assertCan`/`requirePermission`) e no front (`useAuth().can`). O CRUD genérico já checa
  ver/criar/editar/excluir; rota nova de sistema precisa de `requirePermission`. `ADMIN_ONLY` reserva ações a
  administradores (gerenciar perfis). Itens de menu usam `perm: [recurso, ação]`.
- **Hooks** (núcleo em `server/src/hooks/`, aplicação registrada em `server/src/app/hooks.ts`): `beforeSave`/`afterSave`/`beforeDelete` por entidade; lançar `HttpError`
  (`badRequest`, `forbidden`, `conflict` de `utils/http.ts`). Regras de usuários e perfis estão lá (e-mail único,
  sempre um admin ativo, só admin gerencia admin, derrubar sessões).
- **Campos especiais:** `password` nunca sai da API (removido em `present()` no CRUD), não é filtrável/ordenável,
  vai para o banco como hash e para o log só como "(alterada)". `permissions` é JSON normalizado.
- **Motor de registros:** `server/src/services/records.ts` (listar com filtros/período/ordenação/totais, criar, editar,
  lixeira, restaurar, opções de relação) — `routes/crud.ts` só valida permissão e chama o serviço. Exportação em
  `services/export.ts`. Entidade com `lixeira: true` ganha a coluna `excluido_em` (via `tableFields` no diff).
- **Master-detail:** `details` no pai + `detailOf` na entidade das linhas. `validateDetails`/`computeFields`/
  `detailSums` (shared) validam e calculam no form e na API. `records.ts` grava pai + linhas numa transação
  (`inTransaction`; o pool do SQLite tem 1 conexão, então dentro da transação use SEMPRE o `c.db` recebido) e apaga
  dependentes em `deleteDependents`. `can()` resolve a sub-tabela para o pai.
- **Anexos:** `services/anexos.ts` (tabela `anexos` + arquivos em `UPLOAD_DIR`, nome aleatório; tipo pelo nome do
  arquivo, nunca pelo navegador). Upload/importação chegam como `application/octet-stream` (`express.raw` na rota).
- **Importação:** `services/import.ts` (CSV/XLSX → prévia → `createRecord` com `semLog` + um log de resumo).
- **Telas plugáveis:** `web/src/lib/screens.ts` (`registerScreens`, `registerPage`), registradas em
  `web/src/app/screens.ts`; rotas em `pages/EntityRoutes.tsx`. `CrudList`/`CrudForm` aceitam `entity` e slots.
- **Módulo de demonstração:** `shared/src/demo/`, `server/src/demo/setup.ts`, `web/src/demo/menu.ts`; ligado por
  `DEMO=true` no `.env` (o Vite lê o mesmo arquivo e define `__DEMO__`). Tabelas `demo_*` fora das migrações.
  Telas próprias de exemplo em `web/src/demo/pages.tsx`.
- **Logs:** `addLog(db, entrada, actor)` com `diffRecord()` → coluna `alteracoes` `{ campo: { de, para } }`.
- **Front:** `AuthContext` (`useAuth`), `RouteGuards` (`RequireAuth`, `PublicOnly`, `Guard`). A camada `lib/api.ts`
  dispara eventos em 401/TROCAR_SENHA. Relações no form usam `GET /api/:entidade/opcoes` (liberado a qualquer logado).

## Testes

- Vitest em cada workspace. API testada com Supertest sobre SQLite em memória (`server/test/helpers.ts`).
- Todo comportamento novo de API/validação vem com teste. Bug corrigido ganha teste de regressão.

## Convenções

- Tabelas/campos em português, snake_case (`cliente_id`, `criado_em`).
- Relacionamentos: campo `xxx_id`, `type: 'relation'`, `entity`; a API devolve `xxx_id__label`.
- Erros da API: `{ error, errors?: { campo: mensagem } }`; 422 para validação, 404, 400 (JSON inválido).
- Commits: Conventional Commits em português (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
  O pre-commit roda ESLint + Prettier nos arquivos alterados.

## Versão

- Número do frame em `package.json` da raiz (manter os workspaces iguais); versão do sistema derivado em
  `shared/src/app/info.ts` (o `package.json` fica com a do frame). Commit do git (ou `APP_COMMIT`). Front: `__APP_VERSION__`/
  `__APP_COMMIT__` (vite define, `web/src/lib/version.ts`); API: `server/src/version.ts` → `/api/health`.
- Ao fechar uma entrega: subir a versão (semver) e registrar no `CHANGELOG.md` (no sistema derivado:
  `app/info.ts` e `docs/app/CHANGELOG.md`).

## Testes de entidades

- O frame não tem entidades de negócio; os testes do motor genérico usam entidades de exemplo em
  `shared/test/fixtures.ts` (`registerFixtureEntities()`), com tabelas criadas por `createEntityTable` e dados em
  `server/test/fixtures.ts`.
