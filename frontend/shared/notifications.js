/**
 * MacOS Uniform Glassmorphic & Native Device Notification Engine
 * Standardized across all MacOS WebApp and Core 4 modules.
 * 
 * Features:
 * 1. Native macOS Glassmorphic Toast Stack (Sonoma/Sequoia styling, backdrop-blur, smooth animations)
 * 2. Web Audio API synthesized pristine macOS chimes (zero network latency, 100% offline)
 * 3. HTML5 Device OS Notifications (fires when browser is backgrounded/minimized)
 * 4. Automatic CoreDataBus reactive stream integration
 * 5. Universal backward-compatible facade (window.showNotification)
 */

(function(global) {
  'use strict';

  const log = (typeof global.MacOSLogger !== 'undefined')
    ? global.MacOSLogger.createScope('Notifications')
    : { debug: () => {}, info: () => {}, warn: console.warn.bind(console), error: console.error.bind(console) };

  class MacOSNotificationManager {
    constructor() {
      this.container = null;
      this.audioContext = null;
      this.activeToasts = [];
      this.maxVisibleToasts = 5;
      this.soundEnabled = localStorage.getItem('macos_notifications_sound') !== 'false';
      this.nativePermissionRequested = false;

      this.appIcons = {
        'billing': '/assets/Images/Billing.png',
        'ledger': '/assets/Images/Billing.png',
        'contacts': '/assets/Images/Contact.png',
        'contact': '/assets/Images/Contact.png',
        'products': '/assets/Images/List.png',
        'product-list': '/assets/Images/List.png',
        'inventory': '/assets/Images/List.png',
        'analytics': '/assets/Images/Analytics.png',
        'notes': '/assets/Images/Notes.png',
        'calendar': '/assets/Images/Calender.png',
        'calculator': '/assets/Images/Calculator.png',
        'cloud': '/assets/Images/Cloud.png',
        'settings': '/assets/Images/Quick Settings.png',
        'system': '/assets/Images/Favicon.png',
        'default': '/assets/Images/Favicon.png'
      };

      this.init();
    }

    init() {
      if (typeof document === 'undefined') return;

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.setupContainer());
      } else {
        this.setupContainer();
      }

      this.setupCoreDataBusListener();
      this.autoRequestNativePermission();
    }

    setupContainer() {
      if (this.container || typeof document === 'undefined') return;

      let el = document.getElementById('macos-notification-center');
      if (!el) {
        el = document.createElement('div');
        el.id = 'macos-notification-center';
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('aria-atomic', 'true');
        document.body.appendChild(el);
      }
      this.container = el;
    }

    autoRequestNativePermission() {
      if (typeof window === 'undefined' || !('Notification' in window) || !window.Notification) return;

      // If already granted or denied, don't show prompt
      if (window.Notification.permission !== 'default') return;

      const showBanner = () => {
        if (window.Notification.permission !== 'default') return;
        if (sessionStorage.getItem('macos_perm_banner_dismissed') === 'true') return;
        if (document.getElementById('macos-permission-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'macos-permission-banner';
        banner.className = 'macos-permission-banner';
        banner.innerHTML = `
          <div class="perm-banner-icon">🔔</div>
          <div class="perm-banner-content">
            <div class="perm-banner-title">Enable Desktop Notifications</div>
            <div class="perm-banner-desc">Get instant desktop alerts for payments, bills, and order updates.</div>
          </div>
          <div class="perm-banner-actions">
            <button class="perm-btn perm-btn-later" id="macosPermLaterBtn">Later</button>
            <button class="perm-btn perm-btn-allow" id="macosPermAllowBtn">Allow Notifications</button>
          </div>
        `;

        document.body.appendChild(banner);

        const allowBtn = banner.querySelector('#macosPermAllowBtn');
        const laterBtn = banner.querySelector('#macosPermLaterBtn');

        if (allowBtn) {
          allowBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.Notification.requestPermission().then(permission => {
              banner.style.animation = 'bannerSlideDown 0.3s ease reverse forwards';
              setTimeout(() => banner.remove(), 300);
              if (permission === 'granted') {
                this.dispatchNativeNotification('Notifications Active', 'Native desktop alerts are now enabled.', { app: 'System' });
                this.notify({
                  app: 'System',
                  title: 'Notifications Enabled',
                  message: 'Native desktop alerts are active for all apps.',
                  type: 'success'
                });
              }
            }).catch(() => { banner.remove(); });
          });
        }

        if (laterBtn) {
          laterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sessionStorage.setItem('macos_perm_banner_dismissed', 'true');
            banner.style.animation = 'bannerSlideDown 0.3s ease reverse forwards';
            setTimeout(() => banner.remove(), 300);
          });
        }
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(showBanner, 800));
      } else {
        setTimeout(showBanner, 800);
      }
    }

    requestNativePermission() {
      if (typeof window !== 'undefined' && 'Notification' in window && window.Notification) {
        return window.Notification.requestPermission();
      }
      return Promise.resolve('denied');
    }

    isSoundEnabled() {
      return this.soundEnabled && localStorage.getItem('macos_notifications_sound') !== 'false';
    }

    setSoundEnabled(enabled) {
      this.soundEnabled = Boolean(enabled);
      localStorage.setItem('macos_notifications_sound', this.soundEnabled ? 'true' : 'false');
    }

    /**
     * Synthesize clean, crystal macOS acoustic chimes via Web Audio API
     */
    playChime(type = 'info') {
      if (!this.isSoundEnabled()) return;

      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        if (!this.audioContext) {
          this.audioContext = new AudioCtx();
        }

        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume().catch(() => {});
        }

        const now = this.audioContext.currentTime;

        // Frequencies for subtle dual-tone harmonized bell
        let f1 = 587.33; // D5
        let f2 = 880.00; // A5

        if (type === 'success') {
          f1 = 783.99;  // G5
          f2 = 1046.50; // C6
        } else if (type === 'error') {
          f1 = 440.00;  // A4
          f2 = 349.23;  // F4
        } else if (type === 'warning') {
          f1 = 659.25;  // E5
          f2 = 783.99;  // G5
        } else if (type === 'critical') {
          f1 = 880.00;  // A5
          f2 = 1174.66; // D6
        }

        // Primary bell oscillator
        const osc1 = this.audioContext.createOscillator();
        const gain1 = this.audioContext.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(f1, now);
        osc1.frequency.exponentialRampToValueAtTime(f2, now + 0.12);

        gain1.gain.setValueAtTime(0.001, now);
        gain1.gain.linearRampToValueAtTime(0.12, now + 0.02);
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

        osc1.connect(gain1);
        gain1.connect(this.audioContext.destination);

        osc1.start(now);
        osc1.stop(now + 0.40);

        // Overtone shimmer oscillator (glass sparkle)
        const osc2 = this.audioContext.createOscillator();
        const gain2 = this.audioContext.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(f2 * 1.5, now);

        gain2.gain.setValueAtTime(0.001, now);
        gain2.gain.linearRampToValueAtTime(0.03, now + 0.03);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

        osc2.connect(gain2);
        gain2.connect(this.audioContext.destination);

        osc2.start(now);
        osc2.stop(now + 0.30);
      } catch (err) {
        log.debug('Audio chime synthesis suppressed:', err.message);
      }
    }

    /**
     * Dispatch Native Device OS notification to system notification center
     */
    dispatchNativeNotification(title, message, options = {}) {
      if (typeof window === 'undefined' || !('Notification' in window) || !window.Notification) return;
      if (window.Notification.permission !== 'granted') return;

      try {
        const appKey = (options.app || 'system').toLowerCase();
        let icon = options.icon || this.appIcons[appKey] || this.appIcons['default'];

        // Resolve absolute URL for OS notification daemon (Windows/macOS/Linux)
        if (icon && typeof window !== 'undefined' && window.location) {
          try {
            icon = new URL(icon, window.location.origin).href;
          } catch (_) {}
        }

        const nativeNotif = new window.Notification(title, {
          body: message,
          icon: icon,
          badge: icon,
          tag: options.tag || `macos-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          silent: !this.isSoundEnabled()
        });

        nativeNotif.onclick = () => {
          window.focus();
          nativeNotif.close();
          if (typeof options.onClick === 'function') {
            options.onClick();
          }
        };
      } catch (e) {
        log.debug('Native notification dispatch failed:', e.message);
      }
    }

    /**
     * Master notification dispatcher
     */
    notify(rawOptions) {
      this.setupContainer();

      let options = {};
      if (typeof rawOptions === 'string') {
        options = { message: rawOptions, title: 'Notification', type: 'info' };
      } else {
        options = { ...rawOptions };
      }

      const type = options.type || 'info';
      const title = options.title || (type.charAt(0).toUpperCase() + type.slice(1));
      const message = options.message || '';
      const appName = options.app || 'System';
      const duration = typeof options.duration === 'number' ? options.duration : 4000;
      const sound = options.sound !== false;

      const appKey = appName.toLowerCase().replace(/\s+/g, '-');
      const iconUrl = options.icon || this.appIcons[appKey] || this.appIcons['default'];

      // 1. Play synthesized glass audio chime
      if (sound) {
        this.playChime(type);
      }

      // 2. Dispatch native device OS notification
      if (options.native !== false && typeof window !== 'undefined' && 'Notification' in window && window.Notification) {
        if (window.Notification.permission === 'granted') {
          this.dispatchNativeNotification(title, message, { ...options, app: appName, icon: iconUrl });
        } else if (window.Notification.permission === 'default') {
          this.requestNativePermission().then(perm => {
            if (perm === 'granted') {
              this.dispatchNativeNotification(title, message, { ...options, app: appName, icon: iconUrl });
            }
          }).catch(() => {});
        }
      }

      // 3. Render Glassmorphic On-Screen Toast Card
      if (!this.container) return null;

      const toast = document.createElement('div');
      toast.className = `macos-notification-toast toast-type-${type}`;
      toast.setAttribute('role', 'status');

      // Header: App icon, App name, Time, Close button
      const header = document.createElement('div');
      header.className = 'toast-header';

      const iconImg = document.createElement('img');
      iconImg.className = 'toast-app-icon';
      iconImg.src = iconUrl;
      iconImg.alt = appName;
      iconImg.onerror = () => { iconImg.src = this.appIcons['default']; };

      const appTitle = document.createElement('span');
      appTitle.className = 'toast-app-title';
      appTitle.textContent = appName;

      const timeSpan = document.createElement('span');
      timeSpan.className = 'toast-time';
      timeSpan.textContent = 'now';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'toast-close-btn';
      closeBtn.innerHTML = '✕';
      closeBtn.title = 'Dismiss';
      closeBtn.setAttribute('aria-label', 'Dismiss notification');

      header.appendChild(iconImg);
      header.appendChild(appTitle);
      header.appendChild(timeSpan);
      header.appendChild(closeBtn);

      // Body: Title, Message
      const body = document.createElement('div');
      body.className = 'toast-body';

      // Dynamically detect theme for guaranteed high contrast regardless of CSS caching
      const isDark = (typeof document !== 'undefined') && Boolean(
        (typeof document.documentElement?.getAttribute === 'function' && document.documentElement.getAttribute('data-theme') === 'dark') ||
        (typeof document.documentElement?.getAttribute === 'function' && document.documentElement.getAttribute('data-macos-theme') === 'dark') ||
        (typeof document.body?.getAttribute === 'function' && document.body.getAttribute('data-theme') === 'dark') ||
        (typeof document.body?.classList?.contains === 'function' && document.body.classList.contains('dark-theme')) ||
        (typeof document.body?.classList?.contains === 'function' && document.body.classList.contains('dark-mode')) ||
        (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches &&
         !(typeof document.documentElement?.getAttribute === 'function' && document.documentElement.getAttribute('data-theme') === 'light'))
      );

      // Force guaranteed high-contrast styling on container
      toast.style.background = isDark ? 'rgba(28, 30, 34, 0.96)' : 'rgba(255, 255, 255, 0.98)';
      toast.style.color = isDark ? '#ffffff' : '#111827';
      toast.style.border = isDark ? '1px solid rgba(255, 255, 255, 0.16)' : '1px solid rgba(0, 0, 0, 0.12)';
      toast.style.boxShadow = isDark 
        ? '0 18px 40px rgba(0,0,0,0.65), 0 2px 10px rgba(0,0,0,0.35)' 
        : '0 14px 34px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)';

      appTitle.style.color = isDark ? '#d1d5db' : '#4b5563';
      appTitle.style.fontWeight = '700';
      timeSpan.style.color = isDark ? '#9ca3af' : '#6b7280';
      closeBtn.style.color = isDark ? '#f3f4f6' : '#374151';
      closeBtn.style.background = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.07)';

      if (title) {
        const titleEl = document.createElement('div');
        titleEl.className = 'toast-title';
        titleEl.textContent = title;
        titleEl.style.color = isDark ? '#ffffff' : '#111827';
        titleEl.style.fontWeight = '700';
        titleEl.style.fontSize = '13.5px';
        titleEl.style.lineHeight = '1.35';
        body.appendChild(titleEl);
      }

      if (message) {
        const msgEl = document.createElement('div');
        msgEl.className = 'toast-message';
        msgEl.textContent = message;
        msgEl.style.color = isDark ? '#e5e7eb' : '#374151';
        msgEl.style.fontWeight = '500';
        msgEl.style.fontSize = '12.5px';
        msgEl.style.lineHeight = '1.45';
        body.appendChild(msgEl);
      }

      toast.appendChild(header);
      toast.appendChild(body);

      // Optional action buttons
      if (Array.isArray(options.actions) && options.actions.length > 0) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'toast-actions';
        options.actions.forEach(action => {
          const btn = document.createElement('button');
          btn.className = `toast-action-btn ${action.primary ? 'primary' : ''}`;
          btn.textContent = action.label;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof action.onClick === 'function') action.onClick();
            dismissToast();
          });
          actionsDiv.appendChild(btn);
        });
        toast.appendChild(actionsDiv);
      }

      // Hairline progress bar
      let progressBar = null;
      if (duration > 0) {
        progressBar = document.createElement('div');
        progressBar.className = 'toast-progress-bar';
        progressBar.style.transition = `transform ${duration}ms linear`;
        progressBar.style.transform = 'scaleX(1)';
        toast.appendChild(progressBar);
      }

      // Stack management: Remove oldest if exceeding maxVisibleToasts
      if (this.activeToasts.length >= this.maxVisibleToasts) {
        const oldest = this.activeToasts.shift();
        if (oldest && typeof oldest.dismiss === 'function') {
          oldest.dismiss();
        }
      }

      this.container.appendChild(toast);

      // Trigger entering animation on next paint
      requestAnimationFrame(() => {
        toast.classList.add('toast-entering');
        if (progressBar) {
          requestAnimationFrame(() => {
            progressBar.style.transform = 'scaleX(0)';
          });
        }
      });

      // Auto-dismiss logic with pause on hover
      let timer = null;
      let remaining = duration;
      let start = Date.now();

      const startTimer = () => {
        if (duration <= 0) return;
        start = Date.now();
        timer = setTimeout(dismissToast, remaining);
      };

      const pauseTimer = () => {
        if (duration <= 0) return;
        clearTimeout(timer);
        remaining -= (Date.now() - start);
      };

      toast.addEventListener('mouseenter', pauseTimer);
      toast.addEventListener('mouseleave', () => {
        if (remaining > 0) startTimer();
      });

      let isDismissed = false;
      const dismissToast = () => {
        if (isDismissed) return;
        isDismissed = true;
        clearTimeout(timer);

        toast.classList.remove('toast-entering');
        toast.classList.add('toast-exiting');

        setTimeout(() => {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
          const idx = this.activeToasts.indexOf(toastRecord);
          if (idx !== -1) this.activeToasts.splice(idx, 1);
        }, 350);
      };

      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissToast();
      });

      toast.addEventListener('click', () => {
        if (typeof options.onClick === 'function') {
          options.onClick();
        }
        dismissToast();
      });

      const toastRecord = { element: toast, dismiss: dismissToast };
      this.activeToasts.push(toastRecord);

      startTimer();
      return toastRecord;
    }

    // Semantic helper shorthands
    success(title, message, options = {}) {
      return this.notify({ ...options, title, message, type: 'success' });
    }

    error(title, message, options = {}) {
      return this.notify({ ...options, title, message, type: 'error', duration: options.duration || 6000 });
    }

    warning(title, message, options = {}) {
      return this.notify({ ...options, title, message, type: 'warning', duration: options.duration || 5000 });
    }

    info(title, message, options = {}) {
      return this.notify({ ...options, title, message, type: 'info' });
    }

    /**
     * Automatic CoreDataBus Reactive Integration
     */
    setupCoreDataBusListener() {
      if (typeof window === 'undefined' || !window.CoreDataBus) {
        // Retry when CoreDataBus is initialized
        setTimeout(() => this.setupCoreDataBusListener(), 500);
        return;
      }

      // Billing events
      window.CoreDataBus.subscribeDomain('billing:', (data) => {
        const action = data?.action;
        const payload = data?.payload || {};

        if (action === 'created' && data?.domain === 'billing:invoice') {
          const invNo = payload.invoice_no ? ` #${payload.invoice_no}` : '';
          const amt = payload.total_amount ? ` (₹${Number(payload.total_amount).toLocaleString('en-IN')})` : '';
          this.success('Bill Created', `New invoice${invNo} generated${amt}`, {
            app: 'Billing',
            tag: `bill-${payload.id || Date.now()}`,
            onClick: () => {
              if (window.currentBillingApp?.switchView) {
                window.currentBillingApp.switchView('ledger');
              }
            }
          });
        } else if (action === 'created' && data?.domain === 'billing:payment') {
          const cust = payload.customer_name ? ` from ${payload.customer_name}` : '';
          const amt = payload.amount ? `₹${Number(payload.amount).toLocaleString('en-IN')}` : 'Payment';
          this.success('Payment Received', `${amt}${cust} recorded successfully`, {
            app: 'Billing',
            tag: `payment-${payload.id || Date.now()}`,
            onClick: () => {
              if (window.currentBillingApp?.switchView) {
                window.currentBillingApp.switchView('ledger');
              }
            }
          });
        }
      });

      // Inventory events
      window.CoreDataBus.subscribeDomain('inventory:', (data) => {
        const action = data?.action;
        const payload = data?.payload || {};

        if (action === 'created' && data?.domain === 'inventory:product') {
          const name = payload.name ? `: ${payload.name}` : '';
          this.info('Product Added', `New item${name} registered in inventory`, {
            app: 'Products',
            tag: `product-${payload.id || Date.now()}`
          });
        }
      });

      // Contacts events
      window.CoreDataBus.subscribeDomain('contacts:', (data) => {
        const action = data?.action;
        const payload = data?.payload || {};

        if (action === 'created' && data?.domain === 'contacts:customer') {
          const name = payload.name ? `: ${payload.name}` : '';
          this.info('Contact Saved', `New customer profile${name} created`, {
            app: 'Contacts',
            tag: `contact-${payload.id || Date.now()}`
          });
        }
      });
    }
  }

  // Create singleton instance
  const manager = new MacOSNotificationManager();
  global.MacOSNotificationManager = manager;

  /**
   * Universal Global showNotification Facade
   * Automatically normalizes all legacy calls across existing apps:
   * - showNotification("Message text", "success")
   * - showNotification("Title", "Message text", "info")
   * - showNotification({ title, message, type, ... })
   */
  global.showNotification = function(arg1, arg2, arg3) {
    if (typeof arg1 === 'object' && arg1 !== null) {
      return manager.notify(arg1);
    }

    if (typeof arg1 === 'string' && typeof arg2 === 'string' && typeof arg3 === 'string') {
      return manager.notify({ title: arg1, message: arg2, type: arg3 });
    }

    if (typeof arg1 === 'string' && typeof arg2 === 'string') {
      const isKnownType = ['info', 'success', 'warning', 'error', 'critical'].includes(arg2.toLowerCase());
      if (isKnownType) {
        return manager.notify({ title: '', message: arg1, type: arg2.toLowerCase() });
      }
      return manager.notify({ title: arg1, message: arg2, type: 'info' });
    }

    if (typeof arg1 === 'string') {
      return manager.notify({ message: arg1, type: 'info' });
    }

    return null;
  };

  log.debug('🚀 MacOSNotificationManager initialized & global showNotification facade mounted.');

})(typeof window !== 'undefined' ? window : globalThis);
