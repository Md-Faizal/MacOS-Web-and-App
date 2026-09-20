const axios = require('axios');
const crypto = require('crypto');
const createIdentityService = require('./identity-service');
const createAuditService = require('./audit-service');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'PLACEHOLDER_CLIENT_ID';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'PLACEHOLDER_CLIENT_SECRET';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

module.exports = function(db) {
    const identityService = createIdentityService(db);
    const auditService = createAuditService(db);
    return {
        getAuthUrl: (req, res) => {
            // Determine redirect URI based on request origin if possible, fallback to env
            let redirectUri = process.env.GOOGLE_REDIRECT_URI;
            if (!redirectUri) {
                const protocol = req.headers['x-forwarded-proto'] || req.protocol;
                const host = req.headers['x-forwarded-host'] || req.headers.host;
                redirectUri = `${protocol}://${host}/api/auth/google/callback`;
            }
            
            const userId = req.user.userId;
            const state = crypto.randomUUID();
            db.prepare('DELETE FROM oauth_states WHERE expires_at < ?').run(Date.now());
            db.prepare('INSERT INTO oauth_states (state, user_id, expires_at) VALUES (?, ?, ?)')
                .run(state, userId, Date.now() + OAUTH_STATE_TTL_MS);
            res.cookie('oauth_state', state, {
                httpOnly: true,
                secure: ['production', 'oraclevm'].includes(process.env.NODE_ENV) || req.protocol === 'https',
                sameSite: 'Lax',
                maxAge: OAUTH_STATE_TTL_MS,
                path: '/api/auth/google'
            });
            
            const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
                `client_id=${CLIENT_ID}&` +
                `redirect_uri=${encodeURIComponent(redirectUri)}&` +
                `response_type=code&` +
                `scope=openid%20email%20profile&` +
                `state=${encodeURIComponent(state)}`;
            
            res.redirect(url);
        },

        handleCallback: async (req, res) => {
            const { code, state } = req.query;

            if (!code || !state || !req.user?.userId) {
                return res.status(400).send('No code provided');
            }

            const pendingState = db.prepare(
                'SELECT user_id FROM oauth_states WHERE state = ? AND expires_at >= ?'
            ).get(state, Date.now());
            db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
            if (!pendingState || pendingState.user_id !== req.user.userId) {
                return res.status(400).send('Invalid account state');
            }
            const userId = req.user.userId;
            res.clearCookie('oauth_state', { path: '/api/auth/google' });

            // Determine redirect URI used in the initial request
            let redirectUri = process.env.GOOGLE_REDIRECT_URI;
            if (!redirectUri) {
                const protocol = req.headers['x-forwarded-proto'] || req.protocol;
                const host = req.headers['x-forwarded-host'] || req.headers.host;
                redirectUri = `${protocol}://${host}/api/auth/google/callback`;
            }

            try {
                // Exchange code for tokens
                const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
                    code,
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    redirect_uri: redirectUri,
                    grant_type: 'authorization_code'
                });

                const { access_token } = tokenRes.data;

                // Fetch user info
                const userRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${access_token}` }
                });

                const googleUser = userRes.data;

                const identityResolution = identityService.resolveProviderIdentity(
                    'google',
                    googleUser.sub,
                    googleUser.email
                );
                if (identityResolution.userIds.length > 1 ||
                    (identityResolution.userIds.length === 1 && identityResolution.userIds[0] !== userId)) {
                    return res.status(409).send('This Google account or email is already linked to another user. Resolve that account link before reassigning it.');
                }

                const linkGoogleAccount = db.transaction(() => {
                    db.prepare(`
                    UPDATE users SET
                        google_id = ?,
                        google_email = ?,
                        google_name = ?,
                        google_picture = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    `).run(googleUser.sub, googleUser.email, googleUser.name, googleUser.picture, userId);

                // Link to user_profile
                // If the user doesn't exist, we might need to INSERT. But Profile.js usually handles the INSERT.
                // We'll try to UPDATE first.
                const stmt = db.prepare(`
                    UPDATE user_profile 
                    SET google_id = ?, 
                        google_email = ?, 
                        google_name = ?,
                        google_picture = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `);
                
                    const result = stmt.run(googleUser.sub, googleUser.email, googleUser.name, googleUser.picture, userId);

                // If nothing was updated, user_profile doesn't exist for this ID yet
                    if (result.changes === 0) {
                        const insertStmt = db.prepare(`
                        INSERT INTO user_profile (id, google_id, google_email, google_name, google_picture)
                        VALUES (?, ?, ?, ?, ?)
                    `);
                        insertStmt.run(userId, googleUser.sub, googleUser.email, googleUser.name, googleUser.picture);
                    }

                    db.prepare(`
                        INSERT OR IGNORE INTO user_identities
                          (id, user_id, provider, provider_user_id, provider_email, is_verified)
                        VALUES (?, ?, 'google', ?, ?, 1)
                    `).run(crypto.randomUUID(), userId, googleUser.sub, googleUser.email);
                });
                linkGoogleAccount();
                auditService.record({ req, eventType: 'identity_link', outcome: 'success', userId, sessionId: req.user.userId === userId ? req.user.sessionId : null, platform: 'web', provider: 'google' });

                // Close popup with success message
                res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head><title>Authentication Success</title></head>
                    <body>
                        <script>
                            if (window.opener) {
                                window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
                                window.close();
                            } else {
                                document.body.innerHTML = '<h2>Authentication successful! You can close this window.</h2>';
                            }
                        </script>
                    </body>
                    </html>
                `);

            } catch (err) {
                console.error('Google OAuth Error:', err.response?.data || err.message);
                res.status(500).send('Authentication failed. Please check server logs.');
            }
        }
    };
};
