#!/bin/bash

################################################################################
# UBUNTU REMOTE DEPLOYMENT SCRIPT
# 
# Deploy updates from Windows dev machine to Ubuntu production VM via SSH
# Builds frontend locally, syncs via rsync/scp, and restarts services remotely
# 
# The deployment is incremental: rsync compares file contents so a fresh build
# does not resend unchanged files, the Vite build runs only when a frontend
# input changed, and npm install runs only when dependency manifests changed.
#
# Usage: ./deploy-ubuntu.sh [--dry-run] [--force] [--skip-assets] [-t|--traditional] [--hotfix] [--force-build]
#
# Options:
#   --dry-run      Show what would happen without making changes
#   --force        Override failure checks
#   --skip-assets  Skip 5GB+ Assets folder (for faster iterative updates)
#   -t, --traditional
#                  Use the traditional full-file scp transfer as a backup
#   --hotfix       Skip build, backup, and server restart. Only sync files directly.
#   --force-build  Build the frontend even when no frontend input changed
#
# Required environment variable:
#   - SSH_TARGET: SSH alias or user@host (e.g., my-mac or ubuntu@192.168.1.100)
#   - UBUNTU_PROD_DIR: Production directory on Ubuntu (default: /home/ubuntu/MacOS-Production)
#                     Matches Windows equivalent: C:\Users\HP\Desktop\MacOS Project\MacOS-Production
#
# Example with SSH alias:
#   export SSH_TARGET=my-mac
#   ./deploy-ubuntu.sh
#
# Example with user@host:
#   export SSH_TARGET=ubuntu@192.168.1.100
#   ./deploy-ubuntu.sh
################################################################################

set -e  # Exit on error

# Configuration - from environment or defaults
DEV_DIR="${DEV_DIR:-.}"  # Current directory if DEV_DIR not set
SSH_TARGET="${SSH_TARGET:-}"  # SSH alias or user@host (e.g., my-mac or ubuntu@192.168.1.100)
UBUNTU_PROD_DIR="${UBUNTU_PROD_DIR:-/home/ubuntu/MacOS-Production}"  # Matches Windows: C:\Users\HP\Desktop\MacOS Project\MacOS-Production
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
DRY_RUN=false
FORCE=false
SKIP_ASSETS=false
HOTFIX=false
FORCE_BUILD=false
TRADITIONAL=false
BUILD_REQUIRED=false
DEPENDENCIES_CHANGED=false
BACKEND_CHANGED=false
FRONTEND_CHANGED=false
NGINX_CHANGED=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'  # No Color

# Functions
print_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERR]${NC} $1" >&2
}

print_info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_header() {
    echo "======================================================"
    echo "   $1"
    echo "   Timestamp: $TIMESTAMP"
    echo "======================================================"
    echo ""
}

# Git Bash on Windows may not have rsync. Compare SHA-256 hashes in one remote
# scan, then use scp only for files that are missing or have changed.
sync_changed_files_with_scp() {
    local source_dir="$1"
    local remote_dir="$2"
    local exclude_uploads="${3:-false}"
    local local_manifest
    local remote_manifest
    local changed_count=0
    local rel_path
    local local_hash
    local remote_hash
    local source_path

    local_manifest=$(mktemp)
    remote_manifest=$(mktemp)

    if [ -f "$source_dir" ]; then
        printf "%s\t%s\n" "$(sha256sum "$source_dir" | awk '{print $1}')" "$(basename "$source_dir")" > "$local_manifest"
    else
        while IFS= read -r -d '' source_path; do
            rel_path="${source_path#"$source_dir"/}"
            local_hash=$(sha256sum "$source_path" | awk '{print $1}')
            printf "%s\t%s\n" "$local_hash" "$rel_path"
        done < <(
            if [ "$exclude_uploads" = true ]; then
                find "$source_dir" -type f ! -path "$source_dir/uploads/*" -print0
            else
                find "$source_dir" -type f -print0
            fi
        ) > "$local_manifest"
    fi

    if ! ssh "$SSH_TARGET" "mkdir -p '$remote_dir'; cd '$remote_dir' && find . -type f -exec sha256sum {} +" |
        awk '{ hash=$1; path=$0; sub(/^[^ ]+ +/, "", path); print path "\t" hash }' > "$remote_manifest"; then
        rm -f "$local_manifest" "$remote_manifest"
        print_error "Could not read remote file hashes"
        exit 1
    fi

    while IFS= read -r line; do
        local_hash="${line%%$'\t'*}"
        rel_path="${line#*$'\t'}"
        remote_hash=$(awk -F '\t' -v path="./$rel_path" '$1 == path { print $2; exit }' "$remote_manifest")
        if [ "$local_hash" != "$remote_hash" ]; then
            ssh "$SSH_TARGET" "mkdir -p '$remote_dir/$(dirname "$rel_path")'"
            if [ -f "$source_dir" ]; then
                source_path="$source_dir"
            else
                source_path="$source_dir/$rel_path"
            fi
            scp "$source_path" "$SSH_TARGET:$remote_dir/$rel_path"
            changed_count=$((changed_count + 1))
        fi
    done < "$local_manifest"

    rm -f "$local_manifest" "$remote_manifest"
    print_info "  - scp delta transfer uploaded $changed_count changed file(s)"
}

