# CLAUDE.md — contexto do projeto para o Claude Code

## O que é

Frame genérico de aplicação web responsiva (menu, CRUD dirigido por configuração, dashboard,
configurações) que serve de base para vários sistemas. Primeiro sistema em cima dele: gestão de
finanças pessoais. Interface, mensagens e nomes de tabelas/campos em português do Brasil.
Roadmap em `ROADMAP.md` (Fases 0, 1 e 2 concluídas; Fase 3 com as funcionalidades prontas, em uso).

Cada sistema é um repositório derivado deste (remoto `upstream` = frame-app). Regras e contexto do sistema
derivado ficam em `docs/app/CLAUDE.md`, importado aqui: @docs/app/CLAUDE.md

## Stack

- Monorepo com npm workspaces: `shared/`, `server/`, `web/` — tudo em TypeScript (strict)
- Front: React 19 + Vite, react-bootstrap (Bootstrap 5), Bootstrap Icons, Chart.js, react-router-dom 7
- Back: Node.js ≥ 22 + Express 5, Knex (query builder + migrações), better-sqlite3, pino, Zod
- Banco: **Postgres** em produção (`DATABASE_URL`; plataforma no schema `public`, cada espaço no `espaco_<id>`) ou
  SQLite em arquivos (`server/data/`, desenvolvimento) — tudo passa pelo Knex e a suíte roda nos dois

## Comandos (na raiz)

- `npm run setup` — instala, cria `server/.env`, migra e popula
- `npm run dev` — API em :3001 (tsx watch) + Vite em :5173 (proxy /api → 3001)
- `npm run check` — lint + formatação + tipos + testes (rode antes de dar algo por pronto)
- `npm test` / `npm run lint` / `npm run typecheck` / `npm run format`
- `npm run db:migrate | db:rollback | db:status | db:diff -- descricao | db:seed | db:reset`
- `npm run db:admin -- email "Nome"` — cria/recupera administrador (senha provisória)
- `npm run db:para-postgres` — copia a instalação SQLite para o Postgres do `DATABASE_URL` (vazio; `-- --substituir`)
- Testes no Postgres: `TESTE_PG_URL=postgres://... npm run test --workspace server` (o CI roda os dois)
- Login de dev (seed): admin@sistema.com / admin123
- `npm run build` + `npm start` — produção (Express serve a API e o front buildado)
- Deploy (Fase 6B): `deploy/` (Dockerfile, docker-compose com Postgres + app + Caddy + backup, `.env.exemplo`,
  `atualizar.sh`); passo a passo em `deploy/LEIAME.md`. No container: `node dist/cli.js <comando>` (migrate, admin…)

## Arquitetura (importante)

- **Núcleo × aplicação.** O frame (núcleo) não tem regra de negócio. O sistema construído sobre ele vive só nas
  pastas `app/`: `shared/src/app/entities.ts`, `shared/src/app/settings.ts`, `server/src/app/` (hooks.ts, routes.ts, paineis.ts, seed.ts, maintenance.ts) e `web/src/app/`
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
- **Plataforma × espaços (Fase 5A):** dois tipos de banco. **Plataforma** (`DB_PATH`, `data/app.db`): usuários,
  perfis, sessões, tokens, identidade visual (`configuracoes`), `espacos`, `membros`. **Espaço** (`ESPACOS_DIR`,
  `data/espacos/<id>.db`, um por espaço): tudo o resto — entidades do sistema, anexos, logs dos dados, preferências,
  notificações, configurações do sistema derivado — e uma cópia LEVE dos usuários membros (sem senha). O espaço vem
  **só da sessão** (`sessoes.espaco_id`, conferido em `membros` a cada requisição pelo `resolverEspaco`); o código
  recebe `dbEspaco` (proxy que aponta para o banco do espaço da requisição via AsyncLocalStorage e dá erro fora de
  um espaço). Nunca abrir banco de espaço "na mão": `abrirEspaco(id)`/`comEspaco(id, fn)` (`server/src/espacos/`).
  Migrações: `migracoesDe('plataforma')` = núcleo + `db/plataforma/`; `migracoesDe('espaco')` = núcleo + app.
  CRUD de `usuarios`/`perfis` vai para a plataforma (`ENTIDADES_DA_PLATAFORMA`), com usuários restritos aos membros
  do espaço. Logs: `/api/logs` = do espaço; `?origem=plataforma` = acessos/usuários/identidade (admin). Instalação
  antiga (um banco) é convertida sozinha no boot/`db:migrate` (`espacos/conversao.ts`, com backup). Teste de
  isolamento em `server/test/espacos.test.ts`: toda rota/fonte/relatório nova entra na varredura automaticamente.
