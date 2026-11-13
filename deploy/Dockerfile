# =============================================================================
# Imagem de produção (Fase 6B): compila web + server e roda só o necessário.
#   docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
# =============================================================================
FROM node:22-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 usa binário pronto; as ferramentas de compilação ficam só para o caso de não haver
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production TZ=America/Sao_Paulo
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared ./shared
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist
RUN mkdir -p /app/server/data && chown -R node:node /app/server/data
USER node
WORKDIR /app/server
EXPOSE 3001
# migrações antes de subir (plataforma + todos os espaços); em produção o servidor recusa migração pendente
CMD ["sh", "-c", "node dist/cli.js migrate && exec node dist/index.js"]
