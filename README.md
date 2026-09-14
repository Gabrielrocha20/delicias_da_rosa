# Rosa's Candy — Backoffice

Backoffice para gestão de confeitaria com dashboard, ficha técnica de produtos, custos, estoque, equipe, produção e vendas. O frontend é React, a API usa Django REST Framework e o banco de produção é PostgreSQL. SQLite continua disponível apenas para desenvolvimento rápido.

## Rodar pela primeira vez

Requisitos: Python 3.11+ e Node.js 22+.

```bash
npm install
npm run install:all
npm run migrate
npm run dev
```

Abra `http://localhost:5173`.

- E-mail: `admin@rosascandy.com`
- Senha: `admin123`

Contas de demonstração criadas automaticamente:

| Cargo | E-mail | Senha | Acesso |
|---|---|---|---|
| Administrador | `admin@rosascandy.com` | `admin123` | Sistema completo |
| Vendedor | `vendedor@rosascandy.com` | `vendedor123` | Dashboard pessoal, próprias vendas e transparência |
| Produtor | `produtor@rosascandy.com` | `produtor123` | Dashboard pessoal, própria produção e transparência |

No modo SQLite, o banco fica em `backend/data/rosas-candy.db`. Em PostgreSQL, host, porta, banco, usuário, senha e SSL são configurados pelo ambiente. As migrations criam a estrutura Django e importam automaticamente os dados da versão Node na primeira execução. Em uma instalação nova, são criados acessos e dados mínimos de demonstração.

## Rodar como build local

```bash
npm run build
npm start
```

Depois abra `http://localhost:3333`. A API serve o build React automaticamente.

## Estrutura

```text
frontend/
  src/components/   componentes compartilhados
  src/lib/          acesso à API e formatação
  src/pages/        páginas de cada módulo
backend/
  config/            configurações, URLs e WSGI/ASGI
  core/models.py     modelos ORM do negócio
  core/views.py      endpoints Django REST Framework
  core/services.py   dashboards, previsões e Página da Verdade
  core/serializers.py validação e contrato JSON
  core/migrations/   schema e importação da base anterior
  data/              arquivo SQLite local (ignorado pelo Git)
```

## Regras de cálculo

- Custo do insumo por unidade = preço pago / quantidade comprada.
- Custo da receita = soma da quantidade usada × custo base do insumo.
- Custo unitário = receita + embalagem + outros custos.
- Lucro líquido estimado = preço de venda − custo unitário − taxas/comissões.
- Estoque pronto estimado = produção concluída − vendas não canceladas.
- Previsão de venda = velocidade média dos últimos 30 dias aplicada ao estoque atual.
- Comissão do vendedor/produtor = faturamento das vendas vinculadas × percentual definido no produto.
- Resultado do proprietário = faturamento − custo direto − taxas − vendedor − produtor − parceiro − reserva de caixa.
- ROI da empresa = resultado do proprietário / custo direto dos produtos.

## Cargos e segurança

As permissões são aplicadas tanto na navegação quanto na API. Um vendedor não consegue consultar vendas de outro vendedor, e um produtor não consegue consultar lotes de outro produtor mesmo que tente acessar o endpoint diretamente.

O administrador cria contas em **Acessos** e as vincula a uma pessoa cadastrada na **Equipe**. A **Página da Verdade** fica disponível para todos os usuários autenticados.

Os estabelecimentos parceiros podem revender produtos específicos com percentuais diferentes. A comissão vigente é gravada na venda para que alterações futuras no contrato não mudem o histórico.

## Configuração

Copie `backend/.env.example` para `backend/.env`, preencha as variáveis PostgreSQL e altere `DJANGO_SECRET_KEY` antes de publicar. Defina `VITE_API_URL` no frontend caso a API fique em outro endereço. A criação manual do banco e do usuário está documentada em `DATABASE_SETUP.txt`.

O painel administrativo nativo do Django está disponível em `http://localhost:3333/django-admin/` para o administrador.

## Backend Django

O frontend acessa apenas rotas sob `/api`, concentradas em `frontend/src/lib/api.js`. Autenticação, permissões por cargo e escopo de registros são aplicados no Django, independentemente dos menus exibidos no React.

Comandos úteis:

```bash
python backend/manage.py makemigrations
python backend/manage.py migrate
python backend/manage.py check
python backend/manage.py createsuperuser
```

## Testes

```bash
npm test
```

A suíte executa testes unitários e de segurança nos dois projetos. O backend valida autenticação Bearer, senhas, permissões por cargo, isolamento de registros, comissões controladas pelo servidor, quantidades e cálculos financeiros. O frontend valida sessão, cliente HTTP, login, rotas por cargo e o formulário de ingredientes.

## Docker Compose

Desenvolvimento com PostgreSQL no próprio Compose:

```powershell
Copy-Item docker/env.dev.example docker/.env.dev
docker compose --env-file docker/.env.dev --profile local-db up -d --build
```

Produção com PostgreSQL externo:

```powershell
Copy-Item docker/env.prod.example docker/.env.prod
# Edite docker/.env.prod e só então execute:
docker compose --env-file docker/.env.prod up -d --build backend frontend
```

O frontend fica público na porta configurada e usa `/api` na mesma origem. O Nginx encaminha as chamadas ao Django pela rede interna. A porta direta do backend é vinculada a `127.0.0.1` por padrão.
