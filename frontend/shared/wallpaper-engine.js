/**
 * Unified Wallpaper Engine
 * A single, robust engine for managing static and dynamic wallpapers.
 * Handles: State, Path Normalization, Application, Transitions, and Cross-Tab Sync.
 */

class WallpaperEngine {
  constructor() {
    this.API_BASE = '/api';
    this.ASSET_ROOT = '/assets/Wallpaper';
    this.CHANNEL_NAME = 'wallpaper-engine-sync';
    this.STORAGE_KEY = 'selectedWallpaper';
    this.DEFAULT_WP = {
      id: 'default-tahoe',
      name: 'Tahoe Beach',
      type: 'static',
      path: '/assets/Wallpaper/Static/tahoe-beach/tahoe-beach.light.jpg'
    };

    this.channel = new BroadcastChannel(this.CHANNEL_NAME);
    this.initialized = false;
    this.activeVideo = null;

    this._setupSync();
  }

  /**
   * Initializes the engine, applies saved wallpaper or default.
   */
  async init() {
    if (this.initialized) return;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.boot());
    } else {
      this.boot();
    }
  }

  async boot() {
    console.log('[WallpaperEngine] 🚀 Booting...');
    this._ensureStyles();
    
    const saved = this.getSelected();
    await this.applyWallpaper(saved || this.DEFAULT_WP, { skipSync: true });
    
    this.initialized = true;
    console.log('[WallpaperEngine] ✅ Ready');
  }

  /**
   * Persists and applies a new wallpaper.
   */
  async setWallpaper(wallpaper) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(wallpaper));
    await this.applyWallpaper(wallpaper);
  }

  /**
   * Returns currently selected wallpaper from storage.
   */
  getSelected() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }

  /**
   * Applies the wallpaper to the DOM with a smooth transition.
   */
  async applyWallpaper(wallpaper, options = {}) {
    const bg = document.getElementById('wallpaperBackground') || this._createBackgroundElement();
    if (!bg) return;

    // Start transition
    bg.style.opacity = '0';
    
    // Wait for fade out
    await new Promise(r => setTimeout(r, 400));

    // Clear and Swap
    this._performSwap(bg, wallpaper);

    // Fade back in
    bg.style.opacity = '1';

    // Sync other tabs
    if (!options.skipSync) {
      this.channel.postMessage({ type: 'UPDATE', wallpaper });
    }
  }

  /**
   * Normalizes paths to /api/assets/Wallpaper/...
   */
  normalizePath(path, wallpaper = {}) {
    if (!path) return '';
    if (path.startsWith('http') || path.startsWith('blob:')) return path;

    // Clean separators
    let clean = path.replace(/\\/g, '/');

    // Root-relative anchoring
    if (!clean.startsWith('/') && wallpaper.path) {
      const dir = wallpaper.path.substring(0, wallpaper.path.lastIndexOf('/'));
      if (dir && !clean.includes('/')) clean = `${dir}/${clean}`;
    }

    if (!clean.startsWith('/')) clean = '/' + clean;

    const lower = clean.toLowerCase();
    const apiRoot = (this.API_BASE + this.ASSET_ROOT).toLowerCase();
    const assetRoot = this.ASSET_ROOT.toLowerCase();

    if (lower.startsWith(apiRoot)) return clean;
    if (lower.startsWith(assetRoot)) return this.API_BASE + clean;
    
    // Legacy mapping support
    if (lower.startsWith('/assets/')) return this.API_BASE + this.ASSET_ROOT + clean.substring(8);
    if (lower.startsWith('/static/') || lower.startsWith('/dynamic/')) return this.API_BASE + this.ASSET_ROOT + clean;

    return clean;
  }

  /**
   * Detects MIME type for videos.
   */
  getMimeType(path) {
    const ext = path?.toLowerCase().split('.').pop();
    if (ext === 'mp4' || ext === 'mov') return 'video/mp4';
    if (ext === 'webm') return 'video/webm';
    return 'video/mp4';
  }

  /**
   * INTERNAL: Handles the actual DOM swap.
   */
  _performSwap(container, wallpaper) {
    container.innerHTML = '';
    container.style.backgroundImage = 'none';

    const fullPath = this.normalizePath(wallpaper.path, wallpaper);
    const isVideo = wallpaper.type === 'video' || wallpaper.type === 'dynamic' || fullPath.match(/\.(mp4|webm|mov)$/i);

    if (isVideo) {
      const video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
      
      const source = document.createElement('source');
      source.src = fullPath;
      source.type = this.getMimeType(fullPath);
      video.appendChild(source);
      
      container.appendChild(video);
      video.play().catch(e => console.warn('[WallpaperEngine] Video play failed:', e));
      this.activeVideo = video;
    } else {
      container.style.backgroundImage = `url("${fullPath}")`;
      this.activeVideo = null;
    }
  }

  _setupSync() {
    this.channel.onmessage = (event) => {
      if (event.data.type === 'UPDATE') {
        console.log('[WallpaperEngine] 🔄 Syncing wallpaper from another tab');
        this.applyWallpaper(event.data.wallpaper, { skipSync: true });
      }
    };
  }

  _ensureStyles() {
    if (document.getElementById('wallpaper-engine-styles')) return;
    const style = document.createElement('style');
    style.id = 'wallpaper-engine-styles';
    style.textContent = `
      #wallpaperBackground {
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        z-index: -1;
        background-size: cover;
        background-position: center;
        transition: opacity 0.4s ease-in-out;
        background-color: #000;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  _createBackgroundElement() {
    const bg = document.createElement('div');
    bg.id = 'wallpaperBackground';
    document.body.prepend(bg);
    return bg;
  }
}

// Global instance
window.wallpaperEngine = new WallpaperEngine();
window.wallpaperEngine.init();

// Backward compatibility stubs for UI
window.WallpaperSystem = {
  client: { setWallpaper: (wp) => window.wallpaperEngine.setWallpaper(wp) },
  utils: { normalizePath: (path, wp) => window.wallpaperEngine.normalizePath(path, wp) }
};
