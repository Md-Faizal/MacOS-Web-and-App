CREATE TABLE auth_credentials (
            id TEXT PRIMARY KEY,
            user_role TEXT DEFAULT 'admin',
            password_hash TEXT,
            password_hint TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        , security_question TEXT, security_answer_hash TEXT)