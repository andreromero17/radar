# Changelog do Radar

## 0.4.5 — 20/11/2026

- Correção: empresas e pessoas cadastradas antes da 0.4.4 que já tinham passado por uma coleta com a janela curta
  continuavam sem os posts dos últimos 30 dias. Agora cada fonte tem a marca `historico_posts_em`: sem ela, entra no
  run de 30 dias e é marcada quando a coleta termina bem. Fonte que já tem post com mais de 20 dias é marcada sem
  novo run (não gasta crédito à toa).
- Página da empresa: botão **Buscar 30 dias** (para quem corrigiu o endereço do LinkedIn, por exemplo) — na próxima
  coleta de posts, a empresa e as pessoas dela recebem de novo os últimos 30 dias.

## 0.4.4 — 20/11/2026

- Coleta de posts: empresa ou pessoa cadastrada depois da última coleta ganha os últimos 30 dias num run à parte
  (antes, recebia só os posts desde a última coleta). A "última coleta" passou a ser só a de posts (as de páginas e
  vagas confundiam a janela).
- Concorrentes: ao lado de "Assuntos mais abordados", o gráfico de barras **O que mais engaja** (média de
  interações por post, por assunto). "Assuntos por concorrente" ocupa a largura toda; a lista com exemplos virou
  "Posts de destaque por assunto".
- Clicar num assunto (rosca, barras ou lista) abre **Publicações** já filtrada: posts próprios dos concorrentes, no
  período e no assunto; nas barras por concorrente, também na empresa; em "O que mais engaja", dos mais curtidos.
- Publicações ganham o **universo** da empresa (filtro), atualizado quando a empresa muda de universo; o campo
  Assuntos entra no painel de filtros.
- **Sinais** com as abas Contas-alvo | Concorrentes no topo (lembra a última usada, como o dashboard).

## 0.4.3 — 20/11/2026

- Cadastro da empresa com o logo em destaque (grande), mostrando o que está em uso (enviado ou do LinkedIn), com
  "Substituir logo" e "Voltar ao do LinkedIn"; sem o quadro vazio quando já há logo.
- Página da empresa com logo maior, indicador de vagas e a lista de vagas publicadas nos últimos 30 dias.
- Sinais: filtro rápido de severidade (Todos, Alta, Média, Baixa) no topo da lista e na página da empresa.
- Listas do Radar com 100 registros por página (opções 50, 100, 150, 200).
- Cores das etiquetas de universo, severidade e situação da coleta (não apareciam nas listas).
- Pipedrive em mão dupla: o que o Radar tem e o Pipedrive deixou vazio é gravado lá (organização: site,
  LinkedIn, segmento, tier; pessoa: cargo, LinkedIn). Quando os dois têm valor, vale o do Pipedrive. Configuração
  "Completar no Pipedrive…" (ligada por padrão). O resumo da sincronização mostra quantos registros foram completados.
- Vagas: ator `piotrv1001/linkedin-company-jobs-scraper` (o do piloto) roda junto com "Logos e seguidores" (semanal):
  vagas dos últimos 30 dias viram publicações do tipo "Vaga" e a contagem entra na coluna **Vagas** do comparativo.
- Site da empresa vem da página do LinkedIn quando o Radar não tem site (e daí segue para o Pipedrive, se lá estiver
  vazio).

## 0.4.2 — 20/11/2026

- Comparativo de concorrentes com o mesmo indicador de ordenação das listas do frame (coluna ativa em destaque com
  seta; nas outras, a seta aparece ao passar o mouse).
- Cadastro da empresa mostra o logo em uso: o enviado ou, sem ele, o baixado da página do LinkedIn.

## 0.4.1 — 20/11/2026

- **Assuntos** em todo post (13 assuntos: IA e agentes, Dados e analytics, Cloud, Segurança, ERP e plataformas,
  Parcerias, Cases e clientes, Prêmios e certificações, Vagas e talentos, Eventos e conteúdo, Cultura e pessoas,
  Lançamentos e ofertas, Expansão e negócios; sem nenhum, "Outros"), por palavras-chave, na coleta e na importação;
  os posts antigos são classificados na primeira abertura da visão geral.
- Concorrentes: "Fatia da conversa" virou **Assuntos mais abordados** (todos os concorrentes juntos);
  "Movimentos por concorrente" virou **Assuntos por concorrente**; **O que mais engaja** agora é por assunto, com
  todos os posts (não só os que viraram sinal).
