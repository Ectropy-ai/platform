CREATE TABLE IF NOT EXISTS api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL,
  scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ(6),
  expires_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT api_keys_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_hash_key ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS api_keys_is_active_idx ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS api_keys_expires_at_idx ON api_keys(expires_at);
ALTER TABLE api_keys ADD CONSTRAINT IF NOT EXISTS api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO api_keys (name, key_hash, user_id, scopes, is_active, expires_at) VALUES ('business-tools-n8n', '$2b$12$CNLFyDjgC.twk5Alxw4Jxu8aXQqcXHdvl.C8WqhdZr42BmJjLd3ha', '8a1e9c68-cb1c-4da9-b141-a4d12b17b001', ARRAY['*'], true, NULL);
