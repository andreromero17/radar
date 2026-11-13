#!/bin/sh
# Backup diário (Fase 6B): banco inteiro (todas as contas e espaços) + anexos, em deploy/backups/, guardados
# BACKUP_DIAS dias. Com BACKUP_S3_BUCKET (e as chaves AWS) também manda uma cópia para fora do servidor.
#   sh /backup.sh agora   → faz um backup na hora e sai
set -eu
HORA="${BACKUP_HORA:-03:30}"
DIAS="${BACKUP_DIAS:-14}"

fazer() {
  carimbo=$(date +%Y-%m-%d_%H%M)
  pg_dump -Fc -f "/backups/banco-$carimbo.dump"
  tar czf "/backups/anexos-$carimbo.tar.gz" -C /dados . 2>/dev/null || true
  find /backups -type f -mtime +"$DIAS" -delete
  if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
    command -v aws >/dev/null || apk add --no-cache aws-cli >/dev/null
    aws s3 cp "/backups/banco-$carimbo.dump" "s3://$BACKUP_S3_BUCKET/banco-$carimbo.dump" --only-show-errors
    aws s3 cp "/backups/anexos-$carimbo.tar.gz" "s3://$BACKUP_S3_BUCKET/anexos-$carimbo.tar.gz" --only-show-errors
  fi
  echo "$(date '+%d/%m %H:%M') backup ok: banco-$carimbo.dump"
}

if [ "${1:-}" = "agora" ]; then fazer; exit 0; fi
echo "backup diário às $HORA (guarda $DIAS dias)"
while true; do
  agora=$(date +%s)
  alvo=$(date -d "$(date +%Y-%m-%d) $HORA" +%s 2>/dev/null || date -D '%Y-%m-%d %H:%M' -d "$(date +%Y-%m-%d) $HORA" +%s)
  [ "$alvo" -le "$agora" ] && alvo=$((alvo + 86400))
  sleep $((alvo - agora))
  fazer || echo "$(date '+%d/%m %H:%M') ✖ backup falhou"
done
