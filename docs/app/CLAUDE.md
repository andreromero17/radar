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
- A coleta é idempotente: publicação pelo `id_externo`; rodar duas vezes não duplica.
- Token do Apify, do Pipedrive e de LLM só no `.env` (frame: segredos nunca na tabela de configurações).
- Dados pessoais só de perfis públicos e só os campos do modelo.

## Onde está cada coisa

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

- 0.3.0 — Coleta diária no Apify (`registrarTarefaDiaria`), com conferência de autoria, custos em `coletas` e
  alertas de troca de cargo/empresa.
- 0.4.0 — Telas próprias do esboço: abas Contas-alvo/Concorrentes no topo, visão geral de cada universo, caixa de
  sinais com avaliação, detalhe da empresa e da pessoa, logos.
- 0.5.0 — Classificação com LLM e envio de notas/atividades ao Pipedrive.
- Depois: Driva, sites e portais de negócios, Instagram e Facebook (roadmap da proposta).
