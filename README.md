# NSKAnime Stream API

Express + TypeScript backend for NSKAnime streaming, proxy, and admin endpoints.

**Version:** 0.1.0  
**Production:** https://api.nskanime.uk (Railway)

## Architecture

```
Client (nskanime.uk Worker or browser)
        │
        ▼
┌───────────────────────────────────────┐
│  Express API (this repo)              │
│  /api/health · /api/anime/*           │
│  /api/stream/* · /api/proxy/*         │
│  /api/admin/* · /api/skip-times/*     │
└───────────────┬───────────────────────┘
                │
    ┌───────────┼───────────────┐
    ▼           ▼               ▼
 AllAnime    Consumet         Upstash
 (via CF     providers        Redis cache
  relay)     (HiAnime, etc.)
```

The frontend Worker handles edge AllAnime GraphQL (`/api/anime/*` on `nskanime.uk`). Railway runs stream orchestration, media proxy fallbacks, skip times, and admin metrics.

## Railway deployment

1. Connect GitHub repo **`NSK5713/stream-api`**
2. Set environment variables (see below)
3. Add custom domain `api.nskanime.uk` (CNAME → Railway)

See also [`NSKAnime/deploy/railway.md`](../NSKAnime/deploy/railway.md) in the frontend repo.

## Local setup

```bash
npm install
cp .env.example .env
npm run dev          # nodemon — http://127.0.0.1:3003
```

Pair with the NSKAnime frontend (`npm run dev` on port 3002); Vite proxies `/api` → `:3003`.

## Environment variables

Copy [`.env.example`](.env.example) → `.env`.

| Variable | Required | Purpose |
|----------|----------|---------|
| `NODE_ENV` | Production | `production` |
| `FRONTEND_ORIGIN` | Yes | CORS origins, comma-separated |
| `ADMIN_TOKEN` | Recommended | Protects `/api/admin/*` |
| `ALLANIME_API_URL` | Railway | Cloudflare relay URL, e.g. `https://nskanime.uk/r/v1/gql` |
| `ALLANIME_RELAY_TOKEN` | Railway | Must match Cloudflare `ALLANIME_RELAY_SECRET` |
| `KV_REST_API_URL` | Optional | Upstash Redis REST cache |
| `KV_REST_API_TOKEN` | Optional | Upstash token |
| `SENTRY_DSN` | Optional | Server error reporting |

Do **not** commit `.env`. Railway injects `PORT` automatically.

## Build & run

```bash
npm run build        # tsc → dist/
npm start            # node dist/server.js
```

## Streaming architecture

Default provider chain (`STREAM_PROVIDER=consumet-multi`):

1. **Consumet providers** — AnimeKai, HiAnime, AnimePahe, KickAssAnime via `@consumet/extensions`
2. **AllAnime** — GraphQL provider (ani-cli style), reached through Cloudflare relay on Railway

Railway datacenter IPs are blocked by AllAnime's Cloudflare. The NSKAnime Worker exposes authenticated relay paths:

| Relay path | Purpose |
|------------|---------|
| `/r/v1/gql` | AllAnime GraphQL |
| `/r/v1/fetch` | Mirror / embed fetches |

Set `ALLANIME_API_URL` and `ALLANIME_RELAY_TOKEN` to match the frontend Worker secret `ALLANIME_RELAY_SECRET`.

## Provider overview

| Provider | Role |
|----------|------|
| `consumet-multi` | Default multi-provider chain |
| AllAnime | Fallback / primary for many titles |
| HiAnime / AnimeKai | Consumet-backed episode sources |
| Proxy (`/api/proxy`) | Media URL proxy with allowlist |

Episode titles, skip times, and stream URLs are cached in Redis when `KV_REST_*` is configured.

## Security

- **`ADMIN_TOKEN`** — required header `x-admin-token` for admin routes
- **`ALLANIME_RELAY_TOKEN`** — required header `x-allanime-relay-token` on relay paths (when secret is set)
- CORS enforced via `FRONTEND_ORIGIN`
- Rate limiting on sensitive routes

Never commit secrets. Rotate `ADMIN_TOKEN` and relay tokens if exposed.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Local development with nodemon |
| `npm run build` | TypeScript compile |
| `npm start` | Production server |
| `npm run test:unit` | Stream orchestrator tests |

Diagnostic scripts are in `scripts/` (probes, relay tests).