- **Acesso a dados só via Knex** (nada de SQL específico de um banco). Datas gravadas pela aplicação
  como texto local `YYYY-MM-DD HH:MM:SS` (`server/src/utils/time.ts`). Booleanos passam por `toDbValue`.
- **Postgres × SQLite (Fase 6A, `db/knex.ts`, `db/conexao.ts`):** espaço = schema (`createPgDb(url, schema)` com
  `search_path` só nele) ou arquivo. Regras para o código rodar nos dois: INSERT que precisa do id → `inserir(qb, linha)`
  (o Postgres só devolve com RETURNING); busca de texto → `likeOp(db)` (ilike); data vinda da URL → `dataValida`
  (o Postgres recusa 2026-11-31); booleano lido do banco → `!!v` (0/1 × true/false; a API já devolve true/false);
  `numeric`/`count` chegam como número e `date` como texto (parsers em `knex.ts`); listar tabelas → `listarTabelas`.
  Backup do espaço: arquivo (SQLite) ou JSON (Postgres) — `gerarBackup`. Cópia SQLite → Postgres: `db/paraPostgres.ts`.
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
- **Fonte e tamanho:** `fonte` é configuração do sistema (`lib/fontes.ts` carrega só a escolhida e define `--font`;
  `propria` = arquivos enviados em `POST /api/settings/fonte/:peso`, guardados em `configuracoes` e servidos em GET público);
  `tamanho_texto` é do usuário → `data-texto` no `<html>` muda o tamanho base. Medidas em `rem`, nunca `px`
  (exceto bordas/sombras), para acompanhar o tamanho do texto.
- **Mês:** telas por mês usam `components/MonthPicker` (valor `'AAAA-MM'`, helpers em `lib/meses.ts`); o período
  das listagens (`PeriodNav`) já usa. O período escolhido vale para a navegação toda (`lib/periodoGlobal.ts`:
  `periodoPadrao`/`mesPadrao`/`guardarMes`; limpo no login/logout). Campo `type: 'image'`: data URL reduzida no navegador (`lib/imagem.ts`).
- **Configurações do sistema derivado:** `shared/src/app/settings.ts` (`appSettings`) → seção própria na tela de
  Configurações; servidor `getAppSetting(db, chave)` (`services/settings.ts`), front `useAppSettings()`.
- **Segredos** (SMTP, tokens) vão no `.env`, nunca na tabela de configurações nem no git.
- **Acesso:** toda rota de `/api` exige login, exceto `/api/health`, `/api/settings/publicas`, `/api/settings/fonte/:peso` e `/api/auth/*`
  (ordem em `app.ts`: helmet → originGuard → authenticate → públicas → requireAuth → system → CRUD).
  Sessão em cookie `sid` httpOnly; tabela `sessoes` guarda só o hash do token. Senhas: scrypt
  (`server/src/auth/password.ts`), política em `passwordSchema` (shared). `requireAuth` bloqueia com
  403 `code: TROCAR_SENHA` quem precisa trocar a senha.
- **Permissões:** `shared/src/permissions.ts` — recursos = entidades + `SYSTEM_RESOURCES`; `can(user, recurso, ação)`
  usado no servidor (`assertCan`/`requirePermission`) e no front (`useAuth().can`). O CRUD genérico já checa
  ver/criar/editar/excluir; rota nova de sistema precisa de `requirePermission` (rota que GRAVA nunca com `'ver'`:
  o leitor passaria). `ADMIN_ONLY` reserva ações a administradores (gerenciar perfis). Itens de menu usam
  `perm: [recurso, ação]`. **Papel no espaço (Fase 5B)** × perfil: dono pode tudo no espaço (inclusive `membros`,
  `backup`, `configuracoes`); editor segue o perfil (`admin` ou `completo` = todos os dados); leitor só `ver`.
  `usuarios`/`perfis` e a identidade visual (`requireAdmin`) são da plataforma: só o perfil decide.
