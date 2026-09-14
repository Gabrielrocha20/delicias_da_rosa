#!/bin/sh
set -eu

attempt=1
until python manage.py migrate --noinput; do
  if [ "$attempt" -ge 30 ]; then
    echo "Nao foi possivel conectar/migrar o banco apos 30 tentativas." >&2
    exit 1
  fi
  echo "Banco indisponivel; nova tentativa em 2 segundos ($attempt/30)." >&2
  attempt=$((attempt + 1))
  sleep 2
done

python manage.py collectstatic --noinput
exec "$@"
