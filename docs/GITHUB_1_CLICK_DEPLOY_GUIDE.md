# GitHub 1-Click Deployment Setup Guide

This guide walks you through the one-time, 5-minute setup to enable **1-Click Deployments** from your browser or phone via GitHub Actions.

---

## What This Workflow Does
When you click **"Run workflow"** in GitHub:
1. **Verifies code syntax & builds the frontend** in GitHub's cloud runner.
2. **Connects to your Ubuntu VM via SSH**.
3. **Creates an automated safety snapshot** of your live SQLite database (`database/backups/MacOS_backup_YYYYMMDD_HHMMSS.db`).
4. **Pulls the latest code** from the `main` branch.
5. **Builds the lean `dist/` bundle** on the server.
6. **Reloads PM2 processes with zero downtime** (`pm2 reload`).
7. **Performs an instant health check** (`/api/health`) and marks the deployment with a green checkmark.

---

## One-Time Setup: Adding Your VM Secrets in GitHub

Go to your GitHub repository in your browser:

### Step 1: Open Secrets Settings
1. Click the **Settings** tab at the top of your GitHub repository.
2. In the left sidebar, scroll down to **Secrets and variables** $\to$ Click **Actions**.
3. Click the green button: **"New repository secret"**.

---

### Step 2: Add the 3 Secrets

Add these three secrets one by one:

#### 1. `SSH_HOST`
* **Name**: `SSH_HOST`
* **Secret**: Your Ubuntu VM's public IP address (or domain name).
  * *Example*: `140.238.xxx.xxx` (or `vm.faizal.uk`)

#### 2. `SSH_USER`
* **Name**: `SSH_USER`
* **Secret**: The SSH username for your VM.
  * *Usually*: `ubuntu`

#### 3. `SSH_KEY`
* **Name**: `SSH_KEY`
* **Secret**: The **entire contents** of your private SSH key file (the `.pem` or `.key` file you use to log into your VM).
  * Open your `.pem` key file in Notepad on Windows.
  * Copy everything, including the header and footer lines:
    ```
    -----BEGIN OPENSSH PRIVATE KEY-----
    ...
    -----END OPENSSH PRIVATE KEY-----
    ```
  * Paste it into the Secret field and click **Add secret**.

*(Optional)* If your VM uses a custom SSH port other than `22`, add a secret named `SSH_PORT` with that port number.

---

## How to Deploy (Your Daily 1-Click Workflow)

Whenever you want to deploy an update to your live production VM:

1. **Push your latest changes to GitHub**:
   ```bash
   git push origin main
   ```
2. **Open GitHub in your browser (or the GitHub mobile app on your phone)**.
3. Click the **Actions** tab at the top.
4. In the left sidebar, select **"🚀 1-Click Deploy to Ubuntu"**.
5. On the right side, click the **"Run workflow"** dropdown button.
6. (Optional) Check **"Dry Run"** if you want to test the connection and backup without changing any files.
7. Click the green **"Run workflow"** button!

---

## Watching the Deployment
* A new workflow run will appear with a yellow spinning circle.
* Click into it to watch live streaming logs showing:
  * Database backup completion
  * Code synchronization
  * PM2 reload
  * Health check verification
* Once complete, it displays a crisp green checkmark: `✅ Deploy to Production VM`.
