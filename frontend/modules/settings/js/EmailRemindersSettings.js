/**
 * EmailRemindersSettings.js
 * ─────────────────────────────────────────────────────────────────────────────
 * macOS Tahoe/Sequoia style — Email Reminders & Summaries Settings Panel
 * Lives inside Settings → Billing section as a dedicated card section.
 *
 * Features:
 *  • Master enable/disable toggle
 *  • SMTP configuration (host, port, sender, recipient)
 *  • Daily summary schedule (time picker)
 *  • Weekly summary schedule (day + time)
 *  • Invoice overdue alerts: 7d / 14d / 30d (each with time)
 *  • Order pending alerts: 3d / 7d (with time)
 *  • Low stock alert (with time)
 *  • "Send Test Email" button
 *  • Manual "Send Now" buttons for each alert type
 *  • Live status badge (last-sent info from server)
 */

export class EmailRemindersSettingsComponent {
  constructor(container, parentSettings = {}) {
    this.container = container;
    this.parentSettings = parentSettings; // shared app_settings already loaded
    this.settings = {};
    this.loading = true;
    this.saving  = false;

    this.defaults = {
      email_reminders_enabled:       'true',
      email_reminder_to:             'me@faizal.uk',
      email_reminder_from:           'reports@faizal.uk',
      email_smtp_host:               '127.0.0.1',
      email_smtp_port:               '587',
      email_smtp_user:               'reports@faizal.uk',
      email_smtp_pass:               'FaizalReports2026!',
      email_smtp_secure:             'false',
      email_daily_summary_enabled:   'true',
      email_daily_summary_time:      '08:00',
      email_weekly_summary_enabled:  'true',
      email_weekly_summary_day:      '1',
      email_weekly_summary_time:     '09:00',
      email_invoice_7d_enabled:      'true',
      email_invoice_14d_enabled:     'true',
      email_invoice_30d_enabled:     'true',
      email_invoice_check_time:      '10:00',
      email_order_3d_enabled:        'true',
      email_order_7d_enabled:        'true',
      email_order_check_time:        '10:30',
      email_low_stock_enabled:       'true',
      email_low_stock_check_time:    '07:00',
    };
  }

  async render() {
    this.container.innerHTML = `<div class="er-loading"><div class="macos-circular-loader"></div><div style="color:var(--settings-text-secondary,#8e8e93);font-size:13px;margin-top:10px">Loading email settings…</div></div>`;
    await this._loadSettings();
    this._renderUI();
    this._bindEvents();
  }

  async _loadSettings() {
    try {
      const res = await fetch('/api/settings/app-settings');
      if (res.ok) {
        const data = await res.json();
        // Merge: db values > defaults
        for (const [k, v] of Object.entries(this.defaults)) {
          this.settings[k] = data[k] !== undefined ? data[k] : v;
        }
      } else { this.settings = { ...this.defaults }; }
    } catch (_) { this.settings = { ...this.defaults }; }
    this.loading = false;
  }

  _bool(key) { return String(this.settings[key] || 'false').toLowerCase() === 'true'; }
  _val(key)  { return this.settings[key] || this.defaults[key] || ''; }

  _renderToggle(id, checked, label, subtitle) {
    return `
      <div class="er-row-toggle">
        <div class="er-row-left">
          <div class="er-label">${label}</div>
          ${subtitle ? `<div class="er-sublabel">${subtitle}</div>` : ''}
        </div>
        <button type="button" id="${id}" class="billing-toggle-btn${checked?' active':''}" role="switch" aria-checked="${checked}">
          <span class="billing-toggle-knob"></span>
        </button>
      </div>`;
  }

  _renderTimeInput(id, value, label) {
    return `
      <div class="er-field-row">
        <label class="er-field-label" for="${id}">${label}</label>
        <input type="time" id="${id}" class="er-time-input" value="${value}"/>
      </div>`;
  }

  _renderTextInput(id, value, label, placeholder = '', type = 'text') {
    return `
      <div class="er-field-row">
        <label class="er-field-label" for="${id}">${label}</label>
        <input type="${type}" id="${id}" class="er-text-input billing-input" value="${value}" placeholder="${placeholder}"/>
      </div>`;
  }

