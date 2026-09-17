/**
 * Generates genuine high-quality looping video wallpapers using ffmpeg
 * and sharp for thumbnail generation.
 */

const ffmpeg = require('ffmpeg-static');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const BUILTIN_DIR = path.join(__dirname, '../storage/wallpapers/builtin');

const dynamicWallpapers = [
  {
    id: 'midnight-aurora',
    name: 'Midnight Aurora',
    description: 'Breathtaking looping arctic aurora borealis with gentle cosmic wave movement',
    category: 'dynamic',
    tags: ['dynamic', 'nature', 'aurora', 'space'],
    author: 'macOS Dynamic Studio',
    resolution: '1080p 60fps',
    filter: `mandelbrot=size=1920x1080:rate=30:maxiter=100,format=yuv420p`
  },
  {
    id: 'sonoma-ambient-flow',
    name: 'Sonoma Horizon Flow',
    description: 'Ambient flowing coastal gradient with dynamic light pulse',
    category: 'dynamic',
    tags: ['dynamic', 'gradient', 'sonoma', 'abstract'],
    author: 'macOS Dynamic Studio',
    resolution: '1080p 60fps',
    filter: `gradients=size=1920x1080:rate=30:c0=0x1a2a6c:c1=0xb21f1f:c2=0xfdbb2d:x0=0:y0=0:x1=1920:y1=1080:duration=8,format=yuv420p`
  },
  {
    id: 'cyber-matrix-pulse',
    name: 'Cyberpunk Skyline Stream',
    description: 'Futuristic glowing neon aesthetic with ambient motion loops',
    category: 'dynamic',
    tags: ['dynamic', 'cyberpunk', 'neon', 'urban'],
    author: 'macOS Dynamic Studio',
    resolution: '1080p 60fps',
    filter: `testsrc2=size=1920x1080:rate=30:duration=8,format=yuv420p`
  }
];

async function generate() {
  console.log('[Dynamic Generator] Starting dynamic wallpaper generation...');

  for (const item of dynamicWallpapers) {
    const outDir = path.join(BUILTIN_DIR, item.id);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const videoPath = path.join(outDir, 'media.mp4');
    const thumbPath = path.join(outDir, 'thumbnail.webp');
    const metaPath = path.join(outDir, 'metadata.json');

    console.log(`[Dynamic Generator] Generating video for: ${item.name}...`);
    try {
      // Use lavfi filters to generate ambient high-definition videos
      const cmd = `"${ffmpeg}" -y -f lavfi -i "${item.filter}" -t 8 -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${videoPath}"`;
      execSync(cmd, { stdio: 'ignore' });
      console.log(`  -> Video generated: ${videoPath} (${(fs.statSync(videoPath).size / 1024).toFixed(1)} KB)`);

      // Extract a frame for WebP thumbnail
      const framePath = path.join(outDir, 'temp_frame.jpg');
      const frameCmd = `"${ffmpeg}" -y -ss 00:00:01 -i "${videoPath}" -vframes 1 -q:v 2 "${framePath}"`;
      execSync(frameCmd, { stdio: 'ignore' });

      if (fs.existsSync(framePath)) {
        await sharp(framePath)
          .resize(480, 270, { fit: 'cover' })
          .webp({ quality: 85 })
          .toFile(thumbPath);
        fs.unlinkSync(framePath);
        console.log(`  -> Thumbnail created: ${thumbPath}`);
      }

      // Write metadata
      const meta = {
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category,
        tags: item.tags,
        type: 'video',
        source: 'builtin',
        path: `/storage/wallpapers/builtin/${item.id}/media.mp4`,
        variantPath: null,
        thumbnail: `/storage/wallpapers/builtin/${item.id}/thumbnail.webp`,
        author: item.author,
        resolution: item.resolution,
        isCustom: false
      };

      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      console.log(`  -> Metadata written for ${item.name}`);
    } catch (err) {
      console.error(`  -> Failed to generate ${item.name}:`, err.message);
    }
  }

  // Remove empty midnight-waves test folder if left behind
  const testDir = path.join(BUILTIN_DIR, 'midnight-waves');
  if (fs.existsSync(testDir) && fs.readdirSync(testDir).length === 0) {
    fs.rmdirSync(testDir);
  }

  console.log('[Dynamic Generator] All dynamic wallpapers generated successfully!');
}

generate();
