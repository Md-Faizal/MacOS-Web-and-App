CREATE TABLE user_identities (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          provider TEXT NOT NULL, -- 'local', 'google', 'webauthn'
          provider_user_id TEXT, -- e.g., google_id or local username/email
          provider_email TEXT,
          password_hash TEXT,
          is_verified BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(provider, provider_user_id)
        )