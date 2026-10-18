# QR Dinâmico

Gerenciador de **QR codes dinâmicos** com analytics, feito para rodar no **Railway**.

O QR aponta para uma URL curta sua (`https://go.meudominio.com/cardapio`). O servidor registra o scan e responde `302` para o destino. Como o destino pode ser trocado a qualquer momento, o QR impresso nunca precisa mudar.

- **Redirect rápido:** cache em memória e consulta indexada no SQLite, com `Cache-Control: no-store`. O scan é gravado em segundo plano e nunca bloqueia nem derruba o redirect.
- **Analytics:** KPIs com comparação ao período anterior, série diária, heatmap dia × hora (horário de Brasília), dispositivo/SO/navegador, referrers, idiomas, scans recentes, exportação em CSV e API JSON.
- **Privacidade (LGPD):** nenhum IP é armazenado, e não há geolocalização. `visitor_hash = SHA-256(salt diário | IP | User-Agent)`, com salt aleatório apagado após 2 dias. Bots e previews (WhatsApp, Telegram, Slack, Googlebot…) são marcados e ficam fora dos números por padrão.
- **Painel:** React + Tailwind, responsivo, tema claro/escuro, em português.

## Stack

| Camada | Tecnologia |
|---|---|
| Servidor | Node 24 + [Hono](https://hono.dev) (`@hono/node-server`), TypeScript |
| Banco | SQLite nativo do Node (`node:sqlite`) em um volume do Railway |
| Frontend | React 19 + Vite + Tailwind 4, servido pelo próprio servidor em `/app/` |
| Gráficos | Recharts |
| QR | `qr-code-styling` (PNG 2048px e SVG) |
| Testes | Vitest |
| Deploy | Dockerfile + `railway.json` (healthcheck em `/healthz`) |

## Estrutura

```
migrations/            SQL versionado, aplicado automaticamente na inicialização
scripts/seed.ts        popula o banco local com dados fictícios
src/shared/types.ts    contratos da API (servidor ↔ painel)
src/server/
  main.ts              entrada: lê variáveis, abre o banco, roda migrations, sobe o HTTP
  index.ts             monta as rotas: /healthz, /api, /app, /:slug
  db.ts                camada SQLite + migrator
  routes/              redirect.ts, api/{auth,links,stats}.ts
  services/            link-service, redirect-cache, scan-recorder, stats, auth, bot, user-agent, visitor-hash
  repositories/        SQL: links, scans, stats (agregações), rate-limit
  lib/                 http (erros/respostas), period (fuso), url, slug, crypto, request (IP), background
  views/pages.ts       páginas 404 / 410
src/app/               painel (pages/, components/, lib/)
test/                  testes do servidor
Dockerfile · railway.json
```

## Rotas

| Rota | Descrição |
|---|---|
| `GET /:slug` | Redirect público: `302` para o destino (com UTMs). `404` se não existe ou está desativado, `410` se expirou. `HEAD` não conta como scan. |
| `GET /healthz` | Healthcheck usado pelo Railway. |
| `/app/*` | Painel (SPA). |
| `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` | Sessão por cookie HttpOnly (JWT HS256, 7 dias). Rate limit de 5 tentativas a cada 15 min por IP. |
| `GET/POST /api/links` · `GET/PATCH/DELETE /api/links/:id` · `GET /api/links/tags` | CRUD. Busca `?q=`, filtro `?tag=`, ordenação `?sort=created_at\|updated_at\|title\|slug\|total_scans\|scans_24h&order=asc\|desc`. |
| `GET /api/links/:id/stats` · `GET /api/stats` | Todos os agregados em JSON (por link ou geral). |
| `GET /api/links/:id/scans` · `GET /api/scans` | Scans recentes paginados (`?page=&page_size=`), sem dados pessoais. |
| `GET /api/links/:id/scans/export` · `GET /api/scans/export` | CSV (até 50.000 linhas, em streaming). |
| `GET/PATCH /api/settings` | Pausa global da coleta (`{ "analytics_paused": true }`). A pausa por link é o campo `analytics_paused` em `PATCH /api/links/:id`. |
| `POST /api/scans/manual` | Lança N acessos numa data/hora (`{ link_id, ts: "2026-10-18 14:30", count, device_type? }`, horário de Brasília). |
| `POST /api/scans/import` | Importa CSV (`{ csv, link_id? }`). Tudo ou nada: com qualquer linha inválida, nada é gravado e a resposta lista os erros. |
| `POST /api/scans/clear` | Apaga scans (`{ link_id?, from?, to?, only: "all" \| "imported", confirm: "APAGAR" }`). |

### Gerenciar dados (aba Analytics)

- **Pausar coleta:** geral ou por link. Os QR continuam redirecionando, só não registram acessos.
- **Adicionar acessos:** lança acessos com data, hora, quantidade e dispositivo.
- **Importar CSV:** colunas `data` + `hora` (ou `data_hora`), `slug` (no analytics geral) e opcionais `dispositivo`, `quantidade`, `sistema`, `navegador`, `origem`, `idioma`. O CSV exportado pelo painel também é aceito, então serve de backup.
- **Limpar histórico:** do período selecionado ou de tudo; todos os registros ou só os importados/manuais.
- **Origem dos dados:** cada scan tem `source` = `qr` (leitura real), `import` ou `manual`. A tabela de scans, o CSV e a API mostram a origem, e o analytics informa quantos registros importados/manuais estão incluídos nos números.

Parâmetros comuns de analytics:

- `from` e `to`: `YYYY-MM-DD` (dia em São Paulo, `to` inclusivo) ou ISO 8601. Padrão: últimos 30 dias.
- `bots=1`: inclui bots.
- `link_id`: filtra as rotas gerais por link.

Todas as respostas JSON seguem o mesmo formato:

```json
{ "ok": true, "data": { ... } }
{ "ok": false, "error": { "code": "validation_error", "message": "Dados inválidos.", "details": [...] } }
```

### Integração externa

Defina a variável `API_TOKEN` (mínimo de 16 caracteres) e chame a API com `Authorization: Bearer <token>`:

```bash
curl -H "Authorization: Bearer $API_TOKEN" "https://go.meudominio.com/api/links/1/stats?from=2026-10-01&to=2026-10-31"
```

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `ADMIN_PASSWORD` | sim | Senha de login do painel. |
| `JWT_SECRET` | sim | Valor aleatório (mín. 16 caracteres) que assina o cookie de sessão. |
| `API_TOKEN` | não | Token para integrações externas (mín. 16 caracteres). |
| `PUBLIC_BASE_URL` | não | URL pública das URLs curtas e dos QR codes, ex.: `https://go.meudominio.com`. Vazio = origem da requisição. |
| `DATABASE_PATH` | não | **Só local.** Arquivo SQLite, padrão `./data/qr.db`. No Railway, não defina: o banco fica em `<volume>/qr.db`. |
| `PORT` | não | **Só local.** O Railway define sozinho. |
| `TRUST_PROXY` | não | `false` para ignorar `X-Forwarded-*` / `X-Real-IP` fora de um proxy confiável. Padrão: confia (Railway). |

Para gerar valores aleatórios:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Rodando localmente

Pré-requisito: Node 22.13+ (recomendado 24).

```bash
npm install
cp .env.example .env        # edite ADMIN_PASSWORD e JWT_SECRET
npm run db:seed             # opcional: ~6.000 scans fictícios em 5 links
npm run build
npm start
```

Abra http://localhost:3000/app/ e entre com a `ADMIN_PASSWORD`. Teste o redirect em http://localhost:3000/cardapio (se rodou o seed). As migrations rodam sozinhas na inicialização.

**Desenvolvimento com hot reload:** rode `npm run dev:server` (API na porta 3000, reinicia a cada alteração) e, em outro terminal, `npm run dev` (Vite em http://localhost:5173/app/, com proxy de `/api` para o servidor).

### Testes

```bash
npm test
```

Cobrem: redirect 302 com UTMs, 404 de link inexistente/desativado, 410 de link expirado, cache em memória, registro do scan (UA, idioma, origem, hash sem IP), salt diário, resiliência quando a gravação falha, detecção de bots e exclusão nas estatísticas, autenticação (cookie, token, rate limit, CSRF), CRUD, estatísticas, CSV, healthcheck e fallback da SPA.

```bash
npm run typecheck
```

## Deploy no Railway

O repositório já tem `Dockerfile` e `railway.json`: o Railway faz o build com Docker, usa `/healthz` como healthcheck e roda **uma réplica** (o SQLite fica num volume, que só pode ser montado em uma instância).

### 1. Enviar o código

**Opção A, GitHub (recomendada, com deploy automático a cada push):**

1. Crie um repositório no GitHub e envie o projeto. O `.gitignore` já exclui `.env`, `data/` e `dist/`.
2. No Railway: **New Project → Deploy from GitHub repo** e escolha o repositório.

**Opção B, Railway CLI (sem GitHub):**

```bash
npm i -g @railway/cli
```

```bash
railway login
```

```bash
railway init
```

```bash
railway up
```

### 2. Criar o volume (obrigatório)

Sem volume, o banco é apagado a cada deploy. No serviço: **clique com o botão direito → Attach Volume** (ou `Ctrl/Cmd + K → Volume`) e use o mount path **`/data`**. Ative também os **backups** do volume.

O servidor **recusa iniciar** no Railway se não houver volume ou se `DATABASE_PATH` apontar para fora dele (o log mostra `ERRO DE CONFIGURAÇÃO`). Assim o deploy falha e a versão anterior continua no ar, em vez de subir com o banco vazio.

### 3. Variáveis

Em **Variables**, adicione:

```
ADMIN_PASSWORD=<sua senha>
JWT_SECRET=<valor aleatório>
API_TOKEN=<opcional>
PUBLIC_BASE_URL=https://go.meudominio.com
```

**Não** adicione `DATABASE_PATH` nem `PORT` no Railway: o banco vai para o volume e a porta é definida pelo Railway. Salvar as variáveis dispara um novo deploy.

Para conferir, o log de inicialização deve mostrar `banco: /data/qr.db`.

### 4. Domínio

Em **Settings → Networking**:

- **Generate Domain** cria um endereço `https://<nome>.up.railway.app`, útil para testar.
- **Custom Domain**: informe o domínio (ex.: `go.meudominio.com`). O Railway mostra um registro **CNAME** (e às vezes um **TXT** de verificação). Crie esses registros no DNS do seu domínio. No Registro.br, isso fica em **DNS → Editar zona**.

Prefira um **subdomínio** (`go.meudominio.com`): o DNS padrão do Registro.br não aceita CNAME no domínio raiz. O certificado HTTPS é emitido automaticamente.

Depois, atualize `PUBLIC_BASE_URL` para o domínio final. **Configure o domínio antes de imprimir QR codes**: o endereço gravado no QR não pode mudar.

### 5. Conferir

Abra `https://go.meudominio.com/healthz` (deve responder `{"ok":true}`) e depois `/app/` para entrar no painel.

## Backups

O banco inteiro é o arquivo `qr.db` no volume. Ative os **backups de volume** do Railway (aba **Backups** do volume) para ter cópias automáticas.

## Decisões e observações

- **Uma réplica só:** SQLite com volume não pode ser compartilhado entre instâncias. Para este uso (redirect + painel), uma instância aguenta folgadamente milhares de scans por minuto.
- **Sem geolocalização:** fora da Cloudflare não há país/cidade por IP sem um serviço externo. As colunas de localização foram removidas (migration `0004`). Para voltar a ter, dá para integrar a base gratuita GeoLite2 da MaxMind.
- **Slug imutável:** ele está impresso no QR. Para "trocar" o QR, crie outro link.
- **Edições valem na hora:** o cache em memória é atualizado na mesma requisição que salva o link.
- **Fuso:** America/Sao_Paulo está fixo em UTC−3 (sem horário de verão desde 2019). Se o Brasil voltar a adotar horário de verão, ajuste `TZ_OFFSET_HOURS` em `src/server/lib/period.ts`.
- **Visitantes únicos** são aproximados e contados por dia: como o salt muda diariamente, a mesma pessoa em dois dias diferentes conta duas vezes num período de 30 dias. Isso é intencional, porque impede rastrear alguém entre dias.
- **IP atrás do proxy:** o servidor lê `X-Real-IP` / `X-Forwarded-For` (definidos pelo proxy do Railway) apenas para o hash e o rate limit; o IP nunca é gravado.
- **Referrer:** só o hostname é guardado. Leituras diretas de QR normalmente não têm referrer.
- **Exclusão de link** apaga também os scans (`ON DELETE CASCADE`). Para encerrar uma campanha mantendo o histórico, desative o link.
