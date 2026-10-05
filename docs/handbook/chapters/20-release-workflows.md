# CI Release and Deployment Workflows

## Workflow Inventory

| Product | Workflow | Trigger | Output/effect |
| --- | --- | --- | --- |
| Main backend and MacOS web | `.github/workflows/deploy-backend.yml` | Path-filtered push, manual dispatch, reusable workflow call | Builds/checks and deploys through the workflow's SSH/Docker operations |
| Zentra dashboard | `.github/workflows/deploy-zentra.yml` | Path-filtered push, manual dry-run input, reusable call | Builds independent web bundle and syncs `dist/` to configured VM target(s) |
| Combined release | `.github/workflows/deploy-all.yml` | Manual/composed workflow | Calls component workflows; inspect exact input forwarding before use |
| Android | `.github/workflows/android-deploy.yml` | Manual dispatch with version inputs | Builds release APK, produces checksum/manifest, may deploy and publish artifacts |
| Legacy | `.github/workflows/deploy.yml` | Historical workflow file | Marked deprecated; not the active deployment source |

The workflow name or green build alone does not prove that the intended target was updated. For every run, record workflow path, branch/revision, dispatch inputs, target environment, job outcome, health check, and whether the deploy step actually ran.

## Main Web/API Workflow

The active backend workflow preflights Node syntax, installs root dependencies, builds the main Vite frontend, uploads a short-lived build artifact, then performs the deployment stage when configured. It supports manual options for version bump, dry run and skipping install. It also declares a reusable workflow interface with SSH secret names.

Review the current workflow before dispatch because it can write tags, push to the main branch, connect to VMs, and mutate remote deployments. Its path filters include backend/frontend/shared/tool/build configuration; unrelated docs changes do not deploy the product. Never pass resolved secret values as workflow inputs or print them in the run summary.

The repository also contains Docker and compose definitions for the API service and blue/green host-port slots. Verify which image/slot and reverse-proxy target the workflow actually updates before describing a release as blue-green. Compose configuration by itself is not evidence of active production state.

## Zentra Static Deployment

The Zentra workflow uses its own lockfile and Node setup, runs the package TypeScript check, then builds the dashboard with explicit production API/app URL settings. In dry-run mode it builds and lists the output without syncing it. In live mode it prepares SSH, syncs only `zentra-analytics-dashboard/dist/`, and runs a public homepage HTTP smoke check.

The workflow comments describe the dashboard output as mounted into the existing backend containers, so a frontend-only release need not restart the API container. That is a repository procedure; verify the running mount and web server before asserting current production behavior. The workflow supports a secondary VM path; its fallback host configuration is intentionally not repeated here and must be moved to owner-approved secret/config management if not already covered.

Security notes from the checked-in workflow:

- SSH host-key checking is disabled in the generated SSH config; review this before relying on that workflow for privileged releases.
- The secondary target must be explicitly configured and verified; never infer its identity from a checked-in fallback.
- A public `200` smoke check proves only that the tested homepage returned `200`, not that auth, API connectivity, assets, or every VM are correct.
- The live workflow may attempt to activate an Nginx vhost. Treat dispatch as a production mutation and obtain explicit authorization.

## Android Release Pipeline

The Android workflow is manually dispatched with version name, version code and release notes. It checks out source, sets up Java 17, invokes `assembleRelease` using those inputs, locates an APK, computes SHA-256 and file size, writes an update manifest, may copy files to configured remote storage, optionally mirrors artifacts to object storage, and uploads the release directory as a GitHub artifact.

Important: in the inspected workflow, if required SSH secrets are missing, the remote upload step prints a warning and exits successfully. Therefore a successful workflow can mean “APK built and artifact uploaded” while VM publishing was skipped. Inspect the step log and confirm `latest.apk`/manifest publication independently before announcing a deployment.

The Gradle release signing config can fall back to a debug keystore if the app release keystore is missing, with development defaults. A built APK and SHA-256 are not proof of production signature or trusted provenance. Confirm signing config, key injection, Android package signer, artifact repository and update-channel state before release. Credentials and keystore material stay in the approved secret system.

## Ubuntu Local Script Deployment

The local entry point is `npm run deploy:ubuntu` or `bash deploy/ubuntu/deploy.sh`; the script also accepts `--dry-run`. Its header documents incremental syncing, optional compatibility transfer mode, asset skipping, hotfix and forced frontend build. It consumes SSH target and production directory configuration and includes defaults; inspect the script and confirm the target alias before running. A default alias is not a verified production host.

Recommended safe sequence:

1. Read the exact current script and confirm repository revision, local build inputs and target configuration without printing secrets.
2. Run `npm run deploy:ubuntu:dry` and review the proposed target/actions.
3. Confirm the owner-approved target, backup state, change window and rollback plan.
4. Use live deploy only with explicit authorization. Do not use hotfix/skip-build/force flags unless the effect and rollback are understood.
5. Verify the exact service/health endpoints and inspect sanitized logs; record which services/artifacts changed.

The dry-run is a code path, not a production health check or backup/restore test. The script's header comments, environment variable names, and local memory notes may not exactly match current active CI topology; actual behavior comes from the script implementation and owner verification.

## Version and Publication Safety

Root version-bump scripts can create commits/tags and push to the remote repository. Android workflow inputs produce an independent app version code/name. Do not assume the root package version is the mobile app version. Record mapping/release association in the approved release process.

Never publish screenshots, logs, PDFs, update manifests, dependency inventories or APKs that contain secrets, personal records, private host data or credentials. Review generated artifacts before upload, and distinguish build artifact publication from production deployment.