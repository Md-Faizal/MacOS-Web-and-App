#!/bin/bash

################################################################################
# UBUNTU REMOTE DEPLOYMENT SCRIPT
# 
# Deploy updates from Windows dev machine to Ubuntu production VM via SSH
# Builds frontend locally, syncs via rsync/scp, and restarts services remotely
# 
# IMPORTANT: This script ALWAYS builds from src and copies fresh dist to prod.
# There is no skip-build option - builds are mandatory for safety.
#
# Usage: ./deploy-ubuntu.sh [--dry-run] [--force] [--skip-assets] [--hotfix]
#
# Options:
#   --dry-run      Show what would happen without making changes
#   --force        Override failure checks
#   --skip-assets  Skip 5GB+ Assets folder (for faster iterative updates)
#   --hotfix       Skip build, backup, and server restart. Only sync files directly.
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
        --hotfix)
            HOTFIX=true
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
echo "Options: DRY_RUN=$DRY_RUN FORCE=$FORCE SKIP_ASSETS=$SKIP_ASSETS HOTFIX=$HOTFIX"
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


# ============================================================================
# STEP 1: CLEAN AND BUILD FRONTEND (MANDATORY - ALWAYS RUNS UNLESS HOTFIX)
# ============================================================================
if [ "$HOTFIX" = false ]; then
print_info "STEP 1: Cleaning old dist folder and building fresh..."
cd "$DEV_DIR"

# Remove old dist
print_info "  - Removing old dist folder..."
rm -rf dist 2>/dev/null || true

# Run build (includes src folder and both html files)
print_info "  - Running npm run build..."
if ! npm run build; then
    print_error "BUILD FAILED! Deployment aborted to prevent broken release."
    exit 1
fi

# Verify dist was created
if [ ! -d "dist" ]; then
    print_error "CRITICAL: dist folder was not created after build!"
    exit 1
fi

print_info "Fresh build completed and verified"
print_info "  - Build includes: index.html, home.html, offline.html, assets/, frontend/, backend/"
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
# STEP 3: STOP SERVICES ON UBUNTU VM
# ============================================================================
if [ "$HOTFIX" = false ]; then
print_info "STEP 3: Stopping production services on Ubuntu VM..."

STOP_SCRIPT="
if command -v pm2 &> /dev/null; then
    cd '$UBUNTU_PROD_DIR'
    pm2 stop ecosystem.config.js 2>/dev/null || true
    sleep 3
    pkill -f '$UBUNTU_PROD_DIR' 2>/dev/null || true
    sleep 5
fi
"

if [ "$DRY_RUN" = false ]; then
    if ssh "$SSH_TARGET" "$STOP_SCRIPT"; then
        print_success "Services stopped on Ubuntu"
    else
        print_warning "Failed to stop services, continuing anyway..."
    fi
else
    print_info "[DRY RUN] Would stop services on Ubuntu"
fi
else
print_info "STEP 3: Skipped stopping services due to --hotfix flag"
fi

echo ""

# ============================================================================
# STEP 4: SYNC FILES FROM DEV TO UBUNTU VM
# ============================================================================
print_info "STEP 4: Syncing files from dev to Ubuntu VM..."

# First, clean production directory (keep only database, backups, logs) - matches MacOS-Production.ps1
CLEAN_SCRIPT="
cd '$UBUNTU_PROD_DIR'
for item in */; do
    case \"\$item\" in
        database/)      ;;
        backups/)       ;;
        logs/)          ;;
        Wallpapers/)    ;;
        CloudStorage/)  ;;
        *)
            echo \"Removing: \${item%/}\"
            rm -rf \"\$item\" 2>/dev/null || true
            ;;
    esac
done

# Also remove root-level files except those we'll sync
find . -maxdepth 1 -type f ! -name 'database*' ! -name '.env*' -delete 2>/dev/null || true
"

if [ "$HOTFIX" = false ]; then
if [ "$DRY_RUN" = false ]; then
    print_info "  - Cleaning production directory..."
    ssh "$SSH_TARGET" "$CLEAN_SCRIPT" > /dev/null 2>&1
    sleep 2
fi
else
    print_info "  - Skipping production directory clean due to --hotfix flag..."
fi

# List of files/folders to sync - mirrors MacOS-Production.ps1 (Linux/Unix compatible)
SYNC_FILES=(
    "dist"
)

# Sync Wallpapers folder separately if not skipped
if [ "$SKIP_ASSETS" = false ]; then
    print_info "  - Syncing Wallpapers storage (separate from build)..."
    if [ -d "$DEV_DIR/Wallpapers" ]; then
        scp -r "$DEV_DIR/Wallpapers" "$SSH_TARGET:$UBUNTU_PROD_DIR/" 2>&1 | grep -v "^$" | head -5
    else
        print_warning "Wallpapers folder not found at root"
    fi
fi
# NOTE: src is NOT synced - it's bundled into dist/ during build
# NOTE: home.html and index.html are only in dist/ folder (built by vite), not at root
# NOTE: Windows-specific files (run-ipv6.bat, IPV6 UPDATER) are not synced to Linux VM

if [ "$DRY_RUN" = false ]; then
    # Sync contents of dist to flatten structure
    # Using rsync instead of scp - handles subdirs like assets/ reliably on Windows/Git Bash
    print_info "  - Syncing dist contents (flattened) via rsync..."
    if command -v rsync &> /dev/null; then
        rsync -avz --delete \
            --exclude='database' --exclude='backups' --exclude='logs' --exclude='Wallpapers' --exclude='CloudStorage' \
            "$DEV_DIR/dist/" "$SSH_TARGET:$UBUNTU_PROD_DIR/"
        
        print_info "  - Syncing backend, frontend, config, and scripts..."
        rsync -avz --delete "$DEV_DIR/backend/" "$SSH_TARGET:$UBUNTU_PROD_DIR/backend/"
        rsync -avz --delete "$DEV_DIR/frontend/" "$SSH_TARGET:$UBUNTU_PROD_DIR/frontend/"
        rsync -avz "$DEV_DIR/ecosystem.config.js" "$DEV_DIR/package.json" "$DEV_DIR/server-prod.js" "$SSH_TARGET:$UBUNTU_PROD_DIR/"
        if [ -d "$DEV_DIR/scripts_py" ]; then
            rsync -avz --delete "$DEV_DIR/scripts_py/" "$SSH_TARGET:$UBUNTU_PROD_DIR/scripts_py/"
        fi
    else
        # Fallback: sync each known directory explicitly to avoid glob issues
        print_warning "rsync not found, using explicit scp fallback..."
        for item in "$DEV_DIR/dist/"*/; do
            dir_name=$(basename "$item")
            print_info "    Copying $dir_name/..."
            scp -r "$item" "$SSH_TARGET:$UBUNTU_PROD_DIR/$dir_name"
        done
        for file in "$DEV_DIR/dist/"*.html "$DEV_DIR/dist/"*.js "$DEV_DIR/dist/"*.json "$DEV_DIR/dist/"*.conf; do
            [ -f "$file" ] && scp "$file" "$SSH_TARGET:$UBUNTU_PROD_DIR/"
        done
        
        print_info "    Copying backend, frontend, and config..."
        scp -r "$DEV_DIR/backend" "$SSH_TARGET:$UBUNTU_PROD_DIR/"
        scp -r "$DEV_DIR/frontend" "$SSH_TARGET:$UBUNTU_PROD_DIR/"
        scp "$DEV_DIR/ecosystem.config.js" "$DEV_DIR/package.json" "$DEV_DIR/server-prod.js" "$SSH_TARGET:$UBUNTU_PROD_DIR/"
        if [ -d "$DEV_DIR/scripts_py" ]; then
            scp -r "$DEV_DIR/scripts_py" "$SSH_TARGET:$UBUNTU_PROD_DIR/"
        fi
    fi

    # Verify assets/ made it across
    print_info "  - Verifying assets/ on remote..."
    REMOTE_ASSETS=$(ssh "$SSH_TARGET" "ls '$UBUNTU_PROD_DIR/assets/' 2>/dev/null | wc -l")
    if [ "$REMOTE_ASSETS" -gt 0 ]; then
        print_success "Assets synced: $REMOTE_ASSETS files in assets/"
    else
        print_warning "WARNING: assets/ directory is EMPTY or missing on remote!"
        print_warning "  Check: ssh $SSH_TARGET 'ls $UBUNTU_PROD_DIR/'"
    fi

    print_success "Files synced to Ubuntu VM"
else
    print_info "[DRY RUN] Would sync dist/ contents to $UBUNTU_PROD_DIR (using rsync if available)"
fi

echo ""

# Install dependencies (production only, omitting dev dependencies)
print_info "Installing dependencies on Ubuntu..."
NPM_INSTALL_SCRIPT="
cd '$UBUNTU_PROD_DIR'
npm install --omit=dev
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

# Install Python dependencies for PDF generation scripts
print_info "Installing Python dependencies (reportlab, PyMuPDF)..."
PIP_INSTALL_SCRIPT="
cd '$UBUNTU_PROD_DIR'
# Ensure pip3 is available
if ! command -v pip3 &>/dev/null; then
    sudo apt-get install -y python3-pip -q
fi
# Install system-wide (sudo) so Node.js execSync can find the packages
# --break-system-packages needed on Ubuntu 22.04+
sudo pip3 install --quiet --break-system-packages -r scripts_py/requirements.txt 2>/dev/null || \
sudo pip3 install --quiet -r scripts_py/requirements.txt
"
if [ "$DRY_RUN" = false ]; then
    if ssh "$SSH_TARGET" "$PIP_INSTALL_SCRIPT"; then
        print_success "Python dependencies installed"
    else
        print_warning "Python dependency install had issues — PDF generation may fail"
    fi
fi

# Install Chromium & system dependencies for Puppeteer PDF Generation
print_info "Installing Chromium and system dependencies for Puppeteer PDF generator..."
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
print_info "STEP 5b: Uploading and reloading Nginx config..."

if [ "$DRY_RUN" = false ]; then
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
    print_info "[DRY RUN] Would upload nginx config and reload Nginx"
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
    echo 'Starting PM2 services (frontend & backend only)...'
    # Use oraclevm env: HOST=0.0.0.0 (IPv4), PORT=3000 frontend, PORT=3001 backend
    # Note: excluding ipv6-updater as requested for Ubuntu
    # --update-env ensures HOST and PORT env vars are applied even if PM2 already has processes
    pm2 start ecosystem.config.js --env oraclevm --only backend,frontend --update-env
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
echo "  [OK] Fresh build from dev src completed"
if [ "$DRY_RUN" = false ]; then
    echo "  [OK] Backup created on Ubuntu: $BACKUP_DIR"
    echo "  [OK] Files synced to Ubuntu VM"
    echo "  [OK] Dependencies installed"
    echo "  [OK] Services restarted on Ubuntu"
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
