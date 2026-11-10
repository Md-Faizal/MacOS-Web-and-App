'use strict';

/**
 * payment-gateway-service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Customer-Facing Payment Gateway Service
 * Manages tiny-URL payment links, dynamic UPI payload generation,
 * bank clearance coordinates, remittance confirmation telemetry, and
 * direct-to-owner email dispatch without intermediary bank APIs.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');
const path = require('path');
let qrcode = null;
try { qrcode = require('qrcode'); } catch (_) { }

// Safe base62 character set (avoids 0, O, 1, I, l for maximum readability)
const SLUG_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';

function generateSlug(length = 8) {
  const bytes = crypto.randomBytes(length * 2);
  let slug = '';
  for (let i = 0; i < bytes.length && slug.length < length; i++) {
    slug += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return slug;
}

// ─── Settings Helper ─────────────────────────────────────────────────────────
function getSetting(db, key, fallback = '') {
  try {
    const row = db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get(key);
    return row && row.setting_value ? row.setting_value : fallback;
  } catch (_) {
    return fallback;
  }
}

// ─── Email Dispatch Integration ─────────────────────────────────────────────
let emailScheduler = null;
try {
  emailScheduler = require('../../departments/billing/services/email-reminder-scheduler');
} catch (e) {
  try {
    emailScheduler = require(path.join(__dirname, '../../departments/billing/services/email-reminder-scheduler'));
  } catch (_) { }
}

let dataBus = null;
try {
  dataBus = require('../sync/data-bus');
} catch (_) { }

let linkTelemetry = null;
try {
  linkTelemetry = require('./link-telemetry');
} catch (_) { }

/**
 * Ensures table exists (in case running before full database manager sync)
 */