- **Membros e convites (Fase 5B):** `services/membros.ts` + `routes/membros.ts` (`/api/membros`, `/api/espaco`,
  `/api/espacos`, sempre no espaço da sessão) e públicos `/api/auth/convites/:token[/aceitar]`. Convite: hash do token
  em `convites` (plataforma), 7 dias, uma vez, só o e-mail convidado; conta nova recebe o perfil `completo` ("Membro").
  Todo espaço com ao menos um dono ativo. Mudanças no log do espaço (`entidade: 'membros'`). Web: `pages/Membros.tsx`,
  `pages/auth/AceitarConvite.tsx` (`/convite/:token`), seletor/novo espaço no `Topbar` (`lib/espacos.ts`: trocar
  recarrega o app).
- **Plataforma, suporte e 2FA (Fase 5C):** `routes/plataforma.ts` (`/api/plataforma*`, `requireAdmin`, montado ANTES do
  `resolverEspaco`; só metadados). Suporte: `espacos/suporte.ts` — liberação do dono em `acessos_suporte` (prazo,
  leitor/editor), sessão com `sessoes.suporte_id`; o `resolverEspaco` valida a liberação a cada requisição e põe
  `(suporte)` no nome (logs). Trocar de espaço (`definirEspacoDaSessao`) encerra o suporte. Admin que não é membro
  loga no espaço com `id: null` (não há cópia dele lá). 2FA: `auth/totp.ts` (RFC 6238) + `services/doisFatores.ts`;
  login com 2FA devolve `{ segundo_fator, desafio }` e a sessão vem em `POST /api/auth/2fa/entrar`;
  `ADMIN_2FA_OBRIGATORIO` (padrão: produção) → 403 `CONFIGURAR_2FA` até configurar. Colunas `segredo_*` nunca saem
  da API (`present` remove). `aoAbrirEspaco(fn)`: gancho ao abrir cada banco de espaço (a demonstração usa).
- **Espaço modelo (0.22.0):** `espacos.modelo` (um só, marcado na Plataforma). O sistema registra o que se copia dele
  com `registrarCopiaDoModelo` (`espacos/index.ts`): roda ao criar espaço (`novo: true`) e quando o dono pede
  (`POST /api/espaco/modelo`, `components/TrazerDoModelo.tsx`; nunca sobrescrever o que o espaço personalizou).
  Só cadastros de referência — nunca movimentos.
- **Cadastro, LGPD e feedback (Fase 5D):** `services/conta.ts`. Cadastro (`POST /api/auth/cadastro`): fechado por
  padrão (`cadastro_aberto` nas configurações, público); com convite da plataforma (`convites_plataforma`, criados no
  painel) entra direto como dono do próprio espaço; aberto → `usuarios.confirmar_email` + `tokens_email` (24 h), login
  dá 403 `EMAIL_NAO_CONFIRMADO` até `POST /api/auth/cadastro/confirmar`. Aceite dos termos gravado
  (`termos_aceitos_em`/`termos_versao`, `TERMOS_VERSAO` em `shared/src/legal.ts`; textos em `web/src/pages/legal/`).
  `POST /api/auth/meus-dados` (JSON) e `POST /api/auth/excluir-conta` (espaços de que é a única dona →
  `excluirEspaco`: banco em `espacos-excluidos/`, `espacos_excluidos`, apagado de vez em 30 dias pela manutenção).
  `POST /api/feedback` (qualquer logado) → `feedbacks`, lido em Plataforma → Feedback.
- **Hooks** (núcleo em `server/src/hooks/`, aplicação registrada em `server/src/app/hooks.ts`): `beforeSave`/`afterSave`/`beforeDelete` por entidade; lançar `HttpError`
  (`badRequest`, `forbidden`, `conflict` de `utils/http.ts`). Regras de usuários e perfis estão lá (e-mail único,
  sempre um admin ativo, só admin gerencia admin, derrubar sessões).
