# Roadmap — Frame Genérico

**Objetivo:** uma base robusta e reutilizável para vários sistemas web. Inclui navegação, CRUD dirigido por configuração, dashboard, configurações, segurança e deploy. O primeiro sistema construído em cima dela é o de **finanças pessoais**.

**Princípio:** o frame evolui puxado por um sistema real, não no vácuo. Cada fase do core é validada pelo app de finanças. O que o finanças precisar e for genérico sobe para o core. O que for específico fica no módulo.

---

## Fase 0 — Fundação de engenharia ✅ concluída (07/11/2026)

- Git com histórico e Conventional Commits; npm workspaces (`shared/`, `server/`, `web/`)
- TypeScript strict em todo o projeto (tsx em dev, tsup no build)
- Validação Zod gerada das entidades, a mesma no form e na API
- Knex com migrações versionadas, `db:diff` gerando migração a partir das entidades e CLI
  (migrate/rollback/status/diff/seed/reset)
- `.env` validado no boot e logger estruturado (pino)
- ESLint + Prettier, pre-commit (husky + lint-staged), 39 testes (Vitest + Supertest)
- CI no GitHub Actions (antecipado da Fase 6): lint, tipos, testes, build e migração do zero

## Fase 1 — Segurança e acesso ✅ concluída (08/11/2026)

- Login com sessão em cookie `httpOnly`/`SameSite` (token em hash no banco), "manter conectado", expiração por inatividade
- Senhas com scrypt (nativo do Node), política única no form e na API
- Troca de senha (obrigatória no primeiro acesso, se o admin quiser) e recuperação por e-mail com link de uso único
  (SMTP via `.env`; sem SMTP, o e-mail vai para o log)
- **Perfis editáveis** com matriz recurso × ação; menu, botões e rotas respeitam as permissões; mudanças valem na hora
- Proteções contra lockout e escalada: sempre um admin ativo; só admin gerencia perfis e usuários administradores
- Logs com usuário real, IP e antes/depois de cada campo (tela com detalhe expansível)
- Hardening: helmet/CSP, bloqueio de origem (CSRF), limite de tentativas, mensagens que não revelam e-mails cadastrados
- `db:admin` para criar/recuperar administrador em produção
- Antecipado da Fase 2: **hooks por entidade** (`beforeSave`/`afterSave`/`beforeDelete`)
- Pendente para quando houver necessidade: 2FA, login social/SSO, tela de sessões ativas

## Núcleo genérico (v0.3.0) ✅ concluído (08/11/2026)

- Frame sem nada do sistema de chamados; separação núcleo × aplicação (pastas `app/` em shared, server e web)
- Dashboard genérico, botão "+ Novo", versão no menu e em `/api/health` com aviso de nova versão
- Meu perfil (nome, senha, sessões abertas), Central de Ajuda configurável, estilo do menu (colorido/claro)
- Migrações reescritas numa única migração do núcleo; CHANGELOG

## Fase 2 — Motor de CRUD maduro

_Aqui o frame passa a sustentar sistemas de verdade._

### 2A (v0.4.0) ✅ concluída (08/11/2026)

- Campos: moeda BRL com máscara e cores por sinal, CPF/CNPJ com validação, telefone, cor, multiselect, percentual
- Listagem: ordenação clicável, painel de filtros, período (mês), totais, exportar CSV/Excel, ações em lote,
  colunas visíveis por usuário, itens por página
- Lixeira (soft delete), restauração e esvaziamento automático
- Formulário em seções e selects dependentes
- Módulo de demonstração opcional (`DEMO=true`)

### 2B

- **Master-detail:** formulário com sub-tabela (ex.: pedido → itens, lançamento → parcelas)
- **Anexos:** upload de arquivo por registro
- **Telas plugáveis:** cada entidade usa as telas genéricas por padrão, mas aceita lista/form/página customizados
- **Importar CSV** para uma entidade (com prévia e validação linha a linha)
- Hooks por entidade já existem (Fase 1); aqui eles passam a cobrir as regras de negócio do finanças (ex.: recalcular saldo)
- **Pronto quando:** dá para modelar o finanças inteiro sem tocar no código do motor

## Fase 3 — Finanças pessoais (MVP) ← primeiro sistema

_Começa assim que a Fase 2 tiver o essencial; as duas andam juntas._

- Entidades: contas, categorias (receita/despesa, hierárquicas), lançamentos, cartões/faturas, orçamento mensal, metas
- Regras: saldo por conta, transferência entre contas, parcelamento, recorrência
- Dashboard: saldo consolidado, receitas × despesas, gastos por categoria, orçamento × realizado
- Importação de extrato OFX/CSV com categorização assistida
- **Pronto quando:** você usa no dia a dia por um mês sem planilha paralela
- Referência visual/funcional (Mobills, 08/11): menu Contas · Transações · Cartões de crédito · Planejamento ·
  Relatórios; botão "+ Novo" para lançar rápido; seletor de mês no topo; cards Saldo atual / Receitas / Despesas;
  gráficos de despesas e receitas por categoria

## Fase 4 — Dashboards e relatórios configuráveis

- Widgets declarativos (card, gráfico, tabela, ranking) definidos por config, sem código por sistema
- Filtro global de período no dashboard
- Relatórios com filtros, impressão/PDF com cabeçalho da organização (dados das Configurações)
- Notificações reais (tabela própria, lidas/não lidas), no lugar das derivadas do dashboard

## Fase 5 — Multi-sistema

- **Monorepo:** `packages/core` (o frame) + `apps/financas`, `apps/<proximo>`. Melhorias no core chegam a todos os sistemas.
- **Módulo = pasta** com entities, menu, hooks, páginas e widgets próprios
- **CLI de scaffold:** `npm run novo-sistema nome` gera um app pronto para configurar
- **Decisão a tomar aqui:** instâncias separadas por sistema/cliente (mais simples, recomendado) ou multi-tenant numa instalação só (só se virar SaaS)

## Fase 6 — Produção e mobile

- Postgres em produção (SQLite continua no dev), viabilizado pelo Knex da Fase 0
- Docker multi-stage + compose, deploy (VPS, Railway ou Fly.io), HTTPS
- Backup agendado para fora do servidor (S3/R2), monitoramento e log de erros (Sentry)
- **PWA:** instalável no celular, com ícone e cache básico. Cobre boa parte do "mobile" sem app nativo.
- React Native/Expo só se surgir necessidade real de recurso nativo, consumindo a mesma API

---

## Ordem e paralelismo

```
Fase 0 ──► Fase 1 ──► Fase 2 ─┬─► Fase 4 ──► Fase 5 ──► Fase 6
                              └─► Fase 3 (Finanças) ──┘
```

## Decisões em aberto

1. Migrar para TypeScript agora (recomendado) ou seguir em JavaScript?
2. Knex (query builder, combina com o modelo dirigido por config) ou um ORM tipado como Drizzle?
3. Na Fase 5: instâncias separadas ou multi-tenant?
