'use strict';
/**
 * email-reminder-scheduler.js
 * ─────────────────────────────────────────────────────────────────────────────
 * MacOS Business Suite — Email Reminder & Summary Scheduler
 *
 * Runs as a module inside the existing Node.js process (zero extra overhead).
 * Uses a single setInterval(60s) to check IST wall-clock time and fire emails.
 *
 * Delivery: nodemailer → local SMTP on 127.0.0.1:25 (Postfix/Exim on Oracle VM)
 * Config:   All settings live in the `app_settings` DB table so the owner
 *           can change them via Settings UI — hot-reloaded on every tick.
 *
 * ── Settings keys ────────────────────────────────────────────────────────────
 *  email_reminders_enabled          → 'true'|'false'
 *  email_reminder_to                → comma-separated recipient(s)
 *  email_reminder_from              → sender address
 *  email_smtp_host                  → default '127.0.0.1'
 *  email_smtp_port                  → default '25'
 *  email_daily_summary_enabled      → 'true'|'false'
 *  email_daily_summary_time         → 'HH:MM' IST (24h), default '08:00'
 *  email_weekly_summary_enabled     → 'true'|'false'
 *  email_weekly_summary_day         → 0-6 (Sun=0), default 1 (Mon)
 *  email_weekly_summary_time        → 'HH:MM' IST, default '09:00'
 *  email_invoice_7d_enabled         → 'true'|'false'
 *  email_invoice_14d_enabled        → 'true'|'false'
 *  email_invoice_30d_enabled        → 'true'|'false'
 *  email_invoice_check_time         → 'HH:MM' IST, default '10:00'
 *  email_order_3d_enabled           → 'true'|'false'
 *  email_order_7d_enabled           → 'true'|'false'
 *  email_order_check_time           → 'HH:MM' IST, default '10:30'
 *  email_low_stock_enabled          → 'true'|'false'
 *  email_low_stock_check_time       → 'HH:MM' IST, default '07:00'
 * ─────────────────────────────────────────────────────────────────────────────
 */

let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (_) { /* optional dep */ }

// ─── IST helpers ─────────────────────────────────────────────────────────────
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const nowIST = () => new Date(Date.now() + IST_OFFSET_MS);
const istHHMM = () => {
  const d = nowIST();
  return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
};
const istDay  = () => nowIST().getUTCDay(); // 0=Sun

// ─── DB helpers ───────────────────────────────────────────────────────────────
const getSetting = (db, key, fallback = '') => {
  try {
    const row = db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get(key);
    return row ? row.setting_value : fallback;
  } catch (_) { return fallback; }
};
const isEnabled = (db, key) => getSetting(db, key, 'false').toLowerCase() === 'true';

// ─── INR formatter ────────────────────────────────────────────────────────────
const inr = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// ─── SMTP transport ───────────────────────────────────────────────────────────
const net = require('net');
const tls = require('tls');
const fs  = require('fs');

function getSmtpConfig(db) {
  let rawHost = getSetting(db, 'email_smtp_host', 'mail.faizal.uk');
  const port    = parseInt(getSetting(db, 'email_smtp_port', '587'), 10) || 587;
  const user    = getSetting(db, 'email_smtp_user', 'reports@faizal.uk');
  const pass    = getSetting(db, 'email_smtp_pass', 'FaizalReports2026!');
  const from    = getSetting(db, 'email_reminder_from', 'reports@faizal.uk');
  const to      = getSetting(db, 'email_reminder_to', 'me@faizal.uk');
  const secure  = port === 465 || getSetting(db, 'email_smtp_secure', 'false').toLowerCase() === 'true';

  let host = rawHost || 'mail.faizal.uk';
  const isInsideDocker = fs.existsSync('/.dockerenv') || !!process.env.DOCKER_CONTAINER || process.cwd().startsWith('/app');
  if ((host === '127.0.0.1' || host === 'localhost')) {
    if (process.env.DOCKER_BRIDGE_GATEWAY) {
      host = process.env.DOCKER_BRIDGE_GATEWAY;
    } else if (isInsideDocker || process.env.NODE_ENV === 'production') {
      host = 'mail.faizal.uk';
    }
  }

  return { host, port, user, pass, from, to, secure };
}

function createTransport(cfgOrDb) {
  if (!nodemailer) return null;
  const cfg = cfgOrDb && cfgOrDb.host ? cfgOrDb : getSmtpConfig(cfgOrDb);
  const opts = {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    greetingTimeout: 8000,
  };
  if (cfg.user && cfg.pass) {
    opts.auth = { user: cfg.user, pass: cfg.pass };
  }
  return nodemailer.createTransport(opts);
}

function sendViaRawSmtp(cfgOrDb, { subject, html, text }) {
  return new Promise((resolve, reject) => {
    const cfg = cfgOrDb && cfgOrDb.host ? cfgOrDb : getSmtpConfig(cfgOrDb);
    const recipients = (cfg.to || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!recipients.length) return reject(new Error('No recipient email specified'));

    const boundary = '----=_Part_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
    const mimeBody = [
      `From: "MacOS Suite" <${cfg.from}>`,
      `To: ${recipients.join(', ')}`,
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      text || subject,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      html || `<p>${text || subject}</p>`,
      ``,
      `--${boundary}--`,
      `.`,
      ``
    ].join('\r\n');

    let socket = null;
    let stage = cfg.secure ? 'GREETING' : 'CONNECT';
    let buffer = '';
    let rcptIdx = 0;

    const cleanup = () => {
      try { if (socket && !socket.destroyed) socket.destroy(); } catch (_) {}
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`SMTP connection timed out (${cfg.host}:${cfg.port})`));
    }, 15000);

    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\r\n');
      buffer = lines.pop(); // keep remainder

      for (const line of lines) {
        if (!line) continue;
        const code = parseInt(line.slice(0, 3), 10);
        const isMulti = line[3] === '-';
        if (isMulti) continue; // wait for end of multi-line response

        handleResponse(code, line);
      }
    };

    const sendCmd = (cmd) => {
      if (socket && !socket.destroyed) socket.write(cmd + '\r\n');
    };

    const handleResponse = (code, line) => {
      if (code >= 400) {
        cleanup();
        clearTimeout(timer);
        return reject(new Error(`SMTP error ${code}: ${line}`));
      }

      switch (stage) {
        case 'GREETING':
          stage = 'EHLO_1';
          sendCmd('EHLO localhost');
          break;

        case 'EHLO_1':
          if (!cfg.secure && cfg.port === 587) {
            stage = 'STARTTLS';
            sendCmd('STARTTLS');
          } else if (cfg.user && cfg.pass) {
            stage = 'AUTH';
            const token = Buffer.from(`\0${cfg.user}\0${cfg.pass}`).toString('base64');
            sendCmd(`AUTH PLAIN ${token}`);
          } else {
            stage = 'MAIL_FROM';
            sendCmd(`MAIL FROM:<${cfg.from}>`);
          }
          break;

        case 'STARTTLS':
          if (code === 220) {
            socket.removeAllListeners('data');
            const tlsSocket = tls.connect({
              socket,
              host: cfg.host,
              rejectUnauthorized: false
            }, () => {
              stage = 'EHLO_2';
              sendCmd('EHLO localhost');
            });
            tlsSocket.on('data', onData);
            tlsSocket.on('error', (err) => { cleanup(); clearTimeout(timer); reject(err); });
            socket = tlsSocket;
          }
          break;

        case 'EHLO_2':
          if (cfg.user && cfg.pass) {
            stage = 'AUTH';
            const token = Buffer.from(`\0${cfg.user}\0${cfg.pass}`).toString('base64');
            sendCmd(`AUTH PLAIN ${token}`);
          } else {
            stage = 'MAIL_FROM';
            sendCmd(`MAIL FROM:<${cfg.from}>`);
          }
          break;

        case 'AUTH':
          if (code === 235) {
            stage = 'MAIL_FROM';
            sendCmd(`MAIL FROM:<${cfg.from}>`);
          }
          break;

        case 'MAIL_FROM':
          stage = 'RCPT_TO';
          rcptIdx = 0;
          sendCmd(`RCPT TO:<${recipients[0]}>`);
          break;

        case 'RCPT_TO':
          rcptIdx++;
          if (rcptIdx < recipients.length) {
            sendCmd(`RCPT TO:<${recipients[rcptIdx]}>`);
          } else {
            stage = 'DATA';
            sendCmd('DATA');
          }
          break;

        case 'DATA':
          if (code === 354) {
            stage = 'BODY';
            if (socket && !socket.destroyed) socket.write(mimeBody);
          }
          break;

        case 'BODY':
          if (code === 250) {
            stage = 'QUIT';
            sendCmd('QUIT');
            clearTimeout(timer);
            cleanup();
            resolve({ ok: true, messageId: line });
          }
          break;

        case 'QUIT':
          cleanup();
          break;
      }
    };

    try {
      if (cfg.secure) {
        socket = tls.connect({ host: cfg.host, port: cfg.port, rejectUnauthorized: false }, () => {
          stage = 'GREETING';
        });
      } else {
        socket = net.connect({ host: cfg.host, port: cfg.port }, () => {
          stage = 'GREETING';
        });
      }
      socket.on('data', onData);
      socket.on('error', (err) => { cleanup(); clearTimeout(timer); reject(err); });
    } catch (err) {
      cleanup();
      clearTimeout(timer);
      reject(err);
    }
  });
}

async function sendEmail(db, { subject, html, text }) {
  const cfg = getSmtpConfig(db);
  if (!cfg.to) {
    console.warn('[EmailScheduler] No recipient — skipping:', subject);
    return { ok: false, error: 'No recipient email configured' };
  }

  // Candidate hosts to attempt: configured host first, followed by known network bridges
  const candidates = [cfg.host];
  if (cfg.host === '127.0.0.1' || cfg.host === 'localhost') {
    if (!candidates.includes('mail.faizal.uk')) candidates.push('mail.faizal.uk');
    if (!candidates.includes('172.18.0.1')) candidates.push('172.18.0.1');
    if (!candidates.includes('172.17.0.1')) candidates.push('172.17.0.1');
  } else if (cfg.host === 'mail.faizal.uk') {
    if (!candidates.includes('172.18.0.1')) candidates.push('172.18.0.1');
  }

  let lastError = null;

  for (const candidateHost of candidates) {
    const activeCfg = { ...cfg, host: candidateHost };

    // 1. Try nodemailer first
    const transport = createTransport(activeCfg);
    if (transport) {
      try {
        const info = await transport.sendMail({
          from: `"MacOS Suite" <${activeCfg.from}>`,
          to: activeCfg.to,
          subject,
          text: text || subject,
          html,
        });
        console.log(`[EmailScheduler] ✓ Sent via nodemailer (${candidateHost}:${activeCfg.port}): "${subject}" → ${info.messageId}`);
        return { ok: true, messageId: info.messageId, host: candidateHost };
      } catch (err) {
        lastError = err.message;
        console.warn(`[EmailScheduler] Nodemailer (${candidateHost}) failed (${err.message}), trying raw SMTP...`);
      }
    }

    // 2. Fallback to native raw SMTP
    try {
      const res = await sendViaRawSmtp(activeCfg, { subject, html, text });
      console.log(`[EmailScheduler] ✓ Sent via raw SMTP (${candidateHost}:${activeCfg.port}): "${subject}" → ${res.messageId}`);
      return { ok: true, messageId: res.messageId, host: candidateHost };
    } catch (rawErr) {
      lastError = rawErr.message;
      console.warn(`[EmailScheduler] Raw SMTP delivery failed for ${candidateHost}:`, rawErr.message);
    }
  }

  console.error('[EmailScheduler] All SMTP delivery attempts failed:', lastError);
  return { ok: false, error: lastError || 'SMTP delivery failed', host: cfg.host };
}

// ─── Calculator engine import ─────────────────────────────────────────────────
const path = require('path');
let calculator = null;
try {
  calculator = require('../../../core/billing/calculator');
} catch (e1) {
  try {
    calculator = require(path.join(__dirname, '../../../core/billing/calculator'));
  } catch (e2) {
    console.warn('[EmailScheduler] Could not load calculator:', e2.message);
  }
}

// ─── HTML email shell (Light, Ultra-Beautiful & Responsive) ──────────────────
function wrapEmail({ title, badge, badgeColor = '#0071e3', body }) {
  const now = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<title>${title}</title>
<style>
  /* Base reset */
  body, table, td, p, a, li, blockquote {
    -webkit-text-size-adjust: 100%;
    -ms-text-size-adjust: 100%;
    margin: 0;
    padding: 0;
  }
  body {
    background-color: #f4f5f8;
    color: #1f2328;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.5;
    margin: 0;
    padding: 0;
    width: 100% !important;
  }
  .wrapper {
    max-width: 600px;
    margin: 0 auto;
    padding: 24px 16px 40px;
  }
  /* Header Card */
  .header-card {
    background: #ffffff;
    border: 1px solid #e1e4e8;
    border-radius: 16px;
    padding: 24px 28px;
    margin-bottom: 18px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
  }
  .brand-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }
  .brand-title {
    font-size: 14px;
    font-weight: 700;
    color: #374151;
    letter-spacing: -0.2px;
  }
  .badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 3px 10px;
    border-radius: 20px;
    background: ${badgeColor}15;
    color: ${badgeColor};
    border: 1px solid ${badgeColor}35;
  }
  .main-title {
    font-size: 24px;
    font-weight: 800;
    color: #111827;
    letter-spacing: -0.5px;
    line-height: 1.25;
    margin-top: 4px;
  }
  .meta-sub {
    font-size: 12px;
    color: #6b7280;
    margin-top: 4px;
  }
  /* Standard Content Card */
  .card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    padding: 20px 22px;
    margin-bottom: 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  }
  .card-header {
    font-size: 12px;
    font-weight: 700;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  /* Responsive KPI Grid */
  .kpi-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 10px;
    margin: -10px;
  }
  .kpi-cell {
    width: 50%;
    background: #f9fafb;
    border: 1px solid #f3f4f6;
    border-radius: 10px;
    padding: 14px 16px;
    vertical-align: top;
  }
  .kpi-label {
    font-size: 11px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-bottom: 4px;
  }
  .kpi-val {
    font-size: 22px;
    font-weight: 800;
    color: #111827;
    letter-spacing: -0.5px;
  }
  .blue { color: #0284c7; }
  .green { color: #16a34a; }
  .amber { color: #d97706; }
  .red { color: #dc2626; }
  .stat-row {
    padding: 10px 0;
    border-bottom: 1px solid #f3f4f6;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .stat-row:last-child { border-bottom: none; }
  .stat-label { font-size: 13px; color: #4b5563; }
  .stat-value { font-size: 14px; font-weight: 700; color: #111827; }
  /* Clean Data Table */
  .table-responsive {
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .data-table th {
    background: #f9fafb;
    font-size: 11px;
    font-weight: 700;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 10px 10px;
    border-bottom: 1px solid #e5e7eb;
    text-align: left;
  }
  .data-table td {
    padding: 10px 10px;
    color: #374151;
    border-bottom: 1px solid #f3f4f6;
    vertical-align: middle;
  }
  .data-table tr:last-child td { border-bottom: none; }
  .data-table tr:nth-child(even) td { background-color: #fafbfc; }
  /* Alert Box */
  .alert-box {
    border-radius: 12px;
    padding: 14px 18px;
    margin-bottom: 16px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.5;
  }
  .alert-warning {
    background: #fffbeb;
    border: 1px solid #fde68a;
    color: #92400e;
  }
  .alert-danger {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #991b1b;
  }
  .alert-success {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
  }
  /* Badges */
  .pill {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 12px;
    letter-spacing: 0.3px;
  }
  .pill-red { background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; }
  .pill-amber { background: #fef3c7; color: #d97706; border: 1px solid #fcd34d; }
  .pill-blue { background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; }
  .pill-green { background: #dcfce7; color: #16a34a; border: 1px solid #bbf7d0; }
  .btn-link {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    color: #0071e3;
    text-decoration: none;
    padding: 4px 10px;
    border-radius: 6px;
    background: #eef2ff;
    white-space: nowrap;
  }
  .footer {
    text-align: center;
    font-size: 12px;
    color: #9ca3af;
    margin-top: 28px;
    line-height: 1.6;
  }
  /* Mobile reflow */
  @media only screen and (max-width: 580px) {
    .wrapper { padding: 12px 10px 30px; }
    .header-card { padding: 18px 20px; }
    .card { padding: 16px 14px; }
    .main-title { font-size: 20px; }
    .kpi-table { display: block; border-spacing: 0; margin: 0; }
    .kpi-table tbody, .kpi-table tr { display: block; }
    .kpi-cell { display: block; width: 100% !important; margin-bottom: 8px; box-sizing: border-box; }
    .data-table th, .data-table td { padding: 8px 6px; font-size: 12px; }
  }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header-card">
    <div class="brand-row">
      <span class="brand-title">🖥️ MacOS Business Suite</span>
      <span class="badge">${badge}</span>
    </div>
    <div class="main-title">${title}</div>
    <div class="meta-sub">Generated on ${now} IST</div>
  </div>
  ${body}
  <div class="footer">
    MacOS Business Suite &bull; Automated Enterprise Briefing<br/>
    <span style="font-size:11px;color:#9ca3af;">Delivered locally via Stalwart Mail Server &bull; Do not reply to this email</span>
  </div>
</div>
</body>
</html>`;
}

// ─── CANONICAL BILLING & ORDER QUERIES ─────────────────────────────────────────

function queryBusinessMetrics(db) {
  if (calculator && typeof calculator.calculateDashboardMetrics === 'function') {
    try {
      return calculator.calculateDashboardMetrics(db, null, { preset: 'all' });
    } catch (e) {
      console.warn('[EmailScheduler] calculateDashboardMetrics error:', e.message);
    }
  }
  return null;
}

function querySales(db, days = 7) {
  return db.prepare(`
    SELECT
      COALESCE(SUM(grand_total), 0) AS total_invoiced,
      COUNT(*) AS invoice_count,
      COALESCE((SELECT SUM(amount) FROM payments WHERE type='PAYMENT'
                AND created_at >= datetime('now', '-${days} days')), 0) AS payments_collected,
      COALESCE((SELECT SUM(credit_amount) FROM payments WHERE type='CREDIT_NOTE'
                AND created_at >= datetime('now', '-${days} days')), 0) AS credits_issued
    FROM invoices
    WHERE created_at >= datetime('now', '-${days} days')
  `).get() || {};
}

function queryDailySales(db) {
  return db.prepare(`
    SELECT
      COALESCE(SUM(grand_total), 0) AS total_invoiced,
      COUNT(*) AS invoice_count,
      COALESCE((SELECT SUM(amount) FROM payments WHERE type='PAYMENT' AND date(created_at, '+5 hours', '+30 minutes') = date('now', '+5 hours', '+30 minutes')), 0) AS payments_collected
    FROM invoices
    WHERE date(created_at, '+5 hours', '+30 minutes') = date('now', '+5 hours', '+30 minutes')
  `).get() || {};
}

function queryReceivablesAndAging(db) {
  const metrics = queryBusinessMetrics(db);
  if (metrics) {
    const totalDue = Number(metrics.keyMetrics?.amountDue || 0);
    const aging = metrics.receivablesAging || {};
    const top5 = (metrics.topCustomers || [])
      .filter(c => Number(c.dueBalance || c.current_due || 0) > 0.01)
      .slice(0, 5)
      .map(c => {
        const contact = db.prepare(`SELECT phone, ledger_token FROM contacts WHERE id = ?`).get(c.id) || {};
        return {
          name: c.name,
          current_due: Number(c.dueBalance || c.current_due || 0),
          phone: contact.phone,
          ledger_token: contact.ledger_token
        };
      });

    // Fallback if topCustomers didn't have dueBalance:
    let topCustomers = top5;
    if (topCustomers.length === 0) {
      const unsettled = queryOverdueInvoices(db, 0);
      const custTotals = {};
      for (const inv of unsettled) {
        if (!custTotals[inv.cust]) {
          custTotals[inv.cust] = { name: inv.cust, current_due: 0, phone: inv.phone, ledger_token: inv.ledger_token };
        }
        custTotals[inv.cust].current_due += inv.balance;
      }
      topCustomers = Object.values(custTotals).sort((a, b) => b.current_due - a.current_due).slice(0, 5);
    }

    return {
      total: totalDue,
      billed: Number(metrics.keyMetrics?.totalBilled || 0),
      collected: Number(metrics.keyMetrics?.totalCollected || 0),
      collectionRate: Number(metrics.keyMetrics?.collectionRatePercent || 0),
      over30: Number(metrics.keyMetrics?.overdueAmount || 0),
      aging0to30: Number(aging.outstanding0to30 || 0),
      aging31to60: Number(aging.outstanding31to60 || 0),
      aging61Plus: Number(aging.outstanding61Plus || 0),
      top5: topCustomers
    };
  }

  // Pure SQL fallback if calculator module is not found:
  const unsettled = queryOverdueInvoices(db, 0);
  const totalDue = unsettled.reduce((sum, inv) => sum + inv.balance, 0);
  const over30 = unsettled.filter(inv => inv.age > 30).reduce((sum, inv) => sum + inv.balance, 0);
  const over60 = unsettled.filter(inv => inv.age > 60).reduce((sum, inv) => sum + inv.balance, 0);

  const custTotals = {};
  for (const inv of unsettled) {
    if (!custTotals[inv.cust]) {
      custTotals[inv.cust] = { name: inv.cust, current_due: 0, phone: inv.phone, ledger_token: inv.ledger_token };
    }
    custTotals[inv.cust].current_due += inv.balance;
  }
  const top5 = Object.values(custTotals).sort((a, b) => b.current_due - a.current_due).slice(0, 5);

  return {
    total: totalDue,
    billed: 0,
    collected: 0,
    collectionRate: 0,
    over30,
    aging0to30: Math.max(0, totalDue - over30),
    aging31to60: Math.max(0, over30 - over60),
    aging61Plus: over60,
    top5
  };
}

/**
 * Only returns genuinely UNSETTLED invoices (remaining balance > 0.01 via FIFO).
 * Excludes fully paid/settled invoices!
 */
function queryOverdueInvoices(db, daysThreshold = 0) {
  const allContacts = db.prepare(`SELECT id, name, phone, ledger_token, opening_balance, exclude_from_stats FROM contacts WHERE exclude_from_stats = 0`).all();
  const allInvoices = db.prepare(`
    SELECT i.id, i.invoice_no, i.customer_id, c.name AS cust, c.phone, c.ledger_token,
           COALESCE(i.invoice_date, i.created_at) AS invoice_date, i.grand_total
    FROM invoices i
    JOIN contacts c ON i.customer_id = c.id
    WHERE c.exclude_from_stats = 0
    ORDER BY COALESCE(i.invoice_date, i.created_at) ASC
  `).all();
  const allPayments = db.prepare(`SELECT * FROM payments ORDER BY COALESCE(payment_date, created_at) ASC`).all();

  let billBalances = {};
  if (calculator && typeof calculator.calculateBillSettlement === 'function') {
    try {
      billBalances = calculator.calculateBillSettlement(allInvoices, allPayments, allContacts);
    } catch (e) {
      console.warn('[EmailScheduler] calculateBillSettlement fallback:', e.message);
    }
  }

  const now = Date.now();
  const overdueList = [];

  for (const inv of allInvoices) {
    const remaining = billBalances[inv.id] !== undefined ? billBalances[inv.id] : inv.grand_total;
    // CRITICAL: Only include unsettled invoices!
    if (remaining > 0.01) {
      const invDate = new Date(inv.invoice_date);
      const ageDays = isNaN(invDate.getTime()) ? 0 : Math.max(0, Math.floor((now - invDate.getTime()) / 86400000));
      if (ageDays >= daysThreshold) {
        overdueList.push({
          id: inv.id,
          invoice_no: inv.invoice_no,
          invoice_date: inv.invoice_date,
          grand_total: inv.grand_total,
          balance: Number(remaining.toFixed(2)),
          cust: inv.cust,
          phone: inv.phone,
          ledger_token: inv.ledger_token,
          age: ageDays
        });
      }
    }
  }

  overdueList.sort((a, b) => b.age - a.age);
  return overdueList;
}

/**
 * Only returns genuinely PENDING orders (current_stage in stage1, stage2 and not completed/delivered).
 * Excludes stage3 (delivered/billed) and completed/cancelled orders!
 */
function queryPendingOrders(db, daysThreshold = 0) {
  const pendingOrders = db.prepare(`
    SELECT o.id, o.order_number, o.customer_id, c.name AS cust, c.phone,
           o.current_stage, o.status, o.total_amount,
           COALESCE(o.order_date, o.created_at) AS order_date
    FROM orders o
    LEFT JOIN contacts c ON o.customer_id = c.id
    WHERE (o.status IS NULL OR o.status NOT IN ('complete', 'delivered', 'cancelled', 'settled'))
      AND (o.current_stage IN ('stage1', 'stage2') OR o.current_stage IS NULL)
    ORDER BY COALESCE(o.order_date, o.created_at) ASC
  `).all();

  const now = Date.now();
  const result = [];

  for (const ord of pendingOrders) {
    const ordDate = new Date(ord.order_date);
    const ageDays = isNaN(ordDate.getTime()) ? 0 : Math.max(0, Math.floor((now - ordDate.getTime()) / 86400000));
    if (ageDays >= daysThreshold) {
      result.push({
        id: ord.id,
        order_number: ord.order_number,
        cust: ord.cust || 'Direct Customer',
        phone: ord.phone,
        current_stage: ord.current_stage || 'stage1',
        status: ord.status || 'pending',
        total_amount: Number(ord.total_amount || 0),
        order_date: ord.order_date,
        age: ageDays
      });
    }
  }

  result.sort((a, b) => b.age - a.age);
  return result;
}

function queryOrderSummary(db) {
  const pending = queryPendingOrders(db, 0);
  const s1 = pending.filter(o => o.current_stage === 'stage1').length;
  const s2 = pending.filter(o => o.current_stage === 'stage2').length;
  const pipeline = pending.reduce((sum, o) => sum + (o.total_amount || 0), 0);

  const fulfilledRow = db.prepare(`
    SELECT COUNT(*) as count FROM orders
    WHERE status IN ('complete', 'delivered') OR current_stage = 'stage3'
  `).get();

  return {
    total: pending.length,
    s1,
    s2,
    pipeline,
    fulfilledCount: fulfilledRow ? fulfilledRow.count : 0
  };
}

function queryLowStock(db) {
  return db.prepare(`
    SELECT p.name, v.pack_size_value, v.pack_size_type, b.batch_no, b.units_sold, b.exp_date
    FROM batches b
    JOIN variants v ON v.id = b.variant_id
    JOIN products p ON p.id = v.product_id
    WHERE b.units_sold < 10
    ORDER BY b.units_sold ASC
    LIMIT 20
  `).all();
}

// ─── EMAIL TEMPLATE BUILDERS ──────────────────────────────────────────────────

function buildWeeklySummary(db) {
  const company = getSetting(db, 'email_company_name', getSetting(db, 'company_name', 'Your Business'));
  const portal  = getSetting(db, 'email_portal_url', getSetting(db, 'portal_base_url', 'https://mac.faizal.uk'));
  const sales   = querySales(db, 7);
  const aging   = queryReceivablesAndAging(db);
  const orders  = queryOrderSummary(db);

  const top5rows = (aging.top5 || []).map(c => {
    const ledger = c.ledger_token ? `<a href="${portal}/ledger/${c.ledger_token}" class="btn-link" target="_blank">View Ledger →</a>` : '—';
    const ph = c.phone ? `<br/><span style="color:#6b7280;font-size:11px;">${c.phone}</span>` : '';
    return `<tr>
      <td><strong>${c.name}</strong>${ph}</td>
      <td style="color:#dc2626;font-weight:700;">${inr(c.current_due)}</td>
      <td style="text-align:right;">${ledger}</td>
    </tr>`;
  }).join('');

  const body = `
    <!-- KPI Row -->
    <div class="card">
      <div class="card-header">📊 7-Day Performance & Receivables</div>
      <table class="kpi-table" cellpadding="0" cellspacing="0">
        <tr>
          <td class="kpi-cell">
            <div class="kpi-label">Gross Invoiced</div>
            <div class="kpi-val blue">${inr(sales.total_invoiced)}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">${sales.invoice_count || 0} Invoices Raised</div>
          </td>
          <td class="kpi-cell">
            <div class="kpi-label">Payments Collected</div>
            <div class="kpi-val green">${inr(sales.payments_collected)}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">Credits: ${inr(sales.credits_issued)}</div>
          </td>
        </tr>
        <tr>
          <td class="kpi-cell">
            <div class="kpi-label">Total Outstanding</div>
            <div class="kpi-val red">${inr(aging.total)}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">Actual Customer Due</div>
          </td>
          <td class="kpi-cell">
            <div class="kpi-label">Collection Rate</div>
            <div class="kpi-val green">${aging.collectionRate || 100}%</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">Overall Inflow Ratio</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Receivables Aging Card -->
    <div class="card">
      <div class="card-header">💳 Receivables Aging Analysis</div>
      <div class="stat-row">
        <span class="stat-label">Current (0 – 30 Days)</span>
        <span class="stat-value blue">${inr(aging.aging0to30)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Overdue (31 – 60 Days)</span>
        <span class="stat-value amber">${inr(aging.aging31to60)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Critical (61+ Days)</span>
        <span class="stat-value red">${inr(aging.aging61Plus)}</span>
      </div>
      <div class="stat-row" style="background:#fafbfc;margin:8px -22px -20px;padding:12px 22px;border-top:1px solid #e5e7eb;border-bottom-left-radius:14px;border-bottom-right-radius:14px;">
        <span class="stat-label" style="font-weight:700;color:#111827;">Total Outstanding Debt</span>
        <span class="stat-value red" style="font-size:16px;">${inr(aging.total)}</span>
      </div>
    </div>

    <!-- Top Outstanding Customers -->
    ${top5rows ? `
    <div class="card">
      <div class="card-header">🏆 Top Outstanding Receivables</div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Due Balance</th>
              <th style="text-align:right;">Ledger</th>
            </tr>
          </thead>
          <tbody>
            ${top5rows}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <!-- Active Orders Pipeline -->
    <div class="card">
      <div class="card-header">📦 Orders Pipeline Status</div>
      <table class="kpi-table" cellpadding="0" cellspacing="0">
        <tr>
          <td class="kpi-cell">
            <div class="kpi-label">Pending Orders</div>
            <div class="kpi-val amber">${orders.total || 0}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">In Production Pipeline</div>
          </td>
          <td class="kpi-cell">
            <div class="kpi-label">Pipeline Value</div>
            <div class="kpi-val blue">${inr(orders.pipeline)}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">Awaiting Dispatch</div>
          </td>
        </tr>
      </table>
      <div style="margin-top:14px;">
        <div class="stat-row">
          <span class="stat-label">📦 Stage 1: Order Packing</span>
          <span class="stat-value amber">${orders.s1 || 0} Orders</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">✅ Stage 2: Ready for Dispatch</span>
          <span class="stat-value green">${orders.s2 || 0} Orders</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">🚚 Fulfilled / Delivered</span>
          <span class="stat-value blue">${orders.fulfilledCount || 0} Orders</span>
        </div>
      </div>
    </div>`;

  return {
    subject: `📊 Weekly Business Digest — ${company}`,
    html: wrapEmail({ title: `Weekly Executive Briefing — ${company}`, badge: 'Weekly Summary', badgeColor: '#0071e3', body }),
    text: `Weekly Executive Briefing\nGross Invoiced: ${inr(sales.total_invoiced)}\nPayments Collected: ${inr(sales.payments_collected)}\nTotal Outstanding: ${inr(aging.total)}\nPending Orders: ${orders.total}`,
  };
}

function buildDailySummary(db) {
  const company = getSetting(db, 'email_company_name', getSetting(db, 'company_name', 'Your Business'));
  const sales   = queryDailySales(db);
  const aging   = queryReceivablesAndAging(db);
  const orders  = queryOrderSummary(db);

  const body = `
    <!-- Today's Activity KPI -->
    <div class="card">
      <div class="card-header">☀️ Today's Business Activity</div>
      <table class="kpi-table" cellpadding="0" cellspacing="0">
        <tr>
          <td class="kpi-cell">
            <div class="kpi-label">Today's Invoiced</div>
            <div class="kpi-val blue">${inr(sales.total_invoiced)}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">${sales.invoice_count || 0} Bills Raised Today</div>
          </td>
          <td class="kpi-cell">
            <div class="kpi-label">Collected Today</div>
            <div class="kpi-val green">${inr(sales.payments_collected)}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">Cash / Bank Inflow</div>
          </td>
        </tr>
        <tr>
          <td class="kpi-cell">
            <div class="kpi-label">Total Outstanding</div>
            <div class="kpi-val red">${inr(aging.total)}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">Live Ledger Debt</div>
          </td>
          <td class="kpi-cell">
            <div class="kpi-label">Active Orders</div>
            <div class="kpi-val amber">${orders.total || 0}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">Value: ${inr(orders.pipeline)}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Active Pipeline Card -->
    <div class="card">
      <div class="card-header">📦 Order Fulfillment Status</div>
      <div class="stat-row">
        <span class="stat-label">📦 Stage 1: Order Packing</span>
        <span class="stat-value amber">${orders.s1 || 0}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">✅ Stage 2: Quality Checked & Ready</span>
        <span class="stat-value green">${orders.s2 || 0}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">💰 Unfulfilled Pipeline Value</span>
        <span class="stat-value blue">${inr(orders.pipeline)}</span>
      </div>
    </div>`;

  return {
    subject: `☀️ Daily Business Briefing — ${company}`,
    html: wrapEmail({ title: `Daily Briefing — ${company}`, badge: 'Daily Briefing', badgeColor: '#16a34a', body }),
    text: `Daily Briefing\nToday's Invoiced: ${inr(sales.total_invoiced)}\nCollected Today: ${inr(sales.payments_collected)}\nTotal Outstanding: ${inr(aging.total)}\nActive Orders: ${orders.total}`,
  };
}

function buildInvoiceOverdue(db, days) {
  const portal   = getSetting(db, 'email_portal_url', getSetting(db, 'portal_base_url', 'https://mac.faizal.uk'));
  const invoices = queryOverdueInvoices(db, days);
  if (!invoices.length) return null;

  const total = invoices.reduce((s, i) => s + (i.balance || 0), 0);
  const color = days >= 30 ? '#dc2626' : (days >= 14 ? '#ea580c' : '#d97706');
  const alertCls = days >= 30 ? 'alert-danger' : 'alert-warning';
  const icon  = days >= 30 ? '🚨' : '⚠️';

  const rows = invoices.map(i => {
    const ledger = i.ledger_token
      ? `<a href="${portal}/ledger/${i.ledger_token}" class="btn-link" target="_blank">Ledger →</a>`
      : '—';
    const ph = i.phone ? `<br/><span style="color:#6b7280;font-size:11px;">${i.phone}</span>` : '';
    const pillCls = days >= 30 ? 'pill-red' : (days >= 14 ? 'pill-amber' : 'pill-blue');
    const billDate = i.invoice_date ? new Date(i.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    return `<tr>
      <td><strong>${i.cust}</strong>${ph}</td>
      <td><span style="font-family:monospace;font-weight:600;">${i.invoice_no}</span></td>
      <td>${billDate}</td>
      <td style="color:#6b7280;">${inr(i.grand_total)}</td>
      <td style="color:#dc2626;font-weight:700;">${inr(i.balance)}</td>
      <td><span class="pill ${pillCls}">${i.age}d</span></td>
      <td style="text-align:right;">${ledger}</td>
    </tr>`;
  }).join('');

  const body = `
    <div class="alert-box ${alertCls}">
      <span style="font-size:18px;margin-right:6px;">${icon}</span>
      <strong>${invoices.length} invoice${invoices.length !== 1 ? 's' : ''} unsettled for ${days}+ days</strong>
      &bull; Total outstanding collection due: <strong>${inr(total)}</strong>
    </div>

    <div class="card">
      <div class="card-header">📋 Overdue Invoices Requiring Follow-Up (${days}+ Days)</div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Bill #</th>
              <th>Date</th>
              <th>Billed</th>
              <th>Balance Due</th>
              <th>Age</th>
              <th style="text-align:right;">Ledger</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>`;

  return {
    subject: `${icon} ${invoices.length} Invoice${invoices.length !== 1 ? 's' : ''} Overdue ${days}+ Days — ${inr(total)} Pending Collection`,
    html: wrapEmail({ title: `Invoices Overdue ${days}+ Days`, badge: `${days}-Day Overdue Alert`, badgeColor: color, body }),
    text: `${invoices.length} invoices unsettled ${days}+ days. Total overdue: ${inr(total)}`,
  };
}

function buildOrderPending(db, days) {
  const orders = queryPendingOrders(db, days);
  if (!orders.length) return null;

  const totalValue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const stageLabels = {
    stage1: '<span class="pill pill-amber">📦 Stage 1: Packing</span>',
    stage2: '<span class="pill pill-green">✅ Stage 2: Ready for Dispatch</span>',
  };

  const rows = orders.map(o => {
    const ph = o.phone ? `<br/><span style="color:#6b7280;font-size:11px;">${o.phone}</span>` : '';
    const ordDate = o.order_date ? new Date(o.order_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    return `<tr>
      <td><strong>${o.order_number}</strong></td>
      <td><strong>${o.cust}</strong>${ph}</td>
      <td>${ordDate}</td>
      <td>${stageLabels[o.current_stage] || o.current_stage}</td>
      <td><span class="pill pill-amber">${o.age}d</span></td>
      <td style="color:#111827;font-weight:700;">${inr(o.total_amount)}</td>
    </tr>`;
  }).join('');

  const body = `
    <div class="alert-box alert-warning">
      <span style="font-size:18px;margin-right:6px;">⏳</span>
      <strong>${orders.length} order${orders.length !== 1 ? 's' : ''} in pipeline for ${days}+ days</strong>
      &bull; Total pending dispatch value: <strong>${inr(totalValue)}</strong>
    </div>

    <div class="card">
      <div class="card-header">📦 Pending Orders Requiring Processing (${days}+ Days Old)</div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th>Order Date</th>
              <th>Current Stage</th>
              <th>Age</th>
              <th>Order Value</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>`;

  return {
    subject: `⏳ ${orders.length} Order${orders.length !== 1 ? 's' : ''} Pending ${days}+ Days — Action Required`,
    html: wrapEmail({ title: `Pending Orders (${days}+ Days)`, badge: `${days}-Day Order Notice`, badgeColor: '#d97706', body }),
    text: `${orders.length} orders pending ${days}+ days. Total value: ${inr(totalValue)}`,
  };
}

function buildLowStock(db) {
  const items = queryLowStock(db);
  if (!items.length) return null;

  const rows = items.map(i => `<tr>
    <td><strong>${i.name}</strong></td>
    <td>${i.pack_size_value} ${i.pack_size_type}</td>
    <td><span style="font-family:monospace;">${i.batch_no}</span></td>
    <td style="color:#dc2626;font-weight:700;">${i.units_sold} sold</td>
    <td>${i.exp_date ? new Date(i.exp_date).toLocaleDateString('en-IN') : '—'}</td>
  </tr>`).join('');

  const body = `
    <div class="alert-box alert-danger">
      <span style="font-size:18px;margin-right:6px;">📉</span>
      <strong>${items.length} product item${items.length !== 1 ? 's' : ''} with critical inventory</strong> &bull; Review stock & production.
    </div>

    <div class="card">
      <div class="card-header">📉 Low Stock Inventory Alerts</div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Product Name</th>
              <th>Pack Size</th>
              <th>Batch</th>
              <th>Units Sold</th>
              <th>Expiry</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>`;

  return {
    subject: `📉 Low Stock Notice — ${items.length} Item${items.length !== 1 ? 's' : ''} Need Restocking`,
    html: wrapEmail({ title: 'Low Stock Alert', badge: 'Inventory Alert', badgeColor: '#dc2626', body }),
    text: `${items.length} low-stock items detected.`,
  };
}

// ─── SCHEDULER CLASS ──────────────────────────────────────────────────────────

class EmailReminderScheduler {
  constructor(db) {
    this.db = db;
    this._timer = null;
    this._fired = new Set(); // 'key:YYYY-MM-DD' dedup — prevents double-fire within same day

    this._timer = setInterval(() => this._tick(), 60 * 1000);
    console.log('[EmailScheduler] ✅ Initialized — polling every 60s (IST clock-based)');
  }

  destroy() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    console.log('[EmailScheduler] Stopped.');
  }

  _todayStr() {
    const d = nowIST();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }

  _shouldFire(name, hhMM) {
    const key = `${name}:${this._todayStr()}`;
    if (this._fired.has(key)) return false;
    return istHHMM() === hhMM;
  }

  _markFired(name) {
    // Clean up stale keys (previous days) to keep Set small
    const today = this._todayStr();
    for (const k of this._fired) { if (!k.endsWith(`:${today}`)) this._fired.delete(k); }
    this._fired.add(`${name}:${today}`);
  }

  async _tick() {
    const db = this.db;
    if (!isEnabled(db, 'email_reminders_enabled')) return;

    const tasks = [];
    const t = istHHMM();

    // 1. Daily Summary
    if (isEnabled(db, 'email_daily_summary_enabled')) {
      const at = getSetting(db, 'email_daily_summary_time', '08:00');
      if (this._shouldFire('daily', at) && t === at) {
        this._markFired('daily');
        tasks.push(() => sendEmail(db, buildDailySummary(db)));
      }
    }

    // 2. Weekly Summary
    if (isEnabled(db, 'email_weekly_summary_enabled')) {
      const at  = getSetting(db, 'email_weekly_summary_time', '09:00');
      const day = parseInt(getSetting(db, 'email_weekly_summary_day', '1'), 10);
      if (istDay() === day && this._shouldFire('weekly', at) && t === at) {
        this._markFired('weekly');
        tasks.push(() => sendEmail(db, buildWeeklySummary(db)));
      }
    }

    // 3. Invoice Overdue Checks
    const invTime = getSetting(db, 'email_invoice_check_time', '10:00');
    if (isEnabled(db, 'email_invoice_7d_enabled')  && this._shouldFire('inv7d',  invTime) && t === invTime) {
      this._markFired('inv7d');
      tasks.push(async () => { const m = buildInvoiceOverdue(db, 7);  if (m) await sendEmail(db, m); });
    }
    if (isEnabled(db, 'email_invoice_14d_enabled') && this._shouldFire('inv14d', invTime) && t === invTime) {
      this._markFired('inv14d');
      tasks.push(async () => { const m = buildInvoiceOverdue(db, 14); if (m) await sendEmail(db, m); });
    }
    if (isEnabled(db, 'email_invoice_30d_enabled') && this._shouldFire('inv30d', invTime) && t === invTime) {
      this._markFired('inv30d');
      tasks.push(async () => { const m = buildInvoiceOverdue(db, 30); if (m) await sendEmail(db, m); });
    }

    // 4. Order Pending Checks
    const ordTime = getSetting(db, 'email_order_check_time', '10:30');
    if (isEnabled(db, 'email_order_3d_enabled') && this._shouldFire('ord3d', ordTime) && t === ordTime) {
      this._markFired('ord3d');
      tasks.push(async () => { const m = buildOrderPending(db, 3); if (m) await sendEmail(db, m); });
    }
    if (isEnabled(db, 'email_order_7d_enabled') && this._shouldFire('ord7d', ordTime) && t === ordTime) {
      this._markFired('ord7d');
      tasks.push(async () => { const m = buildOrderPending(db, 7); if (m) await sendEmail(db, m); });
    }

    // 5. Low Stock Alert
    if (isEnabled(db, 'email_low_stock_enabled')) {
      const lstTime = getSetting(db, 'email_low_stock_check_time', '07:00');
      if (this._shouldFire('lowstock', lstTime) && t === lstTime) {
        this._markFired('lowstock');
        tasks.push(async () => { const m = buildLowStock(db); if (m) await sendEmail(db, m); });
      }
    }

    for (const task of tasks) {
      try { await task(); } catch (err) { console.error('[EmailScheduler] Task error:', err.message); }
    }
  }

  // ── Manual triggers (called from API endpoints) ──────────────────────────
  async triggerDaily() {
    const res = await sendEmail(this.db, buildDailySummary(this.db));
    return res && res.ok;
  }
  async triggerWeekly() {
    const res = await sendEmail(this.db, buildWeeklySummary(this.db));
    return res && res.ok;
  }
  async triggerInvoiceOverdue(days) {
    const m = buildInvoiceOverdue(this.db, days);
    if (!m) return false;
    const res = await sendEmail(this.db, m);
    return res && res.ok;
  }
  async triggerOrderPending(days) {
    const m = buildOrderPending(this.db, days);
    if (!m) return false;
    const res = await sendEmail(this.db, m);
    return res && res.ok;
  }
  async triggerLowStock() {
    const m = buildLowStock(this.db);
    if (!m) return false;
    const res = await sendEmail(this.db, m);
    return res && res.ok;
  }

  async testSmtp() {
    const cfg = getSmtpConfig(this.db);
    if (!cfg.to) return { ok: false, error: 'No recipient email address configured. Please set a recipient in Settings.' };
    const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const msg = {
      subject: '✅ MacOS Suite — Stalwart Email Test',
      text: `MacOS Suite email test — SMTP is working. Sent via ${cfg.host}:${cfg.port} (${cfg.user || 'no auth'}) at ${now} IST.`,
      html: wrapEmail({
        title: 'Email Delivery Test', badge: 'Stalwart Mail Active', badgeColor: '#16a34a',
        body: `<div class="card">
          <div class="alert-box alert-success" style="margin-bottom:16px;">
            <span style="font-size:20px;margin-right:6px;">✅</span>
            <div>
              <strong>SMTP connection to Stalwart Mail succeeded!</strong>
              <div style="font-size:12px;margin-top:2px;color:#166534;">Mail server is fully authenticated and ready for scheduled dispatch.</div>
            </div>
          </div>
          <div class="card-header">📡 Connection Diagnostics</div>
          <div class="stat-row">
            <span class="stat-label">Server Host & Port</span>
            <span class="stat-value blue">${cfg.host}:${cfg.port} (${cfg.secure ? 'SMTPS 465' : 'STARTTLS 587'})</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Authenticated Account</span>
            <span class="stat-value">${cfg.user || 'anonymous'}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Sender Address</span>
            <span class="stat-value">${cfg.from}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Recipient Address</span>
            <span class="stat-value green">${cfg.to}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Delivered At</span>
            <span class="stat-value">${now} IST</span>
          </div>
          <div style="margin-top:16px;padding:12px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;font-size:12px;color:#166534;line-height:1.5;">
            ✓ Automated daily executive briefings, weekly digests, and invoice/order overdue reminders will be delivered to this inbox.
          </div>
        </div>`,
      }),
    };
    try {
      const res = await sendEmail(this.db, msg);
      if (res && res.ok) {
        return { ok: true, host: res.host || cfg.host, port: cfg.port, recipient: cfg.to, messageId: res.messageId };
      }
      return { ok: false, error: res?.error || 'SMTP delivery failed', host: cfg.host, port: cfg.port, recipient: cfg.to };
    } catch (err) {
      return { ok: false, error: err.message, host: cfg.host, port: cfg.port, recipient: cfg.to };
    }
  }
}

module.exports = { EmailReminderScheduler };
