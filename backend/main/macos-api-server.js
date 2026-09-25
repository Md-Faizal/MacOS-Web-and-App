const express = require('express');
const path = require('path');
const httpProxy = require('http-proxy');

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

const departments = require('../departments');

// Import module APIs (co-located with frontend code)
const billingApi = departments.billing.create(globalDb);
const { router: billingRouter, initializeDatabase: initBilling } = billingApi;
const productsApi = departments.productList.create(globalDb);
const { router: productsRouter, initializeDatabase: initProducts } = productsApi;
const contactsApi = departments.contacts.create(globalDb);
const analyticsApi = departments.analytics.create(globalDb);
const { router: contactsRouter, initializeDatabase: initContacts } = contactsApi;
const { router: analyticsRouter, initializeDatabase: initAnalytics } = analyticsApi;
const notesApi = departments.notes.create(globalDb);
const calendarApi = departments.calendar.create(globalDb);
const settingsApi = departments.settings.create(globalDb);
const cloudApi = departments.cloudStorage.create(globalDb);
const { router: notesRouter, initializeDatabase: initNotes } = notesApi;
const { router: calendarRouter, initializeDatabase: initCalendar } = calendarApi;
const { router: settingsRouter, initializeDatabase: initSettings } = settingsApi;
const { router: cloudRouter, initializeDatabase: initCloud } = cloudApi;
const androidUpdateRouter = require('../core/android-updates');

// Import core/orphaned modules (not tied to specific modules)
const suggestionsApi = departments.suggestions.create(globalDb);
const aiApi = departments.ai.create(globalDb);
const logsApi = departments.logs.create(globalDb);
const { router: suggestionsRouter, initializeDatabase: initSuggestions } = suggestionsApi;
const { router: aiRouter, initializeDatabase: initAI } = aiApi;
const { router: logsRouter, initializeDatabase: initLogs } = logsApi;
const qrRouter = require('../core/qr-routing')(globalDb);

// Auth Module
const authDepartment = departments.auth.create(globalDb);
const authModule = authDepartment.auth;
const profileModule = authDepartment.profile;
const oauthModule = authDepartment.oauth;
const permissionsHelper = authDepartment.permissions;
const workerGoogleAuth = authDepartment.workerGoogle;
const adminAuth = departments.admin.create(globalDb);

const app = express();
const cors = require('cors');

const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://erp.faizal.uk',
  'https://mac.faizal.uk',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || isDev || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-request-id', 'Accept'],
}));

const { attachResponseHelpers, sendSuccess, sendError } = require('../shared/api/response');
const { toLegacyShape } = require('../shared/api/compat');
const auditService = authDepartment.audit;
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

app.use(attachResponseHelpers);

// Trust proxy headers (X-Forwarded-Proto, etc.) for production environments
// This ensures req.protocol is 'https' when running behind Nginx/Proxy
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isProd || isVM) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

const wallpaperRouter = departments.wallpaperContent.create().router;

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

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));
app.use(cookieParser());

const zentraDevTarget = process.env.ZENTRA_DEV_TARGET || 'http://127.0.0.1:3000';
const zentraDevProxy = httpProxy.createProxyServer({
  target: zentraDevTarget,
  changeOrigin: true,
  ws: true,
  xfwd: true,
});

zentraDevProxy.on('error', (err, req, res) => {
  console.warn('[Zentra Proxy] failed to reach dev server:', err && err.message ? err.message : err);
  if (res && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
  }
  if (res) {
    res.end(JSON.stringify({ error: 'Zentra dev server unavailable' }));
  }
});

const zentraDistPath = path.join(__dirname, '../../zentra-analytics-dashboard/dist');
const zentraSourcePath = path.join(__dirname, '../../zentra-analytics-dashboard');
const zentraIndexPath = path.join(zentraDistPath, 'index.html');

// Hostname that identifies Zentra Analytics Dashboard (non-OS frontend).
// Configurable via ZENTRA_HOSTNAME env var for staging/custom domains.
// mac.faizal.uk → MacOS OS-based frontend
// erp.faizal.uk → Zentra React SPA
const ZENTRA_HOSTNAME = (process.env.ZENTRA_HOSTNAME || 'erp.faizal.uk').toLowerCase();
const isZentraHost = (req) => (req.hostname || '').toLowerCase() === ZENTRA_HOSTNAME;

app.get(['/zentra', '/zentra/', '/zentra/index.html'], (req, res) => {
  if (isDev || process.env.ZENTRA_DEV_PROXY === 'true') {
    return zentraDevProxy.web(req, res, { target: zentraDevTarget });
  }

  if (require('fs').existsSync(zentraIndexPath)) {
    return res.sendFile(zentraIndexPath);
  }

  const fallbackPath = path.join(zentraSourcePath, 'index.html');
  if (require('fs').existsSync(fallbackPath)) {
    return res.sendFile(fallbackPath);
  }

  return res.status(404).send('Zentra dashboard not built yet. Run npm run build:zentra or start the Zentra dev server.');
});

app.use('/zentra', (req, res, next) => {
  if (isDev || process.env.ZENTRA_DEV_PROXY === 'true') {
    return zentraDevProxy.web(req, res, { target: zentraDevTarget });
  }
  next();
});

app.use('/zentra', express.static(zentraDistPath, staticOptions));
app.use('/zentra', express.static(zentraSourcePath, staticOptions));
app.get('/zentra/*', (req, res) => {
  if (require('fs').existsSync(zentraIndexPath)) {
    return res.sendFile(zentraIndexPath);
  }
  const fallbackPath = path.join(zentraSourcePath, 'index.html');
  if (require('fs').existsSync(fallbackPath)) {
    return res.sendFile(fallbackPath);
  }
  return res.status(404).send('Zentra dashboard not built yet. Run npm run build:zentra or start the Zentra dev server.');
});

app.use((req, res, next) => {
  const incomingCsrf = req.cookies?.csrf_token;
  const csrfToken = incomingCsrf || crypto.randomBytes(32).toString('base64url');
  if (!incomingCsrf) {
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false,
      secure: isProd || isVM || req.protocol === 'https',
      sameSite: isProd ? 'Strict' : 'Lax',
      maxAge: 12 * 60 * 60 * 1000,
      path: '/'
    });
  }

  const hasBrowserSession = !!req.cookies?.auth_session;
  const isAuthEntry = req.path === '/api/auth/login' || 
                      req.path === '/api/auth/register' || 
                      req.path === '/api/auth/logout' || 
                      req.path === '/api/auth/worker-google';
  const mutatingApiRequest = req.path.startsWith('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const hasBearerAuth = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ');

  if (hasBrowserSession && mutatingApiRequest && !isAuthEntry && !hasBearerAuth) {
    const clientHeaderCsrf = req.get('x-csrf-token');
    if (incomingCsrf && clientHeaderCsrf !== incomingCsrf) {
      return res.status(403).json({ error: 'CSRF validation failed' });
    }
  }
  next();
});

// ─── Hostname-Based Frontend Dispatcher ─────────────────────────────────────
// erp.faizal.uk → Zentra Analytics Dashboard (non-OS React SPA)
// mac.faizal.uk → MacOS Frontend (OS-based Vanilla JS app)
//
// Both share the same backend and all /api/* routes.
// Pattern mirrors MacOS: dist built on CI, rsync'd to VM, volume-mounted
// into Docker — frontend updates go live without a container restart.
app.use((req, res, next) => {
  if (!isZentraHost(req)) return next();
  if (req.path.startsWith('/api/')) return next(); // always let API routes through

  const fs = require('fs');
  // Serve Zentra's built static assets; on miss, SPA-fallback to index.html
  express.static(zentraDistPath, staticOptions)(req, res, () => {
    if (fs.existsSync(zentraIndexPath)) {
      return res.sendFile(zentraIndexPath);
    }
    // Zentra dist not deployed yet
    res.status(503).send(
      'Zentra dashboard not built. Trigger the <strong>deploy-zentra</strong> GitHub Action.'
    );
  });
});

// ─── MacOS Frontend Static Serving ───────────────────────────────────────────
// Only reached for non-Zentra hosts (mac.faizal.uk, localhost, etc.)
app.use(express.static(path.join(__dirname, '../..'), staticOptions));
app.use(express.static(path.join(__dirname, '../../frontend'), staticOptions));
app.use(express.static(path.join(__dirname, '../../frontend/public'), staticOptions));
app.use('/assets', express.static(path.join(__dirname, '../../dist/assets'), staticOptions));
app.use('/modules', express.static(path.join(__dirname, '../../frontend/modules'), staticOptions));
app.use('/scripts', express.static(path.join(__dirname, '../../frontend/scripts'), staticOptions));
app.use('/shared', express.static(path.join(__dirname, '../../frontend/shared'), staticOptions));

// Serve large wallpaper assets from root to keep them out of frontend build
const wallpaperPath = path.join(__dirname, '../../Wallpapers');
app.use('/assets/Wallpaper', express.static(wallpaperPath, staticOptions));
app.use('/api/assets/Wallpaper', express.static(wallpaperPath, staticOptions));

// Lowercase aliases for robustness
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
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:3002',
  'http://127.0.0.1:3002',
  'http://localhost:3003',
  'http://127.0.0.1:3003',
  'http://localhost:3004',
  'http://127.0.0.1:3004',
  'http://localhost:3005',
  'http://127.0.0.1:3005',
  'http://localhost:3006',
  'http://127.0.0.1:3006',
  'http://localhost:3007',
  'http://127.0.0.1:3007',
  'http://localhost:3008',
  'http://127.0.0.1:3008',
  'http://localhost:3009',
  'http://127.0.0.1:3009',
  'http://localhost:3010',
  'http://127.0.0.1:3010'
]);

const defaultProductionOrigins = new Set([
  'https://mac.faizal.uk',
  'http://mac.faizal.uk',
  'https://erp.faizal.uk',
  'http://erp.faizal.uk'
]);

function normalizeOrigin(origin) {
  if (!origin || typeof origin !== 'string') return null;
  try {
    const parsed = new URL(origin);
    const protocol = parsed.protocol.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${protocol}//${hostname}${port}`;
  } catch {
    return null;
  }
}

function isOriginAllowed(origin) {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return true; // same-origin / curl / server-to-server
  if (corsOrigins.length > 0) return corsOrigins.includes(normalizedOrigin);
  // In dev, Vite may pick the next available port (5174+). Allow localhost/127.0.0.1 on any port.
  if (isDev && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(normalizedOrigin)) return true;
  if (isDev) return defaultDevOrigins.has(normalizedOrigin);
  return defaultProductionOrigins.has(normalizedOrigin);
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const normalizedOrigin = normalizeOrigin(origin);
  const isAllowed = normalizedOrigin ? isOriginAllowed(normalizedOrigin) : true;

  if (isAllowed && normalizedOrigin) {
    res.header('Access-Control-Allow-Origin', normalizedOrigin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Vary', 'Origin');
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, X-Client-Platform, X-App-Type');
  res.header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type, X-Request-ID');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    if (normalizedOrigin && !isAllowed) {
      return res.status(403).json({ error: 'Request origin is not allowed' });
    }
    return res.sendStatus(204);
  }

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

const desktopDepartment = departments.desktop.create(globalDb, authModule.authMiddleware);
const { router: desktopRouter, clockRouter, weatherRouter: weatherSettingsRouter, quickNotesRouter, remindersRouter } = desktopDepartment;

// Mount API Routes
const routes = [
  { path: '/api/billing', router: billingRouter },
  { path: '/api/products', router: productsRouter },
  { path: '/api/contacts', router: contactsRouter },
  { path: '/api/notes', router: notesRouter },
  { path: '/api/calendar', router: calendarRouter },
  { path: '/api/analytics', router: analyticsRouter },
  { path: '/api/settings', router: settingsRouter },
  { path: '/api/desktop', router: desktopRouter },
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
app.get('/api/auth/verify', authModule.authMiddleware, authModule.verify);
app.post('/api/auth/logout', authModule.logout);
app.get('/api/auth/status', authModule.getStatus);
app.get('/api/auth/questions', authModule.getSecurityQuestions);
app.get('/api/auth/challenge', authModule.getChallengeQuestion);
app.post('/api/auth/verify-answer', authModule.verifyAnswer);
app.get('/api/auth/verify-answer', (req, res) => {
  res.setHeader('Allow', 'POST');
  res.status(405).json({ error: 'Security-answer verification requires a POST request.' });
});
app.get('/api/auth/webauthn/registration-options', authModule.authMiddleware, authModule.getWebAuthnRegistrationOptions);
app.post('/api/auth/webauthn/registration-verify', authModule.authMiddleware, authModule.verifyWebAuthnRegistration);
app.get('/api/auth/webauthn/authentication-options', authModule.getWebAuthnAuthenticationOptions);
app.post('/api/auth/webauthn/authentication-verify', authModule.verifyWebAuthnAuthentication);
app.post('/api/auth/update-security', authModule.authMiddleware, authModule.updateSecurity);

// Owner administration routes
app.get('/api/admin/users', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.listUsers);
app.get('/api/admin/notifications', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.getNotifications);
app.get('/api/admin/users/:userId/permissions', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.getPermissions);
app.post('/api/admin/users/:userId/approve', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.approveUser);
app.post('/api/admin/users/:userId/approve-deletion', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.approveDeletion);
app.post('/api/admin/users/:userId/deletion/approve', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.approveDeletion);
app.post('/api/admin/users/:userId/reject-deletion', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.rejectDeletion);
app.post('/api/admin/users/:userId/deletion/reject', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.rejectDeletion);
app.get('/api/admin/users/:userId/history', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.getWorkerLifecycleHistory);
app.get('/api/admin/worker-lifecycle', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.getWorkerLifecycleHistory);
app.post('/api/admin/users/:userId/status', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.setStatus);
app.put('/api/admin/users/:userId/permissions', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.updateUserPermissions);
app.delete('/api/admin/users/:userId', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.deleteUser);
app.get('/api/admin/users/:userId/audit', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.getAuditLogs);
app.get('/api/admin/audit', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.getAuditLogs);
app.get('/api/admin/accounts-graph', authModule.authMiddleware, adminAuth.ownerOnly, adminAuth.getAccountsGraph);
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
  } else if (route.path === '/api/wallpapers') {
    // Wallpaper catalog is used on the lockscreen / guest views before auth is established.
    // Keep reads public, but require auth for write operations and management actions.
    app.use(route.path, (req, res, next) => {
      const publicRead = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ||
        req.path === '/health' ||
        req.path === '/marketplace';

      if (publicRead) return next();
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
    return sendError(res, 'PAYLOAD_TOO_LARGE', 'Payload too large. Maximum JSON size is 25MB.', null, 413, { requestId: req.requestId });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.warn('[Server] Malformed JSON:', err.message);
    return sendError(res, 'INVALID_JSON', 'Invalid JSON in request body', null, 400, { requestId: req.requestId });
  }
  console.error('[Server] Unhandled error:', err.message);
  return sendError(res, 'INTERNAL_SERVER_ERROR', err.message || 'Internal Server Error', null, err.status || 500, { requestId: req.requestId });
});

// API Health check endpoint
app.get(['/api/health', '/api/healthz'], (req, res) => {
  res.json({
    status: 'healthy',
    ok: true,
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
const apiDocumentationDocument = {
  service: 'MacOS Business Suite API',
  status: 'running',
  message: 'Consolidated enterprise API server for billing, products, contacts, notes, analytics, and mobile services',
  version: '2.0.0',
  release: '2026-09-20',
  schema: 'v1',
  environment: process.env.NODE_ENV || 'production',
  host: 'mac.faizal.uk',
  baseUrl: 'https://mac.faizal.uk/api',
  docs: {
    format: 'JSON-first, browser-friendly documentation',
    compatibility: 'Accepts JSON for clients; renders HTML docs in browser requests',
    auth: {
      web: 'Cookie/session-based authentication for browser flows',
      mobile: 'Bearer token support for native Android and stateless clients',
      csrf: 'Browser CSRF protections remain active; mobile bearer requests are exempted',
      headers: ['Authorization: Bearer <token>', 'X-App-Type: native_android', 'X-Client-Platform: android', 'X-API-Key: <key>']
    },
    conventions: {
      success: 'Responses use success: true and standard data/meta payloads where applicable',
      errors: 'Error responses use HTTP status codes and descriptive JSON error messages',
      pagination: 'List endpoints support limit, offset, and search filters when applicable',
      timestamps: 'ISO-8601 timestamps in UTC',
      naming: 'Domain-owned services and canonical contracts are preferred over fragmented legacy responses'
    },
    standards: {
      'response-shape': '{ success, data, meta, count, items? }',
      'http-statuses': { ok: 200, created: 201, bad_request: 400, unauthorized: 401, forbidden: 403, not_found: 404, conflict: 409, server_error: 500 },
      'rate-limits': 'Protective limits apply to high-volume endpoints and mobile sync traffic',
      'cache': 'Public catalog endpoints may be cached; business data endpoints should use tenant-aware revalidation'
    }
  },
  domains: {
    billing: {
      summary: 'Invoices, bills, payments, credit notes, customer statements, and ledger operations',
      routes: [
        'GET /api/billing',
        'POST /api/billing',
        'GET /api/billing/:id',
        'PUT /api/billing/:id',
        'DELETE /api/billing/:id',
        'GET /api/billing/summary',
        'GET /api/billing/dashboard-metrics',
        'GET /api/billing/customers/:id/statement',
        'GET /api/billing/customer/:id/statement',
        'GET /api/billing/invoices/payments',
        'POST /api/billing/payments',
        'GET /api/billing/orders',
        'GET /api/billing/creditnotes'
      ]
    },
    products: {
      summary: 'Inventory, variants, batches, categories, and product-list management',
      routes: [
        'GET /api/products',
        'POST /api/products',
        'GET /api/products/:id',
        'PUT /api/products/:id',
        'DELETE /api/products/:id',
        'GET /api/products/categories',
        'POST /api/products/categories',
        'GET /api/products/variants',
        'POST /api/products/variants',
        'GET /api/products/batches',
        'POST /api/products/batches'
      ]
    },
    contacts: {
      summary: 'Customer and vendor records, profiles, and relationship metadata',
      routes: [
        'GET /api/contacts',
        'POST /api/contacts',
        'GET /api/contacts/:id',
        'PUT /api/contacts/:id',
        'DELETE /api/contacts/:id'
      ]
    },
    analytics: {
      summary: 'Executive KPIs, dashboard summaries, and reporting views',
      routes: [
        'GET /api/analytics',
        'GET /api/analytics/dashboard',
        'GET /api/analytics/summary'
      ]
    },
    notes: {
      summary: 'Notes, reminders, and activity-linked journaling',
      routes: [
        'GET /api/notes',
        'POST /api/notes',
        'GET /api/notes/:id',
        'PUT /api/notes/:id',
        'DELETE /api/notes/:id'
      ]
    },
    system: {
      summary: 'Health checks, status endpoints, configuration, and operational diagnostics',
      routes: [
        'GET /api/health',
        'GET /api/status',
        'GET /api/debug/notes',
        'GET /api/android/update/check',
        'GET /api/auth/status'
      ]
    }
  },
  examples: {
    healthCheck: {
      method: 'GET',
      url: 'https://mac.faizal.uk/api/health',
      response: {
        success: true,
        status: 'healthy',
        timestamp: '2026-09-20T00:00:00.000Z',
        service: 'MacOS Business Suite API'
      }
    },
    billingMetrics: {
      method: 'GET',
      url: 'https://mac.faizal.uk/api/billing/dashboard-metrics',
      response: {
        success: true,
        data: {
          summary: {
            totalBilled: 35829,
            totalCollected: 12820,
            amountDue: 23009
          }
        }
      }
    }
  },
  endpoints: {
    'billing': 'POST/GET - Manage invoices/bills',
    'billing/:id': 'GET/PUT/DELETE - Manage specific invoice',
    'billing/summary': 'GET - Get billing summary statistics',
    'billing/dashboard-metrics': 'GET - Get server-authoritative dashboard KPI payload',
    'billing/customers/:id/statement': 'GET - Get FIFO-based customer statement',
    'products': 'GET/POST - Manage product inventory (Product List App)',
    'products/:id': 'GET/PUT/DELETE - Manage specific product (Product List App)',
    'products/categories': 'GET/POST - Manage product categories (Product List App)',
    'contacts': 'GET/POST - Manage customers and vendors',
    'contacts/:id': 'GET/PUT/DELETE - Manage specific contact',
    'notes': 'GET/POST - Manage notes',
    'calendar': 'GET/POST - Manage calendar events',
    'analytics': 'GET - View analytics data',
    'settings': 'GET/PUT - Manage settings',
    'health': 'GET - Service health and readiness check',
    'auth/status': 'GET - Authentication status',
    'wallpapers': 'GET - Get all available wallpapers',
    'suggestions': 'GET - Get smart suggestions based on customer history'
  }
};

const renderApiDocumentationHtml = (doc) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${doc.service}</title>
  <style>
    :root {
      --bg: #0b1020;
      --panel: #121a2b;
      --panel-alt: #1a2338;
      --border: rgba(148, 163, 184, 0.22);
      --text: #e5eefb;
      --muted: #9fb2d3;
      --accent: #6ee7b7;
      --accent-2: #7dd3fc;
      --warning: #fbbf24;
      --danger: #f87171;
      --shadow: 0 18px 45px rgba(15, 23, 42, 0.45);
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      font-family: Inter, Segoe UI, Arial, sans-serif;
      background: linear-gradient(180deg, #0b1020 0%, #111827 100%);
      color: var(--text);
      line-height: 1.6;
    }
    .wrap {
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 20px 80px;
    }
    .hero {
      background: linear-gradient(135deg, rgba(110,231,183,0.14), rgba(125,211,252,0.1));
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 28px 30px;
      box-shadow: var(--shadow);
    }
    .badge {
      display: inline-block;
      background: rgba(110,231,183,0.12);
      border: 1px solid rgba(110,231,183,0.35);
      color: var(--accent);
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    h1 {
      font-size: clamp(2rem, 3vw, 3rem);
      margin: 16px 0 8px;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 16px;
      color: var(--muted);
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 20px;
      margin-top: 28px;
    }
    .card {
      background: rgba(18, 26, 43, 0.92);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px;
      box-shadow: var(--shadow);
    }
    .card h2 {
      margin-top: 0;
      font-size: 1.05rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--accent-2);
    }
    .muted { color: var(--muted); }
    code, pre {
      font-family: 'SFMono-Regular', Consolas, monospace;
    }
    code {
      background: rgba(148,163,184,0.08);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 2px 8px;
      color: #dbeafe;
      font-size: 0.9em;
    }
    pre {
      margin: 0;
      background: rgba(2, 6, 23, 0.8);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      overflow-x: auto;
      color: #dbeafe;
      white-space: pre-wrap;
      word-break: break-word;
    }
    ul {
      margin: 0;
      padding-left: 18px;
      color: var(--muted);
    }
    li { margin-bottom: 8px; }
    a { color: var(--accent-2); text-decoration: none; }
    a:hover { text-decoration: underline; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 16px;
      font-size: 14px;
    }
    th, td {
      border-bottom: 1px solid var(--border);
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
    }
    th { color: var(--text); font-weight: 700; }
    td { color: var(--muted); }
    .section {
      margin-top: 30px;
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin: 22px 0 18px;
    }
    .search-box {
      flex: 1 1 260px;
      background: rgba(15, 23, 42, 0.72);
      border: 1px solid var(--border);
      border-radius: 12px;
      color: var(--text);
      padding: 12px 14px;
      font-size: 14px;
    }
    .status-chips {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .chip {
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: rgba(148,163,184,0.08);
      color: var(--muted);
      font-size: 12px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .chip.success { color: var(--accent); border-color: rgba(110,231,183,0.35); }
    .domain-panel {
      border: 1px solid var(--border);
      background: rgba(18, 26, 43, 0.9);
      border-radius: 14px;
      overflow: hidden;
      margin-bottom: 14px;
      box-shadow: var(--shadow);
    }
    .domain-toggle {
      width: 100%;
      background: transparent;
      color: var(--text);
      border: none;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      text-align: left;
      padding: 18px 20px;
      font: inherit;
    }
    .domain-title-wrap {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .domain-label {
      font-size: 1.02rem;
      font-weight: 700;
      text-transform: capitalize;
    }
    .domain-summary {
      color: var(--muted);
      font-size: 12px;
    }
    .domain-chevron {
      font-size: 22px;
      color: var(--accent-2);
      transition: transform 0.2s ease;
    }
    .domain-panel.open .domain-chevron { transform: rotate(180deg); }
    .domain-body {
      display: none;
      border-top: 1px solid var(--border);
      padding: 16px 20px 20px;
    }
    .domain-panel.open .domain-body { display: block; }
    .route-list {
      display: grid;
      gap: 10px;
    }
    .route-item {
      display: grid;
      grid-template-columns: 74px minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      background: rgba(15, 23, 42, 0.74);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
    }
    .method-tag {
      display: inline-block;
      text-align: center;
      padding: 6px 8px;
      border-radius: 7px;
      font-weight: 800;
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      background: rgba(125,211,252,0.14);
      color: var(--accent-2);
    }
    .method-tag.get { background: rgba(110,231,183,0.12); color: var(--accent); }
    .method-tag.post { background: rgba(251,191,36,0.12); color: var(--warning); }
    .method-tag.put, .method-tag.patch { background: rgba(125,211,252,0.12); color: var(--accent-2); }
    .method-tag.delete { background: rgba(248,113,113,0.12); color: var(--danger); }
    .route-path {
      font-size: 14px;
      color: #dbeafe;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .copy-btn, .example-btn {
      border: 1px solid var(--border);
      background: rgba(148,163,184,0.08);
      color: var(--text);
      border-radius: 10px;
      padding: 7px 10px;
      cursor: pointer;
      font: inherit;
    }
    .copy-btn:hover, .example-btn:hover { border-color: rgba(125,211,252,0.35); }
    .example-toolbar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .example-btn.active {
      background: rgba(110,231,183,0.12);
      color: var(--accent);
      border-color: rgba(110,231,183,0.35);
    }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <span class="badge">API Platform</span>
      <h1>${doc.service}</h1>
      <div class="meta">
        <span>Version ${doc.version}</span>
        <span>Release ${doc.release}</span>
        <span>Schema ${doc.schema}</span>
        <span>Environment ${doc.environment}</span>
      </div>
      <p class="muted" style="margin-top: 18px; font-size: 1.05rem; max-width: 860px;">${doc.message}</p>
      <p class="muted">Base URL: <code>${doc.baseUrl}</code></p>
    </div>

    <div class="toolbar">
      <input id="apiSearch" class="search-box" type="text" placeholder="Search endpoints, domains, or examples..." />
      <div class="status-chips">
        <span class="chip success">Operational</span>
        <span class="chip">JSON-first</span>
        <span class="chip">Bearer + Session Auth</span>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h2>Auth & Security</h2>
        <ul>
          <li>Web: Cookie/session authentication</li>
          <li>Mobile: Bearer token support</li>
          <li>CSRF protections remain enforced for browser flows</li>
          <li>Native Android requests are treated as stateless clients</li>
        </ul>
      </div>
      <div class="card">
        <h2>Response Standards</h2>
        <ul>
          <li>JSON-first responses</li>
          <li>Success envelope: <code>success, data, meta</code></li>
          <li>HTTP status codes for all outcomes</li>
          <li>ISO-8601 timestamps</li>
        </ul>
      </div>
      <div class="card">
        <h2>Operational Notes</h2>
        <ul>
          <li>Domain-specific service contracts</li>
          <li>Canonical data normalization</li>
          <li>Public catalog caching available</li>
          <li>Internal system health is monitored continuously</li>
        </ul>
      </div>
    </div>

    <div class="section">
      <h2>Domains</h2>
      ${Object.entries(doc.domains).map(([domainName, domain]) => `
        <section class="domain-panel open" data-domain="${domainName}">
          <button class="domain-toggle" type="button" data-target="${domainName}">
            <span class="domain-title-wrap">
              <span class="domain-label">${domainName}</span>
              <span class="domain-summary">${domain.summary}</span>
            </span>
            <span class="domain-chevron">▾</span>
          </button>
          <div class="domain-body">
            <div class="route-list">
              ${domain.routes.map(route => {
                const [method, ...rest] = route.split(' ');
                const path = rest.join(' ');
                return `
                  <div class="route-item" data-route="${route.toLowerCase()}">
                    <span class="method-tag ${method.toLowerCase()}">${method}</span>
                    <span class="route-path">${path}</span>
                    <button class="copy-btn" type="button" data-copy="${route}">Copy</button>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </section>
      `).join('')}
    </div>

    <div class="section">
      <h2>Interactive Examples</h2>
      <div class="example-toolbar">
        ${Object.keys(doc.examples).map((key, index) => `
          <button class="example-btn ${index === 0 ? 'active' : ''}" type="button" data-example="${key}">${key}</button>
        `).join('')}
      </div>
      <pre id="exampleCode">${JSON.stringify(doc.examples.healthCheck, null, 2)}</pre>
    </div>

    <div class="section">
      <h2>Standard Response Shape</h2>
      <pre>{
  "success": true,
  "data": {
    "items": [],
    "count": 0
  },
  "meta": {
    "generatedAt": "2026-09-20T00:00:00.000Z",
    "status": "ready"
  }
}</pre>
    </div>

    <div class="section">
      <p class="muted">This documentation endpoint is intentionally designed to be readable in a browser and machine-readable for API consumers.</p>
    </div>
  </div>

  <script>
    const apiSearch = document.getElementById('apiSearch');
    const panels = Array.from(document.querySelectorAll('.domain-panel'));
    const exampleButtons = Array.from(document.querySelectorAll('.example-btn'));
    const exampleCode = document.getElementById('exampleCode');

    const examplePayloads = ${JSON.stringify(doc.examples)};

    function applySearch() {
      const query = (apiSearch.value || '').toLowerCase().trim();
      panels.forEach(panel => {
        const domain = panel.dataset.domain || '';
        const body = panel.querySelector('.domain-body');
        const routes = Array.from(panel.querySelectorAll('.route-item'));
        const matchesDomain = domain.toLowerCase().includes(query);
        const matchesRoute = routes.some(route => (route.dataset.route || '').includes(query));
        const show = !query || matchesDomain || matchesRoute;
        panel.classList.toggle('hidden', !show);
        if (show && query && !matchesDomain && matchesRoute) {
          panel.classList.add('open');
          body.style.display = 'block';
        }
      });
    }

    apiSearch.addEventListener('input', applySearch);

    document.querySelectorAll('.domain-toggle').forEach(button => {
      button.addEventListener('click', () => {
        const panel = button.closest('.domain-panel');
        panel.classList.toggle('open');
      });
    });

    exampleButtons.forEach(button => {
      button.addEventListener('click', () => {
        const key = button.dataset.example;
        exampleButtons.forEach(btn => btn.classList.toggle('active', btn === button));
        exampleCode.textContent = JSON.stringify(examplePayloads[key], null, 2);
      });
    });

    document.querySelectorAll('.copy-btn').forEach(button => {
      button.addEventListener('click', async () => {
        const text = button.dataset.copy || '';
        try {
          await navigator.clipboard.writeText(text);
          const previous = button.textContent;
          button.textContent = 'Copied';
          setTimeout(() => { button.textContent = previous; }, 1200);
        } catch (err) {
          button.textContent = 'Copy failed';
          setTimeout(() => { button.textContent = 'Copy'; }, 1200);
        }
      });
    });
  </script>
</body>
</html>`;

app.get(['/customer-ledger', '/customer-ledger.html', '/ledger/:token', '/ledger', '/l/:token', '/l'], (req, res) => {
  const htmlPath = path.join(__dirname, '../../dist/customer-ledger.html');
  if (require('fs').existsSync(htmlPath)) {
    return res.sendFile(htmlPath);
  }
  return res.sendFile(path.join(__dirname, '../../frontend/customer-ledger.html'));
});

app.get(['/public-product', '/public-product.html'], (req, res) => {
  const htmlPath = path.join(__dirname, '../../dist/public-product.html');
  if (require('fs').existsSync(htmlPath)) {
    return res.sendFile(htmlPath);
  }
  return res.sendFile(path.join(__dirname, '../../frontend/public-product.html'));
});

app.get(['/public/product', '/public/product/:sku', '/public/batch/:batchId'], (req, res) => {
  const htmlPath = path.join(__dirname, '../../dist/public-product.html');
  if (require('fs').existsSync(htmlPath)) {
    return res.sendFile(htmlPath);
  }
  return res.sendFile(path.join(__dirname, '../../frontend/public-product.html'));
});

app.get('/api', (req, res) => {
  const userAgent = String(req.get('user-agent') || '');
  const browserLike = /mozilla|chrome|safari|firefox|edg|opera/i.test(userAgent);
  const prefersHtml = req.accepts(['html', 'json']) === 'html' || browserLike;

  if (prefersHtml) {
    return res.type('html').send(renderApiDocumentationHtml(apiDocumentationDocument));
  }

  return res.json(apiDocumentationDocument);
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

// Start server
const BASE_PORT = Number(process.env.PORT) || 3002;
const HOST = process.env.HOST || '0.0.0.0'; // Default to IPv4 for Ubuntu; bind to all interfaces

function startServer(port, attemptsLeft = 20) {
  const server = app.listen(port, HOST, () => {
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`✨ Backend MacOS API Server running on port ${port}${HOST ? ` (host ${HOST})` : ''}`);
    console.log('───────────────────────────────────────────────────────────');
    console.log(`Local: http://localhost:${port}`);
    console.log(`LAN:   http://127.0.0.1:${port}`);
    if (process.env.PUBLIC_HOST) {
      console.log(`Public: http://${process.env.PUBLIC_HOST}:${port}`);
    }
    console.log('───────────────────────────────────────────────────────────');
    console.log(`📚 API Documentation: http://localhost:${port}/api`);
    console.log(`💚 Health Check:      http://localhost:${port}/api/health`);
    console.log('═══════════════════════════════════════════════════════════\n');
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
