const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

// Configuration
const DB_PATH = path.join(__dirname, '..', 'database', 'MacOS.db');
const STORAGE_PATH = path.join(__dirname, '..', 'CloudStorage');
const THUMB_PATH = path.join(STORAGE_PATH, 'thumbnails');

console.log('DB Path:', DB_PATH);
console.log('Storage Path:', STORAGE_PATH);

if (!fs.existsSync(THUMB_PATH)) {
  fs.mkdirSync(THUMB_PATH, { recursive: true });
}

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

// 1. Check if DB exists
if (!fs.existsSync(DB_PATH)) {
  console.error('✗ Database not found at:', DB_PATH);
  process.exit(1);
}

const db = new Database(DB_PATH);

// 2. Ensure migration 006 is applied (thumbnail_path column)
try {
  const info = db.prepare("PRAGMA table_info(cloud_files)").all();
  if (!info.some(col => col.name === 'thumbnail_path')) {
    console.log('⚙️ Applying migration: Adding thumbnail_path column...');
    db.prepare("ALTER TABLE cloud_files ADD COLUMN thumbnail_path TEXT").run();
  }
} catch (e) {
  console.error('✗ Migration check failed:', e.message);
}

async function generateThumbnail(fileId, filePath, mimeType) {
  try {
    const thumbFileName = `thumb-${fileId}-${Date.now()}.jpg`;
    const thumbFilePath = path.join(THUMB_PATH, thumbFileName);
    const relativeThumbPath = `CloudStorage/thumbnails/${thumbFileName}`;

    if (mimeType.includes('image')) {
      await sharp(filePath)
        .resize(400, 400, { fit: 'cover', position: 'center' })
        .toFormat('jpeg')
        .toFile(thumbFilePath);
      return relativeThumbPath;
    } else if (mimeType.includes('video')) {
      return new Promise((resolve, reject) => {
        ffmpeg(filePath)
          .screenshots({
            timestamps: ['00:00:01'],
            filename: thumbFileName,
            folder: THUMB_PATH,
            size: '400x400'
          })
          .on('end', () => resolve(relativeThumbPath))
          .on('error', (err) => {
            console.error(`  ✗ Video thumbnail error [${fileId}]:`, err.message);
            resolve(null);
          });
      });
    }
  } catch (err) {
    console.error(`  ✗ Thumbnail generation failed [${fileId}]:`, err.message);
  }
  return null;
}

async function run() {
  console.log('🚀 Starting Thumbnail Generation for Existing Files...');
  
  const files = db.prepare("SELECT * FROM cloud_files WHERE (mime_type LIKE 'image/%' OR mime_type LIKE 'video/%') AND (thumbnail_path IS NULL OR thumbnail_path = '')").all();
  
  console.log(`Found ${files.length} files requiring thumbnails.`);

  for (const file of files) {
    // Correctly resolve file path from the record
    // file.path is 'CloudStorage/filename.ext'
    const fullPath = path.join(__dirname, '..', file.path);
    if (!fs.existsSync(fullPath)) {
      console.log(`  ⚠ Skipping: File not found on disk: ${file.original_name} at ${fullPath}`);
      continue;
    }

    process.stdout.write(`  ⌛ Processing: ${file.original_name} ... `);
    const thumbPath = await generateThumbnail(file.id, fullPath, file.mime_type);
    
    if (thumbPath) {
      db.prepare('UPDATE cloud_files SET thumbnail_path = ? WHERE id = ?').run(thumbPath, file.id);
      console.log('✅ Done');
    } else {
      console.log('❌ Failed');
    }
  }

  console.log('\n✨ Processing complete!');
  db.close();
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
