# Frame App

Frame genérico para sistemas web responsivos. Traz navegação, CRUD dirigido por configuração, dashboard, logs, backup e tela de configurações (nome, cores, logo). É o ponto de partida para vários sistemas; o primeiro será **gestão de finanças pessoais**. Veja o [ROADMAP](ROADMAP.md).

**Stack:** TypeScript · React 19 + Vite · Bootstrap 5 · Node.js + Express 5 · Knex + SQLite · Zod · Vitest

---

## 1. Preparar o Mac (uma vez só)

```bash
xcode-select --install                     # git e ferramentas da Apple
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install nvm && mkdir -p ~/.nvm        # siga as linhas que o brew imprimir para o ~/.zshrc
nvm install --lts                          # Node 22 ou superior
brew install --cask visual-studio-code db-browser-for-sqlite
```

Ao abrir a pasta no VS Code, aceite instalar as extensões recomendadas: ESLint, Prettier, SQLite Viewer e Claude Code.

## 2. Rodar

```bash
npm run setup   # instala, cria server/.env, cria o banco (migrações) e popula com exemplos
npm run dev     # API em :3001 + front em :5173 (abre o navegador)
```

## 3. Comandos

| Comando                           | O que faz                                               |
| --------------------------------- | ------------------------------------------------------- |
| `npm run dev`                     | Desenvolvimento com recarga automática (API + front)    |
| `npm run check`                   | Lint + formatação + tipos + testes, tudo de uma vez     |
| `npm test`                        | Testes (shared, server e web)                           |
| `npm run lint` / `npm run format` | ESLint / formata o código com Prettier                  |
| `npm run typecheck`               | Checagem de tipos do TypeScript                         |
| `npm run db:migrate`              | Aplica migrações pendentes                              |
| `npm run db:rollback`             | Desfaz o último lote de migrações                       |
| `npm run db:status`               | Lista migrações aplicadas e pendentes                   |
| `npm run db:diff -- descricao`    | Gera a migração a partir das entidades (ver seção 5)    |
| `npm run db:seed`                 | Dados de exemplo (só se o banco estiver vazio)          |
| `npm run db:reset`                | **Apaga tudo**, recria e popula (bloqueado em produção) |
| `npm run build` + `npm start`     | Produção: Express servindo API + front na porta 3001    |

## 4. Estrutura

```
frame-app/
├── shared/                 Código usado pelo server E pelo web
│   └── src/
│       ├── entities.ts     ★ definição das entidades (fonte da verdade)
│       ├── schema.ts       validação Zod gerada das entidades (form + API)
│       ├── settings.ts     configurações: padrões e validação
│       └── types.ts        tipos compartilhados
├── server/                 API
│   ├── .env.example        variáveis de ambiente (copiado para .env no setup)
│   ├── src/
│   │   ├── config.ts       lê e valida o .env
│   │   ├── app.ts          monta o Express (usado também nos testes)
│   │   ├── index.ts        boot: migrações, limpeza de logs, listen
│   │   ├── db/             Knex, migrador, migrações, diff, seed, CLI
│   │   ├── routes/         CRUD genérico e rotas de sistema
│   │   └── services/       regras: logs, configurações, backup
│   └── test/               testes da API (SQLite em memória)
├── web/                    Front React
│   ├── src/
│   │   ├── config/menu.ts  ★ menu lateral
│   │   ├── layout/         Sidebar, Topbar, Layout
│   │   ├── pages/          Dashboard, CrudList, CrudForm, Logs, Backup
│   │   ├── components/     FieldInput, SettingsModal, StatCard...
│   │   └── lib/            api, tema, formatação
│   └── test/
├── .github/workflows/      CI (lint, tipos, testes, build a cada push)
├── CLAUDE.md               contexto do projeto para o Claude Code
└── ROADMAP.md              fases do frame
```

## 5. Criar uma entidade nova (ex.: `contas`)

**1. Descreva a entidade** em `shared/src/entities.ts`:

```ts
contas: {
  label: 'Contas', singular: 'Conta', icon: 'bank', labelField: 'nome',
  fields: [
    { name: 'nome', label: 'Nome', type: 'text', required: true, list: true, search: true },
    { name: 'tipo', label: 'Tipo', type: 'select', options: ['Corrente', 'Poupança', 'Cartão'], list: true },
    { name: 'saldo_inicial', label: 'Saldo inicial', type: 'money', list: true },
  ],
},
```

**2. Gere e aplique a migração:**

```bash
npm run db:diff -- cria contas   # gera server/src/db/migrations/<data>_cria_contas.ts
npm run db:migrate
```

**3. Coloque no menu**, em `web/src/config/menu.ts`:

```ts
{ label: 'Contas', icon: 'bank', to: '/contas' },
```

Pronto. A entidade ganha API REST, validação (no form e na API), listagem com busca, filtros e paginação, formulário e log de alterações.

Tipos de campo: `text`, `email`, `textarea`, `number`, `money`, `date`, `select`, `boolean`, `relation`.

> O `db:diff` gera só **tabelas e colunas novas**. Renomear ou remover coluna nunca é automático, para não perder dado. Ele avisa e você escreve essa parte à mão na migração (`t.renameColumn` / `t.dropColumn`). Migração já aplicada não se edita: crie outra.

## 6. Configurações do sistema

No menu do usuário → **Configurações**: nome, ícone ou logo, cores (6 paletas prontas), dados da organização (rodapé) e por quantos dias manter os logs. Tudo fica salvo no banco e é aplicado na hora.

Segredos (SMTP, tokens de API) **não** vão nessa tela. Ficam em `server/.env`, que está fora do git.

## 7. Qualidade

- **Pre-commit:** ESLint + Prettier nos arquivos alterados. Commit com erro de lint é bloqueado.
- **CI (GitHub Actions):** lint, formatação, tipos, testes, build e migração do zero, em Node 22 e 24.
- **Padrão de commits:** `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
