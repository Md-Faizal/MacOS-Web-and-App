# MacOS Business Suite
## Deployment and Workspace Roadmap

**Purpose:** Long-term reference for improving the repository, deployment process, production safety, and optional Docker adoption.

**Current deployment target:** Ubuntu VM at `/home/ubuntu/MacOS-Production` (ssh my-mac)

**Current application stack:**

- Vanilla HTML, CSS, and JavaScript frontend built with Vite
- Node.js and Express backend
- SQLite with `better-sqlite3`
- PM2 process management
- Nginx reverse proxy on Ubuntu
- Android companion app and APK update channels
- Git repository added recently

---

## 1. Executive Recommendation

Do not replace the current deployment system immediately. Improve it in stages.

The recommended target is:

```text
Git
  -> tested release
  -> one-click deployment command
  -> incremental transfer or Docker image
  -> persistent production data
  -> targeted PM2/container restart
  -> health check
  -> rollback option
```

The current custom deployment script is still the lowest-risk solution for now. Docker is a later improvement for reproducibility and dependency isolation, not a requirement for solving the current file-copy problem.

---

## 2. What Already Exists

The workspace already provides useful foundations:

- Git repository and normal Git history workflow
- `package-lock.json` for reproducible Node dependency versions
- Centralized database initialization through `DatabaseManager.initialize()`
- Automatic database migration execution during backend startup
- Database backup logic managed by the database layer
- Vite production builds
- PM2 process configuration in `ecosystem.config.js`
- Nginx reverse proxy configuration
- Application health checks in `tools/healthcheck.mjs`
- Separate Android APK publishing scripts
- Ubuntu deployment script with incremental change detection
- Ubuntu deployment support for skipping large wallpaper assets
- Protection for `backend/uploads/` so normal deployment does not overwrite APKs

The existing architecture is workable. The purpose of this roadmap is to make it safer and easier to maintain.

---

## 3. Current Problems to Address

### 3.1 Secrets are not sufficiently protected

The workspace contains `.env` and `.env.production`, while the current `.gitignore` does not clearly ignore all environment files. Secrets must never be committed.

Potential secrets include:

- Google OAuth credentials
- JWT secrets
- FCM server keys
- Recovery keys
- Database or external service credentials

A credential that has already been committed or exposed should be rotated, not merely removed from the latest file.

### 3.2 Build output has mixed responsibilities

The Vite configuration copies backend code and production files into `dist/`. As a result, `dist/` is both:

```text
frontend build output
+
backend deployment content
```

This makes deployment and Docker images harder to reason about.

### 3.3 Production data is mixed near application files

These are persistent runtime data and should not be treated as application source:

```text
database/MacOS.db
backend/uploads/
Wallpapers/
CloudStorage/
logs/
.env
```

The Android APK files under `backend/uploads/android-app/` have a separate publishing lifecycle and must not be copied by the normal application deployment.

### 3.4 Backups are not fully protected against server failure

A backup stored on the same VM protects against some application mistakes, but not against VM, disk, or filesystem loss. At least one backup copy should live outside the production VM.

### 3.5 Deployment verification should be automatic

A successful file transfer does not prove that the application is healthy. Deployment should check the backend, frontend, PM2 status, and optionally Nginx after updating.

---

## 4. Target Workspace Structure

This is the desired direction. It does not require moving every folder at once.

```text
MacOS-Development/
├── backend/                    # Node/Express API source
├── frontend/                   # Web source and modules
├── android/                    # Android application source
├── database/
│   ├── migrations/             # Database migrations
│   └── documentation/          # Schema documentation
├── scripts/                    # Deployment and utility scripts
├── scripts_py/                 # Python utility scripts
├── tools/                      # Health checks and maintenance tools
├── deploy/
│   ├── Dockerfile.api          # Future backend image
│   ├── Dockerfile.web          # Future frontend image
│   ├── compose.yaml            # Future local/staging Compose file
│   ├── compose.production.yaml # Future production overrides
│   └── nginx/                  # Future container Nginx config, if used
├── Documentation/
├── .env.example
├── .dockerignore
├── .gitignore
├── ecosystem.config.js
├── package.json
├── package-lock.json
├── server-prod.js
└── vite.config.js
```

### Keep out of Git and deployment images

```text
database/MacOS.db
 database/backups/
backend/uploads/
Wallpapers/
CloudStorage/
logs/
node_modules/
dist/
.env
.env.* except .env.example
Android build output
```

The exact ignore rules must be checked against the real repository before committing them.

---

## 5. Recommended Implementation Phases

## Phase 0: Protect the Existing System

**Priority: Immediate**

Tasks:

