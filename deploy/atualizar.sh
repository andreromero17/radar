#!/bin/sh
# Atualiza o sistema no servidor: baixa o código, reconstrói e sobe (as migrações rodam ao subir).
set -eu
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
docker image prune -f >/dev/null
docker compose -f deploy/docker-compose.yml --env-file deploy/.env ps
