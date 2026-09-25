# ==========================================================
# STAGE 1: Build Frontend Assets & Native Backend Dependencies
# ==========================================================
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install native build tools required for better-sqlite3 compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests first for optimal Docker layer caching
COPY package*.json ./

# Skip Puppeteer browser binary download to keep image slim and avoid extraction errors
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Install all dependencies (including devDependencies for Vite build)
RUN npm ci

# Copy frontend & source code needed for Vite build
COPY vite.config.js ./
COPY frontend/ ./frontend/
COPY backend/ ./backend/

# Build static distribution bundles into dist/
RUN npm run build

# Prune devDependencies and remove heavyweight unnecessary test/coverage folders
RUN npm prune --omit=dev \
    && rm -rf node_modules/fluent-ffmpeg/coverage node_modules/**/test node_modules/**/tests 2>/dev/null || true


# ==========================================================
# STAGE 2: Lightweight Production Runtime
# ==========================================================
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Install dumb-init for proper PID 1 signal forwarding and zombie reaping,
# curl for health checks, and python3 + pip for invoice/credit-note PDF generation
RUN echo "Acquire::Retries \"5\";" > /etc/apt/apt.conf.d/80-retries \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
       dumb-init \
       curl \
       python3 \
       python3-pip \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0 \
    NODE_OPTIONS="--max-old-space-size=512"

# Install Python dependencies required for PDF generation (invoice, payment/credit notes, etc.)
COPY tools/python/requirements.txt /tmp/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r /tmp/requirements.txt \
    && rm -f /tmp/requirements.txt

# Create required mount point directories before copying app files
RUN mkdir -p database database/backups CloudStorage Wallpapers backend/uploads logs \
    storage/wallpapers/builtin storage/wallpapers/marketplace storage/wallpapers/custom storage/temp_uploads storage/android-updates/archive tools \
    && chown -R node:node /app \
    && chmod -R 777 storage logs backend/uploads CloudStorage Wallpapers 2>/dev/null || true

# Copy files directly with node:node ownership to prevent layer duplication and save disk space
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node backend/ ./backend/
COPY --chown=node:node frontend/ ./frontend/
COPY --chown=node:node tools/ ./tools/

# Switch to non-root user for security
USER node

# Health check against our Express health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT}/api/health || exit 1

EXPOSE 3001

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "backend/main/macos-api-server.js"]
