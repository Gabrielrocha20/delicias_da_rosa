FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN groupadd --system mivi && useradd --system --gid mivi --home-dir /app mivi

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=mivi:mivi backend/ ./
RUN chmod +x /app/docker-entrypoint.sh && mkdir -p /app/staticfiles /app/data && chown -R mivi:mivi /app/staticfiles /app/data

USER mivi

EXPOSE 8000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["sh", "-c", "exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers ${GUNICORN_WORKERS:-3} --timeout 90 --access-logfile -"]
