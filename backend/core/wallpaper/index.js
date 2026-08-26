const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Path to wallpaper assets
const WALLPAPER_BASE_PATH = path.join(__dirname, '../../../', 'Wallpapers');

/**
 * Scan for all available wallpapers in Static and Dynamic subfolders.
 */
async function scanWallpapers() {
  const wallpapers = [];
  
  if (!fs.existsSync(WALLPAPER_BASE_PATH)) return [];

  const categories = ['Static', 'Dynamic'];
  
  for (const cat of categories) {
    const catPath = path.join(WALLPAPER_BASE_PATH, cat);
    if (!fs.existsSync(catPath)) continue;

    const folders = fs.readdirSync(catPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory());

    for (const folder of folders) {
      const folderPath = path.join(catPath, folder.name);
      const metadataPath = path.join(folderPath, 'wallpaper.json');
      
      let wp = null;
      let metadata = {};

      // Try load metadata
      if (fs.existsSync(metadataPath)) {
        try {
          metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        } catch (e) {
          console.warn(`[Wallpaper API] Invalid JSON in ${folder.name}`);
        }
      }

      const files = fs.readdirSync(folderPath);
      const isDynamic = cat === 'Dynamic';
      const exts = isDynamic ? ['.mp4', '.mov', '.webm'] : ['.jpg', '.jpeg', '.png', '.webp'];
      
      // Find primary media file
      const mediaFile = files.find(f => exts.includes(path.extname(f).toLowerCase()));
      if (!mediaFile && !metadata.path) continue;

      wp = {
        id: metadata.id || folder.name.toLowerCase().replace(/\s+/g, '-'),
        name: metadata.name || folder.name.replace(/-/g, ' '),
        type: isDynamic ? 'video' : 'static',
        category: metadata.category || 'general',
        path: `/assets/Wallpaper/${cat}/${folder.name}/${metadata.path || mediaFile}`,
        variantPath: metadata.variantPath ? `/assets/Wallpaper/${cat}/${folder.name}/${metadata.variantPath}` : null,
        thumbnail: metadata.thumbnail ? `/assets/Wallpaper/${cat}/${folder.name}/${metadata.thumbnail}` : null,
        isCustom: false
      };

      // Fallback for dark variants if found but not in metadata
      if (!wp.variantPath && !isDynamic) {
        const darkFile = files.find(f => f.toLowerCase().includes('.dark') && exts.includes(path.extname(f).toLowerCase()));
        if (darkFile) wp.variantPath = `/assets/Wallpaper/${cat}/${folder.name}/${darkFile}`;
      }

      wallpapers.push(wp);
    }
  }

  return wallpapers;
}

/**
 * GET /api/wallpapers
 * Returns all scrambled scan results.
 */
router.get('/', async (req, res) => {
  try {
    const list = await scanWallpapers();
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
 * GET /api/wallpapers/health
 * Simple health check.
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', engine: 'Unified Wallpaper Scanner v2' });
});

module.exports = router;
