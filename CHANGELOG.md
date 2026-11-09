# Changelog

Versões do frame. O número exibido no rodapé do menu vem do `package.json` da raiz, junto com o commit do git.
Use [versionamento semântico](https://semver.org/lang/pt-BR/): **MAIOR** quebra compatibilidade, **MENOR** traz
novidades, **CORREÇÃO** só corrige.

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
