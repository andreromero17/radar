# Radar — contexto do sistema

Monitoramento comercial da Lighthouse: acompanha **contas-alvo**, **concorrentes** e **pessoas-chave** no LinkedIn,
transforma posts e vagas em **sinais** classificados e devolve ao **Pipedrive**. Desenhado como produto: cada cliente
é um **espaço** do frame (isolamento já garantido pelo frame). Repositório derivado: `origin` = andreromero17/radar,
`upstream` = andreromero17/frame-app. **Aqui só se mexe nas pastas `app/` e `docs/app/`**; o que for genérico vira
PR no frame-app.

- Proposta (escopo, arquitetura, roadmap): https://claude.ai/artifact/H1pB9bMPsWU2h9477XoJ2T
- Esboço das telas (referência visual): https://claude.ai/artifact/QaM4giPXUENFPSoegqLg2r
- Dono do produto: André Romero

## Entidades (`shared/src/app/entities.ts`, constantes em `shared/src/app/radar.ts`)

- **empresas** — universo (`Conta-alvo` | `Concorrente`), nome, nome curto (telas), página do LinkedIn, site, segmento,
  tier, UF, dono (nome no Pipedrive), seguidores (coleta), logo próprio (`image`; tem prioridade sobre
  `logo_linkedin`, que vem da coleta), `pipedrive_org_id`, monitorar (`activeField`).
- **pessoas** — pessoa-chave: empresa, cargo cadastrado, nível, prioridade, perfil do LinkedIn, título no LinkedIn
  (coleta), `pipedrive_person_id`, monitorar.
- **publicacoes** — item coletado (post ou vaga): data, empresa e/ou pessoa, autor, título (primeira linha), texto,
  link, post próprio (falso = repost), curtidas/comentários/compartilhamentos, triagem, `id_externo` (único).
- **sinais** — resultado da classificação: data, universo, severidade, confiança, tipo (rótulos de
  `SINAIS_POR_UNIVERSO`), empresa, pessoa, publicação, resumo (`titulo`), gancho, linha de serviço, situação
  (Novo/Tratado/Descartado), avaliação do time (Útil/Irrelevante/Classificação errada), `modelo` (oculto).
- **alertas_cadastro** — troca de cargo/empresa, duplicidade, sem atividade, link quebrado; `chave` única evita repetir.
- **coletas** — uma linha por execução da coleta: início/fim, situação, ator do Apify, fontes, itens encontrados e
  novos, descartados por autor errado, custo em US$, erro.

## Regras que NÃO podem mudar

- A página/perfil do LinkedIn é a chave da coleta: gravada normalizada (`normalizarLinkedin`) e única por espaço
  (hook `app/hooks/cadastros.ts`, 409 com o nome de quem já usa).
- **Coleta só com atores que não exigem login, cookie (`li_at`) nem conta de ninguém.** Atores aprovados:
  `harvestapi/linkedin-company-posts` (posts de páginas de empresa E de perfis, aceita `/company/` e `/in/`) e
  `piotrv1001/linkedin-company-jobs-scraper` (vagas). Trocar de ator exige aprovação do André e teste com 5 perfis.
- Todo post coletado é conferido contra a fonte pedida: autor diferente da empresa/pessoa (e que não seja repost
  dela) é descartado e contado em `coletas.descartados`.
- Empresa/pessoa na lixeira é decisão do usuário: a sincronização com o Pipedrive e a coleta não a recriam nem
  atualizam.
- A coleta é idempotente: publicação pelo `id_externo`; rodar duas vezes não duplica.
- Apollo: nunca pedir e-mail nem telefone; pessoa só entra no Radar aprovada pelo usuário.
- Token do Apify, do Pipedrive, do Apollo e de LLM só no `.env` (frame: segredos nunca na tabela de configurações).
- Dados pessoais só de perfis públicos e só os campos do modelo.

## Onde está cada coisa

- Visão geral (0.4.0): `server/src/app/services/visao.ts` (`visaoConcorrentes`, `visaoContas`; tipos em
  `shared/src/app/radar.ts`; `scoreRadar`), rota `GET /api/radar/visao?universo=&dias=`. Web: `app/dashboard.tsx` →
  `pages/VisaoGeral.tsx` (abas `components/AbasUniverso.tsx`, universo em `lib/universo.ts`), `VisaoContasTela.tsx`,
  `VisaoConcorrentesTela.tsx`, gráficos em `components/Graficos.tsx`, logo em `components/LogoEmpresa.tsx`, CSS em
  `app/styles.css` (só tokens). Universo "Nós" só em empresas (`UNIVERSOS_EMPRESA`). Dados das páginas em
  `coleta/paginas.ts` (semanal; `baixarImagem` guarda o logo como data URL). Testes `radar040.test.ts`.
