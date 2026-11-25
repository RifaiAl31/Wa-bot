import crypto from 'node:crypto'
import { get, all, run, logActivity } from '../db/index.js'
import { config, normalizeJid } from '../config.js'

function safeEqual(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function digest(value) {
  // Password tidak pernah ditulis ke log; yang dibandingkan adalah hashnya.
  return crypto.createHash('sha256').update(String(value || '')).digest()
}

export function verifyVipPassword(password) {
  if (!config.vipPassword) return false
  return safeEqual(digest(password), digest(config.vipPassword))
}

export function isVip(jid) {
  const number = normalizeJid(jid)
  return Boolean(number && get('SELECT jid FROM vip_users WHERE number = ?', number))
}

export function registerVip(rawNumber, registeredBy = null) {
  const number = normalizeJid(rawNumber)
  if (!number) throw new Error('Nomor VIP tidak valid.')
  const now = new Date().toISOString()
  run(`INSERT INTO vip_users(jid, number, name, registered_by, created_at)
       VALUES (?,?,?,?,?)
       ON CONFLICT(number) DO UPDATE SET registered_by=excluded.registered_by, name=COALESCE(excluded.name, vip_users.name)`,
    `${number}@s.whatsapp.net`, number, null, registeredBy || null, now)
  logActivity(registeredBy, 'register_vip', number)
  return number
}

export function removeVip(jid) {
  const number = normalizeJid(jid)
  if (!number) throw new Error('Nomor VIP tidak valid.')
  const before = get('SELECT jid FROM vip_users WHERE number = ?', number)
  if (!before) return false
  run('DELETE FROM vip_users WHERE number = ?', number)
  logActivity(null, 'remove_vip', number)
  return true
}

export function listVips() {
  return all('SELECT jid, number, name, registered_by, created_at FROM vip_users ORDER BY created_at DESC LIMIT 100')
}
