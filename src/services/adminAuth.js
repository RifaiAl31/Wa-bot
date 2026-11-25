import { all, get, run, logActivity } from '../db/index.js'
import { config, normalizeJid } from '../config.js'

export function isAdmin(jid) {
  const number = normalizeJid(jid)
  if (!number) return false
  // Akses terbuka: semua pengirim yang punya nomor dianggap diizinkan.
  if (config.openAccess) return true
  const row = get('SELECT jid FROM admins WHERE number = ? AND is_active = 1', number)
  return Boolean(row)
}

// Berbeda dengan isAdmin() yang mengikuti OPEN_ACCESS, ini selalu memeriksa
// daftar nomor admin di database (dipakai untuk /model N dan daftar grup).
export function isRegisteredAdmin(jid) {
  const number = normalizeJid(jid)
  if (!number) return false
  return Boolean(get('SELECT jid FROM admins WHERE number = ? AND is_active = 1', number))
}

export function listAdmins() {
  return all('SELECT jid, number, name, is_active, created_at FROM admins ORDER BY created_at')
}

export function addAdmin(number, name = null) {
  const digits = String(number).replace(/\D/g, '')
  if (!digits) throw new Error('Nomor admin tidak valid')
  run(`INSERT INTO admins(jid, number, name, is_active, created_at) VALUES (?,?,?,1,?)
       ON CONFLICT(number) DO UPDATE SET is_active=1, name=COALESCE(excluded.name, admins.name)`,
    `${digits}@s.whatsapp.net`, digits, name, new Date().toISOString())
  return digits
}

export function deactivateAdmin(number) {
  run('UPDATE admins SET is_active = 0 WHERE number = ?', String(number).replace(/\D/g, ''))
}

export function bootstrapAdmins() {
  for (const n of config.adminNumbers) addAdmin(n)
}

export function logAdminAction(adminJid, action, detail, groupJid = null) {
  logActivity(normalizeJid(adminJid) + '@s.whatsapp.net', action, detail, groupJid)
}
