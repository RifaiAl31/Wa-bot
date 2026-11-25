import { config, normalizeJid } from '../config.js'
import { get, run, transaction } from '../db/index.js'
import { logger } from '../logger.js'

// Sesi aktivasi VIP disimpan di SQLite (bukan Map) agar tetap ada setelah restart.
// Kuncinya adalah deretan angka; alias (JID grup/LID dan JID private) disimpan
// terpisah sehingga identitas group vs private tidak dianggap sama tanpa validasi.

function keysOf(jid, aliases = []) {
  const keys = new Set()
  for (const value of [jid, ...aliases]) {
    const key = normalizeJid(value)
    if (key) keys.add(key)
  }
  return [...keys]
}

function findRow(jid) {
  const key = normalizeJid(jid)
  if (!key) return null
  return get(`SELECT * FROM vip_activation_sessions
              WHERE user_key = ? OR ',' || alias_keys || ',' LIKE ?
              ORDER BY updated_at DESC LIMIT 1`, key, `%,${key},%`)
}

function save(row) {
  run(`UPDATE vip_activation_sessions SET attempts=?, lock_until_ms=?, expires_at_ms=?, updated_at=?
       WHERE user_key=?`, row.attempts, row.lock_until_ms, row.expires_at_ms, new Date().toISOString(), row.user_key)
}

function toSession(row) {
  if (!row) return null
  const now = Date.now()
  let changed = false
  if (row.lock_until_ms && row.lock_until_ms <= now) {
    row.attempts = 0
    row.lock_until_ms = 0
    row.expires_at_ms = now + config.vipSessionTtlMs
    changed = true
  }
  if (row.expires_at_ms <= now && !row.lock_until_ms) {
    run('DELETE FROM vip_activation_sessions WHERE user_key=?', row.user_key)
    logger.info(`VIP session expired: ${row.user_key}`)
    return null
  }
  if (changed) save(row)
  return {
    key: row.user_key,
    userJid: row.user_jid,
    aliasKeys: String(row.alias_keys || '').split(',').filter(Boolean),
    attempts: row.attempts,
    expiresAt: row.expires_at_ms,
    lockUntil: row.lock_until_ms,
    locked: row.lock_until_ms > now,
  }
}

export function startSession(jid, aliases = [], chatJid = null) {
  const keys = keysOf(jid, aliases)
  const key = keys[0]
  if (!key) return null

  const existing = toSession(findRow(key))
  // Idempoten: pesan /vip duplikat tidak membuat sesi baru atau mereset attempts.
  if (existing) {
    logger.info(`VIP session reused: ${key}`)
    return existing
  }

  const now = Date.now()
  transaction(() => {
    run(`INSERT OR IGNORE INTO vip_activation_sessions
         (user_key, user_jid, alias_keys, chat_jid, attempts, lock_until_ms, expires_at_ms, created_at, updated_at)
         VALUES (?,?,?,?,0,0,?,?,?)`,
      key, String(jid || ''), keys.join(','), chatJid || null,
      now + config.vipSessionTtlMs, new Date().toISOString(), new Date().toISOString())
    // Jika sesi lama masih ada (race antar dua pesan bersamaan), jangan timpa.
    run(`UPDATE vip_activation_sessions SET alias_keys=?, chat_jid=COALESCE(chat_jid, ?)
         WHERE user_key=? AND expires_at_ms > ?`, keys.join(','), chatJid || null, key, now)
  })()
  logger.info(`VIP session created: ${key}`)
  return toSession(findRow(key))
}

export function getSession(jid) {
  return toSession(findRow(jid))
}

export function failAttempt(jid) {
  const row = findRow(jid)
  if (!row) return { attempts: 0, remaining: config.vipMaxAttempts, locked: false }
  const attempts = row.attempts + 1
  let lockUntil = row.lock_until_ms || 0
  if (attempts >= config.vipMaxAttempts) lockUntil = Date.now() + config.vipLockMs
  run(`UPDATE vip_activation_sessions SET attempts=?, lock_until_ms=?, updated_at=? WHERE user_key=?`,
    attempts, lockUntil, new Date().toISOString(), row.user_key)
  logger.info(`VIP session attempt failed: ${row.user_key} (${attempts}/${config.vipMaxAttempts})`)
  return {
    attempts,
    remaining: Math.max(0, config.vipMaxAttempts - attempts),
    locked: lockUntil > Date.now(),
  }
}

export function clearSession(jid) {
  const row = findRow(jid)
  if (!row) return false
  run('DELETE FROM vip_activation_sessions WHERE user_key=?', row.user_key)
  logger.info(`VIP session cleared: ${row.user_key}`)
  return true
}

export function expireSession(jid) {
  const row = findRow(jid)
  if (!row) return false
  run('UPDATE vip_activation_sessions SET expires_at_ms=?, updated_at=? WHERE user_key=?',
    Date.now() - 1, new Date().toISOString(), row.user_key)
  return true
}

export function cleanup() {
  const now = Date.now()
  const result = run(`DELETE FROM vip_activation_sessions
                      WHERE (expires_at_ms <= ? AND lock_until_ms <= ?)`, now, now)
  return result.changes || 0
}

export function sessionStats() {
  const row = get(`SELECT COUNT(*) n FROM vip_activation_sessions WHERE expires_at_ms > ?`, Date.now())
  return { active: row?.n || 0 }
}
