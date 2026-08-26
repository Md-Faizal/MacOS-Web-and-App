const axios = require('axios');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'PLACEHOLDER_CLIENT_ID';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'PLACEHOLDER_CLIENT_SECRET';

module.exports = function(db) {
    return {
        getAuthUrl: (req, res) => {
            // Determine redirect URI based on request origin if possible, fallback to env
            let redirectUri = process.env.GOOGLE_REDIRECT_URI;
            if (!redirectUri) {
                const protocol = req.headers['x-forwarded-proto'] || req.protocol;
                const host = req.headers['x-forwarded-host'] || req.headers.host;
                redirectUri = `${protocol}://${host}/api/auth/google/callback`;
            }
            
            const userId = 'admin_auth'; 
            
            const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
                `client_id=${CLIENT_ID}&` +
                `redirect_uri=${encodeURIComponent(redirectUri)}&` +
                `response_type=code&` +
                `scope=openid%20email%20profile&` +
                `state=${userId}`;
            
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

                const { access_token } = tokenRes.data;

                // Fetch user info
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
