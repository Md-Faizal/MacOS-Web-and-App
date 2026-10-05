# Node.js Backend and API

## Runtime Ownership

The shared HTTP API entry point is `backend/main/macos-api-server.js`. The root npm scripts start it directly or through the local development compositions. The server is implemented with Express; `better-sqlite3` is a direct root dependency. Backend implementation is grouped beneath `backend/`, including core services and domain modules.

| Concern | Source of truth |
| --- | --- |
| API startup and route registration | `backend/main/macos-api-server.js` |
| Domain handlers and services | `backend/` |
| SQLite access | `backend/core/db/` and domain-specific modules |
| Main web development proxy | `vite.config.js` |
| Production HTTP serving/proxy | `server-prod.js`, `Dockerfile`, and active deployment workflow |
| Public API contract | `docs/API_DOCUMENTATION.md`, verified against route implementation |

## Local API Commands

| Command | Effect |
| --- | --- |
| `npm run backend` | Starts the API with the root script's `PORT=3002` setting. |
| `npm start` | Starts the API entry point without the script's explicit port override. |
| `npm run api` | Starts the API through Nodemon for development. |
| `npm run check:dev` | Runs the repository development health check. |
| `npm run check:prod` | Runs the production health check; configure URL overrides for the intended target. |
| `npm run diagnose` | Runs the backend connectivity diagnostic. |

Prefer the `dev:local` composition for normal browser development so frontend and API are started together. Check the actual server output and `.env.example` for the effective bind/port configuration.

## Data and API Contracts

API paths, authentication behavior, request/response shapes, and error codes belong in `docs/API_DOCUMENTATION.md` and the route that implements them. When updating a contract, update its tests and every affected client contract in the same change. Do not infer tenant isolation, transaction guarantees, or retention behavior from the folder name; verify the database operation and authorization middleware.

The product uses persistent local/server data. Never use a production database for setup or contract tests unless the operation has an explicit, reviewed safety process. Do not place real environment values in this handbook or generated inventories.

## Process and Deployment Caution

Deployment scripts and PM2 configuration have conflicting descriptions in older documentation. Before using a PM2 command in production, reconcile `ecosystem.config.js`, the relevant npm script, and the active deployment workflow. The automated deployment flow is described in [Operations and Deployment](#operations); it is not interchangeable with local development commands.