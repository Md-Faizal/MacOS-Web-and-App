# Runtime and Operations Map

## Local Entry Points

| Command | Root definition | Expected boundary | Mutates remote state? |
| --- | --- | --- | --- |
| `npm ci` | Root npm | Installs root lock graph locally | No |
| `npm run dev:local` | Root npm | Main Vite frontend plus shared API | No; starts long-lived processes |
| `npm run dev:zentra` | Root npm | Zentra Vite frontend plus shared API | No; starts long-lived processes |
| `npm run build` | Root npm | Main Vite web distribution | No |
| `npm run build:zentra` | Root npm | Independent Zentra build | No |
| `npm run check:dev` | Root npm | Local health checks | Makes local HTTP requests |
| `npm run check:prod` | Root npm | Production-shaped health check | Makes requests to configured URLs; inspect target first |
| `npm run docs:build` | Root npm | HTML/PDF and generated AI catalog | Writes generated local artifacts/catalog |

## Deployment Entrypoints

- Ubuntu script deploy: `npm run deploy:ubuntu`; dry run: `npm run deploy:ubuntu:dry`.
- Windows script deploy: `npm run deploy:windows`.
- CI backend/MacOS deployment: `.github/workflows/deploy-backend.yml`.
- CI Zentra deployment: `.github/workflows/deploy-zentra.yml`.
- Android testing/production publish: root Android scripts and `.github/workflows/android-deploy.yml`.
- Multi-component workflow: `.github/workflows/deploy-all.yml`.
- `.github/workflows/deploy.yml` is legacy/deprecated; do not treat it as the active release path.

All live deployments, PM2 start/stop commands, publishing, migrations and version pushes require explicit target confirmation and user authorization. Do not run them to gather documentation facts.

## Current Topology Conflicts

- `ecosystem.config.js` names `macos-server` and `ipv6-updater`; root PM2 scripts mention app selectors that do not align. Reconcile before providing a PM2 command.
- `Dockerfile` starts the Express API entry, declares container port 3001, and health-checks `/api/health`.
- `docker-compose.yml` defines blue and green service slots with host loopback mappings 3001 and 3004; this does not identify the active reverse-proxy slot.
- `server-prod.js` is a standalone static server/proxy but is not the Dockerfile command and is not named in the PM2 app list.
- Root `dev` script CLI host/port differs from generic Vite config defaults; document the effective script invocation.
- VM role, provider, OS, capacity, hostnames, ports/firewall, backups, recovery and escalation need an owner-approved inventory.

## Environment Files

- `.env.example` lists root Node/API variable names and placeholders; do not copy real values into docs.
- `zentra-analytics-dashboard/.env.example` contains separate frontend defaults; compare them with the effective Vite config.
- `NODE_ENV`, `PORT`, `HOST`, `VITE_API_TARGET`, `ZENTRA_DEV_TARGET`, and `ZENTRA_HOSTNAME` are configuration inputs; their resolved value is environment-specific.
- Production secret names/values and private SSH settings belong in the approved secret manager or CI secret store, never in agent context.
- Read only variable names or redacted diagnostics unless the task explicitly requires local secret configuration; do not print credential values.

## Production Runbook Completion Gate

Before writing a step-by-step VM procedure, verify the active runtime and service list, upstream proxy, persistent mounts, database/upload paths, health probe, logging destination, and rollback behavior with the owner. Ask for reviewed backup/restore evidence and operator ownership. If these facts are absent, keep the section marked `needs-owner-confirmation`; never fill it from an old README or memory note alone.

## Security Issue Gate

Node startup and Android client source contain hard-coded credential-like values. Never paste them into this map, screenshots, command output or generated artifacts. Revoke/rotate affected credentials, remove source fallbacks, implement approved secret injection, review historical/build exposure, and verify fail-closed behavior before production release.