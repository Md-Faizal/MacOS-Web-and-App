const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const router = express.Router();
const uploadDir = path.join(process.cwd(), 'backend', 'uploads', 'android-app');
const archiveDir = path.join(uploadDir, 'archive');
const manifestPath = path.join(uploadDir, 'update-manifest.json');
const apkPath = path.join(uploadDir, 'latest.apk');
const historyPath = path.join(uploadDir, 'version-history.json');

// Ensure directories exist
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(archiveDir, { recursive: true });

// ─── Multer Configuration ───────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Upload to temp file first, then rename atomically
    cb(null, 'latest.apk.tmp');
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB max
  fileFilter: (req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.apk')) {
      return cb(new Error('Only .apk files are accepted'));
    }
    cb(null, true);
  }
});

// ─── Utility Functions ──────────────────────────────────────────────────────

/**
 * Compute SHA-256 checksum of a file
 */
function computeSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Get file size in bytes
 */
function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

/**
 * Read the update manifest, returning sensible defaults if it doesn't exist
 */
function readManifest() {
  try {
    let raw = fs.readFileSync(manifestPath, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) {
      raw = raw.slice(1);
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error('[Android Update] Manifest parse error:', err.message);
    return {
      versionCode: 1,
      versionName: '1.0.0',
      apkUrl: '/api/android/update/latest',
      releaseNotes: 'Initial debug release',
      publishedAt: new Date().toISOString(),
      fileName: 'BusinessSuite-v1.0.0.apk',
      sha256: '',
      fileSize: 0,
      minSdkVersion: 24,
      previousVersion: null,
      downloadCount: 0
    };
  }
}

/**
 * Write the update manifest to disk
 */
function writeManifest(payload) {
  fs.mkdirSync(uploadDir, { recursive: true });
  const manifest = {
    ...readManifest(),
    ...payload,
    publishedAt: payload.publishedAt || new Date().toISOString()
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
}

/**
 * Ensure a manifest file exists on disk
 */
function ensureManifest() {
  if (!fs.existsSync(manifestPath)) {
    writeManifest({});
  }
  return readManifest();
}

/**
 * Read version history (list of all published versions)
 */
function readHistory() {
  try {
    let raw = fs.readFileSync(historyPath, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) {
      raw = raw.slice(1);
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Append an entry to version history (keep last 20)
 */
function appendHistory(entry) {
  const history = readHistory();
  history.unshift({
    ...entry,
    archivedAt: new Date().toISOString()
  });
  // Keep only last 20 entries
  const trimmed = history.slice(0, 20);
  fs.writeFileSync(historyPath, JSON.stringify(trimmed, null, 2));
  return trimmed;
}

/**
 * Archive the current APK before overwriting
 * Keeps last 5 archived APKs on disk
 */
function archiveCurrentApk() {
  if (!fs.existsSync(apkPath)) return;

  const manifest = readManifest();
  const archiveName = `BusinessSuite-v${manifest.versionName || '1.0.0'}_${manifest.versionCode || 1}_${Date.now()}.apk`;
  const archiveDest = path.join(archiveDir, archiveName);

  try {
    fs.copyFileSync(apkPath, archiveDest);
    console.log(`[Android Update] Archived previous APK: ${archiveName}`);
  } catch (err) {
    console.warn(`[Android Update] Archive copy failed: ${err.message}`);
  }

  // Prune: keep only last 5 archives
  try {
    const files = fs.readdirSync(archiveDir)
      .filter(f => f.endsWith('.apk'))
      .map(f => ({ name: f, time: fs.statSync(path.join(archiveDir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    for (const old of files.slice(5)) {
      fs.unlinkSync(path.join(archiveDir, old.name));
      console.log(`[Android Update] Pruned old archive: ${old.name}`);
    }
  } catch (err) {
    console.warn(`[Android Update] Archive pruning error: ${err.message}`);
  }

  // Record in history
  appendHistory({
    versionCode: manifest.versionCode,
    versionName: manifest.versionName,
    releaseNotes: manifest.releaseNotes,
    sha256: manifest.sha256,
    fileSize: manifest.fileSize,
    publishedAt: manifest.publishedAt,
    archiveFile: archiveName
  });
}

/**
 * Construct the base URL from an Express request
 */
function getBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

/**
 * GET /manifest — Enhanced manifest with checksum, size, and metadata
 */
router.get('/manifest', (req, res) => {
  try {
    const manifest = ensureManifest();

    // Recompute integrity fields from the actual APK on disk if present
    if (fs.existsSync(apkPath)) {
      const currentSha256 = computeSha256(apkPath);
      const currentSize = getFileSize(apkPath);

      // Update manifest if values have drifted (e.g. manual file replacement)
      if (manifest.sha256 !== currentSha256 || manifest.fileSize !== currentSize) {
        manifest.sha256 = currentSha256;
        manifest.fileSize = currentSize;
        writeManifest(manifest);
      }
    }

    res.json(manifest);
  } catch (error) {
    console.error('[Android Update] Manifest read error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * HEAD /latest — Pre-flight check: returns size, checksum, and ETag
 *                without transferring the APK body
 */
router.head('/latest', (req, res) => {
  try {
    if (!fs.existsSync(apkPath)) {
      return res.status(404).end();
    }

    const manifest = readManifest();
    const stats = fs.statSync(apkPath);
    const sha256 = manifest.sha256 || computeSha256(apkPath);

    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('ETag', `"${sha256}"`);
    res.setHeader('X-APK-SHA256', sha256);
    res.setHeader('X-APK-Version', manifest.versionName || '1.0.0');
    res.setHeader('X-APK-Version-Code', String(manifest.versionCode || 1));
    res.status(200).end();
  } catch (error) {
    console.error('[Android Update] HEAD error:', error.message);
    res.status(500).end();
  }
});

/**
 * GET /latest — Download the APK with proper headers for resume support
 */
router.get('/latest', (req, res) => {
  try {
    ensureManifest();

    if (!fs.existsSync(apkPath)) {
      return res.status(404).json({ error: 'No APK has been published yet' });
    }

    const manifest = readManifest();
    const stats = fs.statSync(apkPath);
    const sha256 = manifest.sha256 || computeSha256(apkPath);
    const fileName = manifest.fileName || `BusinessSuite-v${manifest.versionName || '1.0.0'}.apk`;

    // Increment download counter
    manifest.downloadCount = (manifest.downloadCount || 0) + 1;
    writeManifest(manifest);

    // Set headers for integrity and resume support
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('ETag', `"${sha256}"`);
    res.setHeader('X-APK-SHA256', sha256);
    res.setHeader('X-APK-Version', manifest.versionName || '1.0.0');
    res.setHeader('X-APK-Version-Code', String(manifest.versionCode || 1));
    res.setHeader('Cache-Control', 'no-cache');

    // Handle Range requests for resume support
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;

      if (start >= stats.size) {
        res.setHeader('Content-Range', `bytes */${stats.size}`);
        return res.status(416).end();
      }

      const chunkSize = end - start + 1;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
      res.setHeader('Content-Length', chunkSize);
      res.status(206);

      const stream = fs.createReadStream(apkPath, { start, end });
      stream.pipe(res);
    } else {
      res.download(apkPath, fileName);
    }
  } catch (error) {
    console.error('[Android Update] Download error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /upload — Upload a new APK with auto-integrity and version archival
 *
 * Accepts multipart/form-data with:
 *   - apk: the APK file
 *   - versionCode, versionName, releaseNotes, fileName (form fields or JSON in 'manifest' field)
 */
router.post('/upload', upload.single('apk'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'An APK file is required' });
    }

    const tmpPath = path.join(uploadDir, 'latest.apk.tmp');

    // Parse manifest input from form fields or JSON body
    const manifestInput = req.body.manifest ? JSON.parse(req.body.manifest) : {};

    const versionCode = Number(req.body.versionCode || manifestInput.versionCode || readManifest().versionCode || 1);
    const versionName = req.body.versionName || manifestInput.versionName || readManifest().versionName || '1.0.0';
    const releaseNotes = req.body.releaseNotes || manifestInput.releaseNotes || 'Updated via deployment script';
    const fileName = req.body.fileName || manifestInput.fileName || req.file.originalname || `BusinessSuite-v${versionName}.apk`;
    const minSdkVersion = Number(req.body.minSdkVersion || manifestInput.minSdkVersion || 24);

    // Verify the uploaded file exists and is non-zero
    if (!fs.existsSync(tmpPath) || getFileSize(tmpPath) === 0) {
      return res.status(400).json({ error: 'Uploaded file is empty or missing' });
    }

    // Compute integrity of uploaded file
    const sha256 = computeSha256(tmpPath);
    const fileSize = getFileSize(tmpPath);

    // Archive current APK before overwriting
    archiveCurrentApk();

    // Capture previous version info
    const currentManifest = readManifest();
    const previousVersion = {
      versionCode: currentManifest.versionCode,
      versionName: currentManifest.versionName
    };

    // Atomic rename: tmp -> latest.apk
    fs.renameSync(tmpPath, apkPath);

    // Maintain versioned copy for direct distinct downloads
    const versionedApkPath = path.join(uploadDir, fileName);
    try {
      fs.copyFileSync(apkPath, versionedApkPath);
    } catch (e) {
      console.warn('[Android Update] Could not create versioned copy:', e.message);
    }

    // Write enhanced manifest
    const manifest = writeManifest({
      versionCode,
      versionName,
      apkUrl: `${getBaseUrl(req)}/api/android/update/latest`,
      releaseNotes,
      fileName,
      sha256,
      fileSize,
      minSdkVersion,
      previousVersion,
      downloadCount: 0
    });

    console.log(`[Android Update] Published v${versionName} (${versionCode}) — ${(fileSize / 1024 / 1024).toFixed(1)}MB — SHA256: ${sha256.substring(0, 16)}...`);

    res.json({
      success: true,
      manifest,
      uploadedFile: req.file.filename,
      integrity: { sha256, fileSize }
    });
  } catch (error) {
    // Clean up temp file on error
    const tmpPath = path.join(uploadDir, 'latest.apk.tmp');
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    console.error('[Android Update] Upload error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /rollback — Restore the previous version from archive
 */
router.post('/rollback', (req, res) => {
  try {
    const history = readHistory();
    if (history.length === 0) {
      return res.status(404).json({ error: 'No archived versions available for rollback' });
    }

    const target = history[0]; // Most recent archived version
    const archiveFile = path.join(archiveDir, target.archiveFile);

    if (!fs.existsSync(archiveFile)) {
      return res.status(404).json({ error: `Archive file not found: ${target.archiveFile}` });
    }

    // Archive the CURRENT version first (so we can undo the rollback)
    archiveCurrentApk();

    // Copy archived APK to latest.apk
    fs.copyFileSync(archiveFile, apkPath);

    // Recompute integrity from restored file
    const sha256 = computeSha256(apkPath);
    const fileSize = getFileSize(apkPath);

    // Restore manifest to archived version
    const manifest = writeManifest({
      versionCode: target.versionCode,
      versionName: target.versionName,
      releaseNotes: `[ROLLBACK] ${target.releaseNotes || ''}`,
      sha256,
      fileSize,
      previousVersion: null,
      downloadCount: 0
    });

    console.log(`[Android Update] ROLLBACK to v${target.versionName} (${target.versionCode})`);

    res.json({
      success: true,
      message: `Rolled back to v${target.versionName} (${target.versionCode})`,
      manifest,
      restoredFrom: target.archiveFile
    });
  } catch (error) {
    console.error('[Android Update] Rollback error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /archive/:fileName — Download a historical archived APK
 */
router.get('/archive/:fileName', (req, res) => {
  try {
    const safeName = path.basename(req.params.fileName);
    const targetFile = path.join(archiveDir, safeName);
    if (!fs.existsSync(targetFile)) {
      return res.status(404).json({ error: 'Archived APK not found' });
    }
    res.download(targetFile, safeName);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /history — List all published versions
 */
router.get('/history', (req, res) => {
  try {
    const history = readHistory().map(item => ({
      ...item,
      downloadUrl: item.archiveFile ? `/api/android/update/archive/${encodeURIComponent(item.archiveFile)}` : null
    }));
    res.json({
      count: history.length,
      versions: history
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /health — Update system health check
 */
router.get('/health', (req, res) => {
  try {
    const manifest = readManifest();
    const apkExists = fs.existsSync(apkPath);
    const apkSize = apkExists ? getFileSize(apkPath) : 0;
    const archiveCount = fs.existsSync(archiveDir)
      ? fs.readdirSync(archiveDir).filter(f => f.endsWith('.apk')).length
      : 0;

    res.json({
      status: 'healthy',
      currentVersion: {
        versionName: manifest.versionName,
        versionCode: manifest.versionCode,
        publishedAt: manifest.publishedAt
      },
      apk: {
        exists: apkExists,
        sizeBytes: apkSize,
        sizeMB: (apkSize / 1024 / 1024).toFixed(1),
        sha256: manifest.sha256 || null
      },
      archive: {
        count: archiveCount
      },
      downloads: manifest.downloadCount || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
