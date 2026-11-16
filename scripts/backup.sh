#!/bin/sh
# Backup do banco da Doces Mivi rodando no Docker.
# Uso na VPS:  sh scripts/backup.sh            (guarda em ./backups)
# Agende no cron, por exemplo todo dia às 3h:
#   0 3 * * * cd /opt/doces-mivi && sh scripts/backup.sh >> backups/backup.log 2>&1
set -eu

ENV_FILE=${ENV_FILE:-docker/.env.prod}
DEST=${DEST:-backups}
KEEP_DAYS=${KEEP_DAYS:-30}
STAMP=$(date +%F-%H%M%S)
mkdir -p "$DEST"

engine=$(grep -E '^DB_ENGINE=' "$ENV_FILE" | cut -d= -f2 | tr -d '\r' || true)

if [ "$engine" = "postgresql" ] || [ "$engine" = "postgres" ]; then
  docker compose --env-file "$ENV_FILE" --profile postgres exec -T database \
    sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$DEST/doces-mivi-$STAMP.dump"
  echo "Backup PostgreSQL salvo em $DEST/doces-mivi-$STAMP.dump"
else
  # Cópia consistente com o sistema rodando (API de backup do SQLite).
  docker compose --env-file "$ENV_FILE" exec -T backend python -c "
import os, sqlite3
src = sqlite3.connect(os.environ.get('SQLITE_PATH', '/app/data/rosas-candy.db'))
dst = sqlite3.connect('/app/data/backup-tmp.db')
src.backup(dst); dst.close(); src.close()
"
  container=$(docker compose --env-file "$ENV_FILE" ps -q backend)
  docker cp "$container:/app/data/backup-tmp.db" "$DEST/doces-mivi-$STAMP.db"
  docker compose --env-file "$ENV_FILE" exec -T backend rm -f /app/data/backup-tmp.db
  echo "Backup SQLite salvo em $DEST/doces-mivi-$STAMP.db"
fi

find "$DEST" -name 'doces-mivi-*' -mtime +"$KEEP_DAYS" -delete
