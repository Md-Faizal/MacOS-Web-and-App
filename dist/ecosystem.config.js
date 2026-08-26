const path = require('path');

module.exports = {
  apps: [
    // ===== BACKEND APP (PRODUCTION & VM) =====
    {
      name: 'backend',
      script: 'backend/main/macos-api-server.js',
      cwd: './',
      autorestart: true,
      max_memory_restart: '512M',
      error_file: 'logs/backend-error.log',
      out_file: 'logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env_production: {
        NODE_ENV: 'production',
        PORT: '3001',
        HOST: '::',          // IPv6 dual-stack on Windows
        GOOGLE_CLIENT_ID: '540487611333-t0i54c3b0k07nuoaljkdr68otst89se5.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: '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'
      },
      env_oraclevm: {
        NODE_ENV: 'oraclevm',
        PORT: '3001',
        HOST: '0.0.0.0',    // IPv4 on Ubuntu (behind Nginx)
        GOOGLE_CLIENT_ID: '540487611333-t0i54c3b0k07nuoaljkdr68otst89se5.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: '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',
        GOOGLE_REDIRECT_URI: 'https://mac.faizal.uk/api/auth/google/callback'
      },
      instances: 1
    },
    // ===== FRONTEND APP (PRODUCTION & VM) =====
    {
      name: 'frontend',
      script: 'server-prod.js',
      cwd: './',
      autorestart: true,
      max_memory_restart: '512M',
      error_file: 'logs/frontend-error.log',
      out_file: 'logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env_production: {
        NODE_ENV: 'production',
        PORT: '80',
        HOST: '::',         // IPv6 dual-stack on Windows
        API_PORT: '3001'
      },
      env_oraclevm: {
        NODE_ENV: 'oraclevm',
        PORT: '3000',
        HOST: '0.0.0.0',   // IPv4 on Ubuntu (behind Nginx)
        API_PORT: '3001'
      },
      instances: 1
    },
    // ===== IPV6 UPDATER (WINDOWS PRODUCTION ONLY) =====
    {
      name: 'ipv6-updater',
      script: 'scripts_py/ipv6-updater.py',
      cwd: './',
      interpreter: 'python',
      autorestart: true,
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
