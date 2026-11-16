# Doces Mivi — gestão da fábrica

Backoffice da fábrica de bolos: insumos com estoque e histórico, fichas técnicas com custo, produção que baixa
insumos sozinha, vendas, parceiros, caixa, Página da Verdade e um **assistente** que diz o que comprar, o que
produzir e quais preços revisar.

| Parte | Pasta | Tecnologia |
|---|---|---|
| API | `backend/` | Django 5 + Django REST Framework |
| Painel web | `frontend/` | React 19 + Vite |
| App celular | `mobile/` | React Native + Expo (SDK 58) |

## Rodar no computador

Requisitos: Python 3.11+, Node.js 22+.

```bash
npm install
npm run install:all
npm run migrate
npm run dev            # Django em :3333 e painel em http://localhost:5173
```

Instalação nova cria estes acessos de demonstração (troque as senhas em **Acessos**):

| Cargo | E-mail | Senha |
|---|---|---|
| Administrador | `admin@docesmivi.com.br` | `admin123` |
| Vendedor | `vendedor@docesmivi.com.br` | `vendedor123` |
| Produtor | `produtor@docesmivi.com.br` | `produtor123` |

Bancos que já existiam mantêm os acessos que já tinham.

## Subir na VPS (Docker)

Na VPS (Ubuntu com Docker e Nginx):

```bash
git clone <repositório> /opt/doces-mivi && cd /opt/doces-mivi
cp docker/env.prod.example docker/.env.prod
python3 -c "import secrets; print(secrets.token_urlsafe(50))"   # cole em DJANGO_SECRET_KEY
nano docker/.env.prod                                            # domínio nas 4 variáveis de URL/host
docker compose --env-file docker/.env.prod up -d --build
```

1. Copie `docker/nginx.doces-mivi.conf.example` para `/etc/nginx/sites-available/doces-mivi`, ajuste o
   domínio, ative o site e rode `sudo certbot --nginx -d seu.dominio` para ter HTTPS.
2. Teste: `curl -H 'X-Forwarded-Proto: https' http://127.0.0.1:8087/api/health`.
3. Backup diário: `sh scripts/backup.sh` (agende no cron; o comando está no topo do arquivo).

Detalhes que já ficam prontos:

- O backend não sobe em produção sem uma `DJANGO_SECRET_KEY` longa (40+ caracteres).
- Migrations e `collectstatic` rodam sozinhos ao iniciar o container; o admin do Django
  (`/django-admin/`) é servido pelo WhiteNoise.
- Login limitado a 10 tentativas por minuto; perguntas ao assistente, 20 por hora (ajustável por
  `THROTTLE_LOGIN` e `THROTTLE_ASSISTANT`).
- **Banco:** SQLite por padrão (volume `rosas-candy_sqlite_data`, o mesmo da versão anterior — os dados
  continuam). Para PostgreSQL no mesmo servidor, defina `DB_ENGINE=postgresql` e `POSTGRES_PASSWORD` e suba
  com `--profile postgres`. Banco externo: veja `DATABASE_SETUP.txt`.
- Logs com rotação (10 MB × 5 arquivos por serviço).
- Depois que o HTTPS estiver estável, ligue `DJANGO_HSTS_SECONDS=31536000`.

## App de celular

O app usa a **mesma API**: no primeiro login, informe o endereço do painel (ex.: `painel.seudominio.com.br`).

**Testar agora com o Expo Go** (Android/iPhone, app gratuito na loja):

```bash
cd mobile
npm install
npx expo start          # leia o QR code com o Expo Go
```

Para testar contra o backend do seu computador, rode `npm run start` na raiz (Django em `0.0.0.0:3333`),
adicione o IP do PC em `DJANGO_ALLOWED_HOSTS` e use `http://IP-DO-PC:3333` como servidor no app.

**Gerar o APK** (build na nuvem do Expo, conta gratuita em expo.dev):

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

Ao terminar, o EAS mostra um link para baixar o `.apk`. O perfil `production` gera `.aab` para a Play Store.
O APK precisa de HTTPS no servidor (o Android bloqueia `http://` em apps instalados).

O que cada cargo vê no app: administrador — início, vendas, produção, insumos (entrada de compra,
contagem/perda, histórico), assistente, caixa e Página da Verdade; vendedor — as próprias vendas;
produtor — os próprios lotes. Cadastros de produtos, receitas, equipe e acessos ficam no painel web.

## Assistente

`GET /api/assistant/insights` calcula, sem custo e sem internet:

- insumos em falta, abaixo do mínimo, sem mínimo definido ou insuficientes para os lotes agendados;
- **lista de compras** em embalagens inteiras para 14 dias + lotes agendados (copiar ou mandar no WhatsApp);
- quanto dá para produzir de cada receita agora e qual insumo limita;
- produtos com margem baixa ou prejuízo, com o preço que daria 25% de margem;
- o que produzir pelo ritmo de venda, produtos parados e vendas a receber.

O **chat** (`POST /api/assistant/ask`) é opcional: defina `ANTHROPIC_API_KEY` no `.env` e ele responde perguntas
livres com os números da fábrica, usando o modelo `claude-opus-5-5` (troque por `ASSISTANT_MODEL`).
Sem a chave, o resto funciona igual.

## Regras de cálculo

- Custo do insumo por unidade = preço pago / quantidade comprada (o cadastro converte kg→g, l→ml, dúzia→un).
- Entrada de compra soma ao estoque, atualiza o custo (opcional) e lança a saída no caixa (opcional).
- Concluir um lote baixa os insumos da receita e grava no histórico; excluir ou reabrir devolve.
- Custo unitário = receita + embalagem + outros custos.
- Lucro do proprietário = preço − custo − taxas − comissões − reserva de caixa − parceiro.
- Cobertura do insumo = estoque ÷ consumo médio diário dos lotes concluídos nos últimos 30 dias.
- Saldo do caixa = vendas pagas + entradas manuais − saídas.

## Testes

```bash
npm test     # 31 testes no backend + 12 no painel
```

## Estrutura

```text
backend/core/
  models.py       negócio (StockMovement = histórico de estoque)
  inventory.py    consumo médio, cobertura, sugestão de compra
  assistant.py    regras do assistente e chat opcional com IA
  views.py        endpoints REST
frontend/src/
  pages/          uma página por módulo (Insumos, Assistente, …)
  components/UI.jsx
mobile/
  App.js          navegação por cargo
  src/screens/    telas do app
docker/           exemplos de .env e Nginx
scripts/backup.sh backup do banco no Docker
```
