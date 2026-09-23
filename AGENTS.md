# Project Rules & Task Execution

This project defines specific developer tasks configured in `.vscode/tasks.json` and `.agents/skills/project-tasks/SKILL.md`.

When the user asks to perform standard lifecycle tasks, use the established commands:

- **Start MacOS (Frontend + Backend)**: `npm run dev:local`
- **Start Zentra (Frontend + Backend)**: `npm run dev:zentra`
- **Start All 3 (MacOS + Zentra + Backend)**: `concurrently "npm run backend" "npm run dev -- --host 0.0.0.0 --port 5173" "npm --prefix zentra-analytics-dashboard run dev -- --host 0.0.0.0 --port 3000"`
- **Bump Version (Patch)**: `npm version patch && git push origin main --tags`
- **Bump Version (Minor)**: `npm version minor && git push origin main --tags`
- **Deploy to Ubuntu (Dry Run)**: `bash deploy/ubuntu/deploy.sh --dry-run`
- **Deploy to Ubuntu (Live)**: `bash deploy/ubuntu/deploy.sh`
- **Git Push Main**: `git push origin main`
- **Healthcheck**: `npm run check:dev` or `npm run check:prod`
