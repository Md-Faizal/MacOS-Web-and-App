const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const storageManager = require('./storage-manager');
const marketplaceCatalog = require('./marketplace-catalog');

const router = express.Router();

// Configure multer for custom wallpaper uploads (temp storage before processing)
const uploadDir = path.join(__dirname, '../../../storage/temp_uploads');
let activeUploadDir = uploadDir;
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (err) {
  console.warn('[Wallpaper] Warning: Could not create uploadDir, using os.tmpdir():', err.message);
  activeUploadDir = require('os').tmpdir();
}

const upload = multer({
  dest: activeUploadDir,
  limits: { fileSize: 60 * 1024 * 1024 }, // 60MB limit
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.webm'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Supported: JPG, PNG, WEBP, MP4, WebM, MOV`));
    }
  }
});

/**
 * GET /api/wallpapers
 * Returns all installed wallpapers (Builtin, Marketplace, Custom)
 * Publicly accessible (no 401 on lockscreen / guest)
 */
router.get('/', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const wallpapers = await storageManager.getInstalledWallpapers(force);
    res.json({
      success: true,
      count: wallpapers.length,
      wallpapers
    });
  } catch (error) {
    console.error('[Wallpaper API] Error scanning wallpapers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/wallpapers/marketplace
 * Returns online wallpaper marketplace catalog combined with user-shared community wallpapers
 */
router.get('/marketplace', async (req, res) => {
  try {
    const { category, search } = req.query;
    let list = [...marketplaceCatalog];

    // Include community-shared user wallpapers
    try {
      const sharedCustom = await storageManager.getSharedCustomWallpapers();
      const formattedShared = sharedCustom.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description || `Shared by ${item.author}`,
        category: item.category || 'community',
        tags: [...(item.tags || []), 'community', 'user-upload'],
        type: item.type,
        path: item.path,
        variantPath: item.variantPath,
        hasDarkVariant: item.hasDarkVariant,
        thumbnail: item.thumbnail,
        author: item.author || 'Community Member',
        resolution: item.resolution || 'HD',
        isCommunityUpload: true,
        isInstalled: true,
        downloadUrl: item.path
      }));
      list = [...formattedShared, ...list];
    } catch (err) {
      console.warn('[Wallpaper API] Error fetching shared community wallpapers:', err.message);
    }

    if (category && category !== 'all') {
      list = list.filter(w => (w.category && w.category.toLowerCase() === category.toLowerCase()) ||
                              (w.tags && w.tags.some(t => t.toLowerCase() === category.toLowerCase())));
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(w => 
        w.name.toLowerCase().includes(q) || 
        (w.description && w.description.toLowerCase().includes(q)) ||
        (w.author && w.author.toLowerCase().includes(q)) ||
        (w.tags && w.tags.some(t => t.toLowerCase().includes(q)))
      );
    }

    res.json({
      success: true,
      count: list.length,
      wallpapers: list
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/wallpapers/marketplace/install
 * Installs an item from the marketplace catalog into local storage
 */
router.post('/marketplace/install', async (req, res) => {
  try {
    const { wallpaperId } = req.body;
    if (!wallpaperId) {
      return res.status(400).json({ success: false, error: 'wallpaperId is required' });
    }

    // If it's already a shared custom wallpaper locally, return it immediately
    const installed = await storageManager.getInstalledWallpapers();
    const existing = installed.find(w => w.id === wallpaperId);
    if (existing) {
      return res.json({
        success: true,
        message: `${existing.name} is already available locally`,
        wallpaper: existing
      });
    }

    const item = marketplaceCatalog.find(w => w.id === wallpaperId);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Marketplace wallpaper not found' });
    }

    console.log(`[Wallpaper API] Installing marketplace wallpaper: ${item.name}`);
    const installedItem = await storageManager.installMarketplaceWallpaper(item);

    res.json({
      success: true,
      message: `Successfully installed ${item.name}`,
      wallpaper: installedItem
    });
  } catch (error) {
    console.error('[Wallpaper API] Install error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/wallpapers/upload
 * Custom wallpaper upload handler with Light/Dark dual files and Public/Private sharing
 */
router.post('/upload', upload.fields([
  { name: 'lightFile', maxCount: 1 },
  { name: 'darkFile', maxCount: 1 },
  { name: 'wallpaper', maxCount: 1 }
]), async (req, res) => {
  try {
    const lightFile = (req.files && req.files['lightFile'] && req.files['lightFile'][0]) ||
                      (req.files && req.files['wallpaper'] && req.files['wallpaper'][0]) ||
                      req.file;

    const darkFile = req.files && req.files['darkFile'] && req.files['darkFile'][0];

    if (!lightFile) {
      return res.status(400).json({ success: false, error: 'Please upload at least a Light / Primary wallpaper file' });
    }

    const title = req.body.title || lightFile.originalname.replace(/\.[^/.]+$/, '');
    const category = req.body.category || 'custom';
    const author = req.body.author || 'You';
    const isShared = req.body.isShared === 'true' || req.body.isShared === true || req.body.isShared === '1';
    const type = req.body.type || 'auto';

    console.log(`[Wallpaper API] Processing upload: "${title}" (Light: ${lightFile.originalname}, Dark: ${darkFile ? darkFile.originalname : 'none'}, Shared: ${isShared})`);

    const newWallpaper = await storageManager.saveCustomWallpaper({
      lightFile,
      darkFile,
      title,
      category,
      author,
      isShared,
      type
    });

    res.json({
      success: true,
      message: 'Custom wallpaper uploaded successfully',
      wallpaper: newWallpaper
    });
  } catch (error) {
    console.error('[Wallpaper API] Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/wallpapers/:id/share
 * Toggles public community sharing for a custom wallpaper
 */
router.patch('/:id/share', (req, res) => {
  try {
    const { id } = req.params;
    const isShared = req.body.isShared === true || req.body.isShared === 'true';
    const updated = storageManager.toggleShareWallpaper(id, isShared);

    if (updated) {
      res.json({
        success: true,
        message: `Sharing status updated to ${isShared ? 'Public (Community)' : 'Private'}`,
        wallpaper: updated
      });
    } else {
      res.status(404).json({ success: false, error: 'Custom wallpaper not found or cannot toggle built-in' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/wallpapers/:id
 * Updates metadata (name, category, tags) for a custom wallpaper
 */
router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, tags, isShared } = req.body;
    const updated = storageManager.updateWallpaperMetadata(id, { name, category, tags, isShared });

    if (updated) {
      res.json({
        success: true,
        message: 'Wallpaper metadata updated successfully',
        wallpaper: updated
      });
    } else {
      res.status(404).json({ success: false, error: 'Custom wallpaper not found or cannot modify built-in' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/wallpapers/:id
 * Deletes custom or marketplace wallpaper
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const deleted = storageManager.deleteWallpaper(id);
    if (deleted) {
      res.json({ success: true, message: `Wallpaper ${id} removed` });
    } else {
      res.status(404).json({ success: false, error: 'Wallpaper not found or cannot delete built-in' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/wallpapers/health
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', engine: 'Industrial Wallpaper Storage & Marketplace v3' });
});

module.exports = router;