  _renderUI() {
    const en       = this._bool('email_reminders_enabled');
    const dailyEn  = this._bool('email_daily_summary_enabled');
    const weeklyEn = this._bool('email_weekly_summary_enabled');
    const inv7En   = this._bool('email_invoice_7d_enabled');
    const inv14En  = this._bool('email_invoice_14d_enabled');
    const inv30En  = this._bool('email_invoice_30d_enabled');
    const ord3En   = this._bool('email_order_3d_enabled');
    const ord7En   = this._bool('email_order_7d_enabled');
    const lstEn    = this._bool('email_low_stock_enabled');

    const weekDays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dayOptions = weekDays.map((d,i) =>
      `<option value="${i}" ${this._val('email_weekly_summary_day')==String(i)?'selected':''}>${d}</option>`
    ).join('');

    this.container.innerHTML = `
    <div class="er-root">

      <!-- ── Header ─────────────────────────────────────────────────────── -->
      <div class="er-section-header">
        <div class="er-section-header-left">
          <div class="er-section-title">
            <span>📧</span><span>Email Reminders & Summaries</span>
          </div>
          <div class="er-section-desc">
            Automated email digests and overdue alerts sent via your Stalwart Mail Server
            (<code>mail.faizal.uk:587</code>) — completely free, internal delivery.
          </div>
        </div>
        <div class="er-header-actions">
          <span id="erSaveStatus" class="billing-toast-success" style="display:none">
            <span>✓</span> <span>Saved</span>
          </span>
          <button type="button" id="erSaveBtn" class="billing-save-btn" style="padding:7px 16px;font-size:12px">
            Save Changes
          </button>
        </div>
      </div>

      <!-- ── Master Toggle ─────────────────────────────────────────────── -->
      <div class="billing-card">
        <div class="billing-card-header">
          <div>
            <div class="billing-card-title"><span>🔔</span><span>Email Reminders</span></div>
            <div class="billing-card-subtitle">Master switch for all automated email reminders and summaries.</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="er-status-badge ${en?'er-badge-on':'er-badge-off'}" id="erMasterBadge">
              ${en ? '● Active' : '○ Disabled'}
            </span>
          </div>
        </div>
        ${this._renderToggle('erMasterToggle', en, 'Enable Email Reminders',
          'When off, no scheduled emails will be sent regardless of other settings.')}
      </div>

      <!-- ── SMTP Configuration ─────────────────────────────────────────── -->
      <div class="billing-card">
        <div class="billing-card-header">
          <div>
            <div class="billing-card-title"><span>🖥️</span><span>Mail Server & SMTP (Stalwart)</span></div>
            <div class="billing-card-subtitle">Connected to Stalwart Mail Server on <code>my-mac</code>. Zero external costs, local delivery.</div>
          </div>
          <button type="button" id="erStalwartPresetBtn" class="er-action-btn er-btn-secondary" style="font-size:11px;padding:4px 10px">
            ⚡ Fill Stalwart Defaults
          </button>
        </div>
        ${this._renderTextInput('erSmtpHost', this._val('email_smtp_host'), 'SMTP Host', '127.0.0.1 or mail.faizal.uk')}
        ${this._renderTextInput('erSmtpPort', this._val('email_smtp_port'), 'SMTP Port', '587 (STARTTLS) or 465 (SMTPS)')}
        ${this._renderTextInput('erSmtpUser', this._val('email_smtp_user'), 'SMTP Username', 'reports@faizal.uk')}
        ${this._renderTextInput('erSmtpPass', this._val('email_smtp_pass'), 'SMTP Password', '••••••••', 'password')}
        ${this._renderTextInput('erRecipient', this._val('email_reminder_to'), 'Recipient Email(s)', 'me@faizal.uk')}
        ${this._renderTextInput('erSender', this._val('email_reminder_from'), 'Sender Address', 'reports@faizal.uk')}
        <div class="er-test-row">
          <button type="button" id="erTestBtn" class="er-action-btn er-btn-secondary">
            <span>📤</span> Send Test Email
          </button>
          <span id="erTestStatus" class="er-test-status"></span>
        </div>
      </div>

      <!-- ── Daily Summary ──────────────────────────────────────────────── -->
      <div class="billing-card">
        <div class="billing-card-header">
          <div>
            <div class="billing-card-title"><span>☀️</span><span>Daily Business Summary</span></div>
            <div class="billing-card-subtitle">Morning briefing — today's invoices, payments collected, active orders pipeline.</div>
          </div>
        </div>
        ${this._renderToggle('erDailyToggle', dailyEn, "Enable Daily Summary", "Sent every morning at the configured time.")}
        ${this._renderTimeInput('erDailyTime', this._val('email_daily_summary_time'), 'Send At (IST)')}
        <div class="er-send-row">
          <button type="button" class="er-action-btn er-btn-ghost" data-trigger="daily">
            <span>▶</span> Send Now
          </button>
        </div>
      </div>

      <!-- ── Weekly Summary ────────────────────────────────────────────── -->
      <div class="billing-card">
        <div class="billing-card-header">
          <div>
            <div class="billing-card-title"><span>📊</span><span>Weekly Business Summary</span></div>
            <div class="billing-card-subtitle">Full weekly digest — sales, receivables aging, top outstanding customers, orders pipeline.</div>
          </div>
        </div>
        ${this._renderToggle('erWeeklyToggle', weeklyEn, "Enable Weekly Summary", "Sent once per week on the configured day and time.")}
        <div class="er-field-row">
          <label class="er-field-label" for="erWeeklyDay">Day of Week</label>
          <select id="erWeeklyDay" class="er-select billing-input">${dayOptions}</select>
        </div>
        ${this._renderTimeInput('erWeeklyTime', this._val('email_weekly_summary_time'), 'Send At (IST)')}
        <div class="er-send-row">
          <button type="button" class="er-action-btn er-btn-ghost" data-trigger="weekly">
            <span>▶</span> Send Now
          </button>
        </div>
      </div>

      <!-- ── Invoice Overdue Alerts ─────────────────────────────────────── -->
      <div class="billing-card">
        <div class="billing-card-header">
          <div>
            <div class="billing-card-title"><span>🧾</span><span>Invoice Overdue Alerts</span></div>
            <div class="billing-card-subtitle">
              Automated alerts listing unsettled invoices that have crossed aging thresholds.
              Each email includes customer name, balance due, days overdue, and a ledger link.
            </div>
          </div>
        </div>

        <div class="er-alert-group">
          <div class="er-alert-row">
            <div class="er-alert-icon" style="background:rgba(255,159,10,.12);color:#ff9f0a">⚠️</div>
            <div class="er-alert-body">
              ${this._renderToggle('erInv7Toggle', inv7En, '7-Day Overdue Alert',
                'Invoices unsettled for 7+ days — gentle early warning.')}
            </div>
          </div>
          <div class="er-alert-row">
            <div class="er-alert-icon" style="background:rgba(255,107,53,.12);color:#ff6b35">⚠️</div>
            <div class="er-alert-body">
              ${this._renderToggle('erInv14Toggle', inv14En, '14-Day Overdue Alert',
                'Invoices unsettled for 14+ days — follow-up needed.')}
            </div>
          </div>
          <div class="er-alert-row">
            <div class="er-alert-icon" style="background:rgba(255,69,58,.12);color:#ff453a">🚨</div>
            <div class="er-alert-body">
              ${this._renderToggle('erInv30Toggle', inv30En, '30-Day Overdue Alert',
                'Invoices unsettled for 30+ days — critical collection required.')}
            </div>
          </div>
        </div>

        ${this._renderTimeInput('erInvTime', this._val('email_invoice_check_time'), 'Daily Check Time (IST)')}

        <div class="er-send-row" style="gap:8px">
          <button type="button" class="er-action-btn er-btn-ghost" data-trigger="invoice" data-days="7">▶ 7d Now</button>
          <button type="button" class="er-action-btn er-btn-ghost" data-trigger="invoice" data-days="14">▶ 14d Now</button>
          <button type="button" class="er-action-btn er-btn-ghost" data-trigger="invoice" data-days="30">▶ 30d Now</button>
        </div>
      </div>

      <!-- ── Order Pending Alerts ───────────────────────────────────────── -->
      <div class="billing-card">
        <div class="billing-card-header">
          <div>
            <div class="billing-card-title"><span>📦</span><span>Pending Order Alerts</span></div>
            <div class="billing-card-subtitle">
              Alerts for orders stuck in the pipeline — helps ensure timely dispatch and follow-up.
            </div>
          </div>
        </div>

        <div class="er-alert-group">
          <div class="er-alert-row">
            <div class="er-alert-icon" style="background:rgba(255,159,10,.12);color:#ff9f0a">⏳</div>
            <div class="er-alert-body">
              ${this._renderToggle('erOrd3Toggle', ord3En, '3-Day Pending Alert',
                'Orders not dispatched after 3 days — early nudge.')}
            </div>
          </div>
          <div class="er-alert-row">
            <div class="er-alert-icon" style="background:rgba(255,69,58,.12);color:#ff453a">⏳</div>
            <div class="er-alert-body">
              ${this._renderToggle('erOrd7Toggle', ord7En, '7-Day Pending Alert',
                'Orders pending for 7+ days — urgent review required.')}
            </div>
          </div>
        </div>

        ${this._renderTimeInput('erOrdTime', this._val('email_order_check_time'), 'Daily Check Time (IST)')}

        <div class="er-send-row" style="gap:8px">
          <button type="button" class="er-action-btn er-btn-ghost" data-trigger="order" data-days="3">▶ 3d Now</button>
          <button type="button" class="er-action-btn er-btn-ghost" data-trigger="order" data-days="7">▶ 7d Now</button>
        </div>
      </div>

      <!-- ── Low Stock Alert ───────────────────────────────────────────── -->
      <div class="billing-card">
        <div class="billing-card-header">
          <div>
            <div class="billing-card-title"><span>📉</span><span>Low Stock Alert</span></div>
            <div class="billing-card-subtitle">
              Morning alert listing product variants with low sold-unit counts — helps plan restocking.
            </div>
          </div>
        </div>
        ${this._renderToggle('erLstToggle', lstEn, 'Enable Low Stock Alert', 'Checks inventory every morning at the configured time.')}
        ${this._renderTimeInput('erLstTime', this._val('email_low_stock_check_time'), 'Send At (IST)')}
        <div class="er-send-row">
          <button type="button" class="er-action-btn er-btn-ghost" data-trigger="lowstock">
            <span>▶</span> Send Now
          </button>
        </div>
      </div>

      <!-- ── Save footer ───────────────────────────────────────────────── -->
      <div style="display:flex;justify-content:flex-end;padding:4px 0 16px">
        <button type="button" id="erSaveBtnFooter" class="billing-save-btn">Save Changes</button>
      </div>

    </div>`;
  }