- Confirm `.env` and `.env.production` are not tracked by Git.
- Add `.env` and `.env.*` to `.gitignore`, while allowing `.env.example`.
- Search Git history for credentials that may have been committed.
- Rotate any exposed OAuth, FCM, JWT, or recovery credentials.
- Move hardcoded secrets from `ecosystem.config.js` into environment variables.
- Create `.env.example` with variable names only and no real values.
- Do not commit `database/MacOS.db`, APK files, wallpaper libraries, or user uploads.
- Make a manual database backup before changing deployment layout.

Suggested `.gitignore` additions:

```gitignore
.env
.env.*
!.env.example

# Runtime and production data
database/*.db
database/backups/
backend/uploads/
Wallpapers/
CloudStorage/

# Build and dependency output
node_modules/
dist/
```

Review existing rules before replacing them. Keep useful existing exceptions.

**Completion check:**

```bash
git status --ignored
git ls-files .env .env.production database/MacOS.db backend/uploads
```

The second command should not list secrets or production data.

---

## Phase 1: Make the Current Custom Deployment Reliable

**Priority: Next**

Keep the current Ubuntu deployment script, but make its contract explicit.

Required behavior:

- Build Vite only when frontend inputs changed, or when explicitly forced.
- Use `rsync` to transfer changed files rather than copying the entire tree.
- Never delete production data during normal application deployment.
- Never sync `backend/uploads/` through the normal backend source transfer.
- Keep APK publishing separate from application deployment.
- Skip wallpaper transfer when `--skip-assets` is used.
- Install Node dependencies only when manifests changed or dependencies are missing.
- Install Python dependencies only when requirements changed.
- Reload Nginx only when its configuration changed.
- Restart only the affected PM2 service.
- Let backend startup continue to run `DatabaseManager.initialize()` and migrations.
- Run health checks after deployment.
- Keep a deployment marker containing the deployed Git commit or timestamp.

Important distinction:

```text
Normal application deploy:
  backend source, frontend source, built files, scripts, configuration

Android deploy:
  selected APK channel and its manifest

Persistent production data:
  database, uploads, wallpapers, cloud storage, environment, logs
```

### Suggested deployment modes

```bash
# Normal incremental application deployment
bash "Deploy Scripts/deploy-ubuntu.sh"

# Skip large wallpaper storage
bash "Deploy Scripts/deploy-ubuntu.sh" --skip-assets

# Force a Vite build
bash "Deploy Scripts/deploy-ubuntu.sh" --force-build

# Preview the deployment plan
bash "Deploy Scripts/deploy-ubuntu.sh" --dry-run

# Backend/config hotfix, when appropriate
bash "Deploy Scripts/deploy-ubuntu.sh" --hotfix
```

Before relying on the script for production, test these modes against a disposable staging directory or a safe VM snapshot.

---

## Phase 2: Add Required Safety Features

**Priority: High**

### 2.1 Automated health checks

After deployment, verify:

```text
backend API responds
frontend responds
PM2 backend is online
PM2 frontend is online
Nginx is valid when changed
```

Use the existing `tools/healthcheck.mjs` rather than creating another health-check system.

Recommended checks:

```bash
node tools/healthcheck.mjs dev
node tools/healthcheck.mjs prod
```

The deployment should fail or clearly warn if the post-deployment health check fails.

### 2.2 Off-server database backups

Keep the existing DatabaseManager backups, but add a second destination outside the Ubuntu VM.

Possible destinations:

- Object storage
- A second machine
- A second VM
- OneDrive or Google Drive
- S3-compatible storage

Minimum backup policy:

```text
frequent local backups
+ rotating retention
+ periodic off-server copy
+ tested restore procedure
```

A backup is not considered reliable until restoration has been tested.

### 2.3 Deployment records

Record at least:

```text
commit or release identifier
time deployed
who deployed it
migration result
health-check result
```

A simple file such as `deployment-meta.json` can be stored on the server outside the application source.

### 2.4 Rollback procedure

Document and test rollback for:

- frontend build
- backend source
- PM2 configuration
- Nginx configuration
- database backup restoration

Never automatically roll back a database migration by deleting tables. Database rollback should use a reviewed migration or a verified database backup.

---

## Phase 3: Improve Git Usage

**Priority: High**

Git should identify exactly what is being deployed.

Recommended workflow:

```bash
git status
git diff
git add .
git commit -m "Describe the change"
git push
```

For production, deploy a known commit rather than an arbitrary uncommitted working tree.

Recommended release information:

```text
commit SHA
branch or tag
build timestamp
Node version
package-lock.json state
```

Useful future conventions:

- `main` or `production` branch for deployable code
- feature branches for larger work
- tags for known production releases
- commit SHA saved on the Ubuntu server
- no direct edits to application source on the production VM

Do not use plain `git pull` directly in the live application directory as the long-term release strategy. A failed pull or build can leave a partially updated application.

---

## Phase 4: Add Docker, Only When Ready

**Priority: Medium / Later**

