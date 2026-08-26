#!/usr/bin/env node
/**
 * Simple production HTTP server for serving dist/ folder
 * Handles routing to index.html for SPA and proxies /api requests
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const httpProxy = require('http-proxy');

const ENV = process.env.NODE_ENV || 'production';
const PORT = process.env.PORT || (ENV === 'oraclevm' ? 3000 : 80);
const DIST_DIR = fs.existsSync(path.join(__dirname, 'dist')) 
  ? path.join(__dirname, 'dist') 
  : __dirname;
const ASSETS_DIR = fs.existsSync(path.join(DIST_DIR, 'Assets'))
  ? path.join(DIST_DIR, 'Assets')
  : path.join(__dirname, 'Assets');

console.log('═══════════════════════════════════════════════════════════');
console.log(`[INFO] Environment: ${ENV}`);
console.log(`[INFO] Serving static files from: ${DIST_DIR}`);
console.log(`[INFO] Assets directory: ${ASSETS_DIR}`);
const API_TARGET = `http://127.0.0.1:${process.env.API_PORT || 3001}`;

// Create proxy for API requests
const proxy = httpProxy.createProxyServer({ target: API_TARGET });

proxy.on('error', (err, req, res) => {
  console.error('[PROXY ERROR]', err.message);
  res.writeHead(502, { 'Content-Type': 'text/plain' });
  res.end('Bad Gateway - API Server Unavailable');
});

// Combined IPv4/IPv6 listener
const serverAll = http.createServer((req, res) => {
  // Trust proxy headers to prevent redirect loops
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  
  // API requests - proxy to backend
  if (req.url.startsWith('/api')) {
    proxy.web(req, res);
    return;
  }

  // Serve /Assets/* from project root, everything else from dist/
  let url = req.url === '/' ? 'index.html' : decodeURIComponent(req.url);
  url = url.replace(/^\//,'').split('?')[0];
  
  let filePath;
  
  // 1. Explicit mapping for specific wallpapers and lowercase assets
  if (url.match(/^(assets|Assets)\/Wallpaper\/Static\/tahoe-beach\/tahoe-beach\.light\.jpg$/i) || 
      url.match(/^(assets|Assets)\/Images\/Wallpaper\/Static\/tahoe-beach\/tahoe-beach\.light\.jpg$/i)) {
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    filePath = path.join(__dirname, 'Wallpapers/Static/tahoe-beach/tahoe-beach.light.jpg');
    fs.createReadStream(filePath).pipe(res);
    return;
  } 
  
  // 2. Handle /Assets/Wallpaper/... or /assets/Wallpaper/... requests
  if (url.match(/^(assets|Assets)\/Wallpaper\/.*\.(jpg|jpeg|png|gif|svg|webp|ico|avif)$/i)) {
    const relativePath = url.replace(/^(assets|Assets)\/Wallpaper\//i, '');
    filePath = path.join(__dirname, 'Wallpapers', relativePath);
  }
  // 3. Handle /Images/... requests - map to Assets/Images/ 
  else if (url.match(/^Images\/.*\.(jpg|jpeg|png|gif|svg|webp|ico|avif)$/i)) {
    filePath = path.join(DIST_DIR, 'Assets', url);
  }
  // 4. Handle lowercase /assets/... (Vite hashed bundles) and general /Assets/...
  else if (url.match(/^(assets|Assets)\/.*\.(js|css|jpg|jpeg|png|gif|svg|webp|ico|avif|woff|woff2|ttf|eot)$/i)) {
    // Standard Vite build puts things in assets/ (lowercase)
    filePath = path.join(DIST_DIR, url);
  }
  else {
    filePath = path.join(DIST_DIR, url);
    // Fallback to frontend directory if not found at root
    if (!fs.existsSync(filePath)) {
      const frontendPath = path.join(DIST_DIR, 'frontend', url);
      if (fs.existsSync(frontendPath)) {
        filePath = frontendPath;
      }
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      let ext = path.extname(filePath).toLowerCase();
      const contentTypes = { 
        '.html': 'text/html', 
        '.js': 'application/javascript', 
        '.css': 'text/css', 
        '.json': 'application/json', 
        '.png': 'image/png', 
        '.jpg': 'image/jpeg', 
        '.jpeg': 'image/jpeg', 
        '.gif': 'image/gif', 
        '.svg': 'image/svg+xml', 
        '.webp': 'image/webp', 
        '.ico': 'image/x-icon', 
        '.woff': 'font/woff', 
        '.woff2': 'font/woff2', 
        '.ttf': 'font/ttf', 
        '.eot': 'application/vnd.ms-fontobject', 
        '.avif': 'image/avif' 
      };
      res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      // CRITICAL: If the request was for a static asset (CSS/JS/Image), DO NOT serve index.html
      // This prevents MIME type errors (e.g., serving HTML when CSS is expected)
      const isAsset = url.match(/\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot)$/i);
      if (isAsset) {
        console.warn(`[404] Asset not found: ${url} (Expected at: ${filePath})`);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
      
      // Fallback for SPA routing
      let targetHtml = 'index.html';
      if (url.startsWith('public/product/') || url.startsWith('public/batch/')) {
        targetHtml = 'public-product.html';
      }
      
      const indexPath = path.join(DIST_DIR, targetHtml);
      fs.stat(indexPath, (err) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(indexPath).pipe(res);
      });
    }
  });
});

// Bind to :: (IPv6 dual-stack) on Windows, 0.0.0.0 (IPv4) on Ubuntu
const HOST = process.env.HOST || (ENV === 'oraclevm' ? '0.0.0.0' : '::');

serverAll.listen(PORT, HOST, () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`🚀 Production Frontend Server`);
  console.log(`🌐 Mode:    ${ENV === 'oraclevm' ? 'Ubuntu VM (IPv4)' : 'Windows Production (IPv6 dual-stack)'}`);
  console.log(`📁 Serving: ${DIST_DIR}`);
  console.log(`🌍 Binding: ${HOST}:${PORT}`);
  console.log(`🔗 API Proxy: ${API_TARGET}`);
  if (PORT == 80) {
    console.log('💡 TIP: If you get EACCES error on port 80, run:');
    console.log('   sudo setcap \'cap_net_bind_service=+ep\' $(which node)');
  }
  console.log('═══════════════════════════════════════════════════════════\n');
});

// Handle shutdown gracefully
const shutdown = () => {
  console.log(`\n[${new Date().toISOString()}] 🛑 Shutting down...`);
  serverAll.close(() => {
    console.log(`[${new Date().toISOString()}] ✓ Server closed`);
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