  _bindEvents() {
    const c = this.container;

    // Toggle buttons
    c.querySelectorAll('.billing-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        btn.setAttribute('aria-checked', btn.classList.contains('active'));
        // Update master badge
        if (btn.id === 'erMasterToggle') {
          const badge = c.querySelector('#erMasterBadge');
          if (badge) {
            const on = btn.classList.contains('active');
            badge.className = `er-status-badge ${on ? 'er-badge-on' : 'er-badge-off'}`;
            badge.textContent = on ? '● Active' : '○ Disabled';
          }
        }
      });
    });

    // Save
    const triggerSave = () => this._save();
    c.querySelector('#erSaveBtn')?.addEventListener('click', triggerSave);
    c.querySelector('#erSaveBtnFooter')?.addEventListener('click', triggerSave);

    // Test email
    c.querySelector('#erTestBtn')?.addEventListener('click', () => this._testEmail());

    // Stalwart preset button
    c.querySelector('#erStalwartPresetBtn')?.addEventListener('click', () => {
      const setVal = (id, val) => { const el = c.querySelector(`#${id}`); if (el) el.value = val; };
      setVal('erSmtpHost', '127.0.0.1');
      setVal('erSmtpPort', '587');
      setVal('erSmtpUser', 'reports@faizal.uk');
      setVal('erSmtpPass', 'FaizalReports2026!');
      setVal('erSender', 'reports@faizal.uk');
      setVal('erRecipient', 'me@faizal.uk');
      const status = c.querySelector('#erTestStatus');
      if (status) {
        status.textContent = '⚡ Filled Stalwart defaults. Click "Save Changes" or "Send Test Email".';
        status.className = 'er-test-status er-test-ok';
      }
    });

    // Manual trigger buttons
    c.querySelectorAll('[data-trigger]').forEach(btn => {
      btn.addEventListener('click', () => this._triggerNow(btn.dataset.trigger, btn.dataset.days));
    });
  }

  async _save() {
    const c = this.container;
    const getBool = (id) => c.querySelector(`#${id}`)?.classList.contains('active') ? 'true' : 'false';
    const getVal  = (id) => c.querySelector(`#${id}`)?.value?.trim() || '';

    const newSettings = {
      ...this.settings,
      email_reminders_enabled:       getBool('erMasterToggle'),
      email_smtp_host:               getVal('erSmtpHost') || '127.0.0.1',
      email_smtp_port:               getVal('erSmtpPort') || '587',
      email_smtp_user:               getVal('erSmtpUser') || 'reports@faizal.uk',
      email_smtp_pass:               getVal('erSmtpPass') || 'FaizalReports2026!',
      email_reminder_to:             getVal('erRecipient') || 'me@faizal.uk',
      email_reminder_from:           getVal('erSender') || 'reports@faizal.uk',
      email_daily_summary_enabled:   getBool('erDailyToggle'),
      email_daily_summary_time:      getVal('erDailyTime') || '08:00',
      email_weekly_summary_enabled:  getBool('erWeeklyToggle'),
      email_weekly_summary_day:      getVal('erWeeklyDay') || '1',
      email_weekly_summary_time:     getVal('erWeeklyTime') || '09:00',
      email_invoice_7d_enabled:      getBool('erInv7Toggle'),
      email_invoice_14d_enabled:     getBool('erInv14Toggle'),
      email_invoice_30d_enabled:     getBool('erInv30Toggle'),
      email_invoice_check_time:      getVal('erInvTime') || '10:00',
      email_order_3d_enabled:        getBool('erOrd3Toggle'),
      email_order_7d_enabled:        getBool('erOrd7Toggle'),
      email_order_check_time:        getVal('erOrdTime') || '10:30',
      email_low_stock_enabled:       getBool('erLstToggle'),
      email_low_stock_check_time:    getVal('erLstTime') || '07:00',
    };

    const saveBtn  = c.querySelector('#erSaveBtn');
    const saveBtn2 = c.querySelector('#erSaveBtnFooter');
    [saveBtn, saveBtn2].filter(Boolean).forEach(b => {
      b.disabled = true; b.innerHTML = '⏳ Saving…';
    });

    try {
      const res = await fetch('/api/settings/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: newSettings }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.settings = newSettings;
      const toast = c.querySelector('#erSaveStatus');
      if (toast) { toast.style.display = 'inline-flex'; setTimeout(() => toast.style.display = 'none', 3000); }
    } catch (err) {
      alert('Failed to save email settings: ' + err.message);
    } finally {
      [saveBtn, saveBtn2].filter(Boolean).forEach(b => {
        b.disabled = false; b.innerHTML = 'Save Changes';
      });
    }
  }

  async _testEmail() {
    const btn    = this.container.querySelector('#erTestBtn');
    const status = this.container.querySelector('#erTestStatus');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Sending…'; }
    if (status) { status.textContent = ''; status.className = 'er-test-status'; }
    try {
      // Save first so recipient is up to date
      await this._save();
      const res  = await fetch('/api/billing/email/test', { method: 'POST' });
      const data = await res.json();
      if (status) {
        status.textContent = data.ok ? '✅ Test email sent successfully!' : `❌ ${data.error || 'Send failed'}`;
        status.className   = `er-test-status ${data.ok ? 'er-test-ok' : 'er-test-fail'}`;
      }
    } catch (err) {
      if (status) { status.textContent = '❌ ' + err.message; status.className = 'er-test-status er-test-fail'; }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<span>📤</span> Send Test Email'; }
    }
  }

  async _triggerNow(type, days) {
    const btn = event?.target?.closest('[data-trigger]');
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Sending…'; }
    try {
      const body = { type };
      if (days) body.days = parseInt(days, 10);
      const res  = await fetch('/api/billing/email/trigger', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok === false && data.error) {
        alert(`Email trigger failed: ${data.error}`);
      } else {
        const label = { daily:'Daily Summary', weekly:'Weekly Summary', invoice:`${days}d Invoice Alert`,
          order:`${days}d Order Alert`, lowstock:'Low Stock Alert' }[type] || type;
        const msg = data.ok
          ? `✅ ${label} sent successfully.`
          : `⚠️ ${label}: No matching data found (no overdue invoices/orders to report).`;
        // Brief inline toast
        const toast = document.createElement('span');
        toast.className = `er-test-status ${data.ok ? 'er-test-ok' : 'er-test-warn'}`;
        toast.textContent = msg;
        toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;font-size:13px;padding:8px 16px;border-radius:8px;background:#1c1c1e;border:1px solid rgba(255,255,255,.1)';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
      }
    } catch (err) {
      alert('Trigger error: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.days ? `▶ ${btn.dataset.days}d Now` : '<span>▶</span> Send Now'; }
    }
  }
}
