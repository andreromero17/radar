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

Acesso de exemplo criado pelo setup (**só para desenvolvimento**): `admin@sistema.com` / `admin123`.

Para parar: `Control + C` no terminal.

## 3. Comandos

| Comando                            | O que faz                                               |
| ---------------------------------- | ------------------------------------------------------- |
| `npm run dev`                      | Desenvolvimento com recarga automática (API + front)    |
| `npm run check`                    | Lint + formatação + tipos + testes, tudo de uma vez     |
| `npm test`                         | Testes (shared, server e web)                           |
| `npm run lint` / `npm run format`  | ESLint / formata o código com Prettier                  |
| `npm run typecheck`                | Checagem de tipos do TypeScript                         |
| `npm run db:migrate`               | Aplica migrações pendentes                              |
| `npm run db:rollback`              | Desfaz o último lote de migrações                       |
| `npm run db:status`                | Lista migrações aplicadas e pendentes                   |
| `npm run db:diff -- descricao`     | Gera a migração a partir das entidades (ver seção 5)    |
| `npm run db:seed`                  | Dados de exemplo (só se o banco estiver vazio)          |
| `npm run db:reset`                 | **Apaga tudo**, recria e popula (bloqueado em produção) |
| `npm run db:admin -- email "Nome"` | Cria/recupera um administrador com senha provisória     |
| `npm run build` + `npm start`      | Produção: Express servindo API + front na porta 3001    |

## 4. Estrutura: núcleo × aplicação

O frame tem duas camadas. O **núcleo** é igual em todo sistema: login, usuários, perfis, logs, backup e configurações.
A **aplicação** é o negócio do sistema construído em cima dele. Para criar um sistema novo, você só mexe nas pastas
`app/`. O frame vem com elas vazias.

```
frame-app/
├── shared/src/
│   ├── app/                ★ APLICAÇÃO: entities.ts (cadastros), info.ts (nome e versão do sistema)
│   ├── core/entities.ts    núcleo: usuários e perfis
│   ├── entities.ts         registro = aplicação + núcleo
│   ├── schema.ts           validação Zod gerada das entidades (form + API)
│   ├── permissions.ts      recursos, ações e can() (servidor e front)
│   └── settings.ts         configurações: padrões e validação
├── server/
│   ├── .env.example        variáveis de ambiente (copiado para .env no setup)
│   └── src/
│       ├── app/            ★ APLICAÇÃO: hooks.ts, routes.ts, seed.ts, migrations/
│       ├── auth/           senhas, sessões, middleware de login/permissão
│       ├── db/             Knex, migrador, migrações do núcleo, diff, seed, CLI
│       ├── hooks/          regras do núcleo (usuários, perfis)
│       ├── routes/         auth, CRUD genérico e rotas de sistema
│       ├── services/       logs, configurações, backup, e-mail
│       ├── app.ts          monta o Express (usado também nos testes)
│       └── index.ts        boot: migrações, manutenção, listen
├── web/src/
│   ├── app/                ★ APLICAÇÃO: menu.ts, dashboard.tsx, screens.ts
│   ├── config/menu.ts      menu = Dashboard + aplicação + Administração
│   ├── layout/             Sidebar (com "+ Novo" e versão), Topbar, Layout
│   ├── pages/              Dashboard, CrudList, CrudForm, MeuPerfil, Logs, Backup, auth/
│   └── components/         FieldInput, PermissionMatrix, SettingsModal...
├── .github/workflows/      CI (lint, tipos, testes, build a cada push)
├── docs/app/               ★ APLICAÇÃO: README, CHANGELOG e CLAUDE.md do sistema
├── CHANGELOG.md            o que mudou em cada versão do frame
├── CLAUDE.md               contexto do frame para o Claude Code (importa docs/app/CLAUDE.md)
└── ROADMAP.md              fases do frame
```

### Criar um sistema a partir do frame

Cada sistema é um repositório próprio, copiado do frame **com o histórico**, que continua recebendo as melhorias dele.
Como o sistema só mexe nas pastas `app/` (marcadas com ★) e em `docs/app/`, as atualizações do frame entram sem
conflito.

```bash
# uma vez: repositório vazio criado no GitHub (ex.: financas)
git clone git@github.com:andreromero17/frame-app.git financas && cd financas
git remote rename origin upstream
git remote add origin git@github.com:andreromero17/financas.git
git push -u origin main

# sempre que o frame tiver novidade
git pull upstream main
npm install          # se mudou dependência
npm run dev          # migrações novas do núcleo são aplicadas sozinhas
```

Regras para não brigar com o frame:

- **Mudança no núcleo nasce no frame-app** (PR lá) e desce para o sistema com `git pull upstream main`. No sistema,
  só regra de negócio.
- No sistema, edite apenas `*/src/app/`, `docs/app/` e o `server/.env`. O `package.json` da raiz guarda a versão do
  frame: a do sistema fica em `shared/src/app/info.ts` (`{ nome: 'Finanças', versao: '0.1.0' }`), que aparece no
  menu com a do frame no tooltip.
- Dependência nova do sistema: pode adicionar no `package.json` do workspace; se o frame mexer no mesmo arquivo, o
  conflito é pequeno e óbvio.
- Migrações do sistema ficam em `server/src/app/migrations/` (o `db:diff` grava lá); as do núcleo, em
  `server/src/db/migrations/`. As duas listas rodam juntas, em ordem de data.

## 5. Criar uma entidade nova (ex.: `contas`)

**1. Descreva a entidade** em `shared/src/app/entities.ts`:

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
npm run db:diff -- cria contas   # gera server/src/app/migrations/<data>_cria_contas.ts
npm run db:migrate
```

**3. Coloque no menu**, em `web/src/app/menu.ts`:

```ts
{ label: 'Contas', icon: 'bank', to: '/contas', perm: ['contas', 'ver'] },
```

Pronto. A entidade ganha API REST, validação (no form e na API), listagem com busca, filtros, ordenação, exportação e ações em lote, formulário e log de alterações.

Tipos de campo: `text`, `email`, `textarea`, `number`, `money`, `percent`, `date`, `datetime`, `select`,
`multiselect`, `boolean`, `relation`, `document` (CPF/CNPJ), `phone`, `color`, `password` e `permissions`.

Opções úteis:

| Onde     | Opção                                         | O que faz                                                                                      |
| -------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| campo    | `section: 'Contato'`                          | agrupa o formulário em seções                                                                  |
| campo    | `min` / `max`                                 | limites de `number`, `money` e `percent`                                                       |
| campo    | `signColors: true`                            | valor negativo em vermelho, positivo em verde                                                  |
| campo    | `total: 'sum'`                                | soma na linha de totais da listagem (e no Excel)                                               |
| campo    | `filter: true/false`                          | mostra ou esconde no painel de filtros (padrão: select, multiselect, boolean, relação e datas) |
| campo    | `docType: 'cpf' \| 'cnpj' \| 'cpf_cnpj'`      | o que o campo `document` aceita                                                                |
| campo    | `dependsOn: { field: 'tipo' }`                | relação filtrada pelo valor de outro campo (ex.: categoria conforme o tipo)                    |
| entidade | `lixeira: true`                               | excluir envia para a lixeira (restaurável); cria a coluna `excluido_em`                        |
| entidade | `periodField: 'data'`                         | seletor de mês na listagem, que abre no mês atual                                              |
| entidade | `defaultSort: { field: 'data', dir: 'desc' }` | ordem padrão da listagem                                                                       |
| entidade | `group: 'Financeiro'`                         | grupo na matriz de permissões                                                                  |
| entidade | `details: [{ entity, field, sum, min }]`      | sub-tabelas gravadas junto (master-detail) — veja abaixo                                       |
| entidade | `detailOf: 'pedidos'`                         | a entidade é sub-tabela de outra (segue as permissões do pai)                                  |
| entidade | `anexos: true`                                | arquivos anexados a cada registro                                                              |
| entidade | `importar: false`                             | desliga a importação de planilha (ligada por padrão, exceto núcleo e sub-tabelas)              |
| entidade | `activeField: 'ativa'`                        | inativos somem dos selects de outros cadastros (continuam nos filtros)                         |
| campo    | `default: 'hoje'` / `'agora'`                 | data de hoje / data e hora atuais ao criar                                                     |
| campo    | `compute: (v) => ...`                         | campo calculado (somente leitura): a tela mostra e a API grava                                 |

Filtros também funcionam pela URL (dá para fazer links prontos): `?tipo=Despesa&tipo=Receita`,
`?data__de=2026-11-01&data__ate=2026-11-30`, `?valor__de=100`, `?descricao__contem=luz`.

**Sub-tabelas (master-detail).** Um registro pode ter linhas filhas editadas no mesmo formulário e gravadas
juntas (tudo ou nada): orçamento → itens, lançamento → parcelas. A entidade das linhas tem `detailOf` e um campo
`relation` para o pai; o pai declara a sub-tabela e, se quiser, as somas que recebe:

```ts
orcamentos: {
  /* ... */
  details: [{ entity: 'orcamento_itens', field: 'orcamento_id', label: 'Itens', min: 1, sum: { total: 'valor' } }],
},
orcamento_itens: {
  /* ... */ detailOf: 'orcamentos',
  fields: [
    { name: 'orcamento_id', label: 'Orçamento', type: 'relation', entity: 'orcamentos', required: true },
    { name: 'quantidade', label: 'Qtd.', type: 'number', required: true },
    { name: 'preco', label: 'Preço', type: 'money', required: true },
    { name: 'valor', label: 'Valor', type: 'money', compute: (v) => Number(v.quantidade) * Number(v.preco) },
  ],
},
```

A API devolve as linhas em `GET /api/orcamentos/:id` (`{ ..., orcamento_itens: [...] }`) e recebe do mesmo jeito no
POST/PUT: linha com `id` é atualizada, sem `id` é criada, e a que sumiu da lista é apagada. Sem a lista no corpo, as
linhas não mudam. Excluir o pai de vez leva as linhas junto (a chave é criada com `ON DELETE CASCADE`).

**Anexos.** Com `anexos: true`, o formulário de edição ganha o quadro "Anexos" (enviar, arrastar, baixar, excluir).
Os arquivos ficam em `server/data/anexos/` (`UPLOAD_DIR`), com nome aleatório; o limite é `UPLOAD_MAX_MB` (10 MB).
PDF e imagens abrem no navegador, o resto sempre baixa. **O backup da tela copia só o banco: copie a pasta de anexos
junto.**

**Importar planilha.** Na listagem, o menu **Planilha → Importar** aceita `.xlsx` ou `.csv` (separador `;` ou `,`).
As colunas são ligadas aos campos pelo nome (dá para trocar), a prévia mostra os erros linha a linha e só as linhas
válidas entram, com as mesmas regras do cadastro. Entende `1.234,56`, `31/12/2026`, `Sim/Não` e o nome dos registros
relacionados ("Mercado" em vez do id). Tem planilha modelo com instruções.

**Telas próprias.** Se a tela genérica não atende, registre outra em `web/src/app/screens.ts`:

```ts
registerScreens('lancamentos', { list: LancamentosComSaldo }); // troca a listagem (ou o form: `form`)
registerPage({ path: 'relatorios/fluxo', component: Fluxo, perm: ['lancamentos', 'ver'] }); // página nova
```

A tela própria pode reaproveitar a genérica: `<CrudList entity="lancamentos" before={<Saldo />} />` ou
`<CrudForm entity="lancamentos" after={...} />`. Exemplos funcionando em `web/src/demo/pages.tsx`.

**Módulo de demonstração.** Com `DEMO=true` no `server/.env`, o sistema ganha o grupo "Demonstração" (clientes,
categorias, movimentos, orçamentos com itens e um resumo por categoria) mostrando todos esses recursos. As tabelas `demo_*` são criadas e populadas no
boot, fora das migrações; tirar a linha do `.env` esconde o módulo. As definições ficam em `shared/src/demo/`.

A entidade nova entra sozinha na matriz de permissões. Libere-a nos perfis (o administrador já tem acesso). No menu, use `perm: ['contas', 'ver']` para esconder o item de quem não pode ver.

Regras que não cabem na definição (ex.: "não excluir se estiver em uso", "recalcular saldo") ficam em hooks (`beforeSave`, `afterSave`, `beforeDelete`) registrados em `server/src/app/hooks.ts`. Os do núcleo, em `server/src/hooks/`, servem de exemplo. Rotas especiais (relatórios, ações) vão em `server/src/app/routes.ts`, e dados de exemplo em `server/src/app/seed.ts`.

A entidade nova também aparece sozinha no botão **"+ Novo"** e no dashboard genérico. Para um painel próprio, exporte um componente em `web/src/app/dashboard.tsx`.

> O `db:diff` gera só **tabelas e colunas novas**. Renomear ou remover coluna nunca é automático, para não perder dado. Ele avisa e você escreve essa parte à mão na migração (`t.renameColumn` / `t.dropColumn`). Migração já aplicada não se edita: crie outra.

## 6. Acesso e permissões

**Login** por e-mail e senha, com sessão em cookie `httpOnly` (o token fica em hash no banco). A sessão expira após `SESSION_HOURS` sem uso. Com "manter conectado", dura `REMEMBER_DAYS`.

**Perfis de acesso** (Administração → Perfis de acesso) definem o que cada usuário pode fazer, numa matriz recurso × ação:

- Recursos são as entidades (Ver / Criar / Editar / Excluir) e as áreas do sistema (Logs, Backup, Configurações).
- Um perfil com **acesso total** é administrador.
- Só administradores criam ou alteram perfis e mexem em usuários administradores. Assim ninguém consegue se autopromover.
- O sistema nunca fica sem ao menos um administrador ativo.
- Mudanças de permissão valem na hora, sem novo login.

**Senhas:**

- Hash com scrypt e política única no form e na API: 8+ caracteres, com letras e números.
- Ao criar um usuário, o admin define uma senha provisória e pode exigir a troca no primeiro acesso.
- "Esqueci minha senha" envia um link de uso único, válido por 1 hora.
- Trocar ou redefinir a senha encerra as outras sessões. Desativar um usuário derruba as sessões dele na hora.

**E-mail:** configure `SMTP_*` no `server/.env`. Sem SMTP, o e-mail (com o link) aparece no terminal do `npm run dev`.

**Primeiro acesso em produção:** não existe seed. Crie o administrador com:

```bash
npm run db:admin -- voce@empresa.com "Seu Nome"   # mostra uma senha provisória
```

O mesmo comando recupera o acesso se você esquecer a senha do admin.

**Logs:** cada ação registra quem fez, de onde (IP) e o antes/depois de cada campo alterado. Clique na linha para ver. Senhas nunca vão para o log.

**Proteções:** cabeçalhos de segurança (helmet/CSP), bloqueio de requisições de outros sites (CSRF), limite de tentativas de login (5 erros por e-mail em 15 min) e mensagens que não revelam quais e-mails existem.

**Meu perfil** (menu do usuário): editar o próprio nome, alterar a senha e ver as sessões abertas em outros dispositivos, com a opção de encerrá-las.

## 7. Configurações do sistema

No menu do usuário → **Configurações** (precisa da permissão "Configurações: Editar"):

- **Identidade:** nome do sistema, ícone ou logo.
- **Cores:** 6 paletas prontas ou cores próprias.
- **Organização:** dados exibidos no rodapé.
- **Menu e ajuda:** estilo do menu (colorido ou claro) e link da Central de Ajuda (opcional).
- **Manutenção:** por quantos dias manter os logs.

Tudo fica salvo no banco e é aplicado na hora. A identidade visual também aparece na tela de login.

## 8. Versão

O rodapé do menu mostra a versão (ex.: `v0.3.0 · 30ffc90`): o número vem do `package.json` da raiz, e o código é o commit do git. A API informa a mesma coisa em `/api/health`. Em produção, se o servidor for atualizado com o sistema aberto no navegador, aparece o aviso "Há uma nova versão" com um botão para recarregar. Ao lançar uma versão, atualize o número em `package.json` e registre as mudanças no `CHANGELOG.md`.

Segredos (SMTP, tokens de API) **não** vão nessa tela. Ficam em `server/.env`, que está fora do git.

## 9. Qualidade

- **Pre-commit:** ESLint + Prettier nos arquivos alterados. Commit com erro de lint é bloqueado.
- **CI (GitHub Actions):** lint, formatação, tipos, testes, build e migração do zero, em Node 22 e 24.
- **Padrão de commits:** `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
