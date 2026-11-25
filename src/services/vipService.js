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
  if (!number) return false
  const row = get('SELECT expires_at FROM vip_users WHERE number = ?', number)
  if (!row) return false
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
    run('DELETE FROM vip_users WHERE number = ?', number)
    return false
  }
  return true
}

export function registerVip(rawNumber, registeredBy = null, expiresAt = null) {
  const number = normalizeJid(rawNumber)
  if (!number) throw new Error('Nomor VIP tidak valid.')
  if (expiresAt && Number.isNaN(Date.parse(expiresAt))) throw new Error('Tanggal berlaku VIP tidak valid.')
  const now = new Date().toISOString()
  const expiry = expiresAt ? new Date(expiresAt).toISOString() : null
  run(`INSERT INTO vip_users(jid, number, name, registered_by, created_at, expires_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(number) DO UPDATE SET registered_by=excluded.registered_by,
         name=COALESCE(excluded.name, vip_users.name), expires_at=excluded.expires_at`,
    `${number}@s.whatsapp.net`, number, null, registeredBy || null, now, expiry)
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
  return all('SELECT jid, number, name, registered_by, created_at, expires_at FROM vip_users ORDER BY created_at DESC LIMIT 100')
}

export function setVipExpiry(jid, expiresAt) {
  const number = normalizeJid(jid)
  if (!number) throw new Error('Nomor VIP tidak valid.')
  const expiry = expiresAt ? new Date(expiresAt) : null
  if (expiry && Number.isNaN(expiry.getTime())) throw new Error('Tanggal berlaku VIP tidak valid.')
  run('UPDATE vip_users SET expires_at=? WHERE number=?', expiry ? expiry.toISOString() : null, number)
  return expiry ? expiry.toISOString() : null
}