Docker is recommended when runtime consistency, rollback, or dependency isolation becomes more important than minimizing initial setup effort.

Docker would package:

- Node.js version
- npm production dependencies
- Python runtime dependencies
- Chromium/Puppeteer runtime requirements
- frontend runtime
- backend runtime

Docker should not package mutable production data.

### Future Docker services

```text
api       Node/Express backend
web       Built frontend and production frontend server
nginx     Optional Nginx container, or keep Nginx on the host
```

### Persistent data

These should remain host directories or named volumes:

```text
SQLite database
APK uploads
other user uploads
Wallpapers
CloudStorage
logs
production environment variables
```

Conceptual volume mapping:

```text
/app/database
/app/backend/uploads
/app/Wallpapers
/app/CloudStorage
```

### Docker files to add later

```text
.dockerignore
deploy/Dockerfile.api
deploy/Dockerfile.web
deploy/compose.yaml
deploy/compose.production.yaml
```

### Docker build rules

- Use `npm ci`, not `npm install`, inside reproducible builds.
- Build frontend assets in a build stage.
- Do not copy `.env`, databases, wallpapers, APK archives, or `node_modules` into images.
- Use a non-root runtime user where practical.
- Add container health checks.
- Tag images with Git commit identifiers.
- Keep at least one previous image for rollback.

### One-click Docker goal

The eventual user-facing command should be one command, for example:

```bash
docker compose -f deploy/compose.yaml -f deploy/compose.production.yaml up -d --build
```

This can later be wrapped as:

```bash
npm run deploy:ubuntu
```

Docker Compose is the useful part for this project. Kubernetes is not needed for one Ubuntu VM.

---

## Phase 5: Add Automatic Deployment

**Priority: Later**

After Git and deployment are stable, optional automation can run deployment after a push.

Possible flow:

```text
push to production branch
  -> install dependencies
  -> run tests
  -> build Vite
  -> deploy known commit
  -> run migrations through backend startup
  -> health check
  -> report success or failure
```

Possible implementations:

- GitHub Actions plus SSH
- PM2 Deploy
- Docker Compose triggered by a small deployment command

Do not add this before secrets, backups, and health checks are reliable.

---

## 6. Docker Versus the Current Custom Script

| Concern | Current improved script | Docker Compose |
|---|---|---|
| Initial effort | Low | Medium to high |
| One-command deployment | Yes | Yes |
| Changed-file transfer | Excellent with rsync | Uses cached image layers |
| Runtime consistency | Depends on VM | Strong |
| Dependency isolation | Moderate | Strong |
| Persistent data safety | Exclusion rules | Volumes |
| Rollback | Custom backups | Previous image/release |
| Current PM2 compatibility | Native | Requires a design decision |
| Large asset handling | Explicit skip options | Volumes and separate sync |
| Local/production parity | Moderate | Better |
| Migration complexity | Low | Medium |

Docker is an investment in reliability and repeatability. It is not required merely to avoid copying unchanged files.

---

## 7. What Not to Add Yet

Avoid adding these until the current deployment and data model require them:

- Kubernetes
- Terraform
- Ansible for a single VM
- A full frontend/backend monorepo rewrite
- Git LFS for production wallpapers or APK archives
- Multiple deployment platforms at the same time
- A second migration framework
- A second process manager alongside PM2

Each additional system creates another configuration surface to maintain.

---

## 8. Decision Guide

### Stay with the improved custom script when:

- There is one Ubuntu VM.
- Deployment is occasional.
- The existing Node and PM2 setup is stable.
- The main concern is avoiding unnecessary file copies.
- You want the smallest change with the lowest risk.

### Move to Docker when:

- The VM has dependency conflicts.
- Puppeteer or Python setup is unreliable.
- You need the same runtime on multiple machines.
- Rollback must be quick and predictable.
- The deployment script is becoming difficult to maintain.
- You want application code and runtime data clearly separated.

### Add GitHub Actions or PM2 Deploy when:

- You want deployment triggered by a Git push.
- Tests must run before production deployment.
- You want a remote record of deployment history.
- Local uncommitted files should never reach production.

---

## 9. Final Recommended Order

```text
1. Protect secrets and verify Git history
2. Confirm production data is outside normal source deployment
3. Finish and test the incremental custom deployment script
4. Add post-deployment health checks
5. Add off-server database backups and test restore
6. Record deployed commit and deployment result
7. Adopt commit-based releases or tags
8. Add .dockerignore
9. Add Docker Compose when the benefit justifies the migration
10. Add GitHub Actions or PM2 Deploy later if automatic deployment is desired
```

### The core principle

```text
Git protects code history.
The deployment script moves the release.
Docker protects runtime consistency.
Volumes protect live data.
Backups protect against machine failure.
Health checks protect against broken deployments.
```

This document is a roadmap, not a requirement to implement every phase immediately.
