const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const archiver = require('archiver');

// Configure FFMPEG path
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}


module.exports = function(db) {
// Robust path resolution: find project root (4 levels up from this file)
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
const storagePath = path.join(PROJECT_ROOT, 'CloudStorage');
  
  // Ensure storage and thumbnail directories exist
  const thumbPath = path.join(storagePath, 'thumbnails');
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }
  if (!fs.existsSync(thumbPath)) {
    fs.mkdirSync(thumbPath, { recursive: true });
  }

  // Helper: Generate Thumbnail (Industrial Standard - YouTube Style)
  const generateThumbnail = async (fileId, filePath, mimeType) => {
    try {
      if (!fs.existsSync(filePath)) {
        console.warn(`[Thumbnail] Source file not found: ${filePath}`);
        return null;
      }

      // Use WebP as the industrial standard for quality/size ratio
      const thumbFileName = `thumb-${fileId}-${Date.now()}.webp`;
      const thumbFilePath = path.join(thumbPath, thumbFileName);
      const relativeThumbPath = `CloudStorage/thumbnails/${thumbFileName}`;

      console.log(`[Thumbnail] Generating industrial-standard preview for ID ${fileId}`);

      if (mimeType.includes('image')) {
        await sharp(filePath)
          .resize(1280, 720, { 
            fit: 'cover', 
            position: 'center',
            withoutEnlargement: false
          })
          .webp({ quality: 85 })
          .toFile(thumbFilePath);
        
        return relativeThumbPath;
      } 
      
      if (mimeType.includes('video')) {
        return new Promise((resolve) => {
          // YT-Style Extraction:
          // 1. Fast seek (-ss before -i) for performance
          // 2. High-quality single frame (-vframes 1, -q:v 2)
          // 3. Proper 16:9 aspect ratio with padding/scale to avoid distortion
          ffmpeg(filePath)
            .inputOptions(['-ss', '00:00:02']) // Seek to 2s to avoid black frames
            .outputOptions([
              '-vframes', '1',
              '-q:v', '2',
              '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2'
            ])
            .on('start', (cmd) => console.log(`[Thumbnail-Process] Industrial Command: ${cmd}`))
            .on('end', () => {
              console.log(`✓ [Thumbnail] Industrial preview generated: ${thumbFileName}`);
              resolve(relativeThumbPath);
            })
            .on('error', (err) => {
              console.error(`✗ [Thumbnail] FFmpeg failed for ID ${fileId}:`, err.message);
              resolve(null);
            })
            .save(thumbFilePath);
        });
      }
    } catch (err) {
      console.error('[Thumbnail] Critical failure:', err);
    }
    return null;
  };


  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, storagePath);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  });

  const upload = multer({ 
    storage: storage,
    limits: {
      fileSize: Infinity // Unlimited as requested
    }
  });

  return {
    uploadMiddleware: upload.single('file'),

    getStats: (req, res) => {
      try {
        const stats = {
          total: 200 * 1024 * 1024 * 1024, // 200GB Limit
          used: 0,
          free: 0,
          appUsed: 0,
          categories: {
            image: { count: 0, size: 0 },
            video: { count: 0, size: 0 },
            document: { count: 0, size: 0 },
            others: { count: 0, size: 0 }
          }
        };

        // Get actual disk usage
        if (fs.statfsSync) {
          try {
            const disk = fs.statfsSync(storagePath);
            const actualTotal = disk.blocks * disk.bsize;
            const actualFree = disk.bavail * disk.bsize;
            
            stats.total = actualTotal;
            stats.free = actualFree;
            stats.used = Math.max(0, stats.total - stats.free);
          } catch (de) {
            console.error('Disk stat error:', de);
          }
        }

        // Get application specific usage grouped by categories
        const allFiles = db.prepare('SELECT mime_type, size FROM cloud_files').all();
        allFiles.forEach(file => {
          const size = file.size || 0;
          stats.appUsed += size;
          
          const mime = (file.mime_type || '').toLowerCase();
          let cat = 'others';
          if (mime.includes('image')) cat = 'image';
          else if (mime.includes('video')) cat = 'video';
          else if (mime.includes('pdf') || mime.includes('word') || mime.includes('text') || mime.includes('excel') || mime.includes('sheet')) cat = 'document';
          
          stats.categories[cat].count++;
          stats.categories[cat].size += size;
        });

        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getFiles: (req, res) => {
      try {
        const { space } = req.query;
        let files;
        if (space && space !== 'all') {
          files = db.prepare('SELECT * FROM cloud_files WHERE space = ? ORDER BY uploaded_at DESC').all(space);
        } else {
          files = db.prepare('SELECT * FROM cloud_files ORDER BY uploaded_at DESC').all();
        }
        res.json(files);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    uploadFile: (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        const { filename, originalname, mimetype, size } = req.file;
        const { space = 'personal' } = req.body;
        const relativePath = `CloudStorage/${filename}`;

        const stmt = db.prepare('INSERT INTO cloud_files (name, original_name, mime_type, size, path, space) VALUES (?, ?, ?, ?, ?, ?)');
        const result = stmt.run(filename, originalname, mimetype, size, relativePath, space);
        const fileId = result.lastInsertRowid;

        // Generate thumbnail in background
        generateThumbnail(fileId, req.file.path, mimetype).then(thumbPath => {
          if (thumbPath) {
            db.prepare('UPDATE cloud_files SET thumbnail_path = ? WHERE id = ?').run(thumbPath, fileId);
          }
        });

        res.status(201).json({
          success: true,
          file: {
            id: fileId,
            name: filename,
            original_name: originalname,
            mime_type: mimetype,
            size: size,
            path: relativePath
          }
        });

      } catch (error) {
        // Cleanup file if DB insert fails
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: error.message });
      }
    },

    downloadFile: (req, res) => {
      try {
        const { id } = req.params;
        const file = db.prepare('SELECT * FROM cloud_files WHERE id = ?').get(id);

        if (!file) {
          return res.status(404).json({ error: 'File not found' });
        }

        const fullPath = path.join(PROJECT_ROOT, file.path);
        
        if (!fs.existsSync(fullPath)) {
          console.error(`[Cloud] Download failed: File not found on disk: ${fullPath} (Record ID: ${id})`);
          return res.status(404).json({ error: 'File not found on disk' });
        }

        // Use res.sendFile instead of res.download for media to support Range requests (streaming)
        const isMedia = file.mime_type.includes('image') || file.mime_type.includes('video');
        if (isMedia) {
          // Explicitly set Content-Type to prevent media format errors in browsers
          res.setHeader('Content-Type', file.mime_type);
          res.sendFile(fullPath, {
            acceptRanges: true,
            cacheControl: true,
            dotfiles: 'deny'
          }, (err) => {
            if (err && !res.headersSent) {
              console.error(`[Cloud] sendFile error:`, err);
              if (!res.headersSent) res.status(500).end();
            }
          });
        } else {
          res.download(fullPath, file.original_name);
        }




      } catch (error) {
        res.status(500).json({ error: error.message });
      }

    },

    deleteFile: (req, res) => {
      try {
        const { id } = req.params;
        const file = db.prepare('SELECT * FROM cloud_files WHERE id = ?').get(id);

        if (!file) {
          return res.status(404).json({ error: 'File not found' });
        }

        const fullPath = path.join(__dirname, '../../../../', file.path);

        // Delete from database first
        db.prepare('DELETE FROM cloud_files WHERE id = ?').run(id);

        // Delete from disk
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }

        res.json({ success: true, message: 'File deleted successfully' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    renameFile: (req, res) => {
      try {
        const { id, newName } = req.body;

        if (!newName) {
          return res.status(400).json({ error: 'New name is required' });
        }

        const stmt = db.prepare('UPDATE cloud_files SET original_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        const result = stmt.run(newName, id);

        if (result.changes === 0) {
          return res.status(404).json({ error: 'File not found' });
        }

        res.json({ success: true, message: 'File renamed successfully' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    shareFile: (req, res) => {
      try {
        const { id } = req.params;
        const { password, expiryHours, downloadLimit } = req.body;
        const crypto = require('crypto');
        const shareToken = crypto.randomBytes(8).toString('hex');

        let expiresAt = null;
        if (expiryHours && !isNaN(expiryHours)) {
          expiresAt = new Date(Date.now() + parseFloat(expiryHours) * 3600000).toISOString();
        }

        const stmt = db.prepare('UPDATE cloud_files SET share_token = ?, share_password = ?, share_expires_at = ?, share_download_limit = ?, share_download_count = 0, shared_at = CURRENT_TIMESTAMP WHERE id = ?');
        const dLimit = (downloadLimit && !isNaN(parseInt(downloadLimit))) ? parseInt(downloadLimit) : null;
        const result = stmt.run(shareToken, password || null, expiresAt, dLimit, id);

        if (result.changes === 0) {
          return res.status(404).json({ error: 'File not found' });
        }

        res.json({ 
          success: true, 
          shareToken,
          shareUrl: `/api/cloud/share/${shareToken}`
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    createBatchShare: (req, res) => {
      try {
        const { fileIds, password, expiryHours, downloadLimit } = req.body;
        if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
          return res.status(400).json({ error: 'No files selected for batch share' });
        }

        const crypto = require('crypto');
        const token = crypto.randomBytes(12).toString('hex');

        let expiresAt = null;
        if (expiryHours && !isNaN(expiryHours)) {
          expiresAt = new Date(Date.now() + parseFloat(expiryHours) * 3600000).toISOString();
        }

        const dLimit = (downloadLimit && !isNaN(parseInt(downloadLimit))) ? parseInt(downloadLimit) : null;
        
        const stmt = db.prepare('INSERT INTO cloud_batch_shares (token, file_ids, password, expires_at, download_limit) VALUES (?, ?, ?, ?, ?)');
        stmt.run(token, JSON.stringify(fileIds), password || null, expiresAt, dLimit);

        res.json({ 
          success: true, 
          token,
          shareUrl: `/api/cloud/share/batch/${token}`
        });
      } catch (error) {
        console.error('[BatchShare] Error:', error);
        res.status(500).json({ error: error.message });
      }
    },

    getBatchSharedPage: (req, res) => {
      try {
        const { token } = req.params;
        const { pw } = req.query;
        const batch = db.prepare('SELECT * FROM cloud_batch_shares WHERE token = ?').get(token);

        const renderError = (title, message, icon = '🚫') => {
          res.send(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>${title} - StackDrive Cloud</title>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f5f5f7; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-radius: 24px; padding: 50px; box-shadow: 0 15px 40px rgba(0,0,0,0.08); text-align: center; width: 100%; max-width: 400px; border: 1px solid rgba(255,255,255,0.4); }
                .icon { font-size: 64px; margin-bottom: 20px; }
                h1 { font-size: 24px; margin: 0 0 12px; font-weight: 600; color: #1d1d1f; }
                p { font-size: 16px; color: #86868b; line-height: 1.5; margin: 0; }
                .footer { position: fixed; bottom: 30px; width: 100%; text-align: center; color: #86868b; font-size: 13px; }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="icon">${icon}</div>
                <h1>${title}</h1>
                <p>${message}</p>
              </div>
              <div class="footer">Powered by <strong>StackDrive Cloud</strong></div>
            </body>
            </html>
          `);
        };

        if (!batch) {
          return renderError('Not Found', 'The requested collection could not be found or the link is invalid.', '❓');
        }

        if (batch.expires_at) {
          const expirationTime = Date.parse(batch.expires_at);
          if (!isNaN(expirationTime) && expirationTime < Date.now()) {
            return renderError('Link Expired', 'This shared collection link has expired.', '⏳');
          }
        }

        if (batch.download_limit && batch.download_count >= batch.download_limit) {
          return renderError('Limit Reached', 'The maximum download limit for this collection has been reached.', '🛑');
        }

        if (batch.password && batch.password !== pw) {
          const errorMsg = pw ? '<p style="color: #ff3b30; margin-top: 10px; font-size: 14px;">Incorrect password. Please try again.</p>' : '';
          return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Password Protected - StackDrive Cloud</title>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f5f5f7; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-radius: 20px; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); text-align: center; width: 100%; max-width: 400px; border: 1px solid rgba(255,255,255,0.3); }
                .icon { font-size: 64px; margin-bottom: 20px; }
                h1 { font-size: 24px; margin: 0 0 10px; font-weight: 600; color: #1d1d1f; }
                p { font-size: 15px; color: #86868b; margin-bottom: 30px; }
                input { width: 100%; padding: 12px 16px; border-radius: 12px; border: 1px solid #d2d2d7; background: #fff; font-size: 16px; margin-bottom: 20px; box-sizing: border-box; outline: none; transition: border-color 0.2s; }
                input:focus { border-color: #0071e3; }
                button { background: #0071e3; color: #fff; border: none; padding: 12px 24px; border-radius: 12px; font-size: 16px; font-weight: 500; cursor: pointer; width: 100%; transition: background 0.2s; }
                button:hover { background: #0077ed; }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="icon">🔒</div>
                <h1>Password Required</h1>
                <form method="GET">
                  <input type="password" name="pw" placeholder="Password" required autofocus>
                  <button type="submit">Unlock Collection</button>
                  ${errorMsg}
                </form>
              </div>
            </body>
            </html>
          `);
        }

        const fileIds = JSON.parse(batch.file_ids);
        const files = db.prepare(`SELECT * FROM cloud_files WHERE id IN (${fileIds.map(() => '?').join(',')})`).all(...fileIds);

        const formatBytes = (bytes) => {
          const b = parseFloat(bytes);
          if (isNaN(b) || b <= 0) return '0 Bytes';
          const k = 1024;
          const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
          const i = Math.floor(Math.log(b) / Math.log(k));
          return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        // Calculate limits status
        let statusBadges = [];
        if (batch.expires_at) {
          const diff = new Date(batch.expires_at) - new Date();
          if (diff > 0) {
            const hours = Math.floor(diff / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            if (hours > 24) statusBadges.push(`<span>⏳ Expires in ${Math.floor(hours/24)}d</span>`);
            else if (hours > 0) statusBadges.push(`<span>⏳ Expires in ${hours}h ${minutes}m</span>`);
            else statusBadges.push(`<span>⏳ Expires in ${minutes}m</span>`);
          }
        }
        if (batch.download_limit) {
          const rem = Math.max(0, batch.download_limit - batch.download_count);
          statusBadges.push(`<span>📥 ${rem} collection download${rem !== 1 ? 's' : ''} left</span>`);
        }
        const statusHtml = statusBadges.length > 0 
          ? `<div class="status-container">${statusBadges.join('<span class="divider"></span>')}</div>` 
          : '';

        const fileRows = files.map(file => {
          const hasThumbnail = file.mime_type.includes('image') || file.mime_type.includes('video');
          const thumbUrl = `/api/cloud/share/batch/${token}/download/${file.id}?preview=1${pw ? '&pw=' + pw : ''}`;
          let displayIcon = '📄';
          if (file.mime_type.includes('image')) displayIcon = '🖼️';
          else if (file.mime_type.includes('video')) displayIcon = '🎬';
          else if (file.mime_type.includes('pdf')) displayIcon = '📕';
          
          return `
            <div class="file-row">
              <div class="file-icon-box">
                ${hasThumbnail ? `<img src="${thumbUrl}" alt="" onerror="this.parentElement.innerHTML='<span>${displayIcon}</span>'">` : `<span>${displayIcon}</span>`}
              </div>
              <div class="file-info">
                <div class="file-name">${file.original_name}</div>
                <div class="file-meta">${formatBytes(file.size)} &bull; ${file.mime_type.split('/')[1]?.toUpperCase()}</div>
              </div>
              <a href="/api/cloud/share/batch/${token}/download/${file.id}${pw ? '?pw=' + pw : ''}" class="row-dl-btn">Download</a>
            </div>
          `;
        }).join('');

        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Shared Collection - StackDrive Cloud</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              :root { --sd-blue: #0071e3; --sd-bg: #f5f5f7; }
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: var(--sd-bg); margin: 0; color: #1d1d1f; }
              .container { max-width: 600px; margin: 60px auto; padding: 0 20px; }
              .header { text-align: center; margin-bottom: 40px; }
              .header h1 { font-size: 28px; font-weight: 600; margin: 0 0 10px; }
              .header p { color: #86868b; margin: 0; }
              
              .batch-card { background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(20px); border-radius: 24px; padding: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); border: 1px solid rgba(255,255,255,0.4); }
              
              .actions-top { display: flex; justify-content: center; margin-bottom: 30px; gap: 12px; }
              .dl-all-btn { background: var(--sd-blue); color: #fff; text-decoration: none; padding: 14px 30px; border-radius: 12px; font-weight: 500; font-size: 16px; box-shadow: 0 4px 15px rgba(0,113,227,0.2); transition: transform 0.2s; border: none; cursor: pointer; }
              .dl-all-btn.secondary { background: rgba(0,113,227,0.1); color: var(--sd-blue); box-shadow: none; border: 1px solid rgba(0,113,227,0.2); }
              .dl-all-btn:hover { transform: translateY(-2px); }
              .dl-all-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
              
              .status-container { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 25px; font-size: 13px; font-weight: 500; color: #0071e3; background: rgba(0, 113, 227, 0.08); padding: 8px 16px; border-radius: 100px; display: inline-flex; width: fit-content; align-self: center; }
              .status-container .divider { width: 1px; height: 12px; background: rgba(0, 113, 227, 0.2); }

              .file-list { display: flex; flex-direction: column; gap: 12px; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 25px; }
              .file-row { display: flex; align-items: center; gap: 15px; padding: 12px; border-radius: 14px; transition: background 0.2s; }
              .file-row:hover { background: rgba(0,0,0,0.02); }
              
              .file-icon-box { width: 50px; height: 50px; background: #fff; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); overflow: hidden; flex-shrink: 0; }
              .file-icon-box img { width: 100%; height: 100%; object-fit: cover; }
              
              .file-info { flex: 1; min-width: 0; }
              .file-name { font-weight: 500; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
              .file-meta { font-size: 12px; color: #86868b; margin-top: 2px; }
              
              .row-dl-btn { font-size: 13px; color: var(--sd-blue); text-decoration: none; font-weight: 500; padding: 6px 12px; border-radius: 6px; background: rgba(0,113,227,0.05); }
              .footer { text-align: center; margin-top: 60px; color: #86868b; font-size: 13px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Shared Folder</h1>
                <p>${files.length} items shared with you</p>
              </div>
              
              <div class="batch-card" style="display: flex; flex-direction: column;">
                ${statusHtml}
                <div class="actions-top">
                  <a href="/api/cloud/share/batch/${token}/zip${pw ? '?pw=' + pw : ''}" class="dl-all-btn">Download All (.zip)</a>
                  <button id="dl-individual-btn" class="dl-all-btn secondary">Download All (Individual)</button>
                </div>
                
                <div class="file-list">
                  ${fileRows}
                </div>
              </div>
              
              <div class="footer">Powered by <strong>StackDrive Cloud</strong></div>
            </div>

            <script>
              document.getElementById('dl-individual-btn').onclick = async function() {
                const btn = this;
                const originalText = btn.textContent;
                btn.disabled = true;
                btn.textContent = 'Processing...';

                const links = Array.from(document.querySelectorAll('.row-dl-btn'));
                for (let i = 0; i < links.length; i++) {
                  const link = links[i];
                  btn.textContent = \`Downloading \${i+1}/\${links.length}...\`;
                  
                  const a = document.createElement('a');
                  a.href = link.href;
                  a.style.display = 'none';
                  document.body.appendChild(a);
                  a.click();
                  
                  // Staggered delay to prevent browser blocking multiple downloads
                  await new Promise(resolve => setTimeout(resolve, 1200));
                  document.body.removeChild(a);
                }

                btn.textContent = 'Downloads Started!';
                setTimeout(() => {
                  btn.disabled = false;
                  btn.textContent = originalText;
                }, 2000);
              };
            </script>
          </body>
          </html>
        `);
      } catch (error) {
        res.status(500).send(`Internal server error: ${error.message}`);
      }
    },

    downloadBatchFile: (req, res) => {
      try {
        const { token, fileId } = req.params;
        const { pw } = req.query;
        const batch = db.prepare('SELECT * FROM cloud_batch_shares WHERE token = ?').get(token);

        if (!batch) return res.status(404).json({ error: 'Collection not found' });
        
        // Expiry check first
        if (batch.expires_at) {
          const expirationTime = Date.parse(batch.expires_at);
          if (!isNaN(expirationTime) && expirationTime < Date.now()) {
            return res.status(410).json({ error: 'Shared collection expired' });
          }
        }

        if (batch.password && batch.password !== pw) return res.status(401).json({ error: 'Incorrect password' });

        const file = db.prepare('SELECT * FROM cloud_files WHERE id = ?').get(fileId);
        if (!file) return res.status(404).json({ error: 'File data missing' });

        const fullPath = path.join(PROJECT_ROOT, file.path);
        if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not on disk' });

        // Handle thumbnail preview
        if (req.query.preview) {
          if (!file.thumbnail_path) return res.status(404).json({ error: 'Thumbnail not available' });
          const thumbFullPath = path.join(PROJECT_ROOT, file.thumbnail_path);
          if (fs.existsSync(thumbFullPath)) {
            return res.sendFile(thumbFullPath);
          }
          return res.status(404).json({ error: 'Thumbnail file missing' });
        }

        res.download(fullPath, file.original_name);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    downloadBatchZip: async (req, res) => {
      try {
        const { token } = req.params;
        const { pw } = req.query;
        const batch = db.prepare('SELECT * FROM cloud_batch_shares WHERE token = ?').get(token);

        if (!batch) return res.status(404).json({ error: 'Collection not found' });
        if (batch.password && batch.password !== pw) return res.status(401).json({ error: 'Incorrect password' });

        const fileIds = JSON.parse(batch.file_ids);
        const files = db.prepare(`SELECT * FROM cloud_files WHERE id IN (${fileIds.map(() => '?').join(',')})`).all(...fileIds);

        // Update download count for batch
        db.prepare('UPDATE cloud_batch_shares SET download_count = download_count + 1 WHERE id = ?').run(batch.id);

        const archive = archiver('zip', { zlib: { level: 9 } });
        res.attachment(`StackDrive_Share_${token.slice(0,6)}.zip`);

        archive.pipe(res);

        files.forEach(file => {
          const fullPath = path.join(PROJECT_ROOT, file.path);
          if (fs.existsSync(fullPath)) {
            archive.file(fullPath, { name: file.original_name });
          }
        });

        await archive.finalize();
      } catch (error) {
        console.error('[BatchZip] Error:', error);
        if (!res.headersSent) res.status(500).end();
      }
    },

    getSharedFile: (req, res) => {
      try {
        const { token } = req.params;
        const { pw } = req.query;
        const file = db.prepare('SELECT * FROM cloud_files WHERE share_token = ?').get(token);

        const renderError = (title, message, icon = '🚫') => {
          res.send(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>${title} - StackDrive Cloud</title>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f5f5f7; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-radius: 24px; padding: 50px; box-shadow: 0 15px 40px rgba(0,0,0,0.08); text-align: center; width: 100%; max-width: 400px; border: 1px solid rgba(255,255,255,0.4); }
                .icon { font-size: 64px; margin-bottom: 20px; }
                h1 { font-size: 24px; margin: 0 0 12px; font-weight: 600; color: #1d1d1f; }
                p { font-size: 16px; color: #86868b; line-height: 1.5; margin: 0; }
                .footer { position: fixed; bottom: 30px; width: 100%; text-align: center; color: #86868b; font-size: 13px; }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="icon">${icon}</div>
                <h1>${title}</h1>
                <p>${message}</p>
              </div>
              <div class="footer">Powered by <strong>StackDrive Cloud</strong></div>
            </body>
            </html>
          `);
        };

        if (!file) {
          return renderError('Not Found', 'The requested file could not be found or the link is invalid.', '❓');
        }

        // Check expiry
        if (file.share_expires_at) {
          const expirationTime = Date.parse(file.share_expires_at);
          if (!isNaN(expirationTime) && expirationTime < Date.now()) {
            return renderError('Link Expired', 'This shared link has expired and is no longer available.', '⏳');
          }
        }

        // Check download limit
        if (file.share_download_limit && file.share_download_count >= file.share_download_limit) {
          return renderError('Limit Reached', 'The maximum download limit for this file has been reached.', '🛑');
        }

        // Check password
        if (file.share_password && file.share_password !== pw) {
          const errorMsg = pw ? '<p style="color: #ff3b30; margin-top: 10px; font-size: 14px;">Incorrect password. Please try again.</p>' : '';
          return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Password Protected - StackDrive Cloud</title>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f5f5f7; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-radius: 20px; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); text-align: center; width: 100%; max-width: 400px; border: 1px solid rgba(255,255,255,0.3); }
                .icon { font-size: 64px; margin-bottom: 20px; }
                h1 { font-size: 24px; margin: 0 0 10px; font-weight: 600; color: #1d1d1f; }
                p { font-size: 15px; color: #86868b; margin-bottom: 30px; }
                input { width: 100%; padding: 12px 16px; border-radius: 12px; border: 1px solid #d2d2d7; background: #fff; font-size: 16px; margin-bottom: 20px; box-sizing: border-box; outline: none; transition: border-color 0.2s; }
                input:focus { border-color: #0071e3; }
                button { background: #0071e3; color: #fff; border: none; padding: 12px 24px; border-radius: 12px; font-size: 16px; font-weight: 500; cursor: pointer; width: 100%; transition: background 0.2s; }
                button:hover { background: #0077ed; }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="icon">🔒</div>
                <h1>Password Required</h1>
                <p>To view "<strong>${file.original_name}</strong>", please enter the password.</p>
                <form method="GET" action="/api/cloud/share/${token}">
                  <input type="password" name="pw" placeholder="Password" required autofocus>
                  <button type="submit">View Item</button>
                  ${errorMsg}
                </form>
              </div>
            </body>
            </html>
          `);
        }

        // Helper: Format bytes
        const formatBytes = (bytes) => {
          const b = parseFloat(bytes);
          if (isNaN(b) || b <= 0) return '0 Bytes';
          const k = 1024;
          const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
          const i = Math.floor(Math.log(b) / Math.log(k));
          return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        const fileExt = path.extname(file.original_name).toLowerCase();
        let displayIcon = '📄';
        if (file.mime_type.includes('image')) displayIcon = '🖼️';
        else if (file.mime_type.includes('video')) displayIcon = '🎬';
        else if (file.mime_type.includes('pdf')) displayIcon = '📕';
        else if (file.mime_type.includes('audio')) displayIcon = '🎵';
        else if (file.mime_type.includes('zip') || file.mime_type.includes('archive')) displayIcon = '📦';

        // Calculate limits status
        let statusBadges = [];
        if (file.share_expires_at) {
          const diff = new Date(file.share_expires_at) - new Date();
          if (diff > 0) {
            const hours = Math.floor(diff / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            if (hours > 24) statusBadges.push(`<span>⏳ Expires in ${Math.floor(hours/24)}d</span>`);
            else if (hours > 0) statusBadges.push(`<span>⏳ Expires in ${hours}h ${minutes}m</span>`);
            else statusBadges.push(`<span>⏳ Expires in ${minutes}m</span>`);
          }
        }
        if (file.share_download_limit) {
          const rem = Math.max(0, file.share_download_limit - file.share_download_count);
          statusBadges.push(`<span>📥 ${rem} download${rem !== 1 ? 's' : ''} left</span>`);
        }
        const statusHtml = statusBadges.length > 0 
          ? `<div class="status-container">${statusBadges.join('<span class="divider"></span>')}</div>` 
          : '';

        const hasThumbnail = file.mime_type.includes('image') || file.mime_type.includes('video');
        const downloadUrl = `/api/cloud/share/${token}/download${pw ? '?pw=' + pw : ''}`;
        const previewParam = (pw ? '&' : '?') + 'preview=1';
        const thumbUrl = `${downloadUrl}${previewParam}`;

        // Render Preview Page
        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>${file.original_name} - StackDrive Cloud</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f5f5f7; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
              .card { background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-radius: 24px; padding: 50px; box-shadow: 0 15px 40px rgba(0,0,0,0.08); text-align: center; width: 100%; max-width: 500px; border: 1px solid rgba(255,255,255,0.4); }
              .icon-container { width: 120px; height: 120px; background: #fff; border-radius: 30px; margin: 0 auto 30px; display: flex; align-items: center; justify-content: center; font-size: 64px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: hidden; }
              .icon-container img { width: 100%; height: 100%; object-fit: cover; }
              h1 { font-size: 26px; margin: 0 0 8px; font-weight: 600; color: #1d1d1f; word-break: break-all; }
              .details { font-size: 16px; color: #86868b; margin-bottom: 30px; }
              .status-container { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 40px; font-size: 13px; font-weight: 500; color: #0071e3; background: rgba(0, 113, 227, 0.08); padding: 8px 16px; border-radius: 100px; display: inline-flex; }
              .status-container .divider { width: 1px; height: 12px; background: rgba(0, 113, 227, 0.2); }
              .download-btn { display: inline-block; background: #0071e3; color: #fff; text-decoration: none; padding: 14px 40px; border-radius: 14px; font-size: 17px; font-weight: 500; transition: transform 0.2s, background 0.2s; box-shadow: 0 4px 15px rgba(0,113,227,0.3); }
              .download-btn:hover { background: #0077ed; transform: translateY(-2px); }
              .download-btn:active { transform: translateY(0); }
              .footer { position: fixed; bottom: 30px; width: 100%; text-align: center; color: #86868b; font-size: 13px; }
              .footer strong { color: #1d1d1f; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="icon-container">
                ${hasThumbnail ? `<img src="${thumbUrl}" alt="Thumbnail" onerror="this.parentElement.innerHTML='${displayIcon}'">` : displayIcon}
              </div>
              <h1>${file.original_name}</h1>
              <div class="details">
                ${file.mime_type.split('/')[1]?.toUpperCase() || 'FILE'} &bull; ${formatBytes(file.size)}
              </div>
              ${statusHtml}
              <div style="margin-top: 20px;">
                <a href="${downloadUrl}" class="download-btn">Download Now</a>
              </div>
            </div>
            <div class="footer">Shared via <strong>StackDrive Cloud</strong></div>
          </body>
          </html>
        `);
      } catch (error) {
        res.status(500).send(`Internal server error: ${error.message}`);
      }
    },

    downloadSharedFile: (req, res) => {
      try {
        const { token } = req.params;
        const { pw } = req.query;
        const file = db.prepare('SELECT * FROM cloud_files WHERE share_token = ?').get(token);

        if (!file) {
          return res.status(404).json({ error: 'Shared file not found' });
        }

        // Expiry check first
        if (file.share_expires_at) {
          const expirationTime = Date.parse(file.share_expires_at);
          if (!isNaN(expirationTime) && expirationTime < Date.now()) {
            return res.status(410).json({ error: 'Shared link expired' });
          }
        }

        // Check password
        if (file.share_password && file.share_password !== pw) {
          return res.status(401).json({ error: 'Unauthorized: Incorrect password' });
        }

        // Check download limit again before final download (Skip for thumbnail preview)
        if (!req.query.preview && file.share_download_limit && file.share_download_count >= file.share_download_limit) {
          return res.status(403).json({ error: 'Forbidden: Download limit reached' });
        }

        const fullPath = path.join(PROJECT_ROOT, file.path);
        
        if (!fs.existsSync(fullPath)) {
          console.error(`[Cloud Shared] Download failed: File not found on disk: ${fullPath}`);
          return res.status(404).json({ error: 'File not found on server' });
        }

        // Handle thumbnail preview
        if (req.query.preview) {
          if (!file.thumbnail_path) return res.status(404).json({ error: 'Thumbnail not available' });
          const thumbFullPath = path.join(PROJECT_ROOT, file.thumbnail_path);
          if (fs.existsSync(thumbFullPath)) {
            return res.sendFile(thumbFullPath);
          }
          return res.status(404).json({ error: 'Thumbnail file missing' });
        }

        // Increment download count (Skip for thumbnail preview)
        if (!req.query.preview) {
          db.prepare('UPDATE cloud_files SET share_download_count = share_download_count + 1 WHERE id = ?').run(file.id);
        }

        res.download(fullPath, file.original_name);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getFile: (req, res) => {
      try {
        const { id } = req.params;
        const file = db.prepare('SELECT * FROM cloud_files WHERE id = ?').get(id);
        if (!file) return res.status(404).json({ error: 'File not found' });
        
        // Find all batch shares this file belongs to
        // We use LIKE as a robust way to find the ID in a JSON array string
        // "id" or ,id or id,
        const fileIdStr = id.toString();
        const batchShares = db.prepare('SELECT * FROM cloud_batch_shares WHERE file_ids LIKE ?').all(`%${fileIdStr}%`);
        
        // Filter out false positives (e.g. ID 1 matching in 11, 21 etc) if needed, 
        // but since we store as [1,2,3] we can improve this:
        const realBatchShares = batchShares.filter(b => {
          try {
            const ids = JSON.parse(b.file_ids);
            const isMember = ids.map(x => x.toString()).includes(fileIdStr);
            
            if (isMember) {
              // Resolve file names for this collection
              b.files_info = db.prepare(`SELECT id, original_name FROM cloud_files WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
            }
            
            return isMember;
          } catch(e) { return false; }
        });

        file.batch_shares = realBatchShares;
        res.json(file);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    revokeBatchShare: (req, res) => {
      try {
        const { token } = req.params;
        const result = db.prepare('DELETE FROM cloud_batch_shares WHERE token = ?').run(token);
        if (result.changes === 0) {
          return res.status(404).json({ error: 'Collection not found' });
        }
        res.json({ success: true, message: 'Collection sharing deactivated' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    revokeShare: (req, res) => {
      try {
        const { id } = req.params;
        db.prepare('UPDATE cloud_files SET share_token = NULL, share_password = NULL, share_expires_at = NULL, share_download_limit = NULL, share_download_count = 0 WHERE id = ?').run(id);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    getThumbnail: async (req, res) => {
      try {
        const { id } = req.params;
        const file = db.prepare('SELECT id, path, thumbnail_path, mime_type FROM cloud_files WHERE id = ?').get(id);

        if (!file) {
          console.warn(`[Cloud] Thumbnail request for non-existent ID: ${id}`);
          return res.status(404).json({ error: 'File record not found in database' });
        }

        const fullThumbPath = path.join(PROJECT_ROOT, file.thumbnail_path || '');
        const thumbnailExistsOnDisk = file.thumbnail_path && fs.existsSync(fullThumbPath);

        if (!thumbnailExistsOnDisk) {
          console.log(`[Cloud] Thumbnail ${id} missing on disk, triggering JIT generation...`);
          
          const fullOrgPath = path.join(PROJECT_ROOT, file.path);
          if (fs.existsSync(fullOrgPath)) {
            // Attempt JIT Generation
            if (file.mime_type.includes('image') || file.mime_type.includes('video')) {
              const newThumbPath = await generateThumbnail(file.id, fullOrgPath, file.mime_type);
              if (newThumbPath) {
                // Update DB for future requests
                db.prepare('UPDATE cloud_files SET thumbnail_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newThumbPath, file.id);
                return res.sendFile(path.join(PROJECT_ROOT, newThumbPath));
              }
            }
            
            // ROBUST FALLBACK: If generation fails but it's an image, serve original
            if (file.mime_type.includes('image')) {
              console.log(`[Cloud] JIT failed for image ${id}, serving original instead`);
              return res.sendFile(fullOrgPath);
            }
          }
          
          console.error(`[Cloud] Robustness Failure: Thumbnail ${id} missing and JIT failed. Path: ${fullOrgPath}`);
          return res.status(404).json({ error: 'Thumbnail could not be served' });
        }

        res.sendFile(fullThumbPath, (err) => {
          if (err && !res.headersSent) {
            console.error(`[Cloud] Error sending thumbnail file for ID ${id}:`, err.message);
            res.status(404).end();
          }
        });


      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }

  };
};