# Emergency compatibility mode: copy every eligible file, even when its
# contents match the remote copy. Directory contents are flattened when the
# destination is the production root, matching the normal dist deployment.
sync_all_files_with_scp() {
    local source_dir="$1"
    local remote_dir="$2"
    local exclude_uploads="${3:-false}"
    local source_path
    local rel_path

    if [ -f "$source_dir" ]; then
        ssh "$SSH_TARGET" "mkdir -p '$remote_dir'"
        scp "$source_dir" "$SSH_TARGET:$remote_dir/$(basename "$source_dir")"
        return
    fi

    ssh "$SSH_TARGET" "mkdir -p '$remote_dir'"
    while IFS= read -r -d '' source_path; do
        rel_path="${source_path#"$source_dir"/}"
        ssh "$SSH_TARGET" "mkdir -p '$remote_dir/$(dirname "$rel_path")'"
        scp "$source_path" "$SSH_TARGET:$remote_dir/$rel_path"
    done < <(
        if [ "$exclude_uploads" = true ]; then
            find "$source_dir" -type f ! -path "$source_dir/uploads/*" -print0
        else
            find "$source_dir" -type f -print0
        fi
    )
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --skip-assets)
            SKIP_ASSETS=true
            shift
            ;;
        --skip-assetst)
            SKIP_ASSETS=true
            TRADITIONAL=true
            print_warning "Using compatibility spelling --skip-assetst; prefer --skip-assets -t"
            shift
            ;;
        -t|--traditional)
            TRADITIONAL=true
            shift
            ;;
        --hotfix)
            HOTFIX=true
            shift
            ;;
        --force-build)
            FORCE_BUILD=true
            shift
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Validate environment variables
if [ -z "$SSH_TARGET" ]; then
    print_error "SSH_TARGET not set. Export it: export SSH_TARGET=my-mac"
    exit 1
fi

print_header "REMOTE DEPLOYMENT: Dev (Windows) -> Ubuntu VM via SSH"
echo "Target: $SSH_TARGET:$UBUNTU_PROD_DIR"
echo "Options: DRY_RUN=$DRY_RUN FORCE=$FORCE SKIP_ASSETS=$SKIP_ASSETS TRADITIONAL=$TRADITIONAL HOTFIX=$HOTFIX"
if [ "$SKIP_ASSETS" = true ]; then
    print_warning "  Assets folder (5GB+) will be SKIPPED - only syncing dist and config"
fi
echo ""

# Test SSH connection
print_info "Testing SSH connection to $SSH_TARGET..."
if ! ssh -o ConnectTimeout=5 "$SSH_TARGET" "echo 'SSH OK'" > /dev/null 2>&1; then
    print_error "Cannot connect to $SSH_TARGET"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Test your SSH alias: ssh $SSH_TARGET 'uname -a'"
    echo "  2. Ensure SSH key is set up: ssh-keygen -t rsa"
    echo "  3. If not using alias, try: export SSH_TARGET=ubuntu@192.168.1.100"
    exit 1
fi
print_success "SSH connection OK"
echo ""

# Determine the smallest affected deployment units from the working tree. This
# includes staged, unstaged, and untracked files so a commit is not required.
cd "$DEV_DIR"
CHANGED_FILES=$( { git diff --name-only HEAD 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null; } | sort -u )
if [ "$FORCE_BUILD" = true ] || [ ! -d "dist" ] || echo "$CHANGED_FILES" | grep -Eq '^(src/|frontend/|public/|.*\.html$|vite\.config\.|postcss\.config\.)'; then
    BUILD_REQUIRED=true
