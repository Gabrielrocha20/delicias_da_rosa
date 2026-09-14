# Execução com Docker, SQLite e Nginx

O Compose usa SQLite no volume Docker `rosas-candy_sqlite_data`. O arquivo do
banco não fica dentro do container e sobrevive a recriações dos serviços.

## Subir em produção

```sh
cp docker/env.prod.example docker/.env.prod
# Edite docker/.env.prod: dominio e DJANGO_SECRET_KEY.
docker compose --env-file docker/.env.prod up -d --build
```

O único endereço publicado pelo Compose é `http://127.0.0.1:8080`. O backend
não possui porta publicada: a aplicação web encaminha `/api/` para ele pela
rede Docker interna.

Use o arquivo `nginx.rosas-candy.conf.example` como virtual host do Nginx do
servidor. Portanto, o upstream correto é:

```nginx
proxy_pass http://127.0.0.1:8080;
```

Depois de habilitar o site no Nginx, configure TLS (por exemplo, com Certbot) e
mantenha `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS` e `CSRF_TRUSTED_ORIGINS` com a
URL HTTPS pública do painel.

## Backup do SQLite

Faça o backup com o container parado para obter uma cópia consistente:

```sh
docker compose --env-file docker/.env.prod stop backend
docker run --rm -v rosas-candy_sqlite_data:/data -v "$PWD":/backup alpine \
  cp /data/rosas-candy.db /backup/rosas-candy-$(date +%F).db
docker compose --env-file docker/.env.prod start backend
```
