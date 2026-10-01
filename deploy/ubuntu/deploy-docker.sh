#!/bin/bash
set -e

################################################################################
# Blue-Green Zero-Downtime Docker Deployer for MacOS Production
#
# Usage:
#   ./deploy-docker.sh [--target blue|green]
################################################################################

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
NGINX_UPSTREAM_CONF="/etc/nginx/conf.d/upstream_macos.conf"

BLUE_PORT=3001
GREEN_PORT=3004

echo "========================================================"
echo "🚀 Zero-Downtime Blue/Green Docker Deployment Starting"
echo "========================================================"

# 1. Determine active slot from Nginx upstream
CURRENT_ACTIVE="blue"
if [ -f "$NGINX_UPSTREAM_CONF" ]; then
    if grep -q "127.0.0.1:$GREEN_PORT" "$NGINX_UPSTREAM_CONF"; then
        CURRENT_ACTIVE="green"
    fi
fi

# Auto-heal: Ensure Docker bridge network interface & route are active
BRIDGE_NET=$(docker network inspect macos-stack_default --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' 2>/dev/null || true)
BRIDGE_ID=$(docker network inspect macos-stack_default --format '{{.Id}}' 2>/dev/null | cut -c1-12 || true)
if [ -n "$BRIDGE_NET" ] && [ -n "$BRIDGE_ID" ]; then
    BRIDGE_DEV="br-$BRIDGE_ID"
    if ip link show "$BRIDGE_DEV" >/dev/null 2>&1; then
        sudo ip link set "$BRIDGE_DEV" up 2>/dev/null || true
        if ! ip route | grep -q "$BRIDGE_DEV"; then
            echo "🔧 Restoring missing bridge route for $BRIDGE_DEV ($BRIDGE_NET)..."
            sudo ip addr add "$BRIDGE_NET/16" dev "$BRIDGE_DEV" 2>/dev/null || true
            sudo ip link set "$BRIDGE_DEV" up 2>/dev/null || true
        fi
    fi
fi

# Auto-heal: Ensure Docker daemon has DNS fallbacks to prevent container resolution issues
if [ ! -f /etc/docker/daemon.json ] 2>/dev/null; then
    echo "🔧 Setting reliable fallback DNS in /etc/docker/daemon.json..."
    sudo mkdir -p /etc/docker
    echo '{"dns": ["8.8.8.8", "1.1.1.1"]}' | sudo tee /etc/docker/daemon.json >/dev/null 2>&1 || true
    sudo systemctl reload docker 2>/dev/null || true
fi

# 2. Determine target idle slot
if [ "$1" = "--target" ] && [ -n "$2" ]; then
    TARGET_SLOT="$2"
else
    if [ "$CURRENT_ACTIVE" = "blue" ]; then
        TARGET_SLOT="green"
    else
        TARGET_SLOT="blue"
    fi
fi

if [ "$TARGET_SLOT" = "blue" ]; then
    TARGET_PORT=$BLUE_PORT
    OLD_SLOT="green"
    OLD_PORT=$GREEN_PORT
else
    TARGET_PORT=$GREEN_PORT
    OLD_SLOT="blue"
    OLD_PORT=$BLUE_PORT
fi

echo "📍 Current Active Slot: $CURRENT_ACTIVE"
echo "🎯 Deploying to Slot:   $TARGET_SLOT (Port: $TARGET_PORT)"

# 2.4 Host Disk Space Check
echo "🧹 Checking host disk space..."
AVAIL_MB=$(df -m / 2>/dev/null | awk 'NR==2 {print $4}' || echo "99999")
if [ "$AVAIL_MB" -lt 1500 ]; then
    echo "⚠️ Low disk space detected (${AVAIL_MB}MB available). Running light cleanup..."
    docker container prune -f 2>/dev/null || true
    sudo journalctl --vacuum-time=1d 2>/dev/null || true
    sudo rm -rf /tmp/* 2>/dev/null || true
    echo "✓ Post-cleanup free space: $(df -h / | awk 'NR==2 {print $4}')"
fi

# 2.5 Ensure target port is free before spin-up, otherwise an old stale container or orphaned process can block deploys
PORT_BOUND=false
if ss -lnt 2>/dev/null | awk '{print $4}' | grep -Eq "127\.0\.0\.1:${TARGET_PORT}$|\[::\]:${TARGET_PORT}$"; then
    PORT_BOUND=true
fi

if [ "$PORT_BOUND" = true ]; then
    echo "⚠️ Port 127.0.0.1:$TARGET_PORT is already bound. Clearing stale Docker slot state..."
    docker compose -f "$COMPOSE_FILE" stop "macos-server-$TARGET_SLOT" 2>/dev/null || true
    docker compose -f "$COMPOSE_FILE" rm -f -s "macos-server-$TARGET_SLOT" 2>/dev/null || true
    docker rm -f "macos-server-$TARGET_SLOT" 2>/dev/null || true
    sleep 2
    if ss -lnt 2>/dev/null | awk '{print $4}' | grep -Eq "127\.0\.0\.1:${TARGET_PORT}$|\[::\]:${TARGET_PORT}$"; then
        echo "❌ ERROR: port 127.0.0.1:$TARGET_PORT is still occupied by a live process. Aborting deployment to avoid overwriting an active service."
        ss -lntp | grep -E ":${TARGET_PORT} " || true
        exit 1
    fi
fi

# 2.6 Ensure all required host directories exist with open permissions before container mount
echo "📁 Ensuring host data and storage directories exist..."
mkdir -p database/backups CloudStorage Wallpapers backend/uploads logs \
    storage/wallpapers/builtin storage/wallpapers/marketplace storage/wallpapers/custom storage/temp_uploads storage/android-updates/archive tools
chmod -R 777 storage logs backend/uploads CloudStorage Wallpapers 2>/dev/null || true
chmod -R 755 tools 2>/dev/null || true

# Auto-heal: Ensure .env exists and has required production authentication secrets
if [ ! -f .env ] || ! grep -q "JWT_SECRET" .env; then
    echo "⚠️  .env file missing or incomplete on host. Provisioning production .env..."
    cat << 'EOF' > .env
GOOGLE_CLIENT_ID=540487611333-t0i54c3b0k07nuoaljkdr68otst89se5.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
GOOGLE_WORKER_CLIENT_ID=540487611333-t0i54c3b0k07nuoaljkdr68otst89se5.apps.googleusercontent.com
GOOGLE_ANDROID_CLIENT_ID=540487611333-2sknab3189vnh0f4dm6ftnsnddsl447f.apps.googleusercontent.com
GOOGLE_REDIRECT_URI=https://mac.faizal.uk/api/auth/google/callback
JWT_SECRET=Z2CuHUqZaKvWxBQ4etO2F-y8ZqAvUK0nixpJPnGprem79ceQPest-vd-YK0yuRJ9
RECOVERY_KEY=ncfMIes1QCf9IDbR-7j3VW734VYdzw8zgjhLbG9ag_c
PORT=3001
HOST=0.0.0.0
NODE_ENV=production
EOF
    chmod 600 .env 2>/dev/null || true
fi

# 2.7 Smart build detection:
# Routine deploys update frontend/backend/dist via host volume mounts with zero build time.
# Rebuild is ONLY triggered if dependencies changed, image is missing, or explicitly forced.
BUILD_HASH_FILE=".docker_build_hash"
CURRENT_HASH=$(sha256sum package.json package-lock.json tools/python/requirements.txt 2>/dev/null | sha256sum | awk '{print $1}')
IMAGE_EXISTS=$(docker image inspect macos-server:latest >/dev/null 2>&1 && echo "yes" || echo "no")

NEEDS_BUILD=false
if [ "$IMAGE_EXISTS" != "yes" ]; then
    echo "🔨 macos-server:latest image not found on host. Initial build required..."
    NEEDS_BUILD=true
elif [ "$1" = "--rebuild" ] || [ "$2" = "--rebuild" ] || [ "$FORCE_BUILD" = "true" ]; then
    echo "🔄 Rebuild requested via flag..."
    NEEDS_BUILD=true
elif [ -f "$BUILD_HASH_FILE" ] && [ "$CURRENT_HASH" != "$(cat "$BUILD_HASH_FILE" 2>/dev/null)" ]; then
    echo "📦 Dependencies or requirements changed. Rebuilding Docker image..."
    NEEDS_BUILD=true
elif [ ! -f "$BUILD_HASH_FILE" ]; then
    echo "📌 Recording initial build hash for existing macos-server:latest..."
    echo "$CURRENT_HASH" > "$BUILD_HASH_FILE"
    NEEDS_BUILD=false
fi

# 3. Clean up any stopped/stale container for target slot and start fresh
docker compose -f "$COMPOSE_FILE" rm -f -s "macos-server-$TARGET_SLOT" 2>/dev/null || true

if [ "$NEEDS_BUILD" = "true" ]; then
    echo "📦 Building and starting container macos-server-$TARGET_SLOT..."
    docker compose -f "$COMPOSE_FILE" up -d --build --no-deps "macos-server-$TARGET_SLOT"
    echo "$CURRENT_HASH" > "$BUILD_HASH_FILE"
else
    echo "⚡ Fast zero-downtime swap (dependencies unchanged, mounting updated host volumes)..."
    docker compose -f "$COMPOSE_FILE" up -d --no-deps "macos-server-$TARGET_SLOT"
fi

# 4. Await healthy status
echo "⏳ Waiting for macos-server-$TARGET_SLOT to pass health checks on port $TARGET_PORT..."
MAX_RETRIES=30
COUNT=0
HEALTHY=false

while [ $COUNT -lt $MAX_RETRIES ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 2 "http://127.0.0.1:$TARGET_PORT/api/health" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        HEALTHY=true
        echo " [HTTP 200 - Healthy in ${COUNT}s!]"
        break
    fi
    sleep 1
    COUNT=$((COUNT + 1))
    echo -n ".[$HTTP_CODE]"
done
echo ""

if [ "$HEALTHY" != "true" ]; then
    echo "❌ ERROR: Target container macos-server-$TARGET_SLOT failed to become healthy on port $TARGET_PORT after ${MAX_RETRIES}s!"
    echo "Last response probe from http://127.0.0.1:$TARGET_PORT/api/health:"
    curl -v -m 5 "http://127.0.0.1:$TARGET_PORT/api/health" 2>&1 || true
    echo "Logs from macos-server-$TARGET_SLOT:"
    docker compose -f "$COMPOSE_FILE" logs --tail 40 "macos-server-$TARGET_SLOT"
    echo "Aborting switch. Live traffic remains uninterrupted on $CURRENT_ACTIVE."
    exit 1
fi

# 5. Run full verification suite on target port
echo "🧪 Running comprehensive endpoint verification suite against target..."
if [ -f "tools/verify-docker.js" ]; then
    node tools/verify-docker.js "$TARGET_PORT"
fi

# 6. Atomic Nginx Switch: Update upstream config and reload Nginx
echo "🔄 Switching active upstream to $TARGET_SLOT (: $TARGET_PORT)..."
TMP_UPSTREAM="/tmp/upstream_macos.conf"
cat << EOF > "$TMP_UPSTREAM"
# Autogenerated by deploy-docker.sh on $(date)
# Active Slot: $TARGET_SLOT
upstream macos_backend {
    server 127.0.0.1:$TARGET_PORT max_fails=2 fail_timeout=5s;
    keepalive 32;
}
EOF

sudo cp "$TMP_UPSTREAM" "$NGINX_UPSTREAM_CONF"
sudo chmod 644 "$NGINX_UPSTREAM_CONF"

# Mirror upstream config & heartbeat to mounted logs/ directory so Docker containers can inspect it
mkdir -p logs
cp "$TMP_UPSTREAM" logs/upstream_macos.conf 2>/dev/null || true
echo "$(date -u +%s)" > logs/healthwatch.heartbeat 2>/dev/null || true
rm -f "$TMP_UPSTREAM"

echo "🔍 Validating Nginx configuration..."
sudo nginx -t

echo "⚡ Reloading Nginx with zero downtime..."
sudo systemctl reload nginx
echo "✅ Traffic successfully switched to $TARGET_SLOT!"

# 7. Graceful Retirement of old container to free memory (954MB total VM RAM)
echo "🧹 Stopping previous slot macos-server-$OLD_SLOT to preserve RAM..."
sleep 2
docker compose -f "$COMPOSE_FILE" stop "macos-server-$OLD_SLOT" || true

# Clean up stopped container instances to keep disk lean
docker container prune -f >/dev/null 2>&1 || true


echo "========================================================"
echo "🎉 Zero-Downtime Deployment to $TARGET_SLOT Complete!"
echo "========================================================"
