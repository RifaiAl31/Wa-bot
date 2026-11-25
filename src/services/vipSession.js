import { config, normalizeJid } from '../config.js'

// Sesi aktivasi disimpan per nomor WhatsApp pengguna, bukan per grup/chat.
// Export untuk keperluan test; jangan dipakai sebagai API publik.
export const sessions = new Map()

const keyOf = (jid) => normalizeJid(jid)

function fresh(jid) {
  return { key: keyOf(jid), attempts: 0, expiresAt: Date.now() + config.vipSessionTtlMs, lockUntil: 0 }
}

export function startSession(jid) {
  const key = keyOf(jid)
  const session = fresh(key)
  sessions.set(key, session)
  return session
}

export function getSession(jid) {
  const key = keyOf(jid)
  const session = sessions.get(key)
  if (!session) return null
  const now = Date.now()
  if (session.lockUntil && session.lockUntil > now) return { ...session, locked: true }
  if (session.lockUntil && session.lockUntil <= now) {
    session.lockUntil = 0
    session.attempts = 0
    session.expiresAt = now + config.vipSessionTtlMs
  }
  if (session.expiresAt <= now) { sessions.delete(key); return null }
  return session
}

export function failAttempt(jid) {
  const key = keyOf(jid)
  const session = sessions.get(key)
  if (!session) return { attempts: 0, remaining: config.vipMaxAttempts, locked: false }
  session.attempts += 1
  let locked = false
  if (session.attempts >= config.vipMaxAttempts) {
    session.lockUntil = Date.now() + config.vipLockMs
    locked = true
  }
  return { attempts: session.attempts, remaining: Math.max(0, config.vipMaxAttempts - session.attempts), locked }
}

export function clearSession(jid) { sessions.delete(keyOf(jid)) }

export function cleanup() {
  const now = Date.now()
  for (const [key, session] of sessions) {
    if (session.expiresAt <= now && (!session.lockUntil || session.lockUntil <= now)) sessions.delete(key)
  }
}
