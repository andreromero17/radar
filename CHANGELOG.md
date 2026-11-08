# Changelog

Versões do frame. O número exibido no rodapé do menu vem do `package.json` da raiz, junto com o commit do git.
Use [versionamento semântico](https://semver.org/lang/pt-BR/): **MAIOR** quebra compatibilidade, **MENOR** traz
novidades, **CORREÇÃO** só corrige.

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
