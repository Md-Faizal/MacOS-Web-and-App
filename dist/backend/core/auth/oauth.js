const axios = require('axios');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'PLACEHOLDER_CLIENT_ID';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'PLACEHOLDER_CLIENT_SECRET';

module.exports = function(db) {
    return {
        getAuthUrlLogin: (req, res) => {
            let redirectUri = process.env.GOOGLE_REDIRECT_URI;
            if (!redirectUri) {
                const protocol = req.headers['x-forwarded-proto'] || req.protocol;
                const host = req.headers['x-forwarded-host'] || req.headers.host;
                redirectUri = `${protocol}://${host}/api/auth/google/callback`;
            }
            
            const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
                `client_id=${CLIENT_ID}&` +
                `redirect_uri=${encodeURIComponent(redirectUri)}&` +
                `response_type=code&` +
                `scope=openid%20email%20profile&` +
                `state=login`;
            
            res.redirect(url);
        },

        getAuthUrlLink: (req, res) => {
            let redirectUri = process.env.GOOGLE_REDIRECT_URI;
            if (!redirectUri) {
                const protocol = req.headers['x-forwarded-proto'] || req.protocol;
                const host = req.headers['x-forwarded-host'] || req.headers.host;
                redirectUri = `${protocol}://${host}/api/auth/google/callback`;
            }
            
            // Assume req.user.id is set by authMiddleware
            const userId = req.user ? req.user.id : 'admin_auth'; 
            
            const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
                `client_id=${CLIENT_ID}&` +
                `redirect_uri=${encodeURIComponent(redirectUri)}&` +
                `response_type=code&` +
                `scope=openid%20email%20profile&` +
                `state=link_${userId}`;
            
            res.redirect(url);
        },

        handleCallback: async (req, res) => {
            const { code, state } = req.query;
            const userId = state;

            if (!code) {
                return res.status(400).send('No code provided');
            }

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

                const { access_token, id_token } = tokenRes.data;

                if (state === 'login') {
                    // Just return the idToken to the frontend so it can post it to /api/auth/google/worker-login
                    return res.send(`
                        <!DOCTYPE html>
                        <html>
                        <head><title>Authentication Success</title></head>
                        <body>
                            <script>
                                if (window.opener) {
                                    window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', idToken: '${id_token}' }, '*');
                                    window.close();
                                } else {
                                    document.body.innerHTML = '<h2>Authentication successful! You can close this window.</h2>';
                                }
                            </script>
                        </body>
                        </html>
                    `);
                }

                // Otherwise, it's a link request: state is link_userId
                const userId = state.replace('link_', '');

                // Fetch user info for linking
                const userRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${access_token}` }
                });

                const googleUser = userRes.data;

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

                // Link to user_identities
                const existingIdentity = db.prepare("SELECT * FROM user_identities WHERE user_id = ? AND provider = 'google'").get(userId);
                if (!existingIdentity) {
                    const crypto = require('crypto');
                    db.prepare("INSERT INTO user_identities (id, user_id, provider, provider_user_id, provider_email, is_verified) VALUES (?, ?, 'google', ?, ?, 1)").run(crypto.randomUUID(), userId, googleUser.sub, googleUser.email);
                }

                // Close popup with success message
                res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head><title>Authentication Success</title></head>
                    <body>
                        <script>
                            if (window.opener) {
                                window.opener.postMessage({ type: 'GOOGLE_LINK_SUCCESS' }, '*');
                                window.close();
                            } else {
                                document.body.innerHTML = '<h2>Link successful! You can close this window.</h2>';
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