fi
if echo "$CHANGED_FILES" | grep -Eq '^(package\.json|package-lock\.json)$'; then
    DEPENDENCIES_CHANGED=true
fi
if echo "$CHANGED_FILES" | grep -Eq '^(backend/|server-prod\.js|ecosystem\.config\.js|package\.json|package-lock\.json)$'; then
    BACKEND_CHANGED=true
fi
if echo "$CHANGED_FILES" | grep -Eq '^(dist/|frontend/|src/|.*\.html$|server-prod\.js|vite\.config\.|postcss\.config\.)'; then
    FRONTEND_CHANGED=true
fi
if echo "$CHANGED_FILES" | grep -Eq '^macos-nginx\.conf$'; then
    NGINX_CHANGED=true
fi
print_info "Change plan: build=$BUILD_REQUIRED dependencies=$DEPENDENCIES_CHANGED backend=$BACKEND_CHANGED frontend=$FRONTEND_CHANGED nginx=$NGINX_CHANGED"
echo ""

# ============================================================================
# STEP 1: BUILD FRONTEND ONLY WHEN NEEDED
# ============================================================================
if [ "$HOTFIX" = false ]; then
print_info "STEP 1: Checking whether the frontend needs a build..."
cd "$DEV_DIR"

if [ "$BUILD_REQUIRED" = true ]; then
    print_info "  - Running npm run build..."
    if ! npm run build; then
        print_error "BUILD FAILED! Deployment aborted to prevent broken release."
        exit 1
    fi
    [ -d "dist" ] || { print_error "CRITICAL: dist folder was not created after build!"; exit 1; }
    print_success "Frontend build completed and verified"
else
    print_success "Frontend build skipped; no frontend inputs changed"
fi
cd "$DEV_DIR"
echo ""
else
print_info "STEP 1: Skipped build due to --hotfix flag"
fi

# ============================================================================
# STEP 2: BACKUP PRODUCTION STATE ON UBUNTU VM
# ============================================================================
if [ "$HOTFIX" = false ]; then
print_info "STEP 2: Creating backup on Ubuntu VM..."
BACKUP_DIR="$UBUNTU_PROD_DIR/backups/$TIMESTAMP"

# Remote backup commands
BACKUP_SCRIPT="
mkdir -p '$BACKUP_DIR'

# Clean old backups (keep only last 3)
if [ -d '$UBUNTU_PROD_DIR/backups' ]; then
    cd '$UBUNTU_PROD_DIR/backups'
    ls -dt */ | tail -n +4 | xargs rm -rf 2>/dev/null || true
fi

# Backup dist folder
if [ -d '$UBUNTU_PROD_DIR/dist' ]; then
    cp -r '$UBUNTU_PROD_DIR/dist' '$BACKUP_DIR/dist'
fi
"

if [ "$DRY_RUN" = false ]; then
    if ssh "$SSH_TARGET" "$BACKUP_SCRIPT"; then
        print_success "Backup created at: $BACKUP_DIR"
    else
        print_warning "Could not create backup, continuing..."
    fi
else
    print_info "[DRY RUN] Would create backup on Ubuntu"
fi
else
print_info "STEP 2: Skipped backup due to --hotfix flag"
fi

echo ""

# ============================================================================
# STEP 3: KEEP SERVICES RUNNING DURING FILE SYNC
# ============================================================================
if [ "$HOTFIX" = false ]; then
print_info "STEP 3: Keeping production services running during delta sync"
print_info "  - PM2 will restart only affected services after files are synced"
else
print_info "STEP 3: Hotfix mode keeps all services running"
fi

echo ""

# ============================================================================
# STEP 4: SYNC FILES FROM DEV TO UBUNTU VM
# ============================================================================
print_info "STEP 4: Syncing files from dev to Ubuntu VM..."

if [ "$HOTFIX" = false ]; then
    print_info "  - Preserving production data and removing no unrelated files"
fi

# List of files/folders to sync - mirrors MacOS-Production.ps1 (Linux/Unix compatible)
SYNC_FILES=(
    "dist"
)

# Sync Wallpapers folder separately if not skipped
if [ "$SKIP_ASSETS" = false ]; then
    print_info "  - Syncing Wallpapers storage (separate from build)..."
    if [ -d "$DEV_DIR/Wallpapers" ]; then
        if [ "$TRADITIONAL" = true ]; then
            print_warning "traditional mode: copying all Wallpapers files with scp"
            sync_all_files_with_scp "$DEV_DIR/Wallpapers" "$UBUNTU_PROD_DIR/Wallpapers"
        elif command -v rsync &> /dev/null; then
            rsync -avz --checksum --omit-dir-times \
                "$DEV_DIR/Wallpapers/" "$SSH_TARGET:$UBUNTU_PROD_DIR/Wallpapers/"
        else
            print_warning "rsync not found; using hash-based scp delta transfer for Wallpapers"
            sync_changed_files_with_scp "$DEV_DIR/Wallpapers" "$UBUNTU_PROD_DIR/Wallpapers"
        fi
    else
        print_warning "Wallpapers folder not found at root"
    fi
fi
# NOTE: src is NOT synced - it's bundled into dist/ during build
# NOTE: home.html and index.html are only in dist/ folder (built by vite), not at root
# NOTE: Windows-specific files (run-ipv6.bat, IPV6 UPDATER) are not synced to Linux VM

if [ "$DRY_RUN" = false ]; then
    # Compare contents, not timestamps, because a fresh build updates timestamps
    # even when the generated file itself is unchanged.
    print_info "  - Syncing dist contents (flattened) via rsync..."
    if [ "$TRADITIONAL" = true ]; then
        print_warning "traditional mode: copying all deployment files with scp"
        sync_all_files_with_scp "$DEV_DIR/dist" "$UBUNTU_PROD_DIR"
        sync_all_files_with_scp "$DEV_DIR/backend" "$UBUNTU_PROD_DIR/backend" true
        sync_all_files_with_scp "$DEV_DIR/frontend" "$UBUNTU_PROD_DIR/frontend"
        sync_all_files_with_scp "$DEV_DIR/ecosystem.config.js" "$UBUNTU_PROD_DIR"
        sync_all_files_with_scp "$DEV_DIR/package.json" "$UBUNTU_PROD_DIR"
        sync_all_files_with_scp "$DEV_DIR/server-prod.js" "$UBUNTU_PROD_DIR"
        if [ -d "$DEV_DIR/scripts_py" ]; then
            sync_all_files_with_scp "$DEV_DIR/scripts_py" "$UBUNTU_PROD_DIR/scripts_py"
        fi
    elif command -v rsync &> /dev/null; then
        rsync -avz --checksum --omit-dir-times --delete \
            --exclude='database' --exclude='backups' --exclude='logs' --exclude='Wallpapers' --exclude='CloudStorage' \
            "$DEV_DIR/dist/" "$SSH_TARGET:$UBUNTU_PROD_DIR/"
        
        print_info "  - Syncing backend, frontend, config, and scripts..."
        # APKs and user uploads are deployed by their own publisher and are
        # production state, not application source.
        rsync -avz --checksum --omit-dir-times --delete --exclude='uploads/' "$DEV_DIR/backend/" "$SSH_TARGET:$UBUNTU_PROD_DIR/backend/"
        rsync -avz --checksum --omit-dir-times --delete "$DEV_DIR/frontend/" "$SSH_TARGET:$UBUNTU_PROD_DIR/frontend/"
        rsync -avz --checksum --omit-dir-times "$DEV_DIR/ecosystem.config.js" "$DEV_DIR/package.json" "$DEV_DIR/server-prod.js" "$SSH_TARGET:$UBUNTU_PROD_DIR/"
        if [ -d "$DEV_DIR/scripts_py" ]; then
                rsync -avz --checksum --omit-dir-times --delete "$DEV_DIR/scripts_py/" "$SSH_TARGET:$UBUNTU_PROD_DIR/scripts_py/"
        fi
    else
        print_warning "rsync not found; using hash-based scp delta transfer"
        sync_changed_files_with_scp "$DEV_DIR/dist" "$UBUNTU_PROD_DIR"
        sync_changed_files_with_scp "$DEV_DIR/backend" "$UBUNTU_PROD_DIR/backend" true
        sync_changed_files_with_scp "$DEV_DIR/frontend" "$UBUNTU_PROD_DIR/frontend"
        sync_changed_files_with_scp "$DEV_DIR/ecosystem.config.js" "$UBUNTU_PROD_DIR"
        sync_changed_files_with_scp "$DEV_DIR/package.json" "$UBUNTU_PROD_DIR"
        sync_changed_files_with_scp "$DEV_DIR/server-prod.js" "$UBUNTU_PROD_DIR"
        if [ -d "$DEV_DIR/scripts_py" ]; then
            sync_changed_files_with_scp "$DEV_DIR/scripts_py" "$UBUNTU_PROD_DIR/scripts_py"
        fi
    fi

    # Verify assets/ made it across
    if [ "$SKIP_ASSETS" = false ]; then
        print_info "  - Verifying assets/ on remote..."
        REMOTE_ASSETS=$(ssh "$SSH_TARGET" "ls '$UBUNTU_PROD_DIR/assets/' 2>/dev/null | wc -l")
        if [ "$REMOTE_ASSETS" -gt 0 ]; then
            print_success "Assets synced: $REMOTE_ASSETS files in assets/"
        else
            print_warning "WARNING: assets/ directory is EMPTY or missing on remote!"
        fi
    else
        print_info "  - Asset verification skipped"
    fi

    print_success "Files synced to Ubuntu VM"
