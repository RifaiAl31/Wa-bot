import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { getSetting, setSetting, logActivity } from '../db/index.js'
import { logger } from '../logger.js'

const SESSION_COOKIE = 'wa_admin'
const CSRF_COOKIE = 'wa_csrf'
const SESSION_MAX_MS = 8 * 60 * 60 * 1000
const loginAttempts = new Map()
const manageAttempts = new Map()

function secret() {
  try {
    if (fs.existsSync(config.webSecretFile)) {
      const value = fs.readFileSync(config.webSecretFile, 'utf8').trim()
      if (value) return value
    }
  } catch { /* fallback di bawah */ }
  const value = crypto.randomBytes(48).toString('hex')
  fs.mkdirSync(path.dirname(config.webSecretFile), { recursive: true })
  fs.writeFileSync(config.webSecretFile, value, { mode: 0o600 })
  return value
}

function b64url(input) { return Buffer.from(input).toString('base64url') }
function fromB64url(input) { return Buffer.from(String(input), 'base64url').toString('utf8') }

function sign(payload) {
  const body = b64url(JSON.stringify(payload))
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

function parse(token) {
  if (!token || typeof token !== 'string') return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url')
  const a = Buffer.from(sig); const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(fromB64url(body))
    if (!payload.exp || payload.exp < Date.now()) return null
    return payload
  } catch { return null }
}

export function cookiesOf(req) {
  const raw = req?.headers?.cookie || ''
  const out = {}
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i < 1) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function setCookie(res, name, value, maxAge = SESSION_MAX_MS) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax',
    `Max-Age=${Math.floor(maxAge / 1000)}`,
  ]
  if (config.cookieSecure) parts.push('Secure')
  const existing = String(res.getHeader('Set-Cookie') || '')
  const list = existing ? (Array.isArray(existing) ? existing : [existing]) : []
  res.setHeader('Set-Cookie', [...list, parts.join('; ')])
}

function rateLimit(store, key, max, windowMs) {
  const now = Date.now()
  const row = store.get(key)
  if (!row || now - row.at > windowMs) { store.set(key, { at: now, count: 1 }); return false }
  row.count += 1
  return row.count > max
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  try {
    const expected = Buffer.from(parts[2], 'hex')
    const actual = crypto.scryptSync(String(password), parts[1], expected.length)
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  } catch { return false }
}

export function setAdminPassword(password) {
  const value = String(password || '')
  if (value.length < 6) throw new Error('Password minimal 6 karakter.')
  setSetting('admin_password_hash', hashPassword(value))
  logger.info('Password management dashboard diperbarui (hash tersimpan di database).')
  return true
}

export function managementConfigured() { return Boolean(getSetting('admin_password_hash')) }

function sessionOf(req) { return parse(cookiesOf(req)[SESSION_COOKIE]) }

export function authInfo(req) {
  const configured = managementConfigured()
  const authenticated = configured ? Boolean(sessionOf(req)) : true
  return {
    configured, authenticated,
    canWrite: !configured || authenticated,
    public: !configured,
    csrf: cookiesOf(req)[CSRF_COOKIE] || null,
  }
}

export function loginHandler(req, res) {
  const ip = req.ip || req.socket?.remoteAddress || '-'
  if (rateLimit(loginAttempts, ip, 6, 60_000)) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi nanti.' })
  }
  if (!managementConfigured()) {
    return res.status(503).json({ error: 'Management belum dikunci. Jalankan: node scripts/set-admin-password.js' })
  }
  const password = String(req.body?.password || '')
  if (!verifyPassword(password, getSetting('admin_password_hash'))) {
    logActivity(null, 'login_failed', '', '')
    return res.status(401).json({ error: 'Password salah.' })
  }
  const csrf = crypto.randomBytes(24).toString('hex')
  setCookie(res, SESSION_COOKIE, sign({ exp: Date.now() + SESSION_MAX_MS, ip }))
  setCookie(res, CSRF_COOKIE, csrf)
  logActivity(null, 'login_success', '', '')
  return res.json({ ok: true, authenticated: true, csrf })
}

export function logoutHandler(req, res) {
  setCookie(res, SESSION_COOKIE, '', 0)
  setCookie(res, CSRF_COOKIE, '', 0)
  return res.json({ ok: true })
}

// Dashboard publik tetap bisa dibaca bila management belum dikunci.
// Setelah password di-set, seluruh API (kecuali health/auth/login) butuh sesi.
export function requireWeb(req, res, next) {
  if (!managementConfigured()) return next()
  if (!sessionOf(req)) return res.status(401).json({ error: 'Login diperlukan.' })
  return next()
}

export function requireWrite(req, res, next) { return requireWeb(req, res, next) }

// Endpoint sistem/deploy/backup/log SELALU dilindungi, walau dashboard publik.
export function requireManage(req, res, next) {
  if (!managementConfigured()) {
    return res.status(503).json({ error: 'Management belum dikunci. Jalankan: node scripts/set-admin-password.js' })
  }
  const session = sessionOf(req)
  if (!session) return res.status(401).json({ error: 'Login admin diperlukan.' })
  const ip = req.ip || req.socket?.remoteAddress || '-'
  if (rateLimit(manageAttempts, `${ip}|${req.path}`, 30, 10 * 60_000)) {
    return res.status(429).json({ error: 'Terlalu banyak aksi management. Coba lagi nanti.' })
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const cookies = cookiesOf(req)
    const supplied = String(req.get('x-csrf-token') || '')
    if (!cookies[CSRF_COOKIE] || supplied !== cookies[CSRF_COOKIE]) {
      return res.status(403).json({ error: 'Token CSRF tidak valid.' })
    }
  }
  return next()
}

export function audit(req, action, detail = '') {
  logActivity(null, action, String(detail).slice(0, 200), req?.body?.groupJid || null)
}
