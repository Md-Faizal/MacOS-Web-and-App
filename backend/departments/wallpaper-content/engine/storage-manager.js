/**
 * Industrial-Standard Wallpaper Storage Manager
 * Handles:
 * - Clean directory structure (storage/wallpapers/{builtin, marketplace, custom})
 * - Cached manifest for O(1) reads
 * - WebP thumbnail generation via sharp
 * - HTTP 206 Partial Content video streaming
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const STORAGE_ROOT = path.join(__dirname, '../../../../storage/wallpapers');
const BUILTIN_DIR = path.join(STORAGE_ROOT, 'builtin');
const MARKETPLACE_DIR = path.join(STORAGE_ROOT, 'marketplace');
const CUSTOM_DIR = path.join(STORAGE_ROOT, 'custom');
const MANIFEST_FILE = path.join(STORAGE_ROOT, 'manifest.json');

// Ensure base directories exist safely without throwing during module load
[STORAGE_ROOT, BUILTIN_DIR, MARKETPLACE_DIR, CUSTOM_DIR].forEach(dir => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.warn(`[Wallpaper Storage] Warning: Could not create directory ${dir}:`, err.message);
  }
});

class WallpaperStorageManager {
  constructor() {
    this.cachedManifest = null;
    this.lastScanned = 0;
    this.CACHE_TTL = 30000; // 30s cache TTL
  }

  /**
   * Scan storage and return all installed wallpapers
   */
  async getInstalledWallpapers(forceRescan = false) {
    const now = Date.now();
    if (!forceRescan && this.cachedManifest && (now - this.lastScanned < this.CACHE_TTL)) {
      return this.cachedManifest;
    }

    const wallpapers = [];
    const sources = [
      { source: 'builtin', dir: BUILTIN_DIR },
      { source: 'marketplace', dir: MARKETPLACE_DIR },
      { source: 'custom', dir: CUSTOM_DIR }
    ];

    for (const { source, dir } of sources) {
      if (!fs.existsSync(dir)) continue;

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const folderPath = path.join(dir, entry.name);
        const metadataPath = path.join(folderPath, 'metadata.json');
        let meta = null;

        if (fs.existsSync(metadataPath)) {
          try {
            meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
          } catch (e) {
            console.warn(`[StorageManager] Invalid JSON in ${folderPath}`);
          }
        }

        const files = fs.readdirSync(folderPath);
        const videoExts = ['.mp4', '.mov', '.webm'];
        const imageExts = ['.jpg', '.jpeg', '.png', '.webp'];

        const videoFile = files.find(f => videoExts.includes(path.extname(f).toLowerCase()));
        const nonDarkImageFile = files.find(f => imageExts.includes(path.extname(f).toLowerCase()) && !f.includes('thumb') && !f.includes('dark'));
        const anyImageFile = files.find(f => imageExts.includes(path.extname(f).toLowerCase()) && !f.includes('thumb'));
        const darkFile = files.find(f => f.includes('dark') && (imageExts.includes(path.extname(f).toLowerCase()) || videoExts.includes(path.extname(f).toLowerCase())));
        const thumbFile = files.find(f => f.includes('thumb') || f.includes('preview'));

        const isVideo = !!videoFile || meta?.type === 'video' || meta?.type === 'dynamic';
        const primaryFile = videoFile || nonDarkImageFile || anyImageFile || meta?.path?.split('/')?.pop();

        if (!primaryFile) continue;

        const id = meta?.id || entry.name;
        const name = meta?.name || entry.name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const category = meta?.category || (source === 'builtin' ? 'official' : 'custom');

        // Path normalization to /storage/wallpapers/<source>/<folder>/<file>
        const primaryRelPath = `/storage/wallpapers/${source}/${entry.name}/${primaryFile}`;
        const darkRelPath = darkFile ? `/storage/wallpapers/${source}/${entry.name}/${darkFile}` : (meta?.variantPath || null);
        const thumbRelPath = thumbFile ? `/storage/wallpapers/${source}/${entry.name}/${thumbFile}` : (meta?.thumbnail || primaryRelPath);

        const wp = {
          id,
          name,
          description: meta?.description || `${name} desktop wallpaper`,
          category,
          tags: meta?.tags || [category],
          type: isVideo ? 'video' : 'static',
          source,
          path: primaryRelPath,
          variantPath: darkRelPath,
          hasDarkVariant: Boolean(darkRelPath),
          thumbnail: thumbRelPath,
          author: meta?.author || (source === 'builtin' ? 'Apple Design Studio' : 'Custom'),
          resolution: meta?.resolution || (isVideo ? '1080p 60fps' : '4K Ultra HD'),
          isCustom: source === 'custom',
          isShared: Boolean(meta?.isShared)
        };

        wallpapers.push(wp);
      }
    }

    this.cachedManifest = wallpapers;
    this.lastScanned = now;

    // Persist manifest.json for offline / quick inspection
    try {
      fs.writeFileSync(MANIFEST_FILE, JSON.stringify(wallpapers, null, 2));
    } catch (e) {
      // Non-fatal
    }

    return wallpapers;
  }

  /**
   * Save custom wallpaper with dual Light/Dark file support and sharing toggle
   */
  async saveCustomWallpaper({ lightFile, darkFile, title, category = 'custom', author = 'You', isShared = false, type = 'auto' }) {
    const primaryFile = lightFile;
    if (!primaryFile) {
      throw new Error('A primary / light mode wallpaper file is required');
    }

    const safeId = 'custom-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const destDir = path.join(CUSTOM_DIR, safeId);
    fs.mkdirSync(destDir, { recursive: true });

    const primaryExt = path.extname(primaryFile.originalname).toLowerCase();
    const isVideo = ['.mp4', '.mov', '.webm'].includes(primaryExt) || type === 'video';
    const primaryFilename = `light${primaryExt}`;
    const primaryPath = path.join(destDir, primaryFilename);
    const thumbPath = path.join(destDir, 'thumbnail.webp');

    // Move primary file
    fs.copyFileSync(primaryFile.path, primaryPath);
    try { fs.unlinkSync(primaryFile.path); } catch (e) {}

    let darkFilename = null;
    let darkRelPath = null;

    if (darkFile && darkFile.path && fs.existsSync(darkFile.path)) {
      const darkExt = path.extname(darkFile.originalname).toLowerCase();
      darkFilename = `dark${darkExt}`;
      const darkPath = path.join(destDir, darkFilename);
      fs.copyFileSync(darkFile.path, darkPath);
      try { fs.unlinkSync(darkFile.path); } catch (e) {}
      darkRelPath = `/storage/wallpapers/custom/${safeId}/${darkFilename}`;
    }

    let imageScan = null;
    if (!isVideo && fs.existsSync(primaryPath)) {
      try {
        const SuiteCoreBridge = require('../../../../frontend/shared/suite_core_bridge');
        if (SuiteCoreBridge && SuiteCoreBridge.isWasmLoaded()) {
          imageScan = SuiteCoreBridge.scanWallpaper(fs.readFileSync(primaryPath));
        }
      } catch (err) {
        console.warn('[StorageManager] Rust wallpaper scan fallback:', err.message);
      }
    }

    // Generate WebP thumbnail
    if (!isVideo) {
      try {
        let targetW = 480;
        let targetH = 270;
        if (imageScan && imageScan.width && imageScan.height) {
          try {
            const SuiteCoreBridge = require('../../../../frontend/shared/suite_core_bridge');
            const fit = SuiteCoreBridge.calculateFitDimensions(imageScan.width, imageScan.height, 480, 270, 'cover');
            if (fit && fit.target_width && fit.target_height) {
              targetW = fit.target_width;
              targetH = fit.target_height;
            }
          } catch (_) {}
        }

        await sharp(primaryPath)
          .resize(targetW, targetH, { fit: 'cover' })
          .webp({ quality: 85 })
          .toFile(thumbPath);
      } catch (e) {
        console.warn('[StorageManager] Sharp thumbnail generation failed:', e.message);
      }
    } else {
      // Extract first frame from video for thumbnail using ffmpeg if available
      try {
        const ffmpeg = require('ffmpeg-static');
        const { execSync } = require('child_process');
        const framePath = path.join(destDir, 'temp_frame.jpg');
        execSync(`"${ffmpeg}" -y -ss 00:00:01 -i "${primaryPath}" -vframes 1 -q:v 2 "${framePath}"`, { stdio: 'ignore' });
        if (fs.existsSync(framePath)) {
          await sharp(framePath).resize(480, 270, { fit: 'cover' }).webp({ quality: 85 }).toFile(thumbPath);
          try { fs.unlinkSync(framePath); } catch (e) {}
        }
      } catch (e) {
        console.warn('[StorageManager] Video frame extraction failed:', e.message);
      }
    }

    const metadata = {
      id: safeId,
      name: title || primaryFile.originalname.replace(/\.[^/.]+$/, ''),
      description: isShared ? 'Shared community wallpaper' : 'Personal desktop wallpaper',
      category: category || (imageScan?.recommended_category || 'custom'),
      tags: ['custom', category || 'custom'],
      type: isVideo ? 'video' : 'static',
      source: 'custom',
      path: `/storage/wallpapers/custom/${safeId}/${primaryFilename}`,
      variantPath: darkRelPath,
      hasDarkVariant: Boolean(darkRelPath),
      thumbnail: fs.existsSync(thumbPath) ? `/storage/wallpapers/custom/${safeId}/thumbnail.webp` : `/storage/wallpapers/custom/${safeId}/${primaryFilename}`,
      author: author || 'You',
      resolution: isVideo ? 'Video Dynamic' : (imageScan?.resolution_label || 'High Resolution'),
      aspectRatio: imageScan?.aspect_ratio || null,
      width: imageScan?.width || null,
      height: imageScan?.height || null,
      checksumSha256: imageScan?.checksum_sha256 || null,
      isCustom: true,
      isShared: Boolean(isShared),
      created_at: new Date().toISOString()
    };


    fs.writeFileSync(path.join(destDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    this.cachedManifest = null; // Invalidate cache
    return metadata;
  }

  /**
   * Toggle public sharing of custom wallpaper
   */
  toggleShareWallpaper(id, isShared) {
    const targetDir = path.join(CUSTOM_DIR, id);
    const metaPath = path.join(targetDir, 'metadata.json');

    if (!fs.existsSync(metaPath)) {
      return null;
    }

    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      meta.isShared = Boolean(isShared);
      meta.updated_at = new Date().toISOString();
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      this.cachedManifest = null;
      return meta;
    } catch (e) {
      console.error('[StorageManager] Failed to toggle share:', e);
      return null;
    }
  }

  /**
   * Update metadata (title, category, tags) for a custom wallpaper
   */
  updateWallpaperMetadata(id, updates = {}) {
    const targetDir = path.join(CUSTOM_DIR, id);
    const metaPath = path.join(targetDir, 'metadata.json');

    if (!fs.existsSync(metaPath)) {
      return null;
    }

    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (updates.name && typeof updates.name === 'string') {
        meta.name = updates.name.trim();
      }
      if (updates.category && typeof updates.category === 'string') {
        meta.category = updates.category.trim();
        if (!meta.tags) meta.tags = [];
        if (!meta.tags.includes(meta.category)) meta.tags.push(meta.category);
      }
      if (updates.tags && Array.isArray(updates.tags)) {
        meta.tags = updates.tags;
      }
      if (typeof updates.isShared === 'boolean') {
        meta.isShared = updates.isShared;
      }
      meta.updated_at = new Date().toISOString();
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      this.cachedManifest = null;
      return meta;
    } catch (e) {
      console.error('[StorageManager] Failed to update metadata:', e);
      return null;
    }
  }

  /**
   * Return all community-shared custom wallpapers
   */
  async getSharedCustomWallpapers() {
    const all = await this.getInstalledWallpapers();
    return all.filter(w => w.source === 'custom' && w.isShared);
  }

  /**
   * Install a wallpaper from marketplace
   */
  async installMarketplaceWallpaper(marketplaceItem) {
    const destDir = path.join(MARKETPLACE_DIR, marketplaceItem.id);
    fs.mkdirSync(destDir, { recursive: true });

    const axios = require('axios');
    const isVideo = marketplaceItem.type === 'video';
    const mediaExt = isVideo ? '.mp4' : '.jpg';
    const mediaFilename = `media${mediaExt}`;
    const mediaFilePath = path.join(destDir, mediaFilename);
    const thumbFilePath = path.join(destDir, 'thumbnail.webp');

    // Download media
    if (marketplaceItem.downloadUrl) {
      const resp = await axios({
        url: marketplaceItem.downloadUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout: 30000
      });
      fs.writeFileSync(mediaFilePath, resp.data);
    }

    // Download or generate thumbnail
    if (marketplaceItem.thumbnail) {
      try {
        const thumbResp = await axios({
          url: marketplaceItem.thumbnail,
          method: 'GET',
          responseType: 'arraybuffer',
          timeout: 15000
        });
        fs.writeFileSync(thumbFilePath, thumbResp.data);
      } catch (e) {
        if (!isVideo && fs.existsSync(mediaFilePath)) {
          await sharp(mediaFilePath).resize(480, 270, { fit: 'cover' }).webp({ quality: 85 }).toFile(thumbFilePath);
        }
      }
    }

    const metadata = {
      ...marketplaceItem,
      source: 'marketplace',
      path: `/storage/wallpapers/marketplace/${marketplaceItem.id}/${mediaFilename}`,
      thumbnail: `/storage/wallpapers/marketplace/${marketplaceItem.id}/thumbnail.webp`,
      installed_at: new Date().toISOString()
    };

    fs.writeFileSync(path.join(destDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    this.cachedManifest = null;
    return metadata;
  }

  /**
   * Delete installed wallpaper
   */
  deleteWallpaper(id) {
    const sources = [CUSTOM_DIR, MARKETPLACE_DIR];
    for (const dir of sources) {
      const target = path.join(dir, id);
      if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
        this.cachedManifest = null;
        return true;
      }
    }
    return false;
  }
}

module.exports = new WallpaperStorageManager();