- **Campos especiais:** `password` nunca sai da API (removido em `present()` no CRUD), não é filtrável/ordenável,
  vai para o banco como hash e para o log só como "(alterada)". `permissions` é JSON normalizado.
- **Coluna da relação (0.26.0):** campo com `deRelacao: { relacao, campo }` = coluna só de listagem vinda do registro
  relacionado (não é gravada; fora do diff, do formulário e da importação). `relation` com `search: true` busca no
  nome e nos campos de busca do relacionado.
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
  Relação pelo nome (`labelField`; nome repetido = erro) ou pelos campos de `chavesImportacao` da entidade apontada.
  Texto de PDF em linhas: `services/pdf.ts` (`linhasPdf`, via `unpdf`).
- **Telas plugáveis:** `web/src/lib/screens.ts` (`registerScreens`, `registerPage`), registradas em
  `web/src/app/screens.ts`; rotas em `pages/EntityRoutes.tsx`. `CrudList`/`CrudForm` aceitam `entity` e slots
  (`CrudList`: `before`, `actions`, `onAlterado`; `CrudForm`: `after`, `campos` — campo desenhado pelo sistema —, `ocultar`).
- **Módulo de demonstração:** `shared/src/demo/`, `server/src/demo/setup.ts`, `web/src/demo/menu.ts`; ligado por
  `DEMO=true` no `.env` (o Vite lê o mesmo arquivo e define `__DEMO__`). Tabelas `demo_*` fora das migrações.
  Telas próprias de exemplo em `web/src/demo/pages.tsx`.
- **Painéis e relatórios (Fase 4):** fontes de dados `registerDados(nome, { perm, carregar })` e conjuntos
  `registerConjunto(nome, { dimensoes, carregar, link, sentido })` em `services/paineis.ts`, registrados pelo sistema em
  `server/src/app/paineis.ts` (`registrarPaineis`); rotas em `routes/paineis.ts` (`/api/dados/:nome`,
  `/api/relatorios[/:nome]`, `/api/preferencias/:chave`). Web: `<PainelWidgets>` (`components/painel/`, tipos em
  `lib/paineis.ts`) e a tela `/relatorios/:conjunto` (`pages/Relatorio.tsx`). Gráficos sem cor própria usam
  `--serie-1..8`. Exemplo completo no módulo de demonstração (`server/src/demo/paineis.ts`, `web/src/demo/painel.tsx`).
- **Notificações (Fase 4C):** o sistema registra tipos de alerta com `registerAlerta(tipo, { perm, gerar })`
  (`services/notificacoes.ts`, normalmente em `server/src/app/paineis.ts`); `gerar(db, { hoje })` devolve avisos com
  `chave` única (inclua no texto da chave o que torna o aviso único: id, mês, data). Uma notificação por usuário e
  chave (tabela `notificacoes`); verificação na manutenção diária (+ resumo por e-mail para quem pediu) e ao abrir o
  sino (10 min). Web: `components/Sino.tsx`, `pages/Notificacoes.tsx`, ajudantes em `lib/notificacoes.ts`.
- **Tarefas diárias (0.24.0):** `registrarTarefaDiaria({ nome, horarios: ['HH:MM'], executar })` (`services/agenda.ts`),
  registrada pelo sistema em `server/src/app/`; roda fora de um espaço (percorra `idsEspacosAtivos()` + `comEspaco`).
- **Logs:** `addLog(db, entrada, actor)` com `diffRecord()` → coluna `alteracoes` `{ campo: { de, para } }`.
- **Front:** `AuthContext` (`useAuth`), `RouteGuards` (`RequireAuth`, `PublicOnly`, `Guard`). A camada `lib/api.ts`
  dispara eventos em 401/TROCAR_SENHA. Relações no form usam `GET /api/:entidade/opcoes` (liberado a qualquer logado).

## Testes

- Vitest em cada workspace. API testada com Supertest sobre SQLite em memória (`server/test/helpers.ts`):
  `ctx.db` = banco do espaço de teste (dados), `ctx.plataforma` = usuários, sessões, perfis, identidade.
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
