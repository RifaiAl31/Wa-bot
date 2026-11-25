import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { config } from '../config.js'
import { logger } from '../logger.js'

let db = null

export function getDb() {
  if (!db) throw new Error('Database belum diinisialisasi. Jalankan: npm run init-db')
  return db
}

export function initDb({ dbPath = config.dbPath, force = false } = {}) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  if (db) db.close()
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  const schema = fs.readFileSync(path.resolve(import.meta.dirname, 'schema.sql'), 'utf8')
  db.exec(schema)
  // Migrasi ringan: kolom masa aktif VIP. Aman dijalankan berulang.
  const vipColumns = db.prepare('PRAGMA table_info(vip_users)').all().map((c) => c.name)
  if (!vipColumns.includes('expires_at')) db.exec('ALTER TABLE vip_users ADD COLUMN expires_at TEXT')

  if (force) {
    // Schema dijalankan lebih dulu agar DELETE tidak gagal pada database baru.
    db.exec(`DELETE FROM schedule_runs; DELETE FROM delivery_logs; DELETE FROM activity_logs;
      DELETE FROM edit_sessions; DELETE FROM announcement_targets; DELETE FROM schedules;
      DELETE FROM announcements; DELETE FROM categories; DELETE FROM whatsapp_groups;
      DELETE FROM admins; DELETE FROM bot_settings; DELETE FROM id_counters;`)
    db.exec(`INSERT OR IGNORE INTO id_counters(category, next_value) VALUES ('announcement', 1);
      INSERT OR IGNORE INTO bot_settings(key, value, updated_at) VALUES
      ('schema_version', '1', datetime('now')), ('timezone', 'Asia/Jakarta', datetime('now')),
      ('scheduler_enabled', '1', datetime('now'));`)
  }

  seedAdmins()
  logger.info(`Database siap: ${dbPath}`)
  return db
}

function seedAdmins() {
  if (!config.adminNumbers.length) return
  const stmt = getDb().prepare(`INSERT OR IGNORE INTO admins(jid, number, name, is_active, created_at)
    VALUES (?, ?, ?, 1, ?)`)
  const now = new Date().toISOString()
  const run = getDb().transaction(() => {
    for (const number of config.adminNumbers) {
      stmt.run(`${number}@s.whatsapp.net`, number, `Admin ${number}`, now)
    }
  })
  run()
}

export function closeDb() {
  if (db) { db.close(); db = null }
}

export const all = (sql, ...params) => getDb().prepare(sql).all(...params)
export const get = (sql, ...params) => getDb().prepare(sql).get(...params)
export const run = (sql, ...params) => getDb().prepare(sql).run(...params)
export const transaction = (fn) => getDb().transaction(fn)

export function logActivity(adminJid, action, detail = '', groupJid = null) {
  try {
    run('INSERT INTO activity_logs(admin_jid, action, detail, group_jid, created_at) VALUES (?,?,?,?,?)',
      adminJid || null, action, detail, groupJid || null, new Date().toISOString())
  } catch (err) {
    logger.warn('Gagal menulis activity log:', err.message)
  }
}

export function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM bot_settings WHERE key = ?', key)
  return row ? row.value : fallback
}

export function setSetting(key, value) {
  run(`INSERT INTO bot_settings(key, value, updated_at) VALUES (?,?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    key, String(value), new Date().toISOString())
}
