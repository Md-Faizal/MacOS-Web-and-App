/**
 * nexus-auth-gateway.js
 *
 * Intelligent zero-downtime bridge between macOS Business Suite and Nexus Auth Core.
 * Handles:
 * 1. Forwarding login requests to Nexus Central Hub.
 * 2. Automated Just-in-Time (JIT) migration of local macOS accounts.
 * 3. Graceful offline fallback if Central Hub is temporarily disconnected.
 */

const axios = require('axios');

class NexusAuthGateway {
  constructor(db) {
    this.db = db;
    this.hubBaseUrl = process.env.NEXUS_AUTH_HUB_URL || 'https://faizal.uk/api/auth';
    this.internalKey = process.env.NEXUS_INTERNAL_KEY || process.env.ADMIN_PIN || '2004';
    this.timeout = 5000; // 5-second resilient timeout
  }

  getHttpClient() {
    return axios.create({
      baseURL: this.hubBaseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-App': 'macos-suite',
      },
    });
  }

  /**
   * Attempt upstream authentication on Central Nexus Hub
   */
  async loginUpstream(identifier, password, deviceName = 'macOS Web Desktop') {
    try {
      const client = this.getHttpClient();
      const response = await client.post('/login', {
        email: identifier.includes('@') ? identifier : undefined,
        username: !identifier.includes('@') ? identifier : undefined,
        password: password,
        device_name: deviceName,
        app_id: 'app_macos_suite',
      });
      return { success: true, data: response.data };
    } catch (err) {
      if (err.response) {
        return { success: false, status: err.response.status, error: err.response.data?.error || 'Authentication failed' };
      }
      return { success: false, isNetworkError: true, error: err.message };
    }
  }

  /**
   * Migrate a verified local user into the Central Hub
   */
  async migrateLocalUser(localUser, plaintextPassword) {
    try {
      const client = this.getHttpClient();
      const response = await client.post(
        '/internal/migrate-user',
        {
          legacy_id: localUser.id,
          email: localUser.email || `${localUser.username || 'user'}@nexus.local`,
          username: localUser.username || null,
          full_name: localUser.full_name || localUser.username || 'macOS Operator',
          password: plaintextPassword,
          role: localUser.role || 'admin',
          status: localUser.status || 'active',
          avatar_url: localUser.avatar_url || null,
        },
        {
          headers: {
            'x-nexus-internal-key': this.internalKey,
          },
        }
      );
      return { success: true, data: response.data };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || err.message };
    }
  }
}

module.exports = NexusAuthGateway;
