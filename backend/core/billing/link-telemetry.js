/**
 * Link Telemetry & Read Receipt Engine
 * Tracks access metrics, dwell time, device context, and actions for customer ledger links.
 */

function parseUserAgent(ua = '') {
  const s = String(ua || '').toLowerCase();
  
  // Bot detection
  if (/whatsapp|telegrambot|facebookexternalhit|twitterbot|slackbot|curl|wget|bot|crawler|spider|preview|applebot/.test(s)) {
    return { deviceType: 'BOT', os: 'Bot / Crawler', browser: 'Link Preview Bot' };
  }

  // Device Form Factor
  let deviceType = 'DESKTOP';
  if (/ipad|tablet|playbook|silk/.test(s)) {
    deviceType = 'TABLET';
  } else if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/.test(s)) {
    deviceType = 'MOBILE';
  }

  // Operating System
  let os = 'Unknown OS';
  if (/iphone/.test(s)) os = 'iPhone (iOS)';
  else if (/ipad/.test(s)) os = 'iPad (iPadOS)';
  else if (/android\s*([0-9.]+)?/.test(s)) {
    const match = s.match(/android\s*([0-9.]+)?/);
    os = match && match[1] ? `Android ${match[1]}` : 'Android';
  } else if (/windows nt 10\.0/.test(s)) os = 'Windows 10/11';
  else if (/windows nt 6\.3/.test(s)) os = 'Windows 8.1';
  else if (/windows nt 6\.1/.test(s)) os = 'Windows 7';
  else if (/macintosh|mac os x/.test(s)) os = 'macOS';
  else if (/linux/.test(s)) os = 'Linux';

  // Browser
  let browser = 'Unknown Browser';
  if (/edg\/([0-9.]+)/.test(s)) {
    browser = 'Edge';
  } else if (/chrome\/([0-9.]+)/.test(s) && !/chromium|edg/.test(s)) {
    browser = 'Chrome';
  } else if (/version\/([0-9.]+).*safari/.test(s)) {
    browser = 'Safari';
  } else if (/firefox\/([0-9.]+)/.test(s)) {
    browser = 'Firefox';
  } else if (/opera|opr\//.test(s)) {
    browser = 'Opera';
  }

  return { deviceType, os, browser };
}

function parseClientIp(req) {
  if (!req) return '127.0.0.1';
  const raw = req.headers?.['cf-connecting-ip'] ||
              req.headers?.['x-real-ip'] ||
              req.headers?.['x-forwarded-for'] ||
              req.ip ||
              req.socket?.remoteAddress ||
              '127.0.0.1';
  
  const first = String(raw).split(',')[0].trim();
  return first.replace(/^::ffff:/, '');
}

function parseLocation(req) {
  if (!req || !req.headers) return { city: null, region: null, country: null, isp: null };
  const h = req.headers;
  const city = h['cf-ipcity'] || h['x-vercel-ip-city'] || null;
  const region = h['cf-region'] || h['x-vercel-ip-region'] || null;
  const country = h['cf-ipcountry'] || h['x-vercel-ip-country'] || null;
  const isp = h['cf-isp'] || null;
  return { city, region, country, isp };
}

function recordAccess(db, {
  customerId,
  ledgerToken,
  eventType = 'VIEW',
  req = null,
  dwellSeconds = 0,
  scrollDepth = 0,
  metadata = null,
  source = null,
  refNumber = null
}) {
  if (!db || !customerId || !ledgerToken) return null;

  try {
    const ua = req ? (req.headers?.['user-agent'] || '') : '';
    const { deviceType, os, browser } = parseUserAgent(ua);
    const ipAddress = parseClientIp(req);
    const { city, region, country, isp } = parseLocation(req);

    const metaStr = metadata ? (typeof metadata === 'object' ? JSON.stringify(metadata) : String(metadata)) : null;

    const querySource = req?.query?.src || req?.query?.source || req?.body?.source || null;
    const queryRef = req?.query?.ref || req?.query?.ref_number || req?.body?.ref_number || null;
    const finalSource = source || querySource || 'manual_share';
    const finalRef = refNumber || queryRef || null;

    const stmt = db.prepare(`
      INSERT INTO ledger_link_access_logs (
        customer_id, ledger_token, event_type, ip_address, user_agent,
        device_type, os, browser, city, region, country, isp,
        dwell_seconds, scroll_depth, metadata_json, source, ref_number, created_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, datetime('now')
      )
    `);

    stmt.run(
      customerId,
      ledgerToken,
      eventType,
      ipAddress,
      ua,
      deviceType,
      os,
      browser,
      city,
      region,
      country,
      isp,
      Math.max(0, parseInt(dwellSeconds, 10) || 0),
      Math.min(100, Math.max(0, parseInt(scrollDepth, 10) || 0)),
      metaStr,
      finalSource,
      finalRef
    );

    // If a human visitor opens the page, update cached summary columns on contacts
    if (eventType === 'VIEW' && deviceType !== 'BOT') {
      try {
        db.prepare(`
          UPDATE contacts 
          SET last_portal_opened_at = datetime('now'),
              portal_open_count = COALESCE(portal_open_count, 0) + 1
          WHERE id = ?
        `).run(customerId);
      } catch (_) {}
    }

    return true;
  } catch (err) {
    console.error('[LinkTelemetry] Error recording access event:', err.message);
    return false;
  }
}

