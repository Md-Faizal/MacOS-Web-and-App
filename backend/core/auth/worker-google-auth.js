const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'macos_super_secret_session_key_123';
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_WORKER_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

// Fallback QR code generator using SVG if qrcode module is still loading
async function generateQrDataUrl(text) {
  try {
    const QRCode = require('qrcode');
    return await QRCode.toDataURL(text, { width: 256, margin: 2 });
  } catch (err) {
    // Fallback simple SVG QR placeholder / data URL
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"><rect width="200" height="200" fill="#ffffff"/><text x="100" y="105" font-family="monospace" font-size="20" font-weight="bold" fill="#333333" text-anchor="middle">${text}</text><text x="100" y="140" font-family="sans-serif" font-size="12" fill="#888888" text-anchor="middle">Invite Code</text></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }
}

module.exports = function(db, permissionsHelper) {
  return {
    /**
     * Authenticate or register using Google (Workers and Owner Hybrid)
     * Handles both id_token (from Android or Web Google Identity Services) and OAuth code exchange
     */
    loginWithGoogle: async (req, res) => {
      try {
        const { idToken, code, redirectUri, deviceName, deviceType } = req.body;

        let googleUser = null;

        // Mode 1: Verify Google ID Token (preferred for mobile & modern GIS SDK)
        if (idToken) {
          try {
            const tokenVerifyRes = await axios.get(
              `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
              { timeout: 8000 }
            );
            const tokenData = tokenVerifyRes.data;

            if (!tokenData.sub || !tokenData.email) {
              return res.status(400).json({ error: 'Invalid Google ID token payload' });
            }

            googleUser = {
              sub: tokenData.sub,
              email: tokenData.email.toLowerCase().trim(),
              name: tokenData.name || tokenData.email.split('@')[0],
              picture: tokenData.picture || null
            };
          } catch (tokenErr) {
            console.error('Google ID token verification failed:', tokenErr.response?.data || tokenErr.message);
            return res.status(401).json({ error: 'Invalid or expired Google ID token' });
          }
        } 
        // Mode 2: Exchange Authorization Code for Tokens
        else if (code) {
          try {
            let redirect = redirectUri || process.env.GOOGLE_REDIRECT_URI;
            if (!redirect) {
              const protocol = req.headers['x-forwarded-proto'] || req.protocol;
              const host = req.headers['x-forwarded-host'] || req.headers.host;
              redirect = `${protocol}://${host}/api/auth/google/callback`;
            }

            const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
              code,
              client_id: CLIENT_ID,
              client_secret: CLIENT_SECRET,
              redirect_uri: redirect,
              grant_type: 'authorization_code'
            }, { timeout: 8000 });

            const { access_token } = tokenRes.data;

            const userRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${access_token}` },
              timeout: 8000
            });

            googleUser = {
              sub: userRes.data.sub,
              email: userRes.data.email.toLowerCase().trim(),
              name: userRes.data.name || userRes.data.email.split('@')[0],
              picture: userRes.data.picture || null
            };
          } catch (codeErr) {
            console.error('Google OAuth code exchange error:', codeErr.response?.data || codeErr.message);
            return res.status(401).json({ error: 'Failed to authenticate authorization code with Google' });
          }
        } else {
          return res.status(400).json({ error: 'Either idToken or code is required' });
        }

        // 1. Unified Identity Lookup
        let targetUser = null;
        const googleIdentity = db.prepare("SELECT * FROM user_identities WHERE provider = 'google' AND provider_user_id = ?").get(googleUser.sub);
        
        if (googleIdentity) {
          // Returning user via Google
          targetUser = db.prepare("SELECT * FROM users WHERE id = ?").get(googleIdentity.user_id);
          db.prepare("UPDATE user_identities SET provider_email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(googleUser.email, googleIdentity.id);
        } else {
          // Google Identity not found. Check if email exists in users table
          targetUser = db.prepare("SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(google_email) = ?").get(googleUser.email, googleUser.email);
          
          if (targetUser) {
            // Account exists but is not linked to this Google ID
            if (targetUser.is_verified) {
              // Safe to auto-link
              db.prepare("INSERT INTO user_identities (id, user_id, provider, provider_user_id, provider_email, is_verified) VALUES (?, ?, 'google', ?, ?, 1)").run(crypto.randomUUID(), targetUser.id, googleUser.sub, googleUser.email);
            } else {
              // Unverified! Potential pre-hijacking. Do NOT auto-link without password challenge.
              if (linkPassword) {
                const localIdentity = db.prepare("SELECT * FROM user_identities WHERE user_id = ? AND provider = 'local'").get(targetUser.id);
                if (!localIdentity || !localIdentity.password_hash) {
                  return res.status(401).json({ error: 'Incorrect password for linking.' });
                }
                const isMatch = bcrypt.compareSync(linkPassword, localIdentity.password_hash);
                if (!isMatch) {
                  return res.status(401).json({ error: 'Incorrect password for linking.' });
                }
                // Valid password! Mark verified and link.
                db.prepare("UPDATE users SET is_verified = 1 WHERE id = ?").run(targetUser.id);
                db.prepare("UPDATE user_identities SET is_verified = 1 WHERE user_id = ? AND provider = 'local'").run(targetUser.id);
                db.prepare("INSERT INTO user_identities (id, user_id, provider, provider_user_id, provider_email, is_verified) VALUES (?, ?, 'google', ?, ?, 1)").run(crypto.randomUUID(), targetUser.id, googleUser.sub, googleUser.email);
              } else {
                return res.status(409).json({ 
                  error: 'AccountConflict', 
                  message: 'An account with this email already exists. Enter your password to link your Google login.', 
                  requiresLinking: true,
                  email: googleUser.email
                });
              }
            }
          } else {
            // 3. New Worker Registration (First time login)
            const newUserId = crypto.randomUUID();
            const inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6-char code e.g. E9A4B2
            const inviteQr = await generateQrDataUrl(inviteCode);

            db.prepare(`
              INSERT INTO users (
                id, google_id, google_email, google_name, google_picture,
                full_name, email, role, status, invite_code, invite_qr_base64,
                update_channel, token_version, is_verified
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 'worker', 'pending', ?, ?, 'production', 0, 1)
            `).run(
              newUserId, googleUser.sub, googleUser.email, googleUser.name, googleUser.picture,
              googleUser.name, googleUser.email, inviteCode, inviteQr
            );
            
            db.prepare("INSERT INTO user_identities (id, user_id, provider, provider_user_id, provider_email, is_verified) VALUES (?, ?, 'google', ?, ?, 1)").run(crypto.randomUUID(), newUserId, googleUser.sub, googleUser.email);
            targetUser = db.prepare("SELECT * FROM users WHERE id = ?").get(newUserId);
            targetUser._isNewWorker = true;
            targetUser._inviteCode = inviteCode;
          }
        }

        // At this point, targetUser is resolved and securely authenticated/linked.
        
        // If Worker is Pending Approval: return invite code & status (do not issue auth_token yet)
        if (targetUser.role === 'worker' && targetUser.status === 'pending') {
          if (targetUser._isNewWorker) {
            // Notify owner
            try {
              db.prepare(`
                INSERT INTO owner_notifications (type, title, body, data) 
                VALUES (?, ?, ?, ?)
              `).run(
                'new_user_pending',
                'New User Access Request',
                `${googleUser.name} (${googleUser.email}) signed in with Google and requested access. Invite code: ${targetUser._inviteCode}`,
                JSON.stringify({
                  userId: targetUser.id,
                  name: googleUser.name,
                  email: googleUser.email,
                  picture: googleUser.picture,
                  inviteCode: targetUser._inviteCode
                })
              );
            } catch (notifErr) {
              console.warn('Failed to insert owner notification:', notifErr.message);
            }
          }
          
          return res.json({
            success: true,
            status: 'pending',
            role: 'worker',
            isNewUser: targetUser._isNewWorker || false,
            inviteCode: targetUser.invite_code,
            inviteQr: targetUser.invite_qr_base64,
            message: 'Account is pending approval. Share your invite code with your manager.'
          });
        }

        // If Suspended: block login
        if (targetUser.status === 'suspended') {
          return res.status(403).json({ error: 'Your account has been suspended. Please contact your manager.' });
        }

        // Active Owner or Worker: Update profile and issue token
        db.prepare(`
          UPDATE users SET 
            google_id = COALESCE(?, google_id),
            google_email = ?,
            google_name = COALESCE(?, google_name),
            google_picture = COALESCE(?, google_picture),
            last_login = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(googleUser.sub, googleUser.email, googleUser.name, googleUser.picture, targetUser.id);

        let deviceId = null;
        if (deviceName) {
          db.prepare('UPDATE user_devices SET is_current = 0').run();
          db.prepare(`
            INSERT INTO user_devices (device_name, device_type, is_current, last_login, last_seen) 
            VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            ON CONFLICT(device_name) DO UPDATE SET 
              last_login = excluded.last_login,
              last_seen = excluded.last_seen,
              is_current = 1,
              device_type = excluded.device_type
          `).run(deviceName, deviceType || 'Web', 1);

          const dev = db.prepare('SELECT id FROM user_devices WHERE device_name = ?').get(deviceName);
          deviceId = dev?.id;
          if (dev) {
            db.prepare('INSERT INTO login_history (device_id, status) VALUES (?, ?)').run(dev.id, 'success');
          }
        }

        const token = jwt.sign({
          userId: targetUser.id,
          role: targetUser.role,
          tokenVersion: targetUser.token_version || 0,
          deviceId
        }, JWT_SECRET, { expiresIn: '7d' });

        res.cookie('auth_token', token, {
          httpOnly: true,
          secure: ['production', 'oraclevm'].includes(process.env.NODE_ENV) || req.protocol === 'https',
          sameSite: 'Lax',
          path: '/'
        });

        const permissions = permissionsHelper && targetUser.role === 'worker' ? permissionsHelper.getUserPermissionsSnapshot(targetUser.id, 'worker') : null;

        return res.json({
          success: true,
          isOwner: targetUser.role === 'owner',
          role: targetUser.role,
          status: 'active',
          token,
          updateChannel: targetUser.update_channel || 'production',
          user: {
            id: targetUser.id,
            name: targetUser.full_name || googleUser.name,
            email: targetUser.email || googleUser.email,
            picture: googleUser.picture || targetUser.google_picture
          },
          permissions
        });

      } catch (err) {
        console.error('Google login handler error:', err);
        return res.status(500).json({ error: 'Internal server error during Google login' });
      }
    },

    /**
     * Check pending approval status (polled by worker on Pending screen)
     */
    checkWorkerStatus: (req, res) => {
      try {
        const { inviteCode, email } = req.query;
        if (!inviteCode && !email) {
          return res.status(400).json({ error: 'inviteCode or email required' });
        }

        const user = db.prepare(`
          SELECT id, full_name, email, role, status, token_version, update_channel, google_picture 
          FROM users 
          WHERE invite_code = ? OR LOWER(email) = ? OR LOWER(google_email) = ?
        `).get(inviteCode || '', (email || '').toLowerCase().trim(), (email || '').toLowerCase().trim());

        if (!user) {
          return res.status(404).json({ error: 'User registration not found' });
        }

        if (user.status === 'active') {
          const token = jwt.sign({
            userId: user.id,
            role: user.role,
            tokenVersion: user.token_version || 0
          }, JWT_SECRET, { expiresIn: '7d' });

          res.cookie('auth_token', token, {
            httpOnly: true,
            secure: ['production', 'oraclevm'].includes(process.env.NODE_ENV) || req.protocol === 'https',
            sameSite: 'Lax',
            path: '/'
          });

          const permissions = permissionsHelper ? permissionsHelper.getUserPermissionsSnapshot(user.id, user.role) : null;

          return res.json({
            status: 'active',
            approved: true,
            token,
            role: user.role,
            updateChannel: user.update_channel || 'production',
            user: {
              id: user.id,
              name: user.full_name,
              email: user.email,
              picture: user.google_picture
            },
            permissions
          });
        }

        return res.json({
          status: user.status,
          approved: false
        });
      } catch (err) {
        console.error('Check status error:', err);
        return res.status(500).json({ error: 'Failed to check status' });
      }
    }
  };
};
