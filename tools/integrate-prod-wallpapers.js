const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const ffmpeg = require('ffmpeg-static');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const wallpapersDir = path.join(rootDir, 'Wallpapers');
const builtinDir = path.join(rootDir, 'storage/wallpapers/builtin');

async function migrate() {
  const categories = ['Static', 'Dynamic'];
  for (const cat of categories) {
    const catPath = path.join(wallpapersDir, cat);
    if (!fs.existsSync(catPath)) continue;
    const folders = fs.readdirSync(catPath, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const folder of folders) {
      const srcFolder = path.join(catPath, folder.name);
      const targetFolder = path.join(builtinDir, folder.name);
      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }

      let meta = {};
      const wpJsonPath = path.join(srcFolder, 'wallpaper.json');
      if (fs.existsSync(wpJsonPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(wpJsonPath, 'utf8'));
        } catch (e) {}
      }

      const files = fs.readdirSync(srcFolder);
      for (const file of files) {
        if (file === 'wallpaper.json') continue;
        const srcFile = path.join(srcFolder, file);
        const destFile = path.join(targetFolder, file);
        if (!fs.existsSync(destFile)) {
          fs.copyFileSync(srcFile, destFile);
        }
      }

      const isDynamic = cat === 'Dynamic';
      const videoFiles = files.filter(f => /\.(mp4|mov|webm)$/i.test(f));
      const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f) && !f.includes('thumb'));

      let primaryFile = null;
      let darkFile = null;

      if (isDynamic) {
        const lightVid = videoFiles.find(f => f.toLowerCase().includes('light')) || videoFiles[0];
        primaryFile = lightVid;
        darkFile = videoFiles.find(f => f.toLowerCase().includes('dark')) || null;
      } else {
        const lightImg = imageFiles.find(f => f.toLowerCase().includes('light')) || imageFiles[0];
        primaryFile = lightImg;
        darkFile = imageFiles.find(f => f.toLowerCase().includes('dark')) || null;
      }

      const thumbPath = path.join(targetFolder, 'thumbnail.webp');
      if (!fs.existsSync(thumbPath)) {
        if (!isDynamic && primaryFile) {
          try {
            await sharp(path.join(targetFolder, primaryFile))
              .resize(480, 270, { fit: 'cover' })
              .webp({ quality: 85 })
              .toFile(thumbPath);
            console.log('Generated image thumbnail for', folder.name);
          } catch (e) {
            console.warn('Thumb gen failed for', folder.name, e.message);
          }
        } else if (isDynamic && primaryFile) {
          try {
            const framePath = path.join(targetFolder, 'temp_frame.jpg');
            execSync(`"${ffmpeg}" -y -ss 00:00:01 -i "${path.join(targetFolder, primaryFile)}" -vframes 1 -q:v 2 "${framePath}"`, { stdio: 'ignore' });
            if (fs.existsSync(framePath)) {
              await sharp(framePath).resize(480, 270, { fit: 'cover' }).webp({ quality: 85 }).toFile(thumbPath);
              try { fs.unlinkSync(framePath); } catch (e) {}
              console.log('Generated video frame thumbnail for', folder.name);
            }
          } catch (e) {
            console.warn('Video frame thumbnail failed for', folder.name, e.message);
          }
        }
      }

      const standardizedMeta = {
        id: meta.id || folder.name,
        name: meta.name || folder.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        category: 'Landscape',
        type: isDynamic ? 'video' : 'static',
        description: meta.description || (folder.name + ' desktop wallpaper'),
        tags: meta.tags || ['nature', 'tahoe'],
        resolution: isDynamic ? '4K 60fps Aerial' : '4K Ultra HD',
        author: 'Apple Aerials',
        source: 'builtin',
        path: primaryFile ? `/storage/wallpapers/builtin/${folder.name}/${primaryFile}` : null,
        variantPath: darkFile ? `/storage/wallpapers/builtin/${folder.name}/${darkFile}` : null,
        hasDarkVariant: Boolean(darkFile),
        thumbnail: fs.existsSync(thumbPath) ? `/storage/wallpapers/builtin/${folder.name}/thumbnail.webp` : (primaryFile ? `/storage/wallpapers/builtin/${folder.name}/${primaryFile}` : null),
        created_at: new Date().toISOString()
      };

      fs.writeFileSync(path.join(targetFolder, 'metadata.json'), JSON.stringify(standardizedMeta, null, 2));
      console.log('✓ Successfully integrated:', folder.name);
    }
  }
  console.log('🎉 Migration complete!');
}

migrate();
