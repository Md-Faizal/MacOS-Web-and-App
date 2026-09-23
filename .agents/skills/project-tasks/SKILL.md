---
name: project-tasks
description: Run, manage, and trigger project build, development, deployment, versioning, and git tasks matching VSCode tasks.json. Use whenever the user asks to start dev servers, run MacOS or Zentra frontends, bump version, push tags, or deploy.
---

# Project Tasks & Runbook

This skill provides ready-to-run instructions and commands corresponding to the tasks defined in `.vscode/tasks.json` and `package.json`.

## Task Catalog & Commands

| Task Label / Intent | Command / Script | Working Directory | Type / Background | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **▶ Start MacOS Frontend + Backend** | `npm run dev:local` | Workspace Root | Long-running (daemon/async) | Starts shared backend (port 3002) and MacOS frontend (Vite port 5173). |
| **▶ Start Zentra Frontend + Backend** | `npm run dev:zentra` | Workspace Root | Long-running (daemon/async) | Starts shared backend (port 3002) and Zentra frontend (port 3000). |
| **▶ Start All 3: MacOS + Zentra + Backend** | `concurrently "npm run backend" "npm run dev -- --host 0.0.0.0 --port 5173" "npm --prefix zentra-analytics-dashboard run dev -- --host 0.0.0.0 --port 3000"` | Workspace Root | Long-running (daemon/async) | Starts backend (3002), MacOS Vite (5173), and Zentra Vite (3000). |
| **🏷️ Bump Version (Patch) & Push Tags** | `npm version patch && git push origin main --tags` | Workspace Root | One-shot shell | Bumps patch version (e.g. 1.30.0 -> 1.30.1), creates git tag, pushes commit and tags to origin main. |
| **🏷️ Bump Version (Minor) & Push Tags** | `npm version minor && git push origin main --tags` | Workspace Root | One-shot shell | Bumps minor version (e.g. 1.30.0 -> 1.31.0), creates git tag, pushes tags to origin main. |
| **🚀 Deploy to Ubuntu (Dry Run via Script)** | `bash deploy/ubuntu/deploy.sh --dry-run` | Workspace Root | One-shot shell | Tests remote connection and builds without touching production VM. |
| **🚀 Deploy to Ubuntu (Live via Script)** | `bash deploy/ubuntu/deploy.sh` | Workspace Root | One-shot shell | Builds and deploys/syncs files from PC to Ubuntu VM. |
| **⬆️ Git Push (origin main)** | `git push origin main` | Workspace Root | One-shot shell | Pushes committed changes on branch `main` to remote `origin`. |
| **🩺 Healthcheck (Dev / Prod)** | `npm run check:dev` / `npm run check:prod` | Workspace Root | One-shot shell | Validates frontend and backend endpoint connectivity and status. |

---

## Execution Guidelines for Agent

1. **Dev Servers**: When the user requests starting development environments, launch the corresponding command with `IsDaemon: true` or appropriate async handling using `run_command`.
2. **Deployments**: Always ask or confirm before live deployments unless explicitly directed. For dry-run, execute directly.
3. **Version Bumping**: Verify working tree status with `git status` prior to running version bumps to avoid committing unintended files.
