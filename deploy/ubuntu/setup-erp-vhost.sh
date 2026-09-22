#!/bin/bash
# ==========================================================
# One-Time Setup: erp.faizal.uk nginx vhost
#
# Run this ONCE on the production VM to enable the Zentra
# Analytics Dashboard on erp.faizal.uk.
#
# Idempotent — safe to re-run if something changes.
#
# Usage:
#   cd /home/ubuntu/MacOS-Production
#   bash deploy/ubuntu/setup-erp-vhost.sh
# ==========================================================
set -e

TARGET_DIR="/home/ubuntu/MacOS-Production"
NGINX_SITES_AVAILABLE="/etc/nginx/sites-available"
NGINX_SITES_ENABLED="/etc/nginx/sites-enabled"

echo "=================================================="
echo "🔧 Setting up erp.faizal.uk nginx vhost"
echo "=================================================="

# 1. Ensure Zentra dist directory exists (needed for volume mount)
echo "📁 Ensuring Zentra dist directory exists..."
mkdir -p "$TARGET_DIR/zentra-analytics-dashboard/dist"

# 2. Copy nginx vhost to sites-available
echo "📋 Installing nginx vhost config..."
sudo cp "$TARGET_DIR/deploy/nginx/erp.faizal.uk" "$NGINX_SITES_AVAILABLE/erp.faizal.uk"
sudo chmod 644 "$NGINX_SITES_AVAILABLE/erp.faizal.uk"
echo "   Installed: $NGINX_SITES_AVAILABLE/erp.faizal.uk"

# 3. Enable the vhost (idempotent symlink)
echo "🔗 Enabling erp.faizal.uk site..."
sudo ln -sf "$NGINX_SITES_AVAILABLE/erp.faizal.uk" "$NGINX_SITES_ENABLED/erp.faizal.uk"
echo "   Symlinked: $NGINX_SITES_ENABLED/erp.faizal.uk"

# 4. Test nginx config
echo ""
echo "🔍 Validating nginx configuration..."
sudo nginx -t

# 5. Reload nginx
echo "⚡ Reloading nginx..."
sudo systemctl reload nginx

echo ""
echo "=================================================="
echo "✅ erp.faizal.uk vhost is now active!"
echo ""
echo "Next steps:"
echo "  1. Trigger GitHub Action: 'Deploy — Zentra Dashboard'"
echo "     (or run deploy-backend.yml which also rsyncs the backend)"
echo ""
echo "  2. Verify Zentra is live:"
echo "     curl -I https://erp.faizal.uk/"
echo "     curl https://erp.faizal.uk/api/health"
echo ""
echo "  3. If you need HTTPS (Cloudflare flexible SSL is fine,"
echo "     but for full SSL run):"
echo "     sudo certbot --nginx -d erp.faizal.uk"
echo "=================================================="
