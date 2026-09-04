/**
 * PM2 Ecosystem Configuration
 * 
 * All secrets (Google OAuth, JWT, etc.) are loaded from .env files,
 * NOT hardcoded here. This file is safe to commit to Git.
 * 
 * Usage:
 *   Windows:  pm2 start ecosystem.config.js --env production --update-env
 *   Ubuntu:   pm2 start ecosystem.config.js --env oraclevm --only backend,frontend --update-env
 */

module.exports = {
  apps: [
    // ===== UNIFIED MACOS SERVER (API + FRONTEND) =====
    {
      name: 'macos-server',
      script: 'backend/main/macos-api-server.js',
      cwd: './',
      autorestart: true,
      max_memory_restart: '768M',
      error_file: 'logs/server-error.log',
      out_file: 'logs/server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env_production: {
        NODE_ENV: 'production',
        PORT: '80',
        HOST: '::'           // IPv6 dual-stack on Windows
      },
      env_oraclevm: {
        NODE_ENV: 'oraclevm',
        PORT: '3001',
        ALT_PORT: '3000',    // Secondary listener for existing Nginx configurations
        HOST: '0.0.0.0'     // IPv4 on Ubuntu
      },
      instances: 1
    },
    // ===== IPV6 UPDATER (WINDOWS PRODUCTION ONLY) =====
    {
      name: 'ipv6-updater',
      script: 'tools/python/ipv6-updater.py',
      cwd: './',
      interpreter: process.platform === 'win32' ? 'python' : 'python3',
      autorestart: true,
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