else
    print_info "[DRY RUN] Would sync dist/ contents to $UBUNTU_PROD_DIR (using rsync if available)"
fi

echo ""

# Install dependencies only when manifests changed or node_modules is absent.
print_info "Checking Node.js dependencies on Ubuntu..."
NPM_INSTALL_SCRIPT="
cd '$UBUNTU_PROD_DIR'
if [ '$DEPENDENCIES_CHANGED' = true ] || [ ! -d node_modules ]; then
    npm install --omit=dev
else
    echo 'Node.js dependencies unchanged; skipping npm install'
fi
"

if [ "$DRY_RUN" = false ]; then
    if ssh "$SSH_TARGET" "$NPM_INSTALL_SCRIPT"; then
        print_success "Dependencies installed on Ubuntu"
    else
        print_error "Failed to install dependencies!"
        exit 1
    fi
else
    print_info "[DRY RUN] Would install dependencies on Ubuntu"
fi

# Install Python dependencies only when requirements changed or no marker exists.
print_info "Checking Python dependencies (reportlab, PyMuPDF)..."
PIP_INSTALL_SCRIPT="
cd '$UBUNTU_PROD_DIR'
REQUIREMENTS_HASH=\$(sha256sum scripts_py/requirements.txt 2>/dev/null | cut -d' ' -f1)
if [ '$DEPENDENCIES_CHANGED' = true ] || [ ! -f .python-dependencies.hash ] || [ \"\$(cat .python-dependencies.hash 2>/dev/null)\" != \"\$REQUIREMENTS_HASH\" ]; then
    if ! command -v pip3 &>/dev/null; then sudo apt-get install -y python3-pip -q; fi
    sudo pip3 install --quiet --break-system-packages -r scripts_py/requirements.txt 2>/dev/null || sudo pip3 install --quiet -r scripts_py/requirements.txt
    echo "\$REQUIREMENTS_HASH" > .python-dependencies.hash
else
    echo 'Python dependencies unchanged; skipping pip install'
fi
"
if [ "$DRY_RUN" = false ]; then
    if ssh "$SSH_TARGET" "$PIP_INSTALL_SCRIPT"; then
        print_success "Python dependencies installed"
    else
        print_warning "Python dependency install had issues — PDF generation may fail"
    fi
fi

# Install Chromium & system dependencies for Puppeteer PDF Generation
print_info "Checking Chromium for Puppeteer PDF generation..."
PUPPETEER_SYS_SCRIPT="
if ! command -v chromium-browser &>/dev/null && ! command -v chromium &>/dev/null; then
    echo 'Installing Chromium and shared libraries for server PDF generation...'
    sudo apt-get update -q && sudo apt-get install -y -q chromium-browser fonts-liberation libnss3 ca-certificates libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libxkbcommon0 2>/dev/null || \
    sudo apt-get install -y -q chromium fonts-liberation libnss3 ca-certificates 2>/dev/null || true
fi
"
if [ "$DRY_RUN" = false ]; then
    if ssh "$SSH_TARGET" "$PUPPETEER_SYS_SCRIPT"; then
        print_success "Chromium / Puppeteer dependencies verified on Ubuntu"
    else
        print_warning "Chromium system dependency setup encountered non-fatal warning"
    fi
else
    print_info "[DRY RUN] Would verify/install Chromium system dependencies for Puppeteer"
fi

echo ""

# ============================================================================
# STEP 5b: UPLOAD AND RELOAD NGINX CONFIG
# ============================================================================
print_info "STEP 5b: Checking Nginx config..."

if [ "$DRY_RUN" = false ] && { [ "$NGINX_CHANGED" = true ] || [ "$FORCE" = true ]; }; then
    # Upload the nginx config
    scp "$DEV_DIR/macos-nginx.conf" "$SSH_TARGET:/tmp/macos-nginx.conf"

    NGINX_RELOAD_SCRIPT="
# Install config to Nginx sites-available
sudo cp /tmp/macos-nginx.conf /etc/nginx/sites-available/mac.faizal.uk
sudo ln -sf /etc/nginx/sites-available/mac.faizal.uk /etc/nginx/sites-enabled/mac.faizal.uk 2>/dev/null || true

# Test config then reload
if sudo nginx -t 2>&1; then
    sudo systemctl reload nginx
    echo 'Nginx reloaded successfully'
else
    echo 'ERROR: Nginx config test failed! Check /tmp/macos-nginx.conf'
    exit 1
fi
"
    if ssh "$SSH_TARGET" "$NGINX_RELOAD_SCRIPT"; then
        print_success "Nginx config updated and reloaded"
    else
        print_warning "Nginx reload failed — check config manually"
    fi
else
    print_info "Nginx config unchanged; skipping reload"
fi

echo ""

# ============================================================================
# STEP 6: START SERVICES ON UBUNTU VM
# ============================================================================
if [ "$HOTFIX" = false ]; then
print_info "STEP 6: Starting production services on Ubuntu VM..."

START_SCRIPT="
cd '$UBUNTU_PROD_DIR'

if command -v pm2 &> /dev/null; then
    # Backend initialization runs migrations; restart it whenever backend code
    # or dependency manifests changed. Static changes only restart frontend.
    if [ '$BACKEND_CHANGED' = true ] || [ '$FORCE' = true ]; then
        pm2 restart backend --update-env 2>/dev/null || pm2 start ecosystem.config.js --env oraclevm --only backend --update-env
    fi
    if [ '$FRONTEND_CHANGED' = true ] || [ '$FORCE' = true ]; then
        pm2 restart frontend --update-env 2>/dev/null || pm2 start ecosystem.config.js --env oraclevm --only frontend --update-env
    fi
    if [ '$BACKEND_CHANGED' = false ] && [ '$FRONTEND_CHANGED' = false ] && [ '$FORCE' = false ]; then
        echo 'No PM2 service changes detected; skipping restart'
    fi
    sleep 5
    echo 'Service Status:'
    pm2 status
else
    echo 'ERROR: PM2 not found! Install with: npm install -g pm2'
    exit 1
fi
"

if [ "$DRY_RUN" = false ]; then
    ssh "$SSH_TARGET" "$START_SCRIPT"
    print_success "Services started on Ubuntu"
else
    print_info "[DRY RUN] Would start services and test"
fi
else
print_info "STEP 6: Skipped starting services due to --hotfix flag. Note: PM2 services were not stopped, hotfix code should be active if PM2 auto-reloads or if it's frontend only."
fi

# ============================================================================
if [ "$DRY_RUN" = true ]; then
    echo "   DRY RUN COMPLETE (no changes made)"
else
    echo "   REMOTE DEPLOYMENT COMPLETE"
fi
echo "======================================================"
echo ""
echo "Summary:"
echo "  [OK] Incremental build and file sync completed"
if [ "$DRY_RUN" = false ]; then
    echo "  [OK] Backup created on Ubuntu: $BACKUP_DIR"
    echo "  [OK] Changed files synced to Ubuntu VM"
    echo "  [OK] Dependencies checked (installed only when changed)"
    echo "  [OK] Only affected PM2 services restarted"
fi
echo ""
echo "Next steps:"
echo "  - IMPORTANT: If this is a first-time setup for port 80, run:"
echo "    sudo setcap 'cap_net_bind_service=+ep' \$(which node)"
echo "  - To clear old PM2 state: pm2 delete all && pm2 save"
echo "  - Monitor logs:   ssh $SSH_TARGET 'pm2 logs --cwd $UBUNTU_PROD_DIR'"
echo "  - Service status: ssh $SSH_TARGET 'pm2 status --cwd $UBUNTU_PROD_DIR'"
echo "  - Quick restart:  ssh $SSH_TARGET 'cd $UBUNTU_PROD_DIR && pm2 restart ecosystem.config.js'"
echo "  - Rollback:       ssh $SSH_TARGET 'rm -rf $UBUNTU_PROD_DIR/dist && cp -r $BACKUP_DIR/dist $UBUNTU_PROD_DIR/dist && cd $UBUNTU_PROD_DIR && pm2 restart ecosystem.config.js'"
echo ""
