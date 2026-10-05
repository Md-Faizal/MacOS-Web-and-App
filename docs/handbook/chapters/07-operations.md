# Operations and Deployment

## Local Health Checks

```powershell
npm run check:dev
npm run check:prod
```

The production health check expects local production-style endpoints unless `FRONTEND_URL` and `BACKEND_URL` are configured. Confirm the target before running; a check can make requests against the wrong environment if local overrides are stale.

## Distinct Deployment Routes

| Route | Repository entry point | Notes |
| --- | --- | --- |
| Ubuntu script deployment | `npm run deploy:ubuntu` or `bash deploy/ubuntu/deploy.sh` | Dry run: `npm run deploy:ubuntu:dry`. Verify script prerequisites and target before use. |
| Windows script deployment | `npm run deploy:windows` | Runs `deploy/windows/deploy.ps1`. |
| CI backend and MacOS deployment | `.github/workflows/deploy-backend.yml` | Uses CI secrets and its own build/deploy sequence. Do not copy secret values into local files or documentation. |
| Zentra deployment | `.github/workflows/deploy-zentra.yml` | Independent frontend build/publication flow. |
| Android release | `.github/workflows/android-deploy.yml` and `deploy/android/publish.sh` | Separate release channel and signing requirements. |

`deploy-all.yml` composes workflows. `deploy.yml` is marked deprecated. Local SSH deployment, CI VM deployment, Docker operation, static frontend publication, and Android release are separate procedures; do not substitute commands between them.

## VM Inventory: Owner-Verified Fields Required

The repository does not provide a complete, authoritative inventory of production VMs. Before this section can be used as a runbook, the service owner must verify and supply these fields through an approved internal source:

| Field | Status |
| --- | --- |
| VM identifier, provider, OS image, and environment role | Needs owner confirmation |
| Public/private hostname and network boundary | Needs owner confirmation; do not add credentials or private addresses to public docs |
| CPU, memory, disk, and capacity thresholds | Needs owner confirmation |
| Service/container names, ports, proxy and firewall rules | Reconcile from active runtime configuration and owner confirmation |
| Database, uploads, and persistent-volume locations | Verify against deployment and backup configuration |
| Backup schedule, restore test, RPO/RTO, and responsible operator | Needs owner confirmation |
| Monitoring, alert routing, escalation, rollback, and recovery procedure | Needs owner confirmation |

Until these fields are verified, the handbook describes repository deployment inputs, not a production operations runbook.

## Deployment Documentation Risks

1. Existing README/PM2 descriptions disagree with the current PM2 ecosystem configuration and npm script names. Reconcile the app names, profiles, and ports before publishing a PM2 runbook.
2. Deployment and CI files may contain defaults that are unsafe to repeat. Never copy credential-like fallback values into this handbook; review and rotate any value that was a real credential.
3. Android release configuration can fall back to a debug keystore. Treat release signing as unverified until the actual release keystore and secret injection are confirmed.
4. Record the exact revision, workflow run, target environment, result, and rollback decision for each deployment using the approved change process. Do not publish secret-bearing logs as artifacts.

## Change and Recovery Checklist

Before a production operation, verify the target and revision, confirm a current recoverable backup, inspect the exact workflow/script, and confirm an operator can execute the rollback. Afterward, run the environment-appropriate health check and inspect service logs without exposing secrets. The specific VM commands and thresholds remain pending owner confirmation.