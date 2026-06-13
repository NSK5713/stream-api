# Stream API (Express)

Standalone Node.js Express server for anime streaming provider routes (`@consumet/extensions`).

| What | URL (local) |
|------|-------------|
| Health | http://127.0.0.1:3000/api/health |
| Search | http://127.0.0.1:3000/api/anime/search?q=naruto |
| Info | http://127.0.0.1:3000/api/anime/info?id=... |
| Watch | http://127.0.0.1:3000/api/anime/watch?episodeId=... |

Deploy this service separately (Railway, Render, Fly.io, etc.). The frontend is a static Vite app and talks to the API via `VITE_STREAM_API_URL`.

## Local dev

Terminal 1 — stream API:

```powershell
cd stream-api
npm install
npm run dev
```

Terminal 2 — frontend (proxies `/api` to port 3000):

```powershell
npm run dev
```

## Production

```powershell
cd stream-api
npm install
npm run build
npm start
```

Binds to `process.env.PORT` (default `3000`).

## Frontend env

Point the Vite app at your deployed API:

```text
VITE_STREAM_API_URL=https://your-stream-api.example.com
```

In local dev, leave this unset — Vite proxies `/api` to `http://127.0.0.1:3000`.

## Optional env

```text
PORT=3000
FRONTEND_ORIGIN=https://your-frontend.example.com
STREAM_PROVIDER=consumet-multi
KV_REST_API_URL=
KV_REST_API_TOKEN=
STREAM_PROVIDER_BASE_URL=
```

`FRONTEND_ORIGIN` may be a comma-separated list. Use `*` to allow all origins (default).