- Comparativo **ordenável** clicando no título da coluna ("Nós" fica sempre no topo); dicas nos títulos.
- Clicar na empresa abre a **página da empresa** (`/empresa/:id`): seguidores, posts, interações e engajamento,
  posts por semana, assuntos e engajamento, posts que mais engajaram, sinais, pessoas-chave e todas as
  publicações do período (página e pessoas). "Editar cadastro" leva ao formulário.

## 0.4.0 — 20/11/2026

- Dashboard próprio do Radar com abas **Contas-alvo | Concorrentes** no topo (lembradas na URL e no navegador) e
  período de 7, 30 ou 90 dias.
- Concorrentes: indicadores, **comparativo** por empresa (seguidores e variação semanal, posts e reposts com
  seta contra o período anterior, curtidas/comentários/compartilhamentos por post, taxa de engajamento, movimentos,
  alta, último post), **fatia da conversa**, **movimentos por concorrente** e **o que mais engaja** (média de
  interações por tipo de movimento, com posts de exemplo).
- Empresa com universo **"Nós"**: a própria empresa aparece destacada no topo do comparativo.
- Contas-alvo: indicadores, **Agir esta semana**, sinais por semana, tipos de sinal e **contas em destaque** pelo
  Score Radar (alta 25, média 10, baixa 3, pessoa-chave que publicou 5; até 100).
- Logos e seguidores automáticos: ator `harvestapi/linkedin-company` uma vez por semana (e pelo botão "Logos e
  seguidores" em Execuções); o logo é baixado e guardado (os links do LinkedIn expiram); histórico em
  `metricas_empresas`.
- Logo em toda lista do Radar: a imagem ou as iniciais numa cor fixa por empresa.

## 0.3.1 — 19/11/2026

- A coleta espera o ator do Apify por até 3 horas (antes, 30 min — a primeira coleta, com ~500 fontes, passa disso).
- O id do run no Apify fica gravado na execução. Se a espera passar do limite ou o servidor reiniciar no meio, o
  botão "Retomar coleta" aproveita o mesmo run, sem disparar outro nem pagar de novo.
- Execução que ficou "Rodando" sem estar rodando vira "Erro" (interrompida) ao abrir a tela de execuções.

## 0.3.0 — 19/11/2026

- Coleta de posts do LinkedIn pelo Apify (`harvestapi/linkedin-company-posts`, sem login): páginas das empresas e
  perfis das pessoas monitoradas num só run, todo dia às 07:00 e pelo botão "Coletar agora" em Coleta › Execuções.
- Janela desde a última coleta bem-sucedida (menos 1 dia; primeira vez, 30 dias); até 20 posts por fonte
  (configurável). Publicações novas entram com triagem "Pendente"; as já existentes só atualizam o engajamento.
- Conferência de autoria: post de outro autor sem cabeçalho de repost é descartado e contado na execução.
- Empresa ganha o logo do LinkedIn; pessoa ganha o título do perfil, e título que muda vira alerta "Troca de cargo".
- Cada execução registra fontes, itens encontrados e novos, descartados, custo em US$ e o erro, se houver.
- `.env`: `APIFY_TOKEN`.

## 0.2.1 — 19/11/2026

- Empresas e pessoas ganham lixeira. O que foi mandado para a lixeira não volta na sincronização com o Pipedrive
  (aparece como "ignoradas" no resumo); restaurar da lixeira volta a sincronizar.

## 0.2.0 — 19/11/2026

- Sincronização com o Pipedrive (botão "Sincronizar com Pipedrive" na lista de empresas e todo dia às 06:30):
  organizações dos filtros de contas-alvo e de concorrentes viram empresas (nome, página do LinkedIn, site,
  segmento, tier, UF e dono) e as pessoas delas com perfil do LinkedIn viram pessoas-chave (nome, cargo, nível).
- Nunca sobrescreve o que é do Radar (nome curto, logo, monitorar, observações, prioridade); vazio no Pipedrive
  não apaga dado do Radar; o mesmo perfil em dois contatos vira alerta "Cadastro duplicado".
- Configurações › Radar: filtro das contas-alvo, filtro dos concorrentes e sincronização diária.
- `.env`: `PIPEDRIVE_API_TOKEN` (obrigatório) e `PIPEDRIVE_DOMINIO` (opcional).

## 0.1.0 — 19/11/2026

- Sistema criado sobre o frame-app 0.28.0.
- Cadastros: empresas (contas-alvo e concorrentes), pessoas-chave, publicações, sinais, alertas de cadastro e
  execuções de coleta, com menu próprio.
- Página/perfil do LinkedIn gravados normalizados e sem repetição.
- Dados reais do piloto (47 empresas, 50 pessoas, 501 publicações, 88 sinais, 3 alertas) no seed e no script
  `importar-piloto`.
