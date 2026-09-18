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

# Prune devDependencies to keep runtime node_modules slim
RUN npm prune --omit=dev

# ==========================================================
# STAGE 2: Lightweight Production Runtime
# ==========================================================
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Install dumb-init for proper PID 1 signal forwarding and zombie reaping
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0 \
    NODE_OPTIONS="--max-old-space-size=512"

# Copy production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy built frontend assets from builder
COPY --from=builder /app/dist ./dist

# Copy backend application source code and configurations
COPY package.json ./
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Create required mount point directories with fallback files
RUN mkdir -p database database/backups CloudStorage Wallpapers backend/uploads logs \
    storage/wallpapers/builtin storage/wallpapers/marketplace storage/wallpapers/custom storage/temp_uploads storage/android-updates/archive \
    && chown -R node:node /app \
    && chmod -R 777 /app/storage /app/logs /app/backend/uploads /app/CloudStorage /app/Wallpapers 2>/dev/null || true

# Switch to non-root user for security
USER node

# Health check against our Express health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT}/api/health || exit 1

EXPOSE 3001

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "backend/main/macos-api-server.js"]
