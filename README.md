# MacOS-Development Workspace

A MacOS-inspired desktop experience built for the web. This project combines:

- A Vite-based frontend (multi-page, `index.html` + `home.html`)
- A consolidated Node/Express backend (`macos-api-server.js`)
- SQLite-based billing/ERP-style modules and an AI assistant
- PM2-driven production deployment (local + VM)

## Engineering Handbook

Start with [the AI documentation index](docs/AI-INDEX.md) for concise source routing, or browse the [handbook source](docs/handbook/README.md). Build the illustrated HTML handbook, dependency inventory, master PDF, and focused PDF volumes with `npm run docs:build`.

---

## Environments & Ports

- **Dev (Windows 11)**  
  - Frontend: Vite on `http://localhost:5173`  
  - Backend API: Express on `http://localhost:3002`  
  - Vite proxies `/api` → `http://localhost:3002`

- **Production (local & VM, via PM2)**  
  - Frontend server (`server-prod.js`): listens on `:80`  
  - Backend API (`dist/src/api/main/macos-api-server.js`): listens on `:3001`  
  - Frontend proxies `/api` → `API_HOST:API_PORT` (defaults `127.0.0.1:3001`, IPv6-safe)

---

## Quick Start (Development)

1. Install dependencies:

```bash
npm install
```

2. Configure env (optional – defaults are fine for local dev):

```bash
cp .env.example .env.development
```

3. Run backend + frontend together:

```bash
npm run dev:local
```

Then open `http://localhost:5173` in your browser.

---

## Building & Running in Production

1. Build frontend + prepare `dist/`:

```bash
npm run build
```

This:

- Runs `vite build`
- Copies `src/` → `dist/src/`
- Copies `Assets/` → `dist/Assets/`
- Removes `dist/database/` (to avoid shipping raw DBs)

2. Start with PM2 (production profile):

```bash
npm run pm2:start:prod
```

This uses `ecosystem.config.js` to start:

- `backend` on `3001` (`NODE_ENV=production`)
- `frontend` on `80`, proxying `/api` to the backend

3. Health checks:

- Backend: `GET /api/health` (via frontend proxy: `http://your-host/api/health`)  
- Frontend: `GET /healthz`

### Automated healthcheck (recommended)

After starting services, run:

```bash
npm run check:dev
```

Or for production (expects frontend on `http://localhost` and backend on `http://localhost:3001` unless overridden with `FRONTEND_URL` / `BACKEND_URL`):

```bash
npm run check:prod
```

To stop all PM2 processes for this app:

```bash
npm run pm2:stop
```

---

## Environment Configuration

See `.env.example` for all supported keys. The most important are:

- `PORT`, `HOST`: backend API bind address (`HOST` optional; leave unset to allow IPv6 defaults)
- `VITE_PORT`, `VITE_API_TARGET`: Vite dev server + proxy target
- `API_HOST`, `API_PORT`: where `server-prod.js` forwards `/api` in production (IPv6-safe)

The backend loads:

- `.env`
- `.env.<NODE_ENV>` (e.g. `.env.development`, `.env.production`)

The frontend server uses environment passed by PM2 (see `ecosystem.config.js`). For IPv6-only local setups, you can set for the frontend app:

```bash
API_HOST=::1
API_PORT=3001
```

The helper in `server-prod.js` will wrap this as `http://[::1]:3001` for `http-proxy`.

---

## Coding & Project Conventions

- Frontend HTML (`index.html`, `home.html`) loads shared modules from `src/` via `<script type="module">`.
- Vite treats `src/**` as external and serves them "as-is" from `dist/src` in production.
- All browser-to-backend calls are made through **relative** `/api/...` URLs so they work:
  - In dev via Vite proxy
  - In production via `server-prod.js` proxy
- Assets are referenced with absolute paths like `/Assets/Images/Favicon.png`.  
  - In dev, a custom Vite middleware serves `/Assets/*` from the workspace `Assets/` folder.
  - In production, `server-prod.js` serves `/Assets/*` from `dist/Assets` (or root `Assets` as a fallback).

---

## Deployment Notes (Local & VM)

- Use `npm run build` + `npm run pm2:start:prod` as the standard production flow.
- For Oracle VM / special environments, use `npm run pm2:start:vm` which runs PM2 with `--env oraclevm`.
- IPv6-only PM2 environments are supported by:
  - Letting Node bind without a host in `server-prod.js` (so it can use `::`)
  - Wrapping IPv6 hosts for `API_HOST` when building the proxy URL

If you maintain a separate production directory (e.g. via `Deploy Scripts`), make sure that directory contains at least:

- `dist/` (from `npm run build`)
- `Assets/` (if you choose not to rely on `dist/Assets` only)
- `ecosystem.config.js`, `server-prod.js`

