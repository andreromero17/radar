# Colocar no ar (Fase 6B)

Um servidor Linux (Ubuntu) com Docker roda tudo: **Postgres**, a **aplicação**, o **Caddy** (HTTPS automático) e o
**backup** diário. Testado num Lightsail de 2 GB.

> Comandos `docker compose` abaixo sempre a partir da pasta do projeto, com
> `-f deploy/docker-compose.yml --env-file deploy/.env` (o atalho `dc` do passo 3 encurta isso).

## 1. Servidor pronto

Ubuntu 24.04 atualizado, fuso `America/Sao_Paulo`, swap de 2 GB e Docker instalado (`docker run --rm hello-world`
funciona). Firewall: portas 22, 80 e 443. IP fixo.

## 2. Código no servidor

Repositório privado: crie uma **chave de implantação** (só leitura) no próprio servidor.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N "" -C "deploy@servidor"
cat ~/.ssh/github_deploy.pub          # copie a linha
```

No GitHub: repositório → **Settings → Deploy keys → Add deploy key** → cole (deixe "Allow write access" desmarcado).

```bash
printf 'Host github.com\n  IdentityFile ~/.ssh/github_deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config
git clone git@github.com:<dono>/<repositorio>.git ~/app
cd ~/app
```

## 3. Configuração

```bash
cp deploy/.env.exemplo deploy/.env
openssl rand -hex 24                  # use como POSTGRES_PASSWORD
nano deploy/.env                      # DOMINIO, APP_URL, senha do Postgres, SMTP
echo "alias dc='docker compose -f ~/app/deploy/docker-compose.yml --env-file ~/app/deploy/.env'" >> ~/.bashrc
source ~/.bashrc
```

Sem domínio ainda: `DOMINIO=<ip-com-hífens>.sslip.io` (ex.: `3-129-231-124.sslip.io`) e
`APP_URL=https://<o mesmo>`. O HTTPS funciona igual. Ao trocar para o domínio definitivo, mude as duas linhas e rode
`dc up -d` (todos precisam entrar de novo).

## 4. Dados

**a) Começar do zero**: pule para o passo 5 e, depois de subir, crie o administrador:

```bash
dc exec app node dist/cli.js admin seu@email.com "Seu Nome"     # mostra a senha provisória
```

**b) Trazer a instalação que roda no seu computador (SQLite)** — antes de subir a aplicação pela primeira vez:

```bash
# no seu computador (com o sistema parado):
cd <projeto>/server && tar czf ~/dados.tgz data
scp -i <chave-do-servidor>.pem ~/dados.tgz ubuntu@<ip>:~

# no servidor:
mkdir -p ~/importar && tar xzf ~/dados.tgz -C ~/importar
dc up -d db
dc run --rm -v ~/importar/data:/importar -e DB_PATH=/importar/app.db -e ESPACOS_DIR=/importar/espacos \
  app node dist/cli.js para-postgres
dc run --rm -v ~/importar/data/anexos:/origem:ro app sh -c 'cp -r /origem/. /app/server/data/anexos/'
```

O comando confere as contagens tabela a tabela. Os logins e senhas continuam os mesmos.

## 5. Subir

```bash
dc up -d --build        # primeira vez: 5 a 10 minutos (compila a aplicação)
dc ps                   # db, app, caddy e backup "running"/"healthy"
dc logs -f app          # Ctrl+C para sair
```

Abra `https://<DOMINIO>`. Administradores configuram a verificação em duas etapas no primeiro acesso
(`ADMIN_2FA_OBRIGATORIO=true`).

## Dia a dia

| O quê                                  | Comando                                                 |
| -------------------------------------- | ------------------------------------------------------- |
| Atualizar para a versão nova do código | `~/app/deploy/atualizar.sh`                             |
| Ver logs                               | `dc logs -f app` (ou `caddy`, `backup`)                 |
| Backup agora                           | `dc exec backup sh /backup.sh agora`                    |
| Backups guardados                      | `ls ~/app/deploy/backups` (banco + anexos, 14 dias)     |
| Recuperar acesso de administrador      | `dc exec app node dist/cli.js admin email@x.com "Nome"` |
| Reiniciar                              | `dc restart app`                                        |

## Restaurar um backup

```bash
dc stop app
dc exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < ~/app/deploy/backups/banco-AAAA-MM-DD_HHMM.dump
dc run --rm -v ~/app/deploy/backups:/b:ro app sh -c 'tar xzf /b/anexos-AAAA-MM-DD_HHMM.tar.gz -C /app/server/data'
dc start app
```

## Cópia fora do servidor

Os backups ficam no próprio servidor (e o Lightsail tira snapshot diário dele inteiro). Para uma cópia em outro lugar,
preencha `BACKUP_S3_BUCKET` e as chaves AWS no `deploy/.env` (um bucket S3 ou do Lightsail) e rode `dc up -d backup`.
