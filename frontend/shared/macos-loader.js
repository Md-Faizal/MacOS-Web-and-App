/**
 * MACOS STANDARDIZED LOADER API (MacOSLoader)
 * Provides programmatic helpers to render standardized macOS circular loading indicators.
 */

(function () {
  'use strict';

  if (typeof window === 'undefined') return;

  const MacOSLoader = {
    /**
     * Generate HTML string for standard circular loader
     * @param {string} title Loading headline text
     * @param {string} subtitle Descriptive subtitle (optional)
     * @param {string} size Spinner size: '' (default 32px), 'sm' (20px), 'xs' (14px), 'lg' (44px)
     * @param {boolean} compact Whether to use compact padding
     * @returns {string} HTML markup
     */
    create(title = 'Loading...', subtitle = 'Syncing with server', size = '', compact = false) {
      const sizeClass = size ? ` ${size}` : '';
      const compactClass = compact ? ' compact' : '';
      const subtitleHtml = subtitle ? `<p class="macos-loader-subtitle">${subtitle}</p>` : '';
      return `
        <div class="macos-loader-container${compactClass}">
          <div class="macos-circular-loader${sizeClass}"></div>
          ${title ? `<p class="macos-loader-title">${title}</p>` : ''}
          ${subtitleHtml}
        </div>
      `.trim();
    },

    /**
     * Generate inline spinner HTML
     * @param {string} size 'xs', 'sm', or ''
     * @returns {string} HTML markup
     */
    inline(size = 'sm') {
      return `<span class="macos-circular-loader ${size}" style="display:inline-block; margin:0; vertical-align:middle;"></span>`;
    },

    /**
     * Render loader directly into a DOM node or CSS selector
     * @param {HTMLElement|string} target Container element or selector
     * @param {string} title Loading headline
     * @param {string} subtitle Subtitle description
     * @param {string} size Spinner size
     * @param {boolean} compact
     */
    renderInto(target, title = 'Loading...', subtitle = 'Syncing with server', size = '', compact = false) {
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      if (el) {
        el.innerHTML = this.create(title, subtitle, size, compact);
      }
    },

    /**
     * Show a blurred glass overlay loader over a container
     * @param {HTMLElement|string} container
     * @param {string} title
     * @param {string} subtitle
     */
    showOverlay(container, title = 'Loading...', subtitle = 'Syncing with server') {
      const el = typeof container === 'string' ? document.querySelector(container) : container;
      if (!el) return;
      if (el.style.position !== 'absolute' && el.style.position !== 'fixed' && el.style.position !== 'relative') {
        el.style.position = 'relative';
      }
      this.hideOverlay(el);
      const overlay = document.createElement('div');
      overlay.className = 'macos-loader-overlay';
      overlay.innerHTML = `
        <div class="macos-circular-loader"></div>
        ${title ? `<p class="macos-loader-title">${title}</p>` : ''}
        ${subtitle ? `<p class="macos-loader-subtitle">${subtitle}</p>` : ''}
      `;
      el.appendChild(overlay);
    },

    /**
     * Remove overlay from a container
     * @param {HTMLElement|string} container
     */
    hideOverlay(container) {
      const el = typeof container === 'string' ? document.querySelector(container) : container;
      if (!el) return;
      const overlay = el.querySelector('.macos-loader-overlay');
      if (overlay) {
        overlay.remove();
      }
    }
  };

  window.MacOSLoader = MacOSLoader;
})();