- Assuntos (0.4.1): `shared/src/app/assuntos.ts` (`ASSUNTOS` com termos sem acento, `classificarAssuntos` até 3,
  "Outros"); gravados em `publicacoes.assuntos` ("A; B") na coleta e no piloto; `garantirAssuntos` classifica os
  que faltam. Página da empresa: `detalheEmpresa` em `services/visao.ts`, rota `GET /api/radar/empresas/:id/detalhe`,
  tela `web/src/app/pages/EmpresaDetalhe.tsx` registrada em `empresa/:id`. Formulário de empresa
  `pages/EmpresaForm.tsx` (campo Logo mostra o do LinkedIn quando não há enviado).
- Vagas (0.4.3): `coleta/vagas.ts` (`coletarVagas`, ator `piotrv1001/linkedin-company-jobs-scraper`, 30 dias, sem
  detalhe), roda depois de `coletarPaginas` no tipo 'paginas'; vagas = `publicacoes.tipo = 'Vaga'` (`id_externo`
  "vaga:<id>") e `metricas_empresas.vagas`. Toda conta de posts na visão geral filtra `tipo = 'Post'`.
- Pessoa e reposts (0.4.9): `detalhePessoa` em `services/visao.ts` (rota `GET /api/radar/pessoas/:id/detalhe`, tela
  `pages/PessoaDetalhe.tsx` em `pessoa/:id`; `pages/PessoaForm.tsx` com o link). Repost com chave própria
  (`repost:e<empresa>:<id>` / `repost:p<pessoa>:<id>`), `publicacoes.original_id` e `autor_linkedin`; de quem é o
  original: `autorDoRepost` (LinkedIn, ou nome nos antigos). `DetalheEmpresa.assuntos_pessoas` e `reposts_pessoas`;
  `PostDetalhe.repost_empresa`. Tabelas e busca em `components/Publicacoes.tsx` (`PublicacoesDoPeriodo`), ajudantes em
  `lib/texto.ts`. Testes `radar070.test.ts`.
- Tags (0.4.7): entidade `tags` (nome único sem diferenciar maiúsculas, cor) + `empresas.tags` (JSON de ids, oculto;
  `lerTags` em shared). Serviço `app/services/tags.ts` (hooks: nome único e tirar das empresas ao excluir; `listarTags`
  com contagem, `criarTag`, `definirTagsDaEmpresa`). Rotas `GET/POST /api/radar/tags`, `PUT
/api/radar/empresas/:id/tags`; visão geral com `?tags=1,3` ("qualquer uma de"; "Nós" fica). Web: `lib/tags.ts`
  (cache compartilhado, `useFiltroTags` na URL + localStorage), `components/TagPill.tsx`, `components/SeletorTags.tsx`
  (`TagsEditaveis`). Testes `radar060.test.ts`.
- Apollo (0.4.6): `server/src/app/apollo/` — `cliente.ts` (chave mestra `APOLLO_API_KEY` no cabeçalho `x-api-key`;
  contexto trocável com `definirContextoApollo`), `index.ts` (enriquecer pelo domínio do site = 1 crédito, campos
  `empresas.apollo_*`; buscar pessoas `mixed_people/api_search` = 0 crédito → `sugestoes_pessoas` filtradas por
  `areaDoCargo` (shared); aprovar = `people/bulk_match` sem e-mail/telefone → `pessoas`). Nada do Apollo vai para o
  Pipedrive. Rotas `/api/radar/apollo/*`; telas `pages/PessoasSugeridas.tsx`, `components/ApolloEmpresa.tsx`,
  `components/SugestoesPessoas.tsx`. Testes `radar050.test.ts`. Colaboradores = `metricas_empresas.funcionarios`
  (`colaboradoresNoPeriodo` em `services/visao.ts`).