function getTrackingSummary(db, identifier) {
  if (!db || !identifier) return null;

  try {
    // Resolve contact
    let contact = null;
    const isNum = !isNaN(identifier) && String(identifier).trim().length > 0;
    if (isNum) {
      contact = db.prepare('SELECT id, name, phone, ledger_token, last_portal_opened_at, portal_open_count FROM contacts WHERE id = ?').get(Number(identifier));
    }
    if (!contact) {
      contact = db.prepare('SELECT id, name, phone, ledger_token, last_portal_opened_at, portal_open_count FROM contacts WHERE ledger_token = ?').get(String(identifier).trim());
    }
    if (!contact) return null;

    const token = contact.ledger_token;
    let logs = [];
    try {
      logs = db.prepare(`
        SELECT id, event_type, ip_address, device_type, os, browser, city, region, country, isp, dwell_seconds, scroll_depth, metadata_json, source, ref_number, created_at
        FROM ledger_link_access_logs
        WHERE customer_id = ? OR ledger_token = ?
        ORDER BY created_at DESC
        LIMIT 100
      `).all(contact.id, token || '');
    } catch (_) {
      logs = db.prepare(`
        SELECT id, event_type, ip_address, device_type, os, browser, city, region, country, isp, dwell_seconds, scroll_depth, metadata_json, created_at
        FROM ledger_link_access_logs
        WHERE customer_id = ? OR ledger_token = ?
        ORDER BY created_at DESC
        LIMIT 100
      `).all(contact.id, token || '');
    }

    // Aggregations
    const humanViews = logs.filter(l => l.event_type === 'VIEW' && l.device_type !== 'BOT');
    const actions = logs.filter(l => ['COPY_IFSC', 'COPY_ACCOUNT', 'DOWNLOAD_CSV', 'PRINT'].includes(l.event_type));
    const totalViews = humanViews.length || contact.portal_open_count || 0;
    
    let status = 'UNOPENED';
    if (actions.length > 0) {
      status = 'ENGAGED';
    } else if (totalViews > 0 || contact.last_portal_opened_at) {
      status = 'SEEN';
    }

    // Unique devices
    const deviceSet = new Set();
    const locationSet = new Set();
    let totalDwellSeconds = 0;
    let maxScrollDepth = 0;

    logs.forEach(l => {
      if (l.device_type && l.device_type !== 'BOT') {
        deviceSet.add(`${l.device_type} (${l.os || 'OS'} • ${l.browser || 'Browser'})`);
      }
      if (l.city || l.region || l.country) {
        const parts = [l.city, l.region, l.country].filter(Boolean);
        locationSet.add(parts.join(', '));
      }
      if (l.dwell_seconds) totalDwellSeconds += l.dwell_seconds;
      if (l.scroll_depth && l.scroll_depth > maxScrollDepth) maxScrollDepth = l.scroll_depth;
    });

    const firstOpenedAt = humanViews.length > 0 ? humanViews[humanViews.length - 1].created_at : contact.last_portal_opened_at;
    const lastOpenedAt = humanViews.length > 0 ? humanViews[0].created_at : contact.last_portal_opened_at;
    const lastAction = actions.length > 0 ? actions[0].event_type : null;

    // Retrieve financial transactions to calculate "Seen Up To" freshness
    let invoices = [];
    try {
      invoices = db.prepare(`
        SELECT id, invoice_no, total_amount, grand_total, invoice_date, created_at 
        FROM invoices 
        WHERE customer_id = ? 
        ORDER BY created_at ASC
      `).all(contact.id);
    } catch (_) {}

    let payments = [];
    try {
      payments = db.prepare(`
        SELECT id, type, amount, credit_amount, reference_number, payment_date, created_at 
        FROM payments 
        WHERE customer_id = ? 
        ORDER BY created_at ASC
      `).all(contact.id);
    } catch (_) {}

    const transactions = [];
    invoices.forEach(inv => {
      transactions.push({
        id: inv.id,
        refNumber: inv.invoice_no || ('INV-' + inv.id),
        type: 'INVOICE',
        amount: Number(inv.grand_total || inv.total_amount || 0),
        date: inv.invoice_date || inv.created_at,
        createdAt: inv.created_at
      });
    });
    payments.forEach(pmt => {
      transactions.push({
        id: pmt.id,
        refNumber: pmt.reference_number || (pmt.type === 'CREDIT_NOTE' ? ('CN-' + pmt.id) : ('PAY-' + pmt.id)),
        type: pmt.type || 'PAYMENT',
        amount: Number(pmt.amount || pmt.credit_amount || 0),
        date: pmt.payment_date || pmt.created_at,
        createdAt: pmt.created_at
      });
    });
    transactions.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    let freshnessStatus = 'UNOPENED';
    let lastSeenTransaction = null;
    let unseenTransactions = [];
    let unseenTotalAmount = 0;

    const lastSeenTime = contact.last_portal_opened_at ? new Date(contact.last_portal_opened_at).getTime() : 0;

    if (!lastSeenTime || humanViews.length === 0) {
      freshnessStatus = 'UNOPENED';
      unseenTransactions = transactions;
      unseenTotalAmount = transactions.reduce((acc, t) => acc + (t.type === 'INVOICE' ? t.amount : 0), 0);
    } else {
      const seen = transactions.filter(t => new Date(t.createdAt).getTime() <= lastSeenTime);
      const unseen = transactions.filter(t => new Date(t.createdAt).getTime() > lastSeenTime);
      lastSeenTransaction = seen.length > 0 ? seen[seen.length - 1] : null;
      unseenTransactions = unseen;
      unseenTotalAmount = unseen.reduce((acc, t) => acc + (t.type === 'INVOICE' ? t.amount : 0), 0);
      freshnessStatus = unseen.length === 0 ? 'ALL_CAUGHT_UP' : 'NEW_TRANSACTIONS_UNSEEN';
    }

    // Source breakdown stats
    const sourceBreakdown = {};
    logs.forEach(l => {
      if (l.event_type === 'VIEW') {
        const src = l.source || 'manual_share';
        sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;
      }
    });

    return {
      success: true,
      customer: {
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        ledgerToken: token,
        shareUrl: token ? `https://mac.faizal.uk/ledger/${token}` : null
      },
      summary: {
        status,
        totalViews,
        totalDwellSeconds,
        maxScrollDepth,
        firstOpenedAt,
        lastOpenedAt,
        lastAction,
        uniqueDevices: Array.from(deviceSet),
        locations: Array.from(locationSet),
        actionsCount: actions.length
      },
      freshness: {
        status: freshnessStatus,
        lastSeenAt: contact.last_portal_opened_at,
        lastSeenTransaction,
        unseenCount: unseenTransactions.length,
        unseenTotalAmount,
        unseenTransactions: unseenTransactions.slice(-5)
      },
      sources: sourceBreakdown,
      logs: logs.map(l => ({
        id: l.id,
        eventType: l.event_type,
        ipAddress: l.ip_address,
        deviceType: l.device_type,
        os: l.os,
        browser: l.browser,
        location: [l.city, l.region, l.country].filter(Boolean).join(', ') || 'Unknown Location',
        dwellSeconds: l.dwell_seconds || 0,
        scrollDepth: l.scroll_depth || 0,
        metadata: l.metadata_json ? JSON.parse(l.metadata_json) : null,
        source: l.source || 'manual_share',
        refNumber: l.ref_number || null,
        createdAt: l.created_at
      }))
    };
  } catch (err) {
    console.error('[LinkTelemetry] Error generating tracking summary:', err.message);
    return null;
  }
}

module.exports = {
  parseUserAgent,
  parseClientIp,
  parseLocation,
  recordAccess,
  getTrackingSummary
};

