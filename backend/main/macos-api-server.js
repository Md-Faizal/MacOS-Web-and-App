const express = require('express');
const path = require('path');
const fs = require('fs');

// Load environment variables from common dotenv convention:
// - .env
// - .env.<NODE_ENV>
// This makes local dev, PM2 production, and VM deployments consistent.
const dotenv = require('dotenv');
dotenv.config({ path: '.env' });
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

// Detect environment
const ENV = process.env.NODE_ENV || 'dev';
let isProd = ENV === 'production';
let isDev = ENV === 'dev' || ENV === 'development';
let isVM = ENV === 'oraclevm';

console.log(`Running in environment: ${ENV}`);
if (isProd) console.log('✓ Production environment detected');
if (isDev) console.log('✓ Development environment detected');
if (isVM) console.log('✓ Oracle VM environment detected');

if (isProd || isVM) {
  const requiredSecrets = ['JWT_SECRET', 'RECOVERY_KEY'];
  const missingSecrets = requiredSecrets.filter(name => !process.env[name] || process.env[name].length < 32);
  if (missingSecrets.length > 0) {
    throw new Error(`Missing or weak production authentication secrets: ${missingSecrets.join(', ')}`);
  }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_ANDROID_CLIENT_ID) {
    throw new Error('Missing production Google OAuth credentials: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_ANDROID_CLIENT_ID are required');
  }
}

// Initialize centralized database FIRST (before any modules)
const DatabaseManager = require('../core/db/database-manager');
let globalDb;

try {
  globalDb = DatabaseManager.initialize();
  console.log('✓ Database initialized and ready\n');
} catch (err) {
  console.error('✗ Failed to initialize database:', err.message);
  process.exit(1);
}

// Import module APIs (co-located with frontend code)
const { router: billingRouter, initializeDatabase: initBilling } = require('../../frontend/modules/billing/api');
const { router: productsRouter, initializeDatabase: initProducts } = require('../../frontend/modules/product-list/api');
const { router: contactsRouter, initializeDatabase: initContacts } = require('../../frontend/modules/contacts/api');
const { router: notesRouter, initializeDatabase: initNotes } = require('../../frontend/modules/notes/api');
const { router: calendarRouter, initializeDatabase: initCalendar } = require('../../frontend/modules/calendar/api');
const { router: analyticsRouter, initializeDatabase: initAnalytics } = require('../../frontend/modules/analytics/api');
const { router: settingsRouter, initializeDatabase: initSettings } = require('../../frontend/modules/settings/api');
const { router: cloudRouter, initializeDatabase: initCloud } = require('../../frontend/modules/cloud/api');
const androidUpdateRouter = require('../core/android-updates');

// Import core/orphaned modules (not tied to specific modules)
const { router: suggestionsRouter, initializeDatabase: initSuggestions } = require('../core/suggestions');
const { router: aiRouter, initializeDatabase: initAI } = require('../core/ai');
const { router: logsRouter, initializeDatabase: initLogs } = require('../core/logs');
const qrRouter = require('../core/qr-routing')(globalDb);

// Auth Module
const authModule = require('../core/auth/auth')(globalDb);
const profileModule = require('../core/auth/profile')(globalDb);
const oauthModule = require('../core/auth/oauth')(globalDb);
const permissionsHelper = require('../core/auth/permissions')(globalDb);
const workerGoogleAuth = require('../core/auth/worker-google-auth')(globalDb, permissionsHelper);
const adminAuth = require('../core/auth/admin')(globalDb);
const createAuditService = require('../core/auth/audit-service');

const app = express();
const auditService = createAuditService(globalDb);
try {
  auditService.purgeExpired();
} catch (error) {
  console.warn('Initial authentication retention cleanup failed:', error.message);
}
const auditRetentionTimer = setInterval(() => {
  try {
    auditService.purgeExpired();
  } catch (error) {
    console.warn('Authentication retention cleanup failed:', error.message);
  }
}, 60 * 60 * 1000);
auditRetentionTimer.unref?.();

app.use((req, res, next) => {
  req.requestId = req.get('x-request-id') || crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// Trust proxy headers (X-Forwarded-Proto, etc.) for production environments
// This ensures req.protocol is 'https' when running behind Nginx/Proxy
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  if (isProd || isVM) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Import wallpaper router (moved to src/api/core/wallpaper)
let wallpaperRouter;
try {
  wallpaperRouter = require('../core/wallpaper');
} catch (err) {
  console.error('[Wallpaper] Could not load API extensions:', err.message);
  // Provide fallback to prevent crash
  wallpaperRouter = require('express').Router();
  wallpaperRouter.get('/', (req, res) => {
    res.status(500).json({ error: 'Wallpaper API not loaded', details: err.message });
  });
}

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));
app.use(cookieParser());

app.use((req, res, next) => {
  const csrfToken = req.cookies?.csrf_token || crypto.randomBytes(32).toString('base64url');
  const isHttps = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https';
  if (!req.cookies?.csrf_token) {
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false,
      secure: isHttps,
      sameSite: 'Strict',
      maxAge: 12 * 60 * 60 * 1000,
      path: '/'
    });
  }

  const isAuthEntrypoint = [
    '/api/auth/login',
    '/api/auth/google/worker-login',
    '/api/auth/mobile/refresh',
    '/api/auth/verify-answer',
    '/api/auth/challenge',
    '/api/auth/update-security'
  ].includes(req.path);

  const hasBrowserSession = !!req.cookies?.auth_session;
  const mutatingApiRequest = req.path.startsWith('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (!isAuthEntrypoint && hasBrowserSession && mutatingApiRequest && req.get('x-csrf-token') !== csrfToken) {
    return res.status(403).json({ error: 'CSRF validation failed' });
  }
  next();
});

// MIME type map for common file types
const mimeTypes = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.html': 'text/html',
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

// Custom static file serving with proper MIME types
const staticOptions = {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext];
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    
    // Industrial Standard: Prevent caching of HTML files to ensure auth checks run
    if (ext === '.html') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
};

const distPath = path.join(__dirname, '../../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, staticOptions));
  app.use('/assets', express.static(path.join(distPath, 'assets'), {
    maxAge: '1y',
    immutable: true,
    setHeaders: staticOptions.setHeaders
  }));
}
app.use(express.static(path.join(__dirname, '../..'), staticOptions));
app.use(express.static(path.join(__dirname, '../../frontend'), staticOptions));
app.use(express.static(path.join(__dirname, '../../frontend/public'), staticOptions));

// Serve large wallpaper assets from root to keep them out of frontend build
const wallpaperPath = path.join(__dirname, '../../Wallpapers');
app.use('/assets/Wallpaper', express.static(wallpaperPath, staticOptions));
app.use('/Assets/Wallpaper', express.static(wallpaperPath, staticOptions));
app.use('/api/assets/Wallpaper', express.static(wallpaperPath, staticOptions));
app.use('/assets/wallpaper', express.static(wallpaperPath, staticOptions));
app.use('/api/assets/wallpaper', express.static(wallpaperPath, staticOptions));

// CORS (configurable)
// Use comma-separated origins, e.g.:
// CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
// If omitted, defaults to common local dev origins and same-origin requests.
const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const defaultDevOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);

const defaultProductionOrigins = new Set([
  'https://mac.faizal.uk',
  'http://mac.faizal.uk'
]);

function isOriginAllowed(origin) {
  if (!origin) return true; // same-origin / curl / server-to-server
  if (corsOrigins.length > 0) return corsOrigins.includes(origin);
  // Allow local development and SSH port tunnels on any port
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  if (isDev) return defaultDevOrigins.has(origin);
  return defaultProductionOrigins.has(origin);
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    if (origin) res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
  res.header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Access-Control-Max-Age', '86400');



  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const rateLimitBuckets = new Map();
const rateLimitedPaths = new Set([
  '/api/auth/login',
  '/api/auth/google/worker-login',
  '/api/auth/mobile/refresh',
  '/api/auth/verify-answer',
  '/api/auth/webauthn/authentication-options',
  '/api/auth/webauthn/authentication-verify'
]);

app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  const origin = req.headers.origin || (() => {
    try { return new URL(req.headers.referer || '').origin; } catch { return null; }
  })();
  if (!isOriginAllowed(origin)) {
    return res.status(403).json({ error: 'Request origin is not allowed' });
  }

  if (!rateLimitedPaths.has(req.path)) return next();

  const identifier = typeof req.body?.identifier === 'string'
    ? req.body.identifier.trim().toLowerCase()
    : '';
  const key = `${req.ip}:${req.path}:${identifier}`;
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key) || { count: 0, startedAt: now };
  if (now - bucket.startedAt >= 60_000) {
    bucket.count = 0;
    bucket.startedAt = now;
  }
  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  if (bucket.count > 10) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }

  next();
});

// Initialize APIs with database
const modules = [
  { name: 'Billing', init: initBilling },
  { name: 'Products', init: initProducts },
  { name: 'Contacts', init: initContacts },
  { name: 'Notes', init: initNotes },
  { name: 'Calendar', init: initCalendar },
  { name: 'Analytics', init: initAnalytics },
  { name: 'Settings', init: initSettings },
  // Payments, Orders, Variants, Batches, Credit Notes, Invoices
  // are initialized inside the Billing module
  { name: 'Smart Suggestions', init: initSuggestions },
  { name: 'App Logs', init: initLogs },
  { name: 'AI Assistant', init: initAI },
  { name: 'Cloud Storage', init: initCloud }
];

console.log('🔧 Initializing APIs...');
const initializedModules = [];

for (const module of modules) {
  try {
    module.init(globalDb);
    initializedModules.push(module.name);
  } catch (err) {
    console.error(`✗ Failed to initialize ${module.name}:`, err.message);
    process.exit(1);
  }
}

console.log(`✓ All modules initialized (${initializedModules.length}/15)\n`);

const clockRouter = require('../core/widgets/clock')(globalDb, authModule.authMiddleware);
const weatherSettingsRouter = require('../core/widgets/weather-settings')(globalDb, authModule.authMiddleware);
const quickNotesRouter = require('../core/widgets/quick-notes')(globalDb, authModule.authMiddleware);
const remindersRouter = require('../core/widgets/reminders')(globalDb, authModule.authMiddleware);

// Mount API Routes
const routes = [
  { path: '/api/billing', router: billingRouter },
  { path: '/api/products', router: productsRouter },
  { path: '/api/contacts', router: contactsRouter },
  { path: '/api/notes', router: notesRouter },
  { path: '/api/calendar', router: calendarRouter },
  { path: '/api/analytics', router: analyticsRouter },
  { path: '/api/settings', router: settingsRouter },
  // Products, payments, orders, variants, batches, creditnotes, invoices
  // are now exposed under /api/products and /api/billing/* via the module routers
  { path: '/api/suggestions', router: suggestionsRouter },
  { path: '/api/logs', router: logsRouter },
  { path: '/api/ai', router: aiRouter },
  { path: '/api/wallpapers', router: wallpaperRouter },
  { path: '/api/clock', router: clockRouter },
  { path: '/api/weather', router: weatherSettingsRouter },
  { path: '/api/quick-notes', router: quickNotesRouter },
  { path: '/api/reminders', router: remindersRouter },
  { path: '/api/cloud', router: cloudRouter }
];

// Mount QR smart links directly under /q
app.use('/q', qrRouter);
app.use('/api/android/update', androidUpdateRouter);

// Auth Routes
app.post('/api/auth/login', authModule.login);
app.post('/api/auth/mobile/refresh', authModule.refreshMobileSession);
app.post('/api/auth/mobile/logout', authModule.logoutMobileSession);
app.get('/api/auth/google/config', workerGoogleAuth.getClientConfig);
app.post('/api/auth/google/worker-login', workerGoogleAuth.loginWithGoogle);
app.get('/api/auth/worker/status', workerGoogleAuth.checkWorkerStatus);
app.get('/api/auth/devices', authModule.authMiddleware, authModule.getDevices);
app.delete('/api/auth/devices/:id', authModule.authMiddleware, authModule.logoutDevice);
app.delete('/api/auth/devices', authModule.authMiddleware, authModule.logoutAllDevices);
app.get('/api/auth/devices/:id/history', authModule.authMiddleware, authModule.getDeviceHistory);
app.get('/api/auth/verify', authModule.authMiddleware, (req, res) => {
  const permissions = permissionsHelper && req.user.role === 'worker' ? permissionsHelper.getUserPermissionsSnapshot(req.user.id, 'worker') : null;
  res.json({ success: true, authenticated: true, user: req.user, permissions });
});
app.post('/api/auth/logout', authModule.logout);
app.get('/api/auth/status', authModule.getStatus);
app.get('/api/auth/check-username', authModule.checkUsername);
app.get('/api/auth/questions', authModule.getSecurityQuestions);
app.get('/api/auth/challenge', authModule.getChallengeQuestion);
app.post('/api/auth/challenge', authModule.verifyAnswer);
app.post('/api/auth/verify-answer', authModule.verifyAnswer);
app.get('/api/auth/verify-answer', (req, res) => {
  res.setHeader('Allow', 'POST');
  res.status(405).json({ error: 'Security-answer verification requires a POST request.' });
});
app.get('/api/auth/webauthn/registration-options', authModule.authMiddleware, authModule.getWebAuthnRegistrationOptions);
app.post('/api/auth/webauthn/registration-verify', authModule.authMiddleware, authModule.verifyWebAuthnRegistration);
app.get('/api/auth/webauthn/authentication-options', authModule.getWebAuthnAuthenticationOptions);
app.post('/api/auth/webauthn/authentication-verify', authModule.verifyWebAuthnAuthentication);
app.post('/api/auth/mobile/biometric/register', authModule.authMiddleware, authModule.registerMobileBiometric);
app.delete('/api/auth/mobile/biometric', authModule.authMiddleware, authModule.revokeMobileBiometric);
app.post('/api/auth/update-security', authModule.authMiddleware, authModule.updateSecurity);

// Owner administration routes
app.get('/api/admin/users', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.listUsers);
app.get('/api/admin/notifications', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.getNotifications);
app.get('/api/admin/users/:userId/permissions', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.getPermissions);
app.post('/api/admin/users/:userId/approve', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.approveUser);
app.post('/api/admin/users/:userId/approve-deletion', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.approveDeletion);
app.post('/api/admin/users/:userId/reject-deletion', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.rejectDeletion);
app.get('/api/admin/users/:userId/history', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.getWorkerLifecycleHistory);
app.post('/api/admin/users/:userId/status', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.setStatus);
app.put('/api/admin/users/:userId/permissions', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.updateUserPermissions);
app.delete('/api/admin/users/:userId', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.deleteUser);
app.get('/api/admin/users/:userId/audit', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.getAuditLogs);
app.get('/api/admin/audit', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.getAuditLogs);
app.get('/api/realtime/events', authModule.authMiddleware, adminAuth.ownerOnly, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let lastId = Number(req.query.after || 0);
  const sendUpdates = () => {
    const notifications = globalDb.prepare(
      'SELECT id, type, title, body, data, created_at FROM owner_notifications WHERE id > ? ORDER BY id ASC'
    ).all(lastId);
    for (const notification of notifications) {
      lastId = notification.id;
      res.write(`data: ${JSON.stringify(notification)}\n\n`);
    }
    res.write(': keep-alive\n\n');
  };
  sendUpdates();
  const timer = setInterval(sendUpdates, 3000);
  req.on('close', () => clearInterval(timer));
});

// Profile Routes
app.get('/api/profile', authModule.authMiddleware, profileModule.getProfile);
app.post('/api/profile', authModule.authMiddleware, profileModule.updateProfile);
app.post('/api/profile/disconnect-google', authModule.authMiddleware, profileModule.disconnectGoogle);
app.post('/api/profile/deletion-request', authModule.authMiddleware, profileModule.requestAccountDeletion);
app.post('/api/profile/cancel-deletion-request', authModule.authMiddleware, profileModule.cancelAccountDeletion);
app.get('/api/profile/export', authModule.authMiddleware, profileModule.exportData);

// Desktop State Routes
app.get('/api/desktop/state', authModule.authMiddleware, (req, res) => {
  try {
    const userId = req.user.userId;
    const row = globalDb.prepare('SELECT state FROM desktop_state WHERE user_id = ?').get(userId);
    res.json({ success: true, state: row ? JSON.parse(row.state) : null });
  } catch (err) {
    console.error('Get desktop state error:', err);
    res.status(500).json({ error: 'Failed to retrieve desktop state' });
  }
});

app.post('/api/desktop/state', authModule.authMiddleware, (req, res) => {
  try {
    const userId = req.user.userId;
    const { state } = req.body;
    if (!state) return res.status(400).json({ error: 'State is required' });
    
    const fullStateStr = JSON.stringify(req.body);
    const existing = globalDb.prepare('SELECT user_id FROM desktop_state WHERE user_id = ?').get(userId);
    
    if (existing) {
      globalDb.prepare('UPDATE desktop_state SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(fullStateStr, userId);
    } else {
      globalDb.prepare('INSERT INTO desktop_state (user_id, state) VALUES (?, ?)').run(userId, fullStateStr);
    }
    
    res.json({ success: true, message: 'Desktop state saved successfully' });
  } catch (err) {
    console.error('Save desktop state error:', err);
    res.status(500).json({ error: 'Failed to save desktop state' });
  }
});

// Google OAuth Routes
app.get('/api/auth/google', authModule.authMiddleware, oauthModule.getAuthUrl);
app.get('/api/auth/google/link', authModule.authMiddleware, oauthModule.getAuthUrl);
app.get('/api/auth/google/callback', authModule.authMiddleware, oauthModule.handleCallback);

console.log('📡 Mounting API routes...');
for (const route of routes) {
  // Protect all API routes EXCEPT health and auth
  // Special case: Allow public access to cloud sharing links
  if (route.path === '/api/cloud') {
    app.use(route.path, (req, res, next) => {
      // Exempt public sharing and internal media streams from global auth
      if (req.path.startsWith('/share/') || 
          req.path.startsWith('/download/') || 
          req.path.startsWith('/thumbnail/')) {
        return next();
      }
      authModule.authMiddleware(req, res, next);
    }, route.router);

  } else if (route.path === '/api/billing') {
    app.use(route.path, (req, res, next) => {
      // Exempt public ledger access
      if (req.path.startsWith('/public/')) {
        return next();
      }
      authModule.authMiddleware(req, res, next);
    }, route.router);
  } else if (route.path === '/api/products') {
    app.use(route.path, (req, res, next) => {
      // Exempt public product details
      if (req.path.startsWith('/public/')) {
        return next();
      }
      authModule.authMiddleware(req, res, next);
    }, route.router);
  } else if (route.path === '/api/logs') {
    // Allow unauthenticated POST to /api/logs/app so clients can report errors before login;
    // protect other inspection routes with auth middleware.
    app.use(route.path, (req, res, next) => {
      if (req.method === 'POST' && req.path === '/app') return next();
      authModule.authMiddleware(req, res, next);
    }, route.router);
  } else {
    app.use(route.path, authModule.authMiddleware, route.router);
  }
}
console.log(`✓ All ${routes.length} API routes mounted and secured\n`);

// Global error handler for malformed requests
app.use((err, req, res, next) => {
  if (err.status === 413) {
    console.warn('[Server] PayloadTooLarge:', err.message);
    return res.status(413).json({ error: 'Payload too large. Maximum JSON size is 25MB.' });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.warn('[Server] Malformed JSON:', err.message);
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  console.error('[Server] Unhandled error:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// API Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    apis: {
      billing: 'running',
      preferences: 'running (part of billing)',
      products: 'running',
      contacts: 'running',
      notes: 'running',
      calendar: 'running',
      analytics: 'running',
      settings: 'running',
      payments: 'running (consolidated)',
      orders: 'running (consolidated)',
      variants: 'running (consolidated)',
      batches: 'running (consolidated)',
      creditnotes: 'running (consolidated)',
      suggestions: 'running (consolidated)',
      ai: 'running (Gemini)'
    }
  });
});

// API System Info endpoint - Get actual hardware model
app.get('/api/system/info', (req, res) => {
  const { exec } = require('child_process');
  const os = require('os');
  const platform = process.platform;
  const hostname = os.hostname();
  
  if (platform === 'win32') {
    exec('wmic computersystem get model,manufacturer /format:list', (error, stdout) => {
      if (error) return res.json({ model: 'Windows PC', platform: 'win32', hostname });
      
      const lines = stdout.split('\n');
      let manufacturer = '';
      let model = '';
      
      lines.forEach(line => {
        if (line.startsWith('Manufacturer=')) manufacturer = line.split('=')[1].trim();
        if (line.startsWith('Model=')) model = line.split('=')[1].trim();
      });
      
      // Clean up common generic strings
      if (model.includes('To be filled by O.E.M.')) model = '';
      
      const fullModel = [manufacturer, model].filter(Boolean).join(' ');
      res.json({ model: fullModel || 'Windows PC', platform: 'win32', hostname });
    });
  } else if (platform === 'darwin') {
    exec('sysctl -n hw.model', (error, stdout) => {
      res.json({ model: stdout ? stdout.trim() : 'MacBook Pro', platform: 'darwin', hostname });
    });
  } else {
    res.json({ model: 'Linux Device', platform: 'linux', hostname });
  }
});

// API Documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    status: 'running',
    message: 'MacOS API Server (Consolidated)',
    version: '2.0.0',
    note: 'All endpoints consolidated to Node.js backend',
    endpoints: {
      'billing': 'POST/GET - Manage invoices/bills',
      'billing/:id': 'GET/PUT/DELETE - Manage specific invoice',
      'billing/summary': 'GET - Get billing summary statistics',
      'billing/preference/:customerName/:productName': 'GET - Get customer product preference',
      'billing/preferences/:customerName': 'GET - Get all preferences for a customer',
      'billing/preference': 'POST - Create/update customer preference',
      'billing/preference/:customerName/:productName': 'DELETE - Delete customer preference',
      'products': 'GET/POST - Manage product inventory (Product List App)',
      'products/:id': 'GET/PUT/DELETE - Manage specific product (Product List App)',
      'products/categories': 'GET/POST - Manage product categories (Product List App)',
      'products/categories/:id': 'PUT/DELETE - Manage specific category (Product List App)',
      'products/batches/:id': 'PUT/DELETE - Manage specific batch (Product List App)',
      'contacts': 'GET/POST - Manage customers and vendors',
      'contacts/:id': 'GET/PUT/DELETE - Manage specific contact',
      'notes': 'GET/POST - Manage notes',
      'calendar': 'GET/POST - Manage calendar events',
      'analytics': 'GET - View analytics data',
      'settings': 'GET/PUT - Manage settings',
      'payments': 'GET/POST - Manage payment tracking (Billing App)',
      'payments/:id': 'GET/PUT/DELETE - Manage specific payment (Billing App)',
      'orders': 'GET/POST - Manage orders (Billing App)',
      'orders/:id': 'GET/PUT/DELETE - Manage specific order (Billing App)',
      'variants': 'GET/POST - Manage product variants (Billing/Product Apps)',
      'variants/:id': 'GET/PUT/DELETE - Manage specific variant (Billing/Product Apps)',
      'batches': 'GET/POST - Manage inventory batches (Billing/Product Apps)',
      'batches/:id': 'GET/PUT/DELETE - Manage specific batch (Billing/Product Apps)',
      'creditnotes': 'GET/POST - Manage credit notes (Billing App)',
      'creditnotes/:id': 'GET/PUT/DELETE - Manage specific credit note (Billing App)',
      'suggestions': 'GET - Get smart suggestions based on customer history',
      'wallpapers': 'GET - Get all available wallpapers',
      'wallpapers/:id': 'GET - Get specific wallpaper',
      'wallpapers/category/:category': 'GET - Get wallpapers by category'
    }
  });
});

// Debug endpoint - check notes database status
app.get('/api/debug/notes', (req, res) => {
  try {
    res.json({
      message: 'Check /api/notes/health and /api/notes/debug/all for detailed database info',
      endpoints: {
        health: '/api/notes/health - Database connection and table status',
        allNotes: '/api/notes/debug/all - All notes in database',
        createTest: 'POST /api/notes - Try creating a test note'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── SPA & Static HTML Fallback ───
app.get('*', (req, res, next) => {
  // Never serve HTML for missing API endpoints
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }

  // Never serve HTML for missing asset extensions (prevents MIME type errors)
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot)$/i)) {
    return res.status(404).send('Asset Not Found');
  }

  // Public product / batch catalog fallback
  if (req.path.startsWith('/public/product/') || req.path.startsWith('/public/batch/')) {
    const distPub = path.join(__dirname, '../../dist/public-product.html');
    if (fs.existsSync(distPub)) return res.sendFile(distPub);
    const srcPub = path.join(__dirname, '../../frontend/public-product.html');
    if (fs.existsSync(srcPub)) return res.sendFile(srcPub);
  }

  // Customer ledger fallback
  if (req.path.startsWith('/customer-ledger')) {
    const distLedger = path.join(__dirname, '../../dist/customer-ledger.html');
    if (fs.existsSync(distLedger)) return res.sendFile(distLedger);
    const srcLedger = path.join(__dirname, '../../frontend/customer-ledger.html');
    if (fs.existsSync(srcLedger)) return res.sendFile(srcLedger);
  }

  // Home fallback (/home or /home.html)
  if (req.path === '/home' || req.path === '/home.html') {
    const distHome = path.join(__dirname, '../../dist/home.html');
    if (fs.existsSync(distHome)) return res.sendFile(distHome);
    const srcHome = path.join(__dirname, '../../frontend/home.html');
    if (fs.existsSync(srcHome)) return res.sendFile(srcHome);
  }

  // Default SPA index.html
  const distIndex = path.join(__dirname, '../../dist/index.html');
  if (fs.existsSync(distIndex)) {
    return res.sendFile(distIndex);
  }
  const srcIndex = path.join(__dirname, '../../frontend/index.html');
  if (fs.existsSync(srcIndex)) {
    return res.sendFile(srcIndex);
  }

  next();
});

// Start server
const BASE_PORT = Number(process.env.PORT) || 3001;
const ALT_PORT = process.env.ALT_PORT ? Number(process.env.ALT_PORT) : null;
const HOST = process.env.HOST || '0.0.0.0';

function startServer(port, attemptsLeft = 20) {
  const server = app.listen(port, HOST, () => {
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`✨ Unified MacOS Server running on port ${port}${HOST ? ` (host ${HOST})` : ''}`);
    console.log(`📁 Static files: dist/ and frontend/`);
    console.log(`📚 API Documentation: http://localhost:${port}/api`);
    console.log(`💚 Health Check:      http://localhost:${port}/api/health`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // Dual-port listener for zero-downtime transition if ALT_PORT is configured
    if (ALT_PORT && ALT_PORT !== port) {
      try {
        const altServer = app.listen(ALT_PORT, HOST, () => {
          console.log(`🌐 Also listening on secondary port ${ALT_PORT} for zero-downtime compatibility.`);
        });
        altServer.on('error', (e) => {
          console.warn(`[Server] Secondary port ${ALT_PORT} notice: ${e.message}. Primary on ${port} is active.`);
        });
      } catch (e) {
        console.warn(`[Server] Could not bind secondary port ${ALT_PORT}: ${e.message}`);
      }
    }
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      const nextPort = port + 1;
      console.warn(`[Server] Port ${port} in use, retrying on ${nextPort}...`);
      try { server.close(); } catch (_) {}
      startServer(nextPort, attemptsLeft - 1);
      return;
    }

    console.error('[Server] Failed to start:', err && err.message ? err.message : err);
    process.exit(1);
  });
}

startServer(BASE_PORT);
