# Stream API (Express)

Standalone Node.js Express server for NSKAnime streaming (`consumet-multi` + AllAnime).

| What | URL (local dev) |
|------|-----------------|
| Health | http://127.0.0.1:3003/api/health |
| Episodes | http://127.0.0.1:3003/api/anime/info?id=allanime:... |
| Stream | http://127.0.0.1:3003/api/stream/:episodeId?category=sub |
| Search | http://127.0.0.1:3003/api/anime/search?q=naruto |

Deploy separately (Railway recommended, or VPS + PM2). Frontend is a static Vite app.

| Guide | URL |
|-------|-----|
| Railway (recommended) | [../deploy/railway.md](../deploy/railway.md) |
| Cloudflare DNS | [../deploy/cloudflare-dns.md](../deploy/cloudflare-dns.md) |
| Full overview | [../DEPLOYMENT.md](../DEPLOYMENT.md) |

Config-as-code: [`railway.toml`](railway.toml), optional [`Dockerfile`](Dockerfile).

## Local dev

Terminal 1 — stream API:

```powershell
cd stream-api
npm install
npm run dev
```

Terminal 2 — frontend (proxies `/api` to port 3003):

```powershell
npm run dev
```

## Production

```powershell
cd stream-api
cp .env.example .env   # edit FRONTEND_ORIGIN, KV credentials
npm install
npm run build
npm start
```

Entry point: `dist/src/server.js` (via `npm start`).

Binds to `process.env.PORT` (default **3003**).

**PM2:**

```bash
npm run build
pm2 start dist/src/server.js --name stream-api
pm2 save
```

## Frontend env

```env
VITE_API_URL=https://api.nskanime.uk
```

In local dev, leave unset — Vite proxies `/api` to `http://127.0.0.1:3003`.

Same-origin nginx deploy: leave `VITE_API_URL` unset; proxy `/api/` to stream-api.

## Environment

See [`.env.example`](.env.example). Key vars:

| Variable | Purpose |
|----------|---------|
| `PORT` | Listen port (default 3003) |
| `NODE_ENV` | `production` enables startup env warnings |
| `FRONTEND_ORIGIN` | CORS allowlist (comma-separated) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Redis/Upstash cache (optional) |

## Validation

```bash
# from repo root, with API running:
npm run validate:deploy
API_BASE=https://api.nskanime.uk npm run validate:deploy
```
