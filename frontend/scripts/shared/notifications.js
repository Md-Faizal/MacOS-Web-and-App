/**
 * Unified Notification System for MacOS App
 * Provides modern liquid glass toasts for app feedback
 */

class NotificationSystem {
  constructor() {
    this.container = this.createContainer();
    this.notifications = new Map(); // Store by ID for updates
    this.counter = 0;
    this.systemPermission = 'Notification' in window ? Notification.permission : 'denied';
    
    // Auto-request permission if default
    if (this.systemPermission === 'default') {
      setTimeout(() => this.requestPermission(), 2000);
    }
  }

  createContainer() {
    let container = document.getElementById('notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notification-container';
      document.body.appendChild(container);
      this.injectStyles();
    }
    return container;
  }

  injectStyles() {
    const styleId = 'notification-system-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      #notification-container {
        position: fixed;
        top: 30px;
        right: 20px;
        z-index: 10000005;
        display: flex;
        flex-direction: column;
        gap: 12px;
        pointer-events: none;
      }

      .notification-toast {
        min-width: 300px;
        max-width: 380px;
        padding: 16px;
        background: rgba(28, 32, 36, 0.75);
        backdrop-filter: blur(25px) saturate(180%);
        -webkit-backdrop-filter: blur(25px) saturate(180%);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 14px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4), 
                    inset 0 0 0 1px rgba(255, 255, 255, 0.05);
        color: white;
        font-family: 'SF Pro Display', 'Inter', sans-serif;
        pointer-events: auto;
        animation: toast-in 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        display: flex;
        flex-direction: column;
        gap: 10px;
        cursor: default;
        transition: transform 0.3s ease, opacity 0.3s ease;
        overflow: hidden;
      }

      .notification-toast.hiding {
        animation: toast-out 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      }

      .toast-header {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        position: relative;
      }

      .toast-icon {
        font-size: 22px;
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.05);
      }

      .toast-content {
        flex: 1;
        padding-right: 20px;
      }

      .toast-title {
        font-weight: 700;
        font-size: 14px;
        margin-bottom: 2px;
        color: #fff;
      }

      .toast-message {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.7);
        line-height: 1.4;
      }

      /* Progress Bar Styles */
      .toast-progress-container {
        height: 4px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
        width: 100%;
        margin-top: 4px;
        overflow: hidden;
      }

      .toast-progress-bar {
        height: 100%;
        background: #FF6B00;
        width: 0%;
        transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 0 10px rgba(255, 107, 0, 0.3);
      }

      .toast-close {
        position: absolute;
        top: 0;
        right: -5px;
        font-size: 18px;
        opacity: 0.4;
        cursor: pointer;
        transition: all 0.2s;
        color: rgba(255,255,255,0.6);
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
      }

      .notification-toast:hover .toast-close {
        opacity: 1;
      }

      .toast-close:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }

      @keyframes toast-in {
        from { transform: translateX(120%) scale(0.9); opacity: 0; }
        to { transform: translateX(0) scale(1); opacity: 1; }
      }

      @keyframes toast-out {
        from { transform: translateX(0) scale(1); opacity: 1; }
        to { transform: translateX(120%) scale(0.9); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  async requestPermission() {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      this.systemPermission = await Notification.requestPermission();
      return this.systemPermission;
    }
    return this.systemPermission;
  }

  show(title, message, options = {}) {
    const { type = 'info', duration = 4000, progress = null, system = false } = options;
    const id = `toast-${++this.counter}`;
    
    // System Notification fallback
    if (system && this.systemPermission === 'granted') {
      try {
        new Notification(title, { body: message, icon: 'https://cdn-icons-png.flaticon.com/512/179/179331.png' });
      } catch (e) {
        console.warn('System notification failed', e);
      }
    }

    const toast = document.createElement('div');
    toast.className = `notification-toast toast-${type}`;
    toast.id = id;
    
    const iconMap = {
      info: 'ℹ️',
      success: '✅',
      error: '❌',
      warning: '⚠️',
      cloud: '☁️',
      upload: '⬆️',
      delete: '🗑️',
      rename: '✏️'
    };

    toast.innerHTML = `
      <div class="toast-header">
        <div class="toast-icon">${iconMap[type] || iconMap.info}</div>
        <div class="toast-content">
          <div class="toast-title">${title}</div>
          <div class="toast-message">${message}</div>
        </div>
        <div class="toast-close">×</div>
      </div>
      ${progress !== null ? `
        <div class="toast-progress-container">
          <div class="toast-progress-bar" style="width: ${progress}%"></div>
        </div>
      ` : ''}
    `;

    this.container.appendChild(toast);
    this.notifications.set(id, toast);

    toast.querySelector('.toast-close').onclick = (e) => {
      e.stopPropagation();
      this.hide(id);
    };

    if (duration > 0) {
      setTimeout(() => {
        this.hide(id);
      }, duration);
    }

    return id;
  }

  update(id, options = {}) {
    const toast = this.notifications.get(id);
    if (!toast) return;

    const { title, message, progress, type } = options;

    if (title) toast.querySelector('.toast-title').textContent = title;
    if (message) toast.querySelector('.toast-message').textContent = message;
    if (progress !== undefined && progress !== null) {
      let progressBar = toast.querySelector('.toast-progress-bar');
      if (!progressBar) {
        const container = document.createElement('div');
        container.className = 'toast-progress-container';
        container.innerHTML = `<div class="toast-progress-bar"></div>`;
        toast.appendChild(container);
        progressBar = container.querySelector('.toast-progress-bar');
      }
      setTimeout(() => {
        progressBar.style.width = `${progress}%`;
      }, 10);
    }
    
    if (type) {
      // Remove all toast- types and add new one
      toast.classList.forEach(cls => {
        if (cls.startsWith('toast-') && cls !== 'toast-header' && cls !== 'toast-icon') {
          toast.classList.remove(cls);
        }
      });
      toast.classList.add(`toast-${type}`);
      
      const iconMap = { upload: '⬆️', success: '✅', error: '❌', info: 'ℹ️', delete: '🗑️', rename: '✏️' };
      if (iconMap[type]) toast.querySelector('.toast-icon').textContent = iconMap[type];
    }
  }

  hide(id) {
    const toast = typeof id === 'string' ? this.notifications.get(id) : id;
    if (!toast || toast.classList.contains('hiding')) return;

    toast.classList.add('hiding');
    toast.addEventListener('animationend', () => {
      toast.remove();
      if (typeof id === 'string') this.notifications.delete(id);
    }, { once: true });
  }
}

export const notifications = new NotificationSystem();
window.notifications = notifications; // Make available globally
