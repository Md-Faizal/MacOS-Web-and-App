// ========================================
// STANDARDIZED CLOCK COMPONENT SCRIPT
// ======================================== 

const getScopedStorageKey = (baseKey) => {
  const userId = window.currentUserData?.id || sessionStorage.getItem('macos_user_id') || localStorage.getItem('macos_active_user_id') || 'guest';
  const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_') || 'guest';
  return `${baseKey}__user_${safeUserId}`;
};

class ClockDisplay {
  constructor(elementId, options = {}) {
    this.element = document.getElementById(elementId);
    this.options = {
      updateInterval: options.updateInterval || 1000, // 1 second
      format: options.format || '12h', // '12h' or '24h'
      showComma: options.showComma !== false, // Show comma after weekday by default
      ...options
    };
    
    this.updateIntervalId = null;
    
    this.init();
  }

  getScopedStorageKey(baseKey) {
    const userId = window.currentUserData?.id || sessionStorage.getItem('macos_user_id') || localStorage.getItem('macos_active_user_id') || 'guest';
    const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_') || 'guest';
    return `${baseKey}__user_${safeUserId}`;
  }

  init() {
    // Load global settings
    try {
      this.timeSettings = JSON.parse(localStorage.getItem(this.getScopedStorageKey('mac-system-time-settings')) || '{}') || { mode: 'auto' };
    } catch (e) {
      this.timeSettings = { mode: 'auto' };
    }

    // Update clock immediately
    this.updateClock();
    
    // Set up interval for updates
    this.updateIntervalId = setInterval(() => this.updateClock(), this.options.updateInterval);

    // Listen for global sync
    this.syncHandler = (e) => {
      this.timeSettings = e.detail;
      this.updateClock();
    };
    window.addEventListener('mac-time-sync', this.syncHandler);

    // Also listen for storage changes (across tabs)
    this.storageHandler = (e) => {
      const scopedKey = this.getScopedStorageKey('mac-system-time-settings');
      if (e.key === scopedKey) {
        this.timeSettings = JSON.parse(e.newValue || '{}');
        this.updateClock();
      }
    };
    window.addEventListener('storage', this.storageHandler);
  }

  updateClock() {
    let now = new Date();
    
    // Apply Global Settings
    if (this.timeSettings.mode === 'location' && this.timeSettings.timezone) {
      try {
        const locStr = now.toLocaleString('en-US', { timeZone: this.timeSettings.timezone });
        now = new Date(locStr);
      } catch (e) {
        console.error('Invalid timezone:', this.timeSettings.timezone);
      }
    } else if (this.timeSettings.mode === 'manual' && this.timeSettings.manualOffset) {
      now = new Date(now.getTime() + this.timeSettings.manualOffset);
    }

    // Format weekday: "Sun" or "Mon"
    const weekdayOptions = { weekday: 'short' };
    const weekday = now.toLocaleDateString('en-US', weekdayOptions);
    
    // Format date: "Jan 18"
    const dateOptions = { month: 'short', day: 'numeric' };
    const dateStr = now.toLocaleDateString('en-US', dateOptions);
    
    // Format time
    let timeStr;
    if (this.options.format === '12h') {
      // 12-hour format: "8:03 PM"
      const hours12 = now.getHours() % 12 || 12;
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const ampm = now.getHours() >= 12 ? 'PM' : 'AM';
      timeStr = `${hours12}:${minutes} ${ampm}`;
    } else {
      // 24-hour format: "20:03"
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      timeStr = `${hours}:${minutes}`;
    }
    
    // Combine format: "Sun Jan 18 8:03 PM" or "Sun, Jan 18 8:03 PM"
    const separator = this.options.showComma ? ',' : '';
    const fullDisplay = `${weekday}${separator} ${dateStr} ${timeStr}`;
    
    // Update the element
    if (this.element) {
      this.element.textContent = fullDisplay;
    }
  }

  destroy() {
    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
    }
    window.removeEventListener('mac-time-sync', this.syncHandler);
    window.removeEventListener('storage', this.storageHandler);
  }
}

// Backwards-compat: allow non-module pages to access it
if (typeof window !== 'undefined') {
  window.ClockDisplay = ClockDisplay;
}