function ensurePaymentLinksTable(db) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS payment_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        link_code TEXT NOT NULL UNIQUE,
        customer_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        invoice_ids TEXT,
        status TEXT DEFAULT 'ACTIVE',
        claimed_utr TEXT,
        claimed_amount REAL,
        claimed_at DATETIME,
        claimed_notes TEXT,
        payer_name TEXT,
        payer_phone TEXT,
        expires_at DATETIME,
        views_count INTEGER DEFAULT 0,
        last_viewed_at DATETIME,
        created_by_user_id TEXT,
        settled_payment_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES contacts(id),
        FOREIGN KEY (settled_payment_id) REFERENCES payments(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_payment_links_code ON payment_links(link_code);
      CREATE INDEX IF NOT EXISTS idx_payment_links_cust ON payment_links(customer_id);
      CREATE INDEX IF NOT EXISTS idx_payment_links_status ON payment_links(status);
    `);
  } catch (err) {
    console.error('[PaymentGateway] ensurePaymentLinksTable error:', err.message);
  }
}

/**
 * Get active domain for links:
 * - If request originates from localhost or local IP, preserves the local host and port for dev testing.
 * - Otherwise defaults strictly to https://mac.faizal.uk
 */
  function getGatewayBaseUrl(db, req = null) {
    if (req) {
      const host = (req.get ? req.get('host') : (req.headers && req.headers.host)) || '';
      if (host && (host.includes('localhost') || host.includes('127.0.0.1') || host.startsWith('192.168.') || host.startsWith('10.'))) {
        const proto = req.protocol || (req.secure ? 'https' : 'http');
        return `${proto}://${host}`;
      }
    }

    const configured = getSetting(db, 'payment_gateway_domain', '').trim();
    if (configured) {
      return configured.replace(/\/+$/, '');
    }

    // User explicit instruction: Switch back to only using mac.faizal.uk
    return 'https://mac.faizal.uk';
  }

  /**
   * Generate a new short payment link
   */
  function createPaymentLink(db, {
    customerId,
    customerName = null,
    amount,
    description = '',
    invoiceIds = [],
    expiresInDays = 7,
    userId = null,
  customDomain = null,
    req = null
  }) {
    ensurePaymentLinksTable(db);

    let targetId = customerId;
    if (!targetId && customerName) {
      const found = db.prepare('SELECT id FROM contacts WHERE name = ? COLLATE NOCASE').get(customerName);
      if (found) targetId = found.id;
    }

    if (!targetId) throw new Error('Customer ID is required to generate a payment link.');
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Valid positive amount is required for payment link.');
    }

    const customer = db.prepare('SELECT id, name, phone FROM contacts WHERE id = ?').get(targetId);
    if (!customer) throw new Error(`Customer with ID ${targetId} does not exist.`);

    // Generate unique slug
    let linkCode = '';
    let exists = true;
    const checkStmt = db.prepare('SELECT id FROM payment_links WHERE link_code = ?');
    let attempts = 0;
    while (exists && attempts < 10) {
      attempts++;
      linkCode = generateSlug(8);
      if (!checkStmt.get(linkCode)) exists = false;
    }
    if (exists) throw new Error('Failed to generate unique payment link code.');

    let expiresAt = null;
    if (expiresInDays && Number(expiresInDays) > 0) {
      const exp = new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000);
      expiresAt = exp.toISOString();
    }

    const invoiceIdsStr = Array.isArray(invoiceIds) && invoiceIds.length > 0 ? JSON.stringify(invoiceIds) : null;

    const insertStmt = db.prepare(`
    INSERT INTO payment_links (
      link_code, customer_id, amount, description, invoice_ids,
      status, expires_at, created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, datetime('now'), datetime('now'))
  `);

    const result = insertStmt.run(
      linkCode,
      targetId,
      numAmount,
      description || `Invoice Settlement: ${customer.name}`,
      invoiceIdsStr,
      expiresAt,
      userId || 'system'
    );

    const base = customDomain ? customDomain.replace(/\/+$/, '') : getGatewayBaseUrl(db, req);
    const shareUrl = `${base}/p/${linkCode}`;
    const macShareUrl = `https://mac.faizal.uk/p/${linkCode}`;

    return {
      id: result.lastInsertRowid,
      link_code: linkCode,
      customer_id: targetId,
      customer_name: customer.name,
      customer_phone: customer.phone,
      amount: numAmount,
      description: description || `Invoice Settlement: ${customer.name}`,
      share_url: shareUrl,
      fallback_url: macShareUrl,
      expires_at: expiresAt,
      status: 'ACTIVE'
    };
  }

  /**
   * Resolve Invoices covered by this payment link
   */
  function resolveInvoicesCovered(db, customerId, invoiceIdsJson, description = '') {
    const invoiceNumbers = [];

    // 1. If explicit invoice_ids stored in link
    if (invoiceIdsJson) {
      try {
        const parsed = typeof invoiceIdsJson === 'string' ? JSON.parse(invoiceIdsJson) : invoiceIdsJson;
        if (Array.isArray(parsed) && parsed.length > 0) {
          const placeholders = parsed.map(() => '?').join(',');
          const rows = db.prepare(`SELECT invoice_no FROM invoices WHERE id IN (${placeholders}) OR invoice_no IN (${placeholders})`).all(...parsed, ...parsed);
          rows.forEach(r => { if (r.invoice_no && !invoiceNumbers.includes(r.invoice_no)) invoiceNumbers.push(r.invoice_no); });
        }
      } catch (_) {}
    }

    // 2. Check if description contains invoice numbers like INV-... or Bill-...
    if (invoiceNumbers.length === 0 && description) {
      const matches = description.match(/(?:INV|BILL)[-\sA-Z0-9]+/gi);
      if (matches) {
        matches.forEach(m => {
          const clean = m.trim();
          if (!invoiceNumbers.includes(clean)) invoiceNumbers.push(clean);
        });
      }
    }

    // 3. Fallback: Query recent invoices for this customer
    if (invoiceNumbers.length === 0 && customerId) {
      try {
        const recent = db.prepare(`
          SELECT invoice_no FROM invoices
          WHERE customer_id = ?
          ORDER BY id DESC LIMIT 2
        `).all(customerId);
        recent.forEach(r => { if (r.invoice_no && !invoiceNumbers.includes(r.invoice_no)) invoiceNumbers.push(r.invoice_no); });
      } catch (_) {}
    }

    let label = '';
    if (invoiceNumbers.length === 1) {
      label = `Invoice: ${invoiceNumbers[0]}`;
    } else if (invoiceNumbers.length > 1) {
      label = `Invoices: ${invoiceNumbers.join(', ')}`;
    } else {
      label = 'Statement Settlement';
    }

    return {
      invoice_numbers: invoiceNumbers,
      invoice_label: label
    };
  }

  /**
   * Public resolver for customer checkout page
   */
  async function getPublicPaymentLinkData(db, linkCode, req = null) {
    ensurePaymentLinksTable(db);
    if (!linkCode) return null;

    const cleanCode = String(linkCode).trim();
    const link = db.prepare(`
    SELECT pl.*, c.name AS customer_name, c.phone AS customer_phone, c.ledger_token
    FROM payment_links pl
    JOIN contacts c ON pl.customer_id = c.id
    WHERE pl.link_code = ?
  `).get(cleanCode);

    if (!link) return null;

    // Check expiration
    let isExpired = false;
    if (link.expires_at) {
      if (new Date(link.expires_at).getTime() < Date.now()) {
        isExpired = true;
        if (link.status === 'ACTIVE') {
          db.prepare("UPDATE payment_links SET status = 'EXPIRED', updated_at = datetime('now') WHERE id = ?").run(link.id);
          link.status = 'EXPIRED';
        }
      }
    }

    // Increment views count and log telemetry
    try {
      db.prepare(`
      UPDATE payment_links
      SET views_count = views_count + 1,
          last_viewed_at = datetime('now')
      WHERE id = ?
    `).run(link.id);

      if (linkTelemetry && typeof linkTelemetry.recordAccess === 'function') {
        linkTelemetry.recordAccess(db, {
          customerId: link.customer_id,
          ledgerToken: link.ledger_token || cleanCode,
          eventType: 'PAYMENT_GATEWAY_VIEW',
          req,
          metadata: { link_code: cleanCode, amount: link.amount, status: link.status },
          source: 'payment_gateway',
          refNumber: `PAY-${cleanCode}`
        });
      }
    } catch (tErr) {
      console.warn('[PaymentGateway] Telemetry log non-critical warning:', tErr.message);
    }

    // Banking and Business Coordinates
    const companyName = getSetting(db, 'company_name', 'UTKAL CHEMICAL AUSHADHALAYA');
    const upiId = getSetting(db, 'payment_upi_id', '7749089400@hdfc');
    const accountHolder = getSetting(db, 'bank_account_holder', 'MD  FAIZAL');
    const accountNumber = getSetting(db, 'bank_account_number', '50100673684509');
    const ifsc = getSetting(db, 'bank_ifsc', 'HDFC0000236');
    const bankBranch = getSetting(db, 'bank_branch', 'CUTTACK - ODISHA');
    const accountType = getSetting(db, 'bank_account_type', 'Current / Savings Account');
    const companyPhone = getSetting(db, 'company_phone', '06822273304 / 943933330');

    // UPI Deep Link Specification (NPCI regulatory cap: ₹1,00,000 per txn)
    const UPI_LIMIT = 100000;
    const numAmount = Number(link.amount);
    const isSplit = numAmount > UPI_LIMIT;
    const tranches = [];

    if (isSplit) {
      let rem = numAmount;
      let partNum = 1;
      const totalParts = Math.ceil(numAmount / UPI_LIMIT);

      while (rem > 0) {
        const partAmount = Math.min(rem, UPI_LIMIT);
        const trancheNote = `PAY-${cleanCode}-P${partNum}`.slice(0, 30);
        const trancheUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(companyName)}&am=${partAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(trancheNote)}`;

        let trancheQr = '';
        if (qrcode && typeof qrcode.toDataURL === 'function') {
          try {
            trancheQr = await qrcode.toDataURL(trancheUri, {
              width: 380,
              margin: 1,
              color: { dark: '#000000', light: '#ffffff' },
              errorCorrectionLevel: 'M'
            });
          } catch (_) { }
        }

        tranches.push({
          part: partNum,
          total_parts: totalParts,
          amount: partAmount,
          note: trancheNote,
          upi_uri: trancheUri,
          qr_data_url: trancheQr
        });

        rem = Math.round((rem - partAmount) * 100) / 100;
        partNum++;
      }
    } else {
      const upiNote = `PAY-${cleanCode}`.slice(0, 30);
      const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(companyName)}&am=${numAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(upiNote)}`;
      let qrDataUrl = '';
      if (qrcode && typeof qrcode.toDataURL === 'function') {
        try {
          qrDataUrl = await qrcode.toDataURL(upiUri, {
            width: 380,
            margin: 1,
            color: { dark: '#000000', light: '#ffffff' },
            errorCorrectionLevel: 'M'
          });
        } catch (_) { }
      }
      tranches.push({
        part: 1,
        total_parts: 1,
        amount: numAmount,
        note: upiNote,
        upi_uri: upiUri,
        qr_data_url: qrDataUrl
      });
    }

    const invoiceData = resolveInvoicesCovered(db, link.customer_id, link.invoice_ids, link.description);

    return {
      code: link.link_code,
      status: link.status,
      is_expired: isExpired,
      amount: Number(link.amount),
      description: link.description,
      customer_name: link.customer_name,
      customer_phone: link.customer_phone,
      invoices: invoiceData.invoice_numbers,
      invoice_label: invoiceData.invoice_label,
      created_at: link.created_at,
      expires_at: link.expires_at,
      claimed_utr: link.claimed_utr,
      claimed_amount: link.claimed_amount,
      claimed_at: link.claimed_at,
      company: {
        name: companyName,
        phone: companyPhone
      },
      banking: {
        upi_id: upiId,
        account_holder: accountHolder,
        account_number: accountNumber,
        ifsc: ifsc,
        bank_branch: bankBranch,
        account_type: accountType
      },
      upi_uri: tranches[0].upi_uri,
      qr_data_url: tranches[0].qr_data_url,
      is_split: isSplit,
      total_parts: tranches.length,
      tranches: tranches
    };
  }

  /**
   * Handle customer remittance submission (without bank APIs)
   */
  async function confirmPaymentRemittance(db, linkCode, {
    utr,
    amount,
    notes = '',
    payerName = '',
    payerPhone = '',
    req = null
  }) {
    ensurePaymentLinksTable(db);
    if (!linkCode) throw new Error('Missing payment link code.');
    if (!utr || !String(utr).trim()) {
      throw new Error('Please provide the transaction reference or UTR number.');
    }

    const cleanUtr = String(utr).trim();
    const cleanCode = String(linkCode).trim();

    const link = db.prepare(`
    SELECT pl.*, c.name AS customer_name, c.phone AS customer_phone, COALESCE(l.current_due, 0) AS current_due
    FROM payment_links pl
    JOIN contacts c ON pl.customer_id = c.id
    LEFT JOIN ledger l ON c.id = l.customer_id
    WHERE pl.link_code = ?
  `).get(cleanCode);

    if (!link) throw new Error(`Payment link not found: ${cleanCode}`);
    if (link.status === 'SETTLED') {
      throw new Error('This payment link has already been verified and settled.');
    }

    const claimedAmount = Number(amount) > 0 ? Number(amount) : Number(link.amount);
    const claimedAt = new Date().toISOString();

    // Update payment_links
    db.prepare(`
    UPDATE payment_links
    SET claimed_utr = ?,
        claimed_amount = ?,
        claimed_at = ?,
        claimed_notes = ?,
        payer_name = ?,
        payer_phone = ?,
        status = 'CLAIMED',
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
      cleanUtr,
      claimedAmount,
      claimedAt,
      notes ? String(notes).trim() : null,
      payerName ? String(payerName).trim() : null,
      payerPhone ? String(payerPhone).trim() : null,
      link.id
    );

    // Broadcast real-time sync event to connected Admin / Billing screens
    if (dataBus && typeof dataBus.broadcast === 'function') {
      try {
        dataBus.broadcast('billing:payment_link', 'claimed', {
          id: link.id,
          link_code: cleanCode,
          customer_name: link.customer_name,
          amount: claimedAmount,
          utr: cleanUtr,
          claimed_at: claimedAt
        });
        dataBus.broadcast('billing:ledger', 'updated', { customer_id: link.customer_id });
      } catch (_) { }
    }

    // Record telemetry
    try {
      if (linkTelemetry && typeof linkTelemetry.recordAccess === 'function') {
        linkTelemetry.recordAccess(db, {
          customerId: link.customer_id,
          ledgerToken: cleanCode,
          eventType: 'PAYMENT_REMITTANCE_SUBMITTED',
          req,
          metadata: {
            utr: cleanUtr,
            amount: claimedAmount,
            payer_name: payerName
          },
          source: 'payment_gateway',
          refNumber: cleanUtr
        });
      }
    } catch (_) { }

    // ─── Direct-to-Owner Email Dispatch Pipeline (Zero Bank APIs) ─────────────
    let emailSent = false;
    let emailError = null;

    try {
      if (emailScheduler && typeof emailScheduler.sendEmail === 'function') {
        const adminTo = getSetting(db, 'email_reminder_to', 'me@faizal.uk');
        const companyName = getSetting(db, 'company_name', 'UTKAL CHEMICAL AUSHADHALAYA');
        const inrFormatted = `₹${Number(claimedAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        const clientIp = req ? (req.headers?.['cf-connecting-ip'] || req.headers?.['x-real-ip'] || req.ip || '127.0.0.1') : '127.0.0.1';
        const userAgent = req?.headers?.['user-agent'] || 'Direct Web Client';

        const verifyUrl = `https://mac.faizal.uk/app/billing?verify_link=${cleanCode}&action=settle`;

        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Remittance Confirmation</title>
</head>
<body style="margin:0;padding:0;background-color:#090a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f3f4f6;">
  <div style="max-width:580px;margin:24px auto;background:#111218;border:1px solid #27272a;border-radius:14px;overflow:hidden;box-shadow:0 12px 36px rgba(0,0,0,0.5);">
    
    <!-- Header Banner -->
    <div style="background:linear-gradient(135deg,#18181b 0%,#09090b 100%);padding:24px 28px;border-bottom:1px solid #27272a;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#a1a1aa;">${companyName}</span>
        <span style="display:inline-block;padding:3px 10px;background:rgba(67,97,238,0.18);border:1px solid #4361ee;color:#93c5fd;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:0.8px;">⚡ REMITTANCE NOTIFICATION</span>
      </div>
      <h1 style="margin:8px 0 0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Payment Claimed: ${inrFormatted}</h1>
      <p style="margin:4px 0 0;font-size:13px;color:#a1a1aa;">Submitted by <strong>${link.customer_name}</strong> via Customer Remittance Gateway</p>
    </div>

    <!-- Core Details Table -->
    <div style="padding:24px 28px;">
      <div style="background:#18181b;border:1px solid #27272a;border-radius:10px;padding:18px;margin-bottom:20px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:8px 0;color:#71717a;width:40%;">Claimed Amount:</td>
            <td style="padding:8px 0;color:#34d399;font-weight:800;font-size:16px;">${inrFormatted}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#71717a;">Transaction Ref / UTR:</td>
            <td style="padding:8px 0;color:#ffffff;font-family:monospace;font-weight:700;font-size:14px;letter-spacing:0.5px;">${cleanUtr}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#71717a;">Customer:</td>
            <td style="padding:8px 0;color:#ffffff;font-weight:600;">${link.customer_name}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#71717a;">Customer Phone:</td>
            <td style="padding:8px 0;color:#e4e4e7;">${link.customer_phone || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#71717a;">Current Ledger Due:</td>
            <td style="padding:8px 0;color:#f87171;font-weight:700;">₹${Number(link.current_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#71717a;">Payment Link Ref:</td>
            <td style="padding:8px 0;color:#a1a1aa;font-family:monospace;">PAY-${cleanCode}</td>
          </tr>
          ${notes ? `
          <tr>
            <td style="padding:8px 0;color:#71717a;vertical-align:top;">Remitter Notes:</td>
            <td style="padding:8px 0;color:#e4e4e7;font-style:italic;">"${notes}"</td>
          </tr>` : ''}
          ${payerName ? `
          <tr>
            <td style="padding:8px 0;color:#71717a;">Remitter Name:</td>
            <td style="padding:8px 0;color:#e4e4e7;">${payerName}</td>
          </tr>` : ''}
        </table>
      </div>

      <!-- Action Button -->
      <div style="text-align:center;margin:28px 0 16px;">
        <a href="${verifyUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#4361ee 0%,#7209b7 100%);color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:8px;box-shadow:0 4px 18px rgba(67,97,238,0.35);letter-spacing:0.3px;">
          ✓ Verify & Record in Ledger
        </a>
        <div style="margin-top:8px;font-size:11px;color:#71717a;">Opens MacOS Billing Suite to post this voucher with 1 click.</div>
      </div>

      <!-- Security / Audit Footer -->
      <div style="border-top:1px solid #27272a;padding-top:16px;margin-top:20px;font-size:11px;color:#52525b;line-height:1.5;">
        Submission Time: ${claimedAt} (UTC)<br/>
        Remitter IP: ${clientIp} &bull; User Agent: ${userAgent.slice(0, 70)}<br/>
        Zero-Bank-API Direct Remittance Pipeline &bull; Automated Briefing
      </div>
    </div>
  </div>
</body>
</html>
      `;

        const mailRes = await emailScheduler.sendEmail(db, {
          subject: `⚡ [Payment Remittance] ${inrFormatted} from ${link.customer_name} (UTR: ${cleanUtr})`,
          html: emailHtml,
          text: `PAYMENT CLAIM NOTIFICATION\nCustomer: ${link.customer_name}\nAmount: ${inrFormatted}\nUTR / Ref: ${cleanUtr}\nDate: ${claimedAt}\nLink: PAY-${cleanCode}\nVerify & Post: ${verifyUrl}`
        });

        if (mailRes && mailRes.ok) {
          emailSent = true;
          console.log(`[PaymentGateway] Notification email sent successfully to ${adminTo} for UTR ${cleanUtr}`);
        } else {
          emailError = mailRes?.error || 'Unknown email failure';
          console.warn('[PaymentGateway] Email notification non-fatal failure:', emailError);
        }
      }
    } catch (mErr) {
      emailError = mErr.message;
      console.warn('[PaymentGateway] Failed to trigger email notification:', mErr.message);
    }

    return {
      success: true,
      message: 'Remittance notice registered successfully.',
      email_dispatched: emailSent,
      confirmation: {
        link_code: cleanCode,
        customer_name: link.customer_name,
        claimed_amount: claimedAmount,
        claimed_utr: cleanUtr,
        claimed_at: claimedAt
      }
    };
  }

  /**
   * List payment links for admin billing view
   */
    function listPaymentLinks(db, { customerId = null, status = null, limit = 50, offset = 0, req = null } = {}) {
      ensurePaymentLinksTable(db);

      let query = `
    SELECT pl.*, c.name AS customer_name, c.phone AS customer_phone, COALESCE(l.current_due, 0) AS current_due
    FROM payment_links pl
    JOIN contacts c ON pl.customer_id = c.id
    LEFT JOIN ledger l ON c.id = l.customer_id
    WHERE 1=1
  `;
      const params = [];

      if (customerId) {
        query += ` AND pl.customer_id = ?`;
        params.push(customerId);
      }
      if (status) {
        query += ` AND pl.status = ?`;
        params.push(status);
      }

      query += ` ORDER BY pl.id DESC LIMIT ? OFFSET ?`;
      params.push(Number(limit) || 50, Number(offset) || 0);

      const rows = db.prepare(query).all(...params);
      const baseUrl = getGatewayBaseUrl(db, req);

      const mapped = rows.map(r => ({
        ...r,
        share_url: `${baseUrl}/p/${r.link_code}`,
        fallback_url: `https://mac.faizal.uk/p/${r.link_code}`
      }));

      // Statistics
      const stats = db.prepare(`
    SELECT
      COUNT(*) AS total_links,
      SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_links,
      SUM(CASE WHEN status = 'CLAIMED' THEN 1 ELSE 0 END) AS claimed_links,
      SUM(CASE WHEN status = 'SETTLED' THEN 1 ELSE 0 END) AS settled_links,
      COALESCE(SUM(CASE WHEN status = 'SETTLED' THEN amount ELSE 0 END), 0) AS total_settled_amount,
      COALESCE(SUM(CASE WHEN status = 'CLAIMED' THEN claimed_amount ELSE 0 END), 0) AS pending_verification_amount
    FROM payment_links
  `).get() || {};

      return { links: mapped, stats };
    }

    /**
     * Settle payment link and convert directly to a recorded payment voucher
     */
    function settlePaymentLink(db, linkId, {
      paymentMethod = 'upi',
      paymentDate = null,
      notes = '',
      userId = null
    }) {
      ensurePaymentLinksTable(db);
      const link = db.prepare('SELECT * FROM payment_links WHERE id = ?').get(linkId);
      if (!link) throw new Error(`Payment link with ID ${linkId} not found.`);

      if (link.status === 'SETTLED') {
        throw new Error('This payment link is already settled.');
      }

      const effectiveAmount = link.claimed_amount || link.amount;
      const effectiveRef = link.claimed_utr || `PL-${link.link_code}`;
      const effectiveDate = paymentDate || (link.claimed_at ? link.claimed_at.slice(0, 10) : new Date().toISOString().slice(0, 10));
      const fullNotes = [notes, link.claimed_notes ? `Customer Note: ${link.claimed_notes}` : '', `Gateway Code: ${link.link_code}`].filter(Boolean).join(' | ');

      const transaction = db.transaction(() => {
        // 1. Insert formal payment into payments table
        const ins = db.prepare(`
      INSERT INTO payments (
        customer_id, type, amount, payment_medium, reference_number,
        payment_date, notes, created_by_user_id, created_at, updated_at
      ) VALUES (?, 'PAYMENT', ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
          link.customer_id,
          effectiveAmount,
          paymentMethod || 'upi',
          effectiveRef,
          effectiveDate,
          fullNotes,
          userId || 'admin'
        );

        const paymentId = ins.lastInsertRowid;

        // 2. Mark link as SETTLED
        db.prepare(`
      UPDATE payment_links
      SET status = 'SETTLED',
          settled_payment_id = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(paymentId, link.id);

        return paymentId;
      });

      const paymentId = transaction();

      // Broadcast sync events
      if (dataBus && typeof dataBus.broadcast === 'function') {
        try {
          dataBus.broadcast('billing:payment', 'created', { id: paymentId, customer_id: link.customer_id, amount: effectiveAmount });
          dataBus.broadcast('billing:ledger', 'updated', { customer_id: link.customer_id });
          dataBus.broadcast('billing:payment_link', 'settled', { id: link.id, link_code: link.link_code, payment_id: paymentId });
        } catch (_) { }
      }

      return {
        success: true,
        payment_id: paymentId,
        link_id: link.id,
        settled_amount: effectiveAmount,
        reference_number: effectiveRef
      };
    }

    /**
     * Cancel a payment link
     */
    function cancelPaymentLink(db, linkId) {
      ensurePaymentLinksTable(db);
      const result = db.prepare(`
    UPDATE payment_links
    SET status = 'CANCELLED', updated_at = datetime('now')
    WHERE id = ? AND status != 'SETTLED'
  `).run(linkId);

      return { success: result.changes > 0 };
    }

    module.exports = {
      createPaymentLink,
      getPublicPaymentLinkData,
      confirmPaymentRemittance,
      listPaymentLinks,
      settlePaymentLink,
      cancelPaymentLink,
      getGatewayBaseUrl,
      ensurePaymentLinksTable
    };