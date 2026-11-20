# Changelog do Radar

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
