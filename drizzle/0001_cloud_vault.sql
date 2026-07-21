CREATE TABLE IF NOT EXISTS vault_states (
  owner_email TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vault_photos (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  card_id TEXT NOT NULL,
  copy_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS vault_photos_owner_idx ON vault_photos (owner_email, copy_id);
