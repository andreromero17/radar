# Frame App — navegação + CRUD + dashboard

Frame genérico para sistemas web responsivos. Ponto de partida para outros sistemas
(o primeiro será **gestão de finanças pessoais**).

**Stack:** React 19 + Vite · Bootstrap 5 (react-bootstrap) + Bootstrap Icons · Chart.js ·
Node.js + Express 5 · SQLite (better-sqlite3)

---

## 1. Preparar o Mac (uma vez só)

```bash
# Ferramentas de linha de comando da Apple (git, compiladores)
xcode-select --install

# Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node.js LTS via nvm
brew install nvm
mkdir -p ~/.nvm
# siga as 2-3 linhas que o brew imprimir para adicionar o nvm ao ~/.zshrc, depois:
nvm install --lts
node -v   # deve mostrar v22+ ou superior

# Opcionais, mas recomendados
brew install --cask visual-studio-code db-browser-for-sqlite
```

Extensões úteis no VS Code: **ESLint**, **Prettier**, **SQLite Viewer** e a extensão do **Claude Code**.

## 2. Rodar o projeto

```bash
cd frame-app
npm run setup     # instala dependências da raiz, do server e do web
npm run dev       # sobe API (3001) + front (5173) e abre o navegador
```

- Front: http://localhost:5173
- API: http://localhost:3001/api (ex.: `/api/meta`, `/api/dashboard`, `/api/clientes`)
- Banco: `server/data/app.db` — criado e populado automaticamente na primeira execução

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm run seed:reset` | Apaga o banco e recria com dados de exemplo (pare o `dev` antes) |
| `npm run build` | Gera o front otimizado em `web/dist` |
| `npm start` | Sobe só o Express, servindo API + front buildado na porta 3001 |

## 3. Estrutura

```
frame-app/
├── server/                     API Node + SQLite
│   ├── src/entities.js         ★ definição das entidades (gera tabelas, API e telas)
│   ├── src/db.js               conexão, migração automática, logs
│   ├── src/settings.js         configurações padrão, validação, limpeza de logs
│   ├── src/seed.js             dados de exemplo
│   ├── src/routes/crud.js      CRUD genérico /api/:entity
│   ├── src/routes/system.js    meta, dashboard, logs, backup
│   └── data/app.db             banco (fora do git)
└── web/                        Front React + Bootstrap
    └── src/
        ├── config/menu.js      ★ menu lateral
        ├── lib/theme.js        aplica cores/título/favicon das Configurações
        ├── layout/             Sidebar, Topbar, Layout (responsivo)
        ├── pages/              Dashboard, CrudList, CrudForm, Logs, Backup
        ├── components/         StatCard, FieldInput, ValueBadge, ConfirmModal...
        └── styles.css          tema base (layout, raio, fonte; cores via variáveis --brand-*)
```

## 4. Como o CRUD genérico funciona

Cada entidade em `server/src/entities.js` ganha automaticamente:

1. **Tabela no SQLite** (colunas novas são adicionadas sozinhas ao reiniciar)
2. **API REST**: `GET/POST /api/:entity`, `GET/PUT/DELETE /api/:entity/:id`
   com busca (`?q=`), filtros por campo (`?status=Aberto`), paginação e ordenação
3. **Telas**: lista com busca/paginação/exclusão e formulário com validação em `/:entity`, `/:entity/novo`, `/:entity/:id`
4. **Log** de criação, alteração e exclusão

Para criar uma entidade nova (ex.: `contas`):

```js
// server/src/entities.js
contas: {
  label: 'Contas', singular: 'Conta', icon: 'bank', labelField: 'nome',
  fields: [
    { name: 'nome', label: 'Nome', type: 'text', required: true, list: true, search: true },
    { name: 'tipo', label: 'Tipo', type: 'select', options: ['Corrente', 'Poupança', 'Cartão'], list: true },
    { name: 'saldo_inicial', label: 'Saldo inicial', type: 'money', list: true },
  ],
},
```

e adicionar ao menu em `web/src/config/menu.js`:

```js
{ label: 'Contas', icon: 'bank', to: '/contas' },
```

Tipos de campo: `text`, `email`, `textarea`, `number`, `money`, `date`, `select`, `boolean`, `relation`.

## 5. Configurações do sistema (identidade visual)

No menu do usuário → **Configurações**. Tudo fica salvo no banco (tabela `configuracoes`)
e é aplicado na hora, sem rebuild:

| Seção | O que controla |
|---|---|
| Identidade | Nome do sistema (menu, título da aba), ícone do Bootstrap Icons ou logo próprio (também vira favicon) |
| Cores | Cor primária (botões, links, destaques) e secundária (gradiente do menu); 6 paletas prontas |
| Organização | Nome, telefone, e-mail e endereço — exibidos no rodapé, base para relatórios |
| Manutenção | Por quantos dias manter os logs (limpeza automática diária; 0 = nunca) |

Para começar um sistema novo a partir do frame: copie a pasta, ajuste `entities.js` e `menu.js`
e defina nome/cores/logo nas Configurações. Os valores padrão ficam em `server/src/settings.js`.

> SMTP, WhatsApp e chaves de IA **não** estão nessas configurações de propósito: são segredos e
> específicos de cada sistema. Quando precisar, use variáveis de ambiente (`.env`), fora do banco e do git.

## 6. Próximos passos sugeridos

- Autenticação (login, sessão, perfis de acesso)
- Entidades de finanças: contas, categorias, lançamentos, orçamentos, metas
- Dashboard financeiro (saldo, receitas × despesas, gastos por categoria)
- Importação de extrato (OFX/CSV)
