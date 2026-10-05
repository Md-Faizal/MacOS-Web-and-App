# AI Reference Set

This directory contains the expanded, subsystem-oriented context maps behind `docs/AI-INDEX.md`. The root index is deliberately the retrieval front door; load a map only when its subsystem is relevant.

The reference-set target is 1,000–2,000 nonblank Markdown lines across `docs/AI-INDEX.md` and this directory. Each line should add a route, ownership fact, source pointer, command, contract boundary, or verified caveat. Do not create filler to satisfy the count. `npm run docs:build` reports current progress and rejects a reference set above 2,000 lines.

Treat every map as navigation metadata, not proof of behavior. Verify claims against current source, tests, manifests, lockfiles, and active workflows. Keep private host data, secrets, customer data, and unverified production procedures out of these files.

| Map | Use it for |
| --- | --- |
| `00-components.md` | Workspace roots, package boundaries, and owners |
| `01-backend-api.md` | Express startup, routes, middleware and API diagnostics |
| `02-data-domains.md` | Database, department ownership, core-domain boundaries |
| `03-client-platforms.md` | Main web, Zentra, Android, Rust callers |
| `04-runtime-operations.md` | Local commands, build targets, deployment and owner gates |
| `05-source-catalog.md` | Generated path-by-path source discovery map |
| `06-dependencies-and-validation.md` | Dependency authorities and stack check routing |
| `07-task-playbooks.md` | Task-to-source diagnostic recipes |