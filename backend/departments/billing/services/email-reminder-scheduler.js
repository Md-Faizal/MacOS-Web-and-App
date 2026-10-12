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

// ─── HTML email shell ─────────────────────────────────────────────────────────
function wrapEmail({ title, badge, badgeColor = '#0a84ff', body }) {
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata',
    weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#0d0d0f;color:#e5e5e7}
.wrap{max-width:640px;margin:0 auto;padding:24px 16px 48px}
.header{background:linear-gradient(135deg,#1c1c1e 0%,#2c2c2e 100%);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:28px 28px 20px;margin-bottom:20px}
.logo{font-size:22px;font-weight:700;color:#fff;letter-spacing:-.4px;margin-bottom:4px}
.badge{display:inline-block;font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;background:${badgeColor}22;color:${badgeColor};border:1px solid ${badgeColor}44;letter-spacing:.5px;text-transform:uppercase;margin-bottom:12px}
.title{font-size:26px;font-weight:700;color:#fff;letter-spacing:-.5px;line-height:1.2}
.subtitle{font-size:13px;color:#8e8e93;margin-top:6px}
.card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:20px;margin-bottom:16px}
.card-title{font-size:13px;font-weight:600;color:#8e8e93;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px}
.kpi-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.kpi{background:rgba(255,255,255,.05);border-radius:10px;padding:14px}
.kpi-label{font-size:11px;color:#8e8e93;margin-bottom:4px}
.kpi-val{font-size:22px;font-weight:700;color:#fff}
.green{color:#32d74b}.orange{color:#ff9f0a}.red{color:#ff453a}.blue{color:#0a84ff}
table{width:100%;border-collapse:collapse}
th{font-size:11px;font-weight:600;color:#8e8e93;text-transform:uppercase;letter-spacing:.5px;padding:6px 10px;text-align:left;border-bottom:1px solid rgba(255,255,255,.06)}
td{font-size:13px;color:#e5e5e7;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.04)}
tr:last-child td{border-bottom:none}
.pill{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;letter-spacing:.3px}
.pill-red{background:#ff453a22;color:#ff453a;border:1px solid #ff453a44}
.pill-orange{background:#ff9f0a22;color:#ff9f0a;border:1px solid #ff9f0a44}
.alert-box{background:rgba(255,69,58,.08);border:1px solid rgba(255,69,58,.3);border-radius:10px;padding:14px 16px;margin-bottom:12px}
.alert-box.warn{background:rgba(255,159,10,.08);border-color:rgba(255,159,10,.3)}
.stat-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.stat-row:last-child{border-bottom:none}
.sl{font-size:13px;color:#aeaeb2}.sv{font-size:14px;font-weight:600;color:#fff}
.footer{font-size:11px;color:#48484a;text-align:center;margin-top:28px;line-height:1.6}
a{color:#0a84ff;text-decoration:none}
@media(max-width:500px){.kpi-grid{grid-template-columns:1fr}}
</style></head><body>
<div class="wrap">
  <div class="header">
    <div class="logo">🖥️ MacOS Suite</div>
    <div class="badge">${badge}</div>
    <div class="title">${title}</div>
    <div class="subtitle">Generated ${now} IST</div>
  </div>
  ${body}
  <div class="footer">MacOS Business Suite &bull; Automated Report &bull; Do not reply.</div>
</div></body></html>`;
}

// ─── DATA QUERIES ─────────────────────────────────────────────────────────────

function querySales(db, period = '7 days') {
  return db.prepare(`
    SELECT
      COALESCE(SUM(grand_total),0)  AS total_invoiced,
      COUNT(*)                       AS invoice_count,
      COALESCE((SELECT SUM(amount) FROM payments WHERE type='PAYMENT'
                AND created_at >= datetime('now','-${period}')),0) AS payments_collected,
      COALESCE((SELECT SUM(credit_amount) FROM payments WHERE type='CREDIT_NOTE'
                AND created_at >= datetime('now','-${period}')),0) AS credits_issued
    FROM invoices WHERE created_at >= datetime('now','-${period}')
  `).get() || {};
}

function queryDailySales(db) {
  return db.prepare(`
    SELECT
      COALESCE(SUM(grand_total),0) AS total_invoiced,
      COUNT(*) AS invoice_count,
      COALESCE((SELECT SUM(amount) FROM payments WHERE type='PAYMENT' AND date(created_at)=date('now')),0) AS payments_collected
    FROM invoices WHERE date(created_at)=date('now')
  `).get() || {};
}

function queryAging(db) {
  const total = db.prepare(`SELECT COALESCE(SUM(current_due),0) AS v FROM ledger WHERE current_due>0`).get()?.v || 0;
  const over30 = db.prepare(`
    SELECT COALESCE(SUM(l.current_due),0) AS v FROM ledger l
    JOIN invoices i ON i.customer_id=l.customer_id
    WHERE l.current_due>0 AND i.invoice_date<=datetime('now','-30 days')
  `).get()?.v || 0;
  const over60 = db.prepare(`
    SELECT COALESCE(SUM(l.current_due),0) AS v FROM ledger l
    JOIN invoices i ON i.customer_id=l.customer_id
    WHERE l.current_due>0 AND i.invoice_date<=datetime('now','-60 days')
  `).get()?.v || 0;
  const top5 = db.prepare(`
    SELECT c.name, l.current_due, c.phone,
      (SELECT MAX(payment_date) FROM payments p WHERE p.customer_id=c.id AND p.type='PAYMENT') AS last_pay,
      c.ledger_token
    FROM ledger l JOIN contacts c ON c.id=l.customer_id
    WHERE l.current_due>0 AND c.exclude_from_stats=0
    ORDER BY l.current_due DESC LIMIT 5
  `).all();
  return { total, over30, over60, top5 };
}

function queryOverdueInvoices(db, days) {
  return db.prepare(`
    SELECT i.invoice_no, i.invoice_date, i.grand_total, c.name AS cust, c.phone, c.ledger_token,
      CAST(julianday('now')-julianday(i.invoice_date) AS INTEGER) AS age,
      i.grand_total - COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id=i.id AND p.type='PAYMENT'),0) AS balance
    FROM invoices i JOIN contacts c ON c.id=i.customer_id
    WHERE i.invoice_date<=datetime('now','-${days} days')
      AND i.grand_total - COALESCE((SELECT SUM(amount) FROM payments p2 WHERE p2.invoice_id=i.id AND p2.type='PAYMENT'),0) > 0.01
      AND c.exclude_from_stats=0
    ORDER BY age DESC LIMIT 50
  `).all();
}

function queryPendingOrders(db, days) {
  return db.prepare(`
    SELECT o.order_number, o.order_date, o.current_stage, o.total_amount,
      c.name AS cust, c.phone,
      CAST(julianday('now')-julianday(o.order_date) AS INTEGER) AS age
    FROM orders o JOIN contacts c ON c.id=o.customer_id
    WHERE o.status NOT IN ('delivered','cancelled')
      AND o.order_date<=datetime('now','-${days} days')
    ORDER BY age DESC LIMIT 30
  `).all();
}

function queryLowStock(db) {
  return db.prepare(`
    SELECT p.name, v.pack_size_value, v.pack_size_type, b.batch_no, b.units_sold, b.exp_date
    FROM batches b JOIN variants v ON v.id=b.variant_id JOIN products p ON p.id=v.product_id
    WHERE b.units_sold < 10 ORDER BY b.units_sold ASC LIMIT 20
  `).all();
}

function queryOrderSummary(db) {
  return db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN current_stage='stage1' THEN 1 ELSE 0 END) AS s1,
      SUM(CASE WHEN current_stage='stage2' THEN 1 ELSE 0 END) AS s2,
      SUM(CASE WHEN current_stage='stage3' THEN 1 ELSE 0 END) AS s3,
      COALESCE(SUM(total_amount),0) AS pipeline
    FROM orders WHERE status NOT IN ('delivered','cancelled')
  `).get() || {};
}

// ─── EMAIL BUILDERS ───────────────────────────────────────────────────────────

function buildWeeklySummary(db) {
  const company = getSetting(db, 'email_company_name', getSetting(db, 'company_name', 'Your Business'));
  const portal  = getSetting(db, 'email_portal_url',   getSetting(db, 'portal_base_url', 'https://mac.faizal.uk'));
  const sales   = querySales(db, '7 days');
  const aging   = queryAging(db);
  const orders  = queryOrderSummary(db);

  const top5rows = (aging.top5 || []).map(c => {
    const ledger = c.ledger_token ? `<a href="${portal}/ledger/${c.ledger_token}">View</a>` : '—';
    const last   = c.last_pay ? new Date(c.last_pay).toLocaleDateString('en-IN') : `<span style="color:#8e8e93">Never</span>`;
    const ph     = c.phone ? `<br/><span style="color:#8e8e93;font-size:11px">${c.phone}</span>` : '';
    return `<tr><td><strong>${c.name}</strong>${ph}</td><td style="color:#ff453a;font-weight:600">${inr(c.current_due)}</td><td>${last}</td><td>${ledger}</td></tr>`;
  }).join('');

  const body = `
    <div class="card">
      <div class="card-title">📊 Weekly Sales & Cash Flow (7 Days)</div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">Gross Invoiced</div><div class="kpi-val blue">${inr(sales.total_invoiced)}</div></div>
        <div class="kpi"><div class="kpi-label">Invoices Raised</div><div class="kpi-val">${sales.invoice_count||0}</div></div>
        <div class="kpi"><div class="kpi-label">Payments Collected</div><div class="kpi-val green">${inr(sales.payments_collected)}</div></div>
        <div class="kpi"><div class="kpi-label">Credits Issued</div><div class="kpi-val orange">${inr(sales.credits_issued)}</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">💳 Customer Receivables</div>
      <div class="stat-row"><span class="sl">Total Outstanding</span><span class="sv red">${inr(aging.total)}</span></div>
      <div class="stat-row"><span class="sl">Overdue &gt; 30 days</span><span class="sv orange">${inr(aging.over30)}</span></div>
      <div class="stat-row"><span class="sl">Overdue &gt; 60 days</span><span class="sv red">${inr(aging.over60)}</span></div>
    </div>
    ${top5rows ? `<div class="card"><div class="card-title">🏆 Top 5 Outstanding Customers</div>
      <table><thead><tr><th>Customer</th><th>Due</th><th>Last Payment</th><th>Ledger</th></tr></thead>
      <tbody>${top5rows}</tbody></table></div>` : ''}
    <div class="card">
      <div class="card-title">📦 Orders Pipeline</div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">Active Orders</div><div class="kpi-val">${orders.total||0}</div></div>
        <div class="kpi"><div class="kpi-label">Pipeline Value</div><div class="kpi-val blue">${inr(orders.pipeline)}</div></div>
        <div class="kpi"><div class="kpi-label">Packing (Stage 1)</div><div class="kpi-val orange">${orders.s1||0}</div></div>
        <div class="kpi"><div class="kpi-label">Ready (Stage 2)</div><div class="kpi-val green">${orders.s2||0}</div></div>
      </div>
    </div>`;

  return {
    subject: `📊 Weekly Business Summary — ${company}`,
    html: wrapEmail({ title: `Weekly Summary — ${company}`, badge: 'Weekly Digest', badgeColor: '#0a84ff', body }),
    text: `Weekly Summary\nGross Invoiced: ${inr(sales.total_invoiced)}\nCollected: ${inr(sales.payments_collected)}\nOutstanding: ${inr(aging.total)}`,
  };
}

function buildDailySummary(db) {
  const company = getSetting(db, 'email_company_name', getSetting(db, 'company_name', 'Your Business'));
  const sales   = queryDailySales(db);
  const aging   = queryAging(db);
  const orders  = queryOrderSummary(db);

  const body = `
    <div class="card">
      <div class="card-title">☀️ Today's Activity</div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">Today's Invoiced</div><div class="kpi-val blue">${inr(sales.total_invoiced)}</div></div>
        <div class="kpi"><div class="kpi-label">Invoices Raised</div><div class="kpi-val">${sales.invoice_count||0}</div></div>
        <div class="kpi"><div class="kpi-label">Payments Collected</div><div class="kpi-val green">${inr(sales.payments_collected)}</div></div>
        <div class="kpi"><div class="kpi-label">Total Outstanding</div><div class="kpi-val red">${inr(aging.total)}</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">📦 Orders Status</div>
      <div class="stat-row"><span class="sl">Active Orders</span><span class="sv">${orders.total||0}</span></div>
      <div class="stat-row"><span class="sl">Stage 1 — Packing</span><span class="sv orange">${orders.s1||0}</span></div>
      <div class="stat-row"><span class="sl">Stage 2 — Ready</span><span class="sv green">${orders.s2||0}</span></div>
      <div class="stat-row"><span class="sl">Stage 3 — In Transit</span><span class="sv blue">${orders.s3||0}</span></div>
      <div class="stat-row"><span class="sl">Pipeline Value</span><span class="sv">${inr(orders.pipeline)}</span></div>
    </div>`;

  return {
    subject: `☀️ Daily Briefing — ${company}`,
    html: wrapEmail({ title: `Daily Briefing — ${company}`, badge: 'Daily Summary', badgeColor: '#32d74b', body }),
    text: `Daily Briefing\nToday's Invoiced: ${inr(sales.total_invoiced)}\nOutstanding: ${inr(aging.total)}`,
  };
}

function buildInvoiceOverdue(db, days) {
  const portal   = getSetting(db, 'email_portal_url', getSetting(db, 'portal_base_url', 'https://mac.faizal.uk'));
  const invoices = queryOverdueInvoices(db, days);
  if (!invoices.length) return null;

  const total = invoices.reduce((s, i) => s + (i.balance || 0), 0);
  const color = days >= 30 ? '#ff453a' : '#ff9f0a';
  const icon  = days >= 30 ? '🚨' : '⚠️';

  const rows = invoices.map(i => {
    const ledger = i.ledger_token ? `<a href="${portal}/ledger/${i.ledger_token}">Ledger</a>` : '—';
    const ph = i.phone ? `<br/><span style="color:#8e8e93;font-size:11px">${i.phone}</span>` : '';
    const pillCls = days >= 30 ? 'pill-red' : 'pill-orange';
    return `<tr>
      <td><strong>${i.cust}</strong>${ph}</td>
      <td>${i.invoice_no}</td>
      <td>${i.invoice_date ? new Date(i.invoice_date).toLocaleDateString('en-IN') : ''}</td>
      <td style="color:${color};font-weight:600">${inr(i.balance)}</td>
      <td><span class="pill ${pillCls}">${i.age}d</span></td>
      <td>${ledger}</td>
    </tr>`;
  }).join('');

  const alertCls = days >= 30 ? '' : ' warn';
  const body = `
    <div class="alert-box${alertCls}">
      <span style="font-size:18px;margin-right:8px">${icon}</span>
      <strong>${invoices.length} invoice${invoices.length!==1?'s':''} unsettled for ${days}+ days</strong>
      — Total at risk: <strong>${inr(total)}</strong>
    </div>
    <div class="card">
      <div class="card-title">📋 Overdue Invoices — ${days}+ Days</div>
      <table><thead><tr><th>Customer</th><th>Invoice #</th><th>Date</th><th>Balance Due</th><th>Age</th><th>Ledger</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>`;

  return {
    subject: `${icon} ${invoices.length} Invoice${invoices.length!==1?'s':''} Overdue ${days}+ Days — ${inr(total)} Outstanding`,
    html: wrapEmail({ title: `Invoices Overdue ${days}+ Days`, badge: `${days}-Day Overdue`, badgeColor: color, body }),
    text: `${invoices.length} invoices overdue ${days}+ days. Total: ${inr(total)}`,
  };
}

function buildOrderPending(db, days) {
  const orders = queryPendingOrders(db, days);
  if (!orders.length) return null;

  const stageLabel = { stage1: '📦 Packing', stage2: '✅ Ready', stage3: '🚚 In Transit' };
  const rows = orders.map(o => {
    const ph = o.phone ? `<br/><span style="color:#8e8e93;font-size:11px">${o.phone}</span>` : '';
    return `<tr>
      <td><strong>${o.order_number}</strong></td>
      <td>${o.cust}${ph}</td>
      <td>${o.order_date ? new Date(o.order_date).toLocaleDateString('en-IN') : ''}</td>
      <td>${stageLabel[o.current_stage] || o.current_stage}</td>
      <td><span class="pill pill-orange">${o.age}d</span></td>
      <td style="color:#ff9f0a;font-weight:600">${inr(o.total_amount)}</td>
    </tr>`;
  }).join('');

  const body = `
    <div class="alert-box warn">
      <span style="font-size:18px;margin-right:8px">⏳</span>
      <strong>${orders.length} order${orders.length!==1?'s':''} pending for ${days}+ days</strong> — need attention.
    </div>
    <div class="card">
      <div class="card-title">📦 Pending Orders — ${days}+ Days Old</div>
      <table><thead><tr><th>Order #</th><th>Customer</th><th>Date</th><th>Stage</th><th>Age</th><th>Value</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>`;

  return {
    subject: `⏳ ${orders.length} Order${orders.length!==1?'s':''} Pending ${days}+ Days — Action Required`,
    html: wrapEmail({ title: `Pending Orders — ${days}+ Days`, badge: `${days}-Day Order Alert`, badgeColor: '#ff9f0a', body }),
    text: `${orders.length} orders pending ${days}+ days.`,
  };
}

function buildLowStock(db) {
  const items = queryLowStock(db);
  if (!items.length) return null;

  const rows = items.map(i => `<tr>
    <td><strong>${i.name}</strong></td>
    <td>${i.pack_size_value} ${i.pack_size_type}</td>
    <td>${i.batch_no}</td>
    <td style="color:#ff453a;font-weight:600">${i.units_sold} sold</td>
    <td>${i.exp_date ? new Date(i.exp_date).toLocaleDateString('en-IN') : '—'}</td>
  </tr>`).join('');

  const body = `
    <div class="alert-box">
      <span style="font-size:18px;margin-right:8px">📉</span>
      <strong>${items.length} product variant${items.length!==1?'s':''} with low stock</strong> — review inventory.
    </div>
    <div class="card">
      <div class="card-title">📉 Low Stock Items</div>
      <table><thead><tr><th>Product</th><th>Pack Size</th><th>Batch</th><th>Units Sold</th><th>Expiry</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>`;

  return {
    subject: `📉 Low Stock Alert — ${items.length} Item${items.length!==1?'s':''} Need Restocking`,
    html: wrapEmail({ title: 'Low Stock Alert', badge: 'Inventory Alert', badgeColor: '#ff453a', body }),
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
        title: 'Email Delivery Test', badge: 'Stalwart Mail Active', badgeColor: '#32d74b',
        body: `<div class="card">
          <p style="color:#32d74b;font-weight:600;font-size:16px">✅ SMTP connection to Stalwart Mail succeeded!</p>
          <p style="margin-top:10px;color:#aeaeb2;font-size:13px;line-height:1.6">
            <strong>Server:</strong> ${cfg.host}:${cfg.port} (${cfg.secure ? 'SMTPS 465' : 'STARTTLS 587'})<br/>
            <strong>Authenticated User:</strong> ${cfg.user || 'anonymous'}<br/>
            <strong>Sender:</strong> ${cfg.from}<br/>
            <strong>Recipient:</strong> ${cfg.to}<br/>
            <strong>Delivered At:</strong> ${now} IST
          </p>
          <div style="margin-top:14px;padding:10px 12px;background:rgba(50,215,75,0.08);border:1px solid rgba(50,215,75,0.25);border-radius:8px;font-size:12px;color:#32d74b">
            ✓ Automated daily summaries, weekly digests, and invoice/order overdue reminders are active and ready.
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
