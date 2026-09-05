/**
 * BACKUP & DISASTER RECOVERY MANAGER
 * 
 * Features:
 * - SQLite Online Snapshots (.db and .db.gz compression) using native better-sqlite3 .backup()
 * - S3-compatible / Cloudflare R2 cloud uploads with AWS Signature V4 (built-in crypto/http, zero bloat)
 * - Local snapshot retention policy (prunes old backups past limit)
 * - Scheduled snapshot runner (Interval: Disabled, Hourly, 6-Hours, 12-Hours, Daily)
 * - Restores from local or remote cloud snapshot
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

class BackupManager {
  constructor(db) {
    this.db = db;
    this.backupDir = path.join(process.cwd(), 'database', 'backups');
    this.dbPath = path.join(process.cwd(), 'database', 'MacOS.db');
    this.intervalHandle = null;
    this.isBackingUp = false;

    this.ensureDir();
    this.initSchedule();
  }

  ensureDir() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Load backup configuration from app_settings
   */
  getConfig() {
    try {
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS app_settings (
          id TEXT PRIMARY KEY,
          setting_key TEXT NOT NULL UNIQUE,
          setting_value TEXT NOT NULL,
          setting_type TEXT DEFAULT 'string',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      const rows = this.db.prepare(`
        SELECT setting_key, setting_value FROM app_settings 
        WHERE setting_key LIKE 'backup_%'
      `).all();

      const config = {
        enabled: 'false',
        interval: 'daily', // hourly, 6h, 12h, daily, disabled
        retentionCount: '7',
        compress: 'true',
        r2Enabled: 'false',
        r2AccountId: '',
        r2AccessKeyId: '',
        r2SecretAccessKey: '',
        r2BucketName: '',
        r2CustomEndpoint: '', // Optional override for MinIO / S3 compatible
        lastBackupAt: '',
        lastBackupStatus: 'idle',
        lastBackupError: ''
      };

      for (const row of rows) {
        const key = row.setting_key.replace(/^backup_/, '');
        config[key] = row.setting_value;
      }

      return config;
    } catch (err) {
      console.error('[BackupManager] Failed to read backup config:', err.message);
      return {
        enabled: 'false',
        interval: 'daily',
        retentionCount: '7',
        compress: 'true',
        r2Enabled: 'false',
        r2AccountId: '',
        r2AccessKeyId: '',
        r2SecretAccessKey: '',
        r2BucketName: '',
        r2CustomEndpoint: '',
        lastBackupAt: '',
        lastBackupStatus: 'idle',
        lastBackupError: ''
      };
    }
  }

  /**
   * Save backup configuration
   */
  saveConfig(settings) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO app_settings (id, setting_key, setting_value, setting_type, updated_at)
        VALUES (?, ?, ?, 'string', CURRENT_TIMESTAMP)
        ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP
      `);

      const genId = () => `set_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const tx = this.db.transaction(() => {
        for (const [key, value] of Object.entries(settings)) {
          const settingKey = key.startsWith('backup_') ? key : `backup_${key}`;
          stmt.run(genId(), settingKey, String(value ?? ''));
        }
      });
      tx();

      // Restart schedule runner with new settings
      this.initSchedule();
      return { success: true };
    } catch (err) {
      console.error('[BackupManager] Failed to save backup config:', err.message);
      throw err;
    }
  }

  /**
   * Update status in app_settings
   */
  updateStatus(status, error = '') {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO app_settings (id, setting_key, setting_value, setting_type, updated_at)
        VALUES (?, ?, ?, 'string', CURRENT_TIMESTAMP)
        ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP
      `);
      const genId = () => `set_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      stmt.run(genId(), 'backup_lastBackupStatus', status);
      if (status === 'success') {
        stmt.run(genId(), 'backup_lastBackupAt', new Date().toISOString());
        stmt.run(genId(), 'backup_lastBackupError', '');
      } else if (status === 'error') {
        stmt.run(genId(), 'backup_lastBackupError', error || 'Unknown backup error');
      }
    } catch (e) {
      console.warn('[BackupManager] Status update failed:', e.message);
    }
  }

  /**
   * Initialize background schedule timer
   */
  initSchedule() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    const config = this.getConfig();
    if (config.enabled !== 'true' || config.interval === 'disabled') {
      console.log('[BackupManager] Periodic automatic backups are disabled');
      return;
    }

    let intervalMs = 24 * 60 * 60 * 1000; // default daily
    switch (config.interval) {
      case 'hourly':
        intervalMs = 60 * 60 * 1000;
        break;
      case '6h':
        intervalMs = 6 * 60 * 60 * 1000;
        break;
      case '12h':
        intervalMs = 12 * 60 * 60 * 1000;
        break;
      case 'daily':
      default:
        intervalMs = 24 * 60 * 60 * 1000;
        break;
    }

    console.log(`[BackupManager] Scheduled automated snapshots every ${config.interval} (${intervalMs / 1000}s)`);

    // Check every 10 minutes whether an execution is due
    this.intervalHandle = setInterval(async () => {
      try {
        const currentCfg = this.getConfig();
        if (currentCfg.enabled !== 'true') return;

        const lastRun = currentCfg.lastBackupAt ? new Date(currentCfg.lastBackupAt).getTime() : 0;
        const now = Date.now();

        if (now - lastRun >= intervalMs) {
          console.log('[BackupManager] Timer triggered: starting scheduled database snapshot...');
          await this.runBackup({ source: 'scheduled' });
        }
      } catch (err) {
        console.error('[BackupManager] Scheduled backup error:', err.message);
      }
    }, 10 * 60 * 1000);

    // Also unref so it won't block graceful Node shutdown
    if (this.intervalHandle.unref) {
      this.intervalHandle.unref();
    }
  }

  /**
   * Perform SQLite Snapshot
   */
  async runBackup(options = {}) {
    if (this.isBackingUp) {
      throw new Error('A backup operation is currently in progress');
    }

    this.isBackingUp = true;
    this.updateStatus('running');
    const config = this.getConfig();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rawFileName = `backup_${timestamp}.db`;
    const rawFilePath = path.join(this.backupDir, rawFileName);

    try {
      this.ensureDir();
      console.log(`[BackupManager] Starting live SQLite snapshot to ${rawFileName}...`);

      // 1. Native safe SQLite online backup
      await this.db.backup(rawFilePath);

      let finalFileName = rawFileName;
      let finalFilePath = rawFilePath;

      // 2. Optional GZIP Compression (shrinks 10MB DB to ~1MB)
      const shouldCompress = config.compress !== 'false';
      if (shouldCompress) {
        finalFileName = `${rawFileName}.gz`;
        finalFilePath = path.join(this.backupDir, finalFileName);

        const readStream = fs.createReadStream(rawFilePath);
        const writeStream = fs.createWriteStream(finalFilePath);
        const gzip = zlib.createGzip({ level: 9 });

        await new Promise((resolve, reject) => {
          readStream.pipe(gzip).pipe(writeStream)
            .on('finish', resolve)
            .on('error', reject);
        });

        // Remove uncompressed raw backup
        if (fs.existsSync(rawFilePath)) {
          fs.unlinkSync(rawFilePath);
        }
      }

      const stats = fs.statSync(finalFilePath);
      console.log(`[BackupManager] Local snapshot completed: ${finalFileName} (${(stats.size / 1024).toFixed(1)} KB)`);

      // 3. Cloudflare R2 / S3 Sync (if enabled)
      let cloudResult = null;
      if (config.r2Enabled === 'true' && config.r2BucketName) {
        console.log(`[BackupManager] Uploading snapshot to Cloudflare R2: ${config.r2BucketName}...`);
        cloudResult = await this.uploadToR2(finalFilePath, finalFileName, config);
        console.log('[BackupManager] Cloudflare R2 upload finished successfully.');
      }

      // 4. Prune old local backups according to retentionCount
      const retention = parseInt(config.retentionCount, 10) || 7;
      this.pruneOldBackups(retention);

      this.updateStatus('success');
      return {
        success: true,
        filename: finalFileName,
        sizeBytes: stats.size,
        cloudSynced: !!cloudResult,
        createdAt: new Date().toISOString()
      };
    } catch (err) {
      console.error('[BackupManager] Backup run failed:', err);
      this.updateStatus('error', err.message);
      throw err;
    } finally {
      this.isBackingUp = false;
    }
  }

  /**
   * Prune old local backups keeping the latest N
   */
  pruneOldBackups(keepCount = 7) {
    try {
      this.ensureDir();
      const files = fs.readdirSync(this.backupDir)
        .filter(f => f.startsWith('backup_') && (f.endsWith('.db') || f.endsWith('.db.gz')))
        .map(f => {
          const fullPath = path.join(this.backupDir, f);
          const stats = fs.statSync(fullPath);
          return { filename: f, path: fullPath, mtime: stats.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length > keepCount) {
        const toRemove = files.slice(keepCount);
        for (const file of toRemove) {
          try {
            fs.unlinkSync(file.path);
            console.log(`[BackupManager] Pruned expired backup: ${file.filename}`);
          } catch (e) {
            console.warn(`[BackupManager] Failed to prune ${file.filename}:`, e.message);
          }
        }
      }
    } catch (err) {
      console.error('[BackupManager] Prune error:', err.message);
    }
  }

  /**
   * Get list of local backup snapshots
   */
  listLocalBackups() {
    this.ensureDir();
    const files = fs.readdirSync(this.backupDir)
      .filter(f => (f.startsWith('backup_') || f.startsWith('MacOS')) && (f.endsWith('.db') || f.endsWith('.db.gz')))
      .map(f => {
        const filePath = path.join(this.backupDir, f);
        const stats = fs.statSync(filePath);
        return {
          filename: f,
          sizeBytes: stats.size,
          isGzip: f.endsWith('.gz'),
          createdAt: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return files;
  }

  /**
   * Restore database from snapshot
   */
  async restoreBackup(filename) {
    if (!filename || typeof filename !== 'string') {
      throw new Error('Valid filename required');
    }

    const safeFilename = path.basename(filename);
    const sourcePath = path.join(this.backupDir, safeFilename);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Backup snapshot ${safeFilename} does not exist`);
    }

    console.log(`[BackupManager] Restoring database from snapshot: ${safeFilename}`);

    let dbToRestore = sourcePath;
    let tempUncompressed = null;

    if (safeFilename.endsWith('.gz')) {
      tempUncompressed = path.join(this.backupDir, `temp_restore_${Date.now()}.db`);
      const readStream = fs.createReadStream(sourcePath);
      const writeStream = fs.createWriteStream(tempUncompressed);
      const gunzip = zlib.createGunzip();

      await new Promise((resolve, reject) => {
        readStream.pipe(gunzip).pipe(writeStream)
          .on('finish', resolve)
          .on('error', reject);
      });
      dbToRestore = tempUncompressed;
    }

    try {
      const Database = require('better-sqlite3');
      const backupDb = new Database(dbToRestore);
      await backupDb.backup(this.dbPath);
      backupDb.close();
      console.log('[BackupManager] Database restore completed successfully');
      return { success: true };
    } finally {
      if (tempUncompressed && fs.existsSync(tempUncompressed)) {
        try { fs.unlinkSync(tempUncompressed); } catch (e) {}
      }
    }
  }

  /**
   * Delete snapshot
   */
  deleteBackup(filename) {
    const safeFilename = path.basename(filename);
    const filePath = path.join(this.backupDir, safeFilename);
    if (!fs.existsSync(filePath)) {
      throw new Error('Backup file not found');
    }
    fs.unlinkSync(filePath);
    return { success: true };
  }

  /**
   * AWS Signature Version 4 calculation for S3 / Cloudflare R2
   */
  async uploadToR2(filePath, fileName, config) {
    const { r2AccountId, r2AccessKeyId, r2SecretAccessKey, r2BucketName, r2CustomEndpoint } = config;

    if (!r2AccessKeyId || !r2SecretAccessKey || !r2BucketName) {
      throw new Error('Missing Cloudflare R2 credentials (Access Key ID, Secret Access Key, or Bucket Name)');
    }

    const host = r2CustomEndpoint 
      ? r2CustomEndpoint.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      : `${r2AccountId.trim()}.r2.cloudflarestorage.com`;

    const region = 'auto';
    const service = 's3';
    const method = 'PUT';
    const uri = `/${r2BucketName.trim()}/${encodeURIComponent(fileName)}`;

    const fileBuffer = fs.readFileSync(filePath);
    const payloadHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substr(0, 8);

    const canonicalHeaders = 
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;

    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = [
      method,
      uri,
      '', // canonical query string
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');

    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    ].join('\n');

    // Calculate HMAC-SHA256 signature key
    const kDate = crypto.createHmac('sha256', `AWS4${r2SecretAccessKey.trim()}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const authorizationHeader = `${algorithm} Credential=${r2AccessKeyId.trim()}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const headers = {
      'Host': host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      'Authorization': authorizationHeader,
      'Content-Length': fileBuffer.length,
      'Content-Type': fileName.endsWith('.gz') ? 'application/gzip' : 'application/x-sqlite3'
    };

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: host,
        port: 443,
        path: uri,
        method: 'PUT',
        headers: headers,
        timeout: 60000
      }, (res) => {
        let responseBody = '';
        res.on('data', chunk => responseBody += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, statusCode: res.statusCode });
          } else {
            reject(new Error(`R2 upload rejected (HTTP ${res.statusCode}): ${responseBody || res.statusMessage}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Cloudflare R2 upload timed out after 60 seconds'));
      });

      req.write(fileBuffer);
      req.end();
    });
  }

  /**
   * Test connection to Cloudflare R2 by performing a HEAD bucket query
   */
  async testR2Connection(config) {
    const { r2AccountId, r2AccessKeyId, r2SecretAccessKey, r2BucketName, r2CustomEndpoint } = config;

    if (!r2AccessKeyId || !r2SecretAccessKey || !r2BucketName) {
      throw new Error('Access Key ID, Secret Key, and Bucket Name are required');
    }

    const host = r2CustomEndpoint 
      ? r2CustomEndpoint.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      : `${r2AccountId.trim()}.r2.cloudflarestorage.com`;

    const region = 'auto';
    const service = 's3';
    const method = 'HEAD';
    const uri = `/${r2BucketName.trim()}`;

    const payloadHash = crypto.createHash('sha256').update('').digest('hex');
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substr(0, 8);

    const canonicalHeaders = 
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;

    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = [
      method,
      uri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');

    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    ].join('\n');

    const kDate = crypto.createHmac('sha256', `AWS4${r2SecretAccessKey.trim()}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const authorizationHeader = `${algorithm} Credential=${r2AccessKeyId.trim()}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: host,
        port: 443,
        path: uri,
        method: 'HEAD',
        headers: {
          'Host': host,
          'x-amz-date': amzDate,
          'x-amz-content-sha256': payloadHash,
          'Authorization': authorizationHeader
        },
        timeout: 10000
      }, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve({ success: true, message: `Connected successfully to bucket "${r2BucketName}" (HTTP ${res.statusCode})` });
        } else {
          reject(new Error(`Bucket connection failed with HTTP ${res.statusCode} (${res.statusMessage})`));
        }
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Cloudflare R2 connection test timed out (10s)'));
      });
      req.end();
    });
  }
}

module.exports = BackupManager;