- 0.4.5: janela de 30 dias para fonte sem `historico_posts_em` (empresas/pessoas; marcada ao fim da coleta OK ou se
  já tem post com mais de 20 dias; `POST /api/radar/empresas/:id/refazer-historico` limpa). 0.4.4: `publicacoes.universo` copiado
  da empresa (`atualizarUniversoDasPublicacoes`: na visão geral, depois da coleta e no `afterSave` de empresas);
  links dos gráficos para `/publicacoes?tipo=Post&post_proprio=1&universo=…&assuntos__contem=…&data_publicacao__de/ate`;
  `pages/Sinais.tsx` com `AbasUniverso` sobre o filtro `universo`.
- Pipedrive em mão dupla (0.4.3): `pipedrive_completar`; `api.put` (v1) só com campos vazios no Pipedrive.
- Coleta (0.3.0): `server/src/app/coleta/` — `apify.ts` (dispara o ator, acompanha o run, lê o dataset; custo de
  `usageTotalUsd`; contexto trocável com `definirContextoApify`), `posts.ts` (`coletarPosts`: fontes, janela,
  autoria, upsert, logo/título/alerta, linha em `coletas`), `index.ts` (uma coleta por espaço por vez, tarefa diária
  `radar.coleta` às 07:00). Rotas `GET /api/radar/coleta/status` e `POST /api/radar/coleta/executar` (202, segundo
  plano). Botão `web/src/app/components/ColetarAgora.tsx` na tela `pages/Coletas.tsx`. Testes `radar030.test.ts`.
  Ainda não coletados: vagas (`piotrv1001/linkedin-company-jobs-scraper`) e seguidores das páginas.
- Pipedrive (0.2.0): `server/src/app/pipedrive/` — `cliente.ts` (API v2 para organizações/pessoas, v1 para campos e
  usuários; token só no cabeçalho `x-api-token`; contexto trocável nos testes com `definirContextoPipedrive`),
  `sincronizar.ts` (regras de upsert; campos Segmento/Tier/LinkedIn achados pelo nome), `index.ts` (status em
  memória, tarefa diária `radar.pipedrive` às 06:30). Rotas `GET /api/radar/pipedrive/status` e
  `POST /api/radar/pipedrive/sincronizar` (`empresas`/`criar`). Botão em `web/src/app/components/SincronizarPipedrive.tsx`
  na tela `web/src/app/pages/Empresas.tsx`. Configurações em `shared/src/app/settings.ts`. Testes `radar020.test.ts`.

- Dados do piloto (19/11/2026): `server/src/app/dados/piloto.json`, carregados por `app/services/piloto.ts`
  (`importarPiloto`, idempotente) no seed e pelo script `server/src/app/scripts/importar-piloto.ts [--espaco N]`.
- Testes: `server/test/radar*.test.ts`, `shared/test/radar.test.ts`.
- Versão do sistema: `shared/src/app/info.ts` + `docs/app/CHANGELOG.md`.

## Próximas entregas

- 0.4.10 — Caixa de sinais com avaliação, lista de pessoas com "Precisa de atenção".
  - **Posts de troca de emprego** (pedido do André em 21/11/2026; ex.: "Novo capítulo 🚀" da Luana Hipolide virou
    "Cases e clientes"): assunto "Carreira e movimentação" com prioridade, só em post de PESSOA (frases: novo desafio,
    novo capítulo, nova jornada, começo hoje na, último dia, me despeço, encerro meu ciclo, tenho o prazer de anunciar,
    nova casa, starting a new position, new chapter…) — quando bate, os outros assuntos saem. Gera alerta de cadastro
    "Troca de empresa" e sinal (conta-alvo: Alta, contato-chave saiu / nova empresa pode ser oportunidade;
    concorrente: saída de pessoa-chave). Reclassificar o histórico.
  - Gráfico **Assuntos mais abordados** maior (visão de concorrentes; idem as roscas das páginas de empresa e de
    pessoa): aproveitar o espaço vazio do quadro.
  - **Pessoa excluída** (21/11/2026): na lixeira, os posts dela continuam nos números da empresa (assuntos das
    pessoas, publicações) — tirar das estatísticas enquanto estiver na lixeira (voltam se restaurar). Exclusão
    definitiva: hoje o `ON DELETE SET NULL` deixa os posts sem pessoa e eles passam a contar como posts da PÁGINA
    (bug) — apagar as publicações dela (e os sinais ligados) no `beforeDelete` definitivo, com aviso na confirmação.
- 0.5.0 — Classificação com LLM e envio de notas/atividades ao Pipedrive.
- Depois: Driva, sites e portais de negócios, Instagram e Facebook (roadmap da proposta).
