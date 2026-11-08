# Roadmap — Frame Genérico

**Objetivo:** uma base robusta e reutilizável para vários sistemas web. Inclui navegação, CRUD dirigido por configuração, dashboard, configurações, segurança e deploy. O primeiro sistema construído em cima dela é o de **finanças pessoais**.

**Princípio:** o frame evolui puxado por um sistema real, não no vácuo. Cada fase do core é validada pelo app de finanças. O que o finanças precisar e for genérico sobe para o core. O que for específico fica no módulo.

---

## Fase 0 — Fundação de engenharia
*Pré-requisito de tudo. Barato agora e caro depois.*

- **Git + GitHub** (repo privado), com `.gitignore`, branches e commits pequenos
- **TypeScript** em front e back. Com ~60 arquivos a migração é rápida. Num frame que vai ser reutilizado, os tipos são a documentação viva.
- **Validação compartilhada** com Zod: o mesmo schema valida no form e na API
- **Migrações versionadas** com Knex, no lugar da migração automática. Isso permite renomear e remover colunas, e já prepara o terreno para o Postgres.
- **Config por ambiente** (`.env` + `.env.example`): porta, caminho do banco, segredos
- **Qualidade:** ESLint + Prettier e testes com Vitest + Supertest (CRUD genérico e settings)
- **Pronto quando:** `npm test` passa, o banco sobe por migração e não há segredo no código

## Fase 1 — Segurança e acesso
- Login com sessão em cookie `httpOnly`, senha com hash (argon2/bcrypt)
- Usuários reais; o "Usuário Administrador" fixo sai de cena
- **Permissões por perfil × entidade × ação** (ver/criar/editar/excluir), declaradas em `entities`. Menu e botões respeitam as permissões.
- Logs com o usuário real, IP e diff do que mudou (antes/depois)
- Recuperação de senha por e-mail (SMTP via `.env`)
- Hardening: helmet, rate limit no login, CORS restrito, validação de entrada em tudo
- **Pronto quando:** nenhuma rota responde sem login e um perfil "Leitura" não consegue alterar nada

## Fase 2 — Motor de CRUD maduro
*Aqui o frame passa a sustentar sistemas de verdade.*

- **Novos tipos de campo:**
  - moeda BRL com máscara, CPF/CNPJ com validação, telefone, data/hora
  - upload de arquivo/anexo, multiselect, cor
- **Master-detail:** formulário com sub-tabela (ex.: pedido → itens, lançamento → parcelas)
- **Hooks por entidade** (`beforeSave`, `afterSave`, `beforeDelete`), onde vivem as regras de negócio (ex.: recalcular saldo)
- **Telas plugáveis:** cada entidade usa as telas genéricas por padrão, mas aceita lista/form/página customizados
- **Listagem:**
  - filtros por coluna, ordenação clicável
  - exportar CSV/Excel, ações em lote
  - colunas visíveis por usuário
- **Lixeira** (soft delete) e restauração
- **Pronto quando:** dá para modelar o finanças inteiro sem tocar no código do motor

## Fase 3 — Finanças pessoais (MVP) ← primeiro sistema
*Começa assim que a Fase 2 tiver o essencial; as duas andam juntas.*

- Entidades: contas, categorias (receita/despesa, hierárquicas), lançamentos, cartões/faturas, orçamento mensal, metas
- Regras: saldo por conta, transferência entre contas, parcelamento, recorrência
- Dashboard: saldo consolidado, receitas × despesas, gastos por categoria, orçamento × realizado
- Importação de extrato OFX/CSV com categorização assistida
- **Pronto quando:** você usa no dia a dia por um mês sem planilha paralela

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
- CI no GitHub Actions: testes + build a cada push
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
