# CLAUDE.md — contexto do projeto para o Claude Code

## O que é
Frame genérico de aplicação web responsiva (menu, CRUD, dashboard) que servirá de base
para outros sistemas. Primeiro produto em cima dele: gestão de finanças pessoais.
Interface e textos em português do Brasil.

## Stack
- Front: React 19 + Vite, react-bootstrap (Bootstrap 5), Bootstrap Icons, Chart.js, react-router-dom 7
- Back: Node.js + Express 5 (ESM), better-sqlite3
- Banco: SQLite em `server/data/app.db`

## Comandos
- `npm run setup` — instala tudo
- `npm run dev` — API em :3001 + Vite em :5173 (proxy /api → 3001)
- `npm run seed:reset` — recria o banco com dados de exemplo
- `npm run build` — build do front

## Arquitetura (importante)
- O sistema é **dirigido por configuração**. `server/src/entities.js` é a fonte da verdade:
  define tabelas, validações, rotas CRUD e as telas genéricas do front (via `/api/meta`).
- Para nova entidade: adicionar em `entities.js` + item em `web/src/config/menu.js`.
  Não criar telas específicas a menos que a genérica não atenda.
- Telas genéricas: `web/src/pages/CrudList.jsx` e `CrudForm.jsx`; inputs em `components/FieldInput.jsx`.
- Rotas de sistema (dashboard, logs, backup, meta) ficam em `server/src/routes/system.js`,
  registradas antes do CRUD genérico.
- Migração: tabelas e colunas novas são criadas no boot. Renomear/remover coluna exige migração manual.
- Identidade visual (nome, ícone/logo, cores, dados da organização, retenção de logs) é editada
  na tela de Configurações e salva na tabela `configuracoes` (`server/src/settings.js`, `/api/settings`).
  O front aplica via `web/src/lib/theme.js` nas variáveis CSS `--brand-*`. Nunca usar cores de marca
  fixas no CSS: use `var(--brand-1)`, `var(--brand-2)`, `rgba(var(--brand-1-rgb), x)`.
- Segredos (SMTP, tokens de API) vão em `.env`, nunca na tabela de configurações.

## Convenções
- Nomes de tabelas/campos em português, snake_case (`cliente_id`, `criado_em`).
- Relacionamentos: campo `xxx_id` com `type: 'relation'` e `entity`; a API devolve `xxx_id__label`.
- Mensagens de erro da API: `{ error, errors: { campo: mensagem } }` com status 422 para validação.
