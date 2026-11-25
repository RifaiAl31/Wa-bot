PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS admins (
  jid TEXT PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  announcement_id TEXT NOT NULL UNIQUE REFERENCES announcements(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  week_of_month INTEGER NOT NULL DEFAULT 0 CHECK(week_of_month BETWEEN 0 AND 5),
  time TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS whatsapp_groups (
  jid TEXT PRIMARY KEY,
  name TEXT,
  participants INTEGER NOT NULL DEFAULT 0,
  is_registered INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_seen TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS announcement_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  group_jid TEXT NOT NULL REFERENCES whatsapp_groups(jid) ON DELETE CASCADE,
  UNIQUE(announcement_id, group_jid)
);

CREATE TABLE IF NOT EXISTS edit_sessions (
  admin_jid TEXT PRIMARY KEY,
  announcement_id TEXT NOT NULL,
  draft_json TEXT NOT NULL,
  step TEXT NOT NULL DEFAULT 'select_field',
  field TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  announcement_id TEXT NOT NULL,
  group_jid TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  run_date TEXT,
  run_time TEXT,
  message_id TEXT,
  sent_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_jid TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  group_jid TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS id_counters (
  category TEXT PRIMARY KEY,
  next_value INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  announcement_id TEXT NOT NULL,
  run_date TEXT NOT NULL,
  run_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'claimed',
  created_at TEXT NOT NULL,
  sent_at TEXT,
  UNIQUE(announcement_id, run_date, run_time)
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active);
CREATE INDEX IF NOT EXISTS idx_targets_group ON announcement_targets(group_jid);
CREATE INDEX IF NOT EXISTS idx_delivery_announcement ON delivery_logs(announcement_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_runs_date ON schedule_runs(run_date);

CREATE TABLE IF NOT EXISTS ai_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_model_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id TEXT NOT NULL,
  model_name TEXT,
  provider TEXT,
  changed_by TEXT,
  changed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_jid TEXT,
  group_jid TEXT,
  command TEXT,
  model_id TEXT,
  status TEXT NOT NULL,
  reason TEXT,
  prompt_chars INTEGER DEFAULT 0,
  response_chars INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_user_limits (
  user_jid TEXT PRIMARY KEY,
  group_jid TEXT,
  window_start_ms INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  last_request_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_logs(created_at);

CREATE TABLE IF NOT EXISTS vip_users (
  jid TEXT PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  name TEXT,
  registered_by TEXT,
  created_at TEXT NOT NULL
);

-- Sesi aktivasi VIP persisten. Ditulis dengan primary key angka agar group JID/LID
-- dan private chat JID bisa dipetakan ke identitas yang sama setelah divalidasi.
CREATE TABLE IF NOT EXISTS deployment_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  previous_commit TEXT,
  new_commit TEXT,
  status TEXT NOT NULL,
  dependency_changed INTEGER NOT NULL DEFAULT 0,
  backup_path TEXT,
  health TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_state (
  name TEXT PRIMARY KEY,
  pid INTEGER,
  status TEXT NOT NULL,
  url TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vip_activation_sessions (
  user_key TEXT PRIMARY KEY,
  user_jid TEXT,
  alias_keys TEXT NOT NULL DEFAULT '',
  chat_jid TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  lock_until_ms INTEGER NOT NULL DEFAULT 0,
  expires_at_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO ai_settings(key, value, updated_at) VALUES
  ('active_model_id', '', datetime('now')),
  ('active_model_name', '', datetime('now'));

INSERT OR IGNORE INTO id_counters(category, next_value) VALUES ('announcement', 1);
INSERT OR IGNORE INTO bot_settings(key, value, updated_at) VALUES
  ('schema_version', '1', datetime('now')),
  ('timezone', 'Asia/Jakarta', datetime('now')),
  ('scheduler_enabled', '1', datetime('now'));
