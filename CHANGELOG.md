# Changelog

Versões do frame. O número exibido no rodapé do menu vem do `package.json` da raiz, junto com o commit do git.
Use [versionamento semântico](https://semver.org/lang/pt-BR/): **MAIOR** quebra compatibilidade, **MENOR** traz
novidades, **CORREÇÃO** só corrige.

## 0.16.0 — 12/11/2026

**Fase 5A: plataforma e espaços (base do SaaS)** — nada muda na tela; muda onde cada dado mora

- **Um banco por espaço** (`data/espacos/<id>.db`) e o banco da **plataforma** (`data/app.db`: usuários, perfis,
  sessões, identidade, `espacos`, `membros`). O espaço vem da sessão, conferido nos membros a cada requisição; o
  código do sistema usa `dbEspaco`, que sempre aponta para o banco do espaço da sessão
- **Conversão automática** da instalação antiga no primeiro boot (ou `db:migrate`): backup
  `backup-antes-dos-espacos-<data>.db`, dados no espaço 1 ("Pessoal"), plataforma sem dado do sistema, mesmos logins
- O banco do espaço não guarda senha nem sessão (cópia leve dos usuários membros, para nomes e vínculos)
- Usuários (lista, opções, detalhe, edição, lote) restritos aos membros do espaço; id de fora = 404
- `GET /api/auth/me` traz o espaço em uso e a lista; `POST /api/auth/espaco` troca (a tela vem na 5B)
- Logs: a tela mostra os do espaço; administrador vê também os da plataforma (acessos, usuários, identidade)
- Configurações do sistema derivado passam a ser **por espaço**; a identidade visual é da plataforma
- Manutenção diária roda em cada espaço (lixeira, logs, manutenção do app, alertas e e-mails)
- CLI: `db:migrate`/`status`/`rollback`/`seed`/`reset`/`admin` entendem plataforma + espaços (`ESPACOS_DIR`)
- **Teste de isolamento** (`espacos.test.ts`): com dois espaços, percorre todas as entidades (lista, opções,
  exportação, lixeira), logs, painel, backup, configurações, todas as fontes de dados, relatórios e notificações do
  espaço B procurando dados do A; tentativas por id, troca para espaço alheio, membro inativado perde acesso na hora

## 0.15.0 — 12/11/2026

**Fase 4C: notificações reais**

- **Tipos de alerta** registrados pelo sistema (`registerAlerta(tipo, { rotulo, descricao, perm, nivel, icone,
gerar })` em `server/src/services/notificacoes.ts`): cada aviso tem uma **chave**; o frame grava uma notificação
  por usuário e por chave (nova tabela `notificacoes`), então o mesmo aviso nunca se repete
- Verificação na **manutenção diária** (todos os usuários) e ao abrir o sino (no máximo a cada 10 min por usuário);
  um alerta com erro não derruba os outros
- **Sino** no topo com contador de não lidas, as últimas 8, "marcar todas como lidas"; atualiza a cada 2 min e ao
  voltar para a aba. Página **/notificacoes** (todas/não lidas) com **preferências**: liga/desliga cada tipo e
  "Receber também por e-mail" (um resumo dos avisos novos por dia; avisa quando o SMTP não está configurado)
- Rotas: `GET /api/notificacoes`, `POST /api/notificacoes/:id/lida`, `POST /api/notificacoes/lidas`,
  `GET/PUT /api/notificacoes/preferencias`. Lidas há mais de 90 dias são apagadas na manutenção
- Demonstração: alerta "Movimentos atrasados (demo)"

## 0.14.0 — 12/11/2026

**Fase 4A + 4B: painéis por configuração e relatório dinâmico**

- **Fontes de dados** (`registerDados` em `server/src/services/paineis.ts`; o sistema registra em
  `server/src/app/paineis.ts`): `GET /api/dados/:nome?de=&ate=&...` com permissão própria. Formatos: `valores`,
  `serie`, `ranking`, `tabela` e `partes` (várias de um cálculo só)
- **Widgets** (`<PainelWidgets id widgets de ate />`, tipos em `web/src/lib/paineis.ts`): card, gráfico
  (barras/linhas), ranking, tabela ou componente próprio do sistema; mesma fonte = uma chamada só
- **Personalizar painel**: cada usuário oculta, mostra e reordena os widgets; guardado no servidor (tabela
  `preferencias`, `GET/PUT /api/preferencias/:chave`), vale em qualquer aparelho; "Restaurar padrão"
- **Conjuntos** (`registerConjunto`): o sistema entrega movimentos planos (data, valor, dimensões) e o frame monta a
  **tabela dinâmica** `GET /api/relatorios/:nome?de=&ate=&linhas=&f_<dim>=` (linhas × meses, total, média, opções
  dos filtros, link de detalhamento por célula)
- Tela **Relatórios** (`/relatorios` e `/relatorios/:conjunto`): **Evolução** (até 24 meses, gráfico de linhas das
  linhas marcadas) e **Comparativo** (mês × mês anterior ou média de 3/6/12 meses, diferença e %, colorida pelo
  sentido do conjunto); agrupar por qualquer dimensão, filtros múltiplos, CSV e **impressão/PDF** com cabeçalho da
  organização (tudo na URL)
- Paleta categórica dos gráficos (`--serie-1..8`, claro e escuro) e estilos de impressão
- Demonstração: "Painel (widgets)" e "Relatório dinâmico" sobre os movimentos de exemplo

## 0.13.0 — 12/11/2026

- **Esvaziar lixeira**: botão na lixeira de cada entidade (`POST /api/:entity/lixeira/esvaziar`, permissão de excluir)
  apaga de vez tudo o que está nela — anexos e linhas de sub-tabelas juntos — com um log de resumo ("lixeira
  esvaziada")
- A lixeira passa a dizer o prazo da limpeza automática (`dias_lixeira` das Configurações, padrão 30 dias), que já
  rodava na manutenção diária mas não aparecia na tela

## 0.12.1 — 10/11/2026

- Linha extra **separadora** na listagem (`__extra.separador`, com `rotulo`, `destaque` e `icon`): ocupa a largura
  toda, centralizada numa pílula, sem seleção nem edição — para o sistema derivado intercalar, por exemplo, o
  saldo do final de cada dia

## 0.12.0 — 10/11/2026

- **Período da navegação**: o mês/período escolhido no seletor vale para as outras telas até o usuário trocar.
  Listagem aberta sem período na URL usa o último escolhido (antes: sempre o mês atual). Novo login (ou sair)
  volta ao mês atual. `lib/periodoGlobal.ts`: `periodoPadrao()`, `mesPadrao()` e `guardarMes()` para telas por
  mês do sistema derivado (guardado no `sessionStorage`)

## 0.11.0 — 09/11/2026

- **Configurações próprias do sistema derivado**: `shared/src/app/settings.ts` declara `appSettings`
  (`select`, `boolean`, `number`, `text`, com padrão, opções e ajuda). Aparecem na tela de Configurações numa seção
  com o nome do sistema e são gravadas junto (`app.<chave>` na tabela `configuracoes`, com log). API:
  `GET /api/settings/app` (qualquer logado) e `PUT /api/settings/app` (editar configurações). No servidor:
  `getAppSetting(db, chave)`; no front: `useAppSettings()` (`lib/appSettings.ts`). "Restaurar padrão" volta também
  essas

## 0.10.1 — 09/11/2026

- **Voltar para onde estava**: quem navega passa `state: useOrigem()` e a tela de destino volta com
  `useVolta(padrão)` (`lib/voltar.ts`), em cadeia (lista → outra tela → formulário → outra tela → lista). A
  `CrudList` já passa a origem ao abrir um registro, uma linha extra ou "Novo"; o `CrudForm` volta para a origem
  (ou para a listagem guardada). `PageHeader.back` aceita `{ to, state }`

## 0.10.0 — 09/11/2026

- **Linhas extras na listagem**: hook `listExtras(query, { db, actor })` por entidade devolve linhas de outras
  entidades (mesmos campos + `__extra: { rotulo, link, icon, campo }`) que aparecem intercaladas na mesma ordenação, com
  selo, fundo suave e clique abrindo `link`. Não têm seleção nem edição na linha, não entram nos totais nem na
  contagem "N registro(s)", e ficam fora da lixeira e da exportação. A API devolve `extras` (quantas linhas extras
  há em `total`). Com extras, a listagem busca os registros filtrados e pagina em memória
  (`listWithExtras` em `services/records.ts`)

## 0.9.3 — 09/11/2026

- Formulário volta para a listagem **como ela estava** (mês/período, filtros, página, ordenação), ao salvar, cancelar
  ou pela seta do título; antes voltava para o mês atual. A listagem guarda a URL no `sessionStorage`
  (`lembrarLista`/`urlLista` em `lib/listParams.ts`)
- Entidade escolhe as opções de "registros por página" e o padrão: `pageSizes` e `pageSize` (padrão continua
  10, 25, 50, 100)

## 0.9.2 — 09/11/2026

- Seletor de período das listagens: **Período personalizado** (De/Até) abaixo dos atalhos. Aceita só uma das pontas
  ("A partir de…", "Até…") e corrige a ordem se as datas vierem trocadas; o ano inteiro aparece como "Ano de 2025"
- `MonthPicker` ganha `referencia`: com um intervalo livre, as setas e a grade partem do mês do início (antes: do
  mês atual)

## 0.9.1 — 09/11/2026

- `feminino: true` na entidade: botão e título dizem "Nova categoria" em vez de "Novo categoria" (`novoRotulo`)

## 0.9.0 — 09/11/2026

**Campo imagem, fonte própria e seletor de mês**

- **Campo `image`** nas entidades: logo, foto ou ícone gravado no próprio registro (data URL). A tela reduz para no
  máximo 256 px antes de enviar; aceita PNG, JPG, WebP, GIF e SVG (até ~150 KB). Aparece como miniatura na
  listagem; fica fora da exportação/importação e no log aparece só "(alterada)"
- **Fonte própria** (Configurações → Fonte → "Usar uma fonte própria"): o administrador envia o arquivo regular e,
  opcionalmente, o negrito (.woff2, .woff, .otf ou .ttf, até 600 KB), dá um nome (ex.: ABC Oracle) e escolhe a
  opção. Os arquivos ficam no sistema e são servidos em `/api/settings/fonte/:peso` (público, com cache); o tipo é
  conferido pelo conteúdo. Remover o arquivo regular volta para a fonte do tema
- **Seletor de mês** (`MonthPicker`, estilo Mobills): ‹ Janeiro 2025 › e, ao clicar, o ano com os 12 meses para
  pular direto, além dos atalhos (este mês, últimos 30 dias, ano inteiro, todo o período). Usado no período das
  listagens e disponível para as telas do sistema
- **Texto de PDF** (`server/src/services/pdf.ts`, `linhasPdf`): lê o PDF e devolve as linhas na ordem da página
  (pedaços agrupados pela altura; espaço largo entre colunas). Base para importar faturas, extratos e outros
  documentos. Dependência nova: `unpdf`
- Correção: na exportação para Excel, datas saíam como "31/01/2025 03:00" (fuso); agora só a data

## 0.8.0 — 09/11/2026

**Fonte e tamanho do texto**

- **Fonte do sistema** (Configurações → Fonte, administrador): a do tema (Vibrante = Nunito, Minimalista = Inter),
  Inter, Nunito, Roboto, Open Sans, Lato, Source Sans ou a fonte do aparelho. Prévia de cada uma na tela; o
  navegador baixa só a escolhida (`web/src/lib/fontes.ts`), e "do aparelho" não baixa nada
- **Tamanho do texto por usuário** (menu do usuário: A pequeno · A normal · A grande): escala 93,75% / 100% / 112,5%
  de tudo o que é medido em rem. Gravado no usuário (`usuarios.tamanho_texto`, via `PUT /api/auth/perfil`) e
  lembrado no navegador para a tela de login
- Larguras do menu lateral e altura do topo em rem: acompanham o tamanho do texto

## 0.7.0 — 09/11/2026

**Temas e aparência**

- Tokens de design no CSS (`--surface`, `--text`, `--border`, `--positive`, `--negative`, `--radius`, `--shadow-card`,
  `--sidebar-*`…): as telas usam só tokens, e o tema troca os valores
- **Tema do sistema** (Configurações → Tema, definido pelo administrador): **Vibrante** (o visual de sempre) ou
  **Minimalista** (fundo neutro, menu lateral claro, tipografia Inter, cartões sem cor, título da página na barra
  do topo)
- **Aparência por usuário** (menu do usuário): Automático (segue o aparelho), Claro ou Escuro. Fica gravada no
  usuário (`usuarios.aparencia`, via `PUT /api/auth/perfil`) e lembrada no navegador para a tela de login
- Abas no rodapé no celular: itens de menu com `tab: true` (até 4) + botão "Menu"
- `inlineEdit` em campo booleano (`true` ou função por registro): liga/desliga direto na listagem, sem abrir o
  registro; grava pelo CRUD (permissão de editar, hooks e log valem igual)
- `web/src/lib/themeVars.ts`: `cssVar()`, `chartTheme()` e `useThemeVersion()` para gráficos acompanharem o tema e
  o modo escuro; `web/src/lib/media.ts`: `useMedia()`/`useIsDesktop()`
- Etiquetas coloridas (`ValueBadge`) recebem a cor na variável `--badge`: bloco cheio no Vibrante, tom suave no
  Minimalista

## 0.6.0 — 08/11/2026

- `hidden` no campo: coluna técnica gravada e devolvida pela API, preenchida pelos hooks, fora das telas
  (formulário, listagem, colunas, filtros, exportação, importação); filtrável pela URL
- `createOnly` no campo: só no formulário de criação; ignorado nas atualizações
- `server/src/app/maintenance.ts` (`appMaintenance`): manutenção diária da aplicação, no boot e a cada 24 h
- **Correção:** datas sem hora apareciam um dia antes nas telas em fusos negativos (Brasil): `fmtDate` lia
  `2026-10-28` como meia-noite UTC

## 0.5.1 — 08/11/2026

**Preparação para sistemas derivados do frame (repositório próprio com `upstream` = frame-app)**

- Migrações da aplicação em `server/src/app/migrations/` (o `db:diff` grava lá); as do núcleo continuam em
  `server/src/db/migrations/`. As duas rodam juntas, em ordem de data
- Nome e versão do sistema em `shared/src/app/info.ts`; o `package.json` fica com a versão do frame.
  `/api/health` informa as duas (`version` e `frame`)
- `docs/app/` (README, CHANGELOG e CLAUDE.md do sistema), importado pelo `CLAUDE.md` da raiz
- README: como criar um sistema a partir do frame e mantê-lo atualizado
- `default: 'hoje'` (data) e `default: 'agora'` (data e hora), calculados na hora de abrir o formulário/gravar
- `activeField` na entidade: registros inativos somem dos selects de relação (menos o valor atual), mas continuam
  nos filtros da listagem (`/opcoes?todos=1`)
- Nome e ícone padrão das Configurações vêm de `app/info.ts` (`nome`, `icone`)
- Formulário novo aceita valores iniciais pela URL (`/lancamentos/novo?tipo=Receita&conta_id=3`), para atalhos
- `shared` exporta a pasta `app/` inteira (tipos e constantes do sistema); testes do frame não supõem aplicação vazia

## 0.5.0 — 08/11/2026

**Fase 2B: master-detail, anexos, importação e telas plugáveis**

- Sub-tabelas (`details` / `detailOf`): linhas editadas no formulário do registro e gravadas juntas numa transação;
  somas no "pai" (`sum`), mínimo de linhas (`min`), erros por linha; no celular, cada linha vira um card
- Campos calculados (`compute`): a tela mostra enquanto digita e a API recalcula ao gravar
- Sub-tabela segue as permissões do "pai" e fica fora do menu "+ Novo", do dashboard e da matriz de permissões
- Anexos por registro (`anexos: true`): enviar (botão ou arrastar), abrir PDF/imagem, baixar, excluir, com log;
  arquivos em `UPLOAD_DIR`, limite `UPLOAD_MAX_MB`; apagados junto com o registro
- Importação de planilha `.xlsx`/`.csv` com mapeamento de colunas, prévia validada linha a linha, conversão do formato
  brasileiro, nomes de relações e planilha modelo com instruções
- Telas plugáveis: `registerScreens` (lista/form próprios por entidade), `registerPage` (páginas novas com permissão)
  e slots `before`/`after` na listagem e no formulário genéricos
- Demonstração: orçamentos com itens e anexos, movimentos com resumo do período, categorias em cards e página
  "Resumo por categoria"
- Dashboard não conta registros que estão na lixeira
- Migração nova do núcleo: `20261109000000_anexos` (aplicada sozinha no `npm run dev`)

## 0.4.0 — 08/11/2026

**Fase 2A: motor de CRUD maduro (listagem, campos e lixeira)**

- Tipos de campo novos: `document` (CPF/CNPJ com dígito verificador), `phone`, `color`, `multiselect`, `percent`;
  `money` com máscara BRL, `min`/`max` e `signColors` (negativo em vermelho, positivo em verde)
- Listagem: ordenação clicando no cabeçalho, painel de filtros gerado pelos campos (seleção múltipla, faixa de
  datas e valores, "contém"), chips de filtros ativos, seletor de período (`periodField`) que abre no mês atual,
  linha de totais (`total: 'sum'`), itens por página, colunas visíveis por usuário
- Exportar a listagem para Excel (.xlsx) ou CSV com os mesmos filtros e colunas da tela
- Seleção de linhas e ações em lote (editar um campo, excluir, restaurar), cada registro com as mesmas regras e log
- Lixeira (`lixeira: true`): excluir envia para a lixeira, que tem tela própria para restaurar ou excluir de vez;
  esvaziamento automático configurável ("Esvaziar lixeira após N dias")
- Formulário em seções (`section`) e selects dependentes (`dependsOn`: categoria conforme o tipo)
- `defaultSort` e `group` (grupo na matriz de permissões) por entidade
- Módulo de demonstração (`DEMO=true` no `server/.env`): clientes, categorias e movimentos de exemplo com todos os
  recursos acima, em tabelas `demo_*` criadas fora das migrações
- Rotas novas: `GET /api/:entidade/exportar`, `POST /api/:entidade/lote`, `POST /api/:entidade/:id/restaurar`

## 0.3.0 — 08/11/2026

**Núcleo genérico (o frame não tem mais nada de "sistema de chamados")**

- Separação núcleo × aplicação: `shared/src/app/`, `server/src/app/` e `web/src/app/` são o lugar do sistema
  construído sobre o frame (entidades, menu, dashboard, hooks, rotas, dados de exemplo)
- Removidos chamados, clientes, abertura de chamados, busca por protocolo e notificações derivadas
- Dashboard genérico: total de cada cadastro que o usuário pode ver + atividade recente
- Botão "+ Novo" no menu, com o que o usuário pode criar
- Versão do sistema no menu e em `/api/health`; aviso de "nova versão disponível" em produção
- Página "Meu perfil": editar nome, alterar senha, ver e encerrar sessões abertas
- Configurações: link da Central de Ajuda e estilo do menu (colorido ou claro)
- Menu reorganizado: Dashboard · itens da aplicação · Administração (Usuários, Perfis, Logs, Backup)
- Migrações reescritas numa migração única do núcleo (`npm run db:reset` necessário em bancos antigos)
- `auto: 'code'` com `prefix` substitui o antigo `auto: 'protocol'`
- Limite de tentativas por IP passa a contar só falhas de login

**Fase 1: segurança e acesso**

- Login com sessão em cookie `httpOnly`, "manter conectado", troca e recuperação de senha
- Perfis de acesso com matriz recurso × ação; hooks por entidade; logs com usuário, IP e antes/depois
- helmet/CSP, proteção de origem (CSRF), limite de tentativas, `db:admin`

## 0.2.0 — 07/11/2026

**Fase 0: fundação de engenharia**: TypeScript, npm workspaces, Knex com migrações e `db:diff`, validação Zod
compartilhada, `.env` validado, testes, ESLint/Prettier, pre-commit e CI.

## 0.1.0 — 07/11/2026

Frame inicial em JavaScript: navegação, CRUD dirigido por configuração, dashboard, logs, backup e configurações.
