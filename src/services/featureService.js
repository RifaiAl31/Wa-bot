import { getSetting, setSetting } from '../db/index.js'
import { ROLES } from './roleService.js'

// Metadata bawaan. Nilai tersimpan di bot_settings agar bisa diubah lewat
// panel/admin; seed hanya menulis key yang belum ada.
const ALL = [ROLES.ADMIN, ROLES.VIP, ROLES.USER]

export const FEATURES = Object.freeze({
  announcements: Object.freeze({ label: 'Pengumuman', enabled: true, roles: Object.freeze([ROLES.ADMIN]) }),
  scheduler: Object.freeze({ label: 'Penjadwalan', enabled: true, roles: Object.freeze([ROLES.ADMIN]) }),
  ai: Object.freeze({ label: 'Asisten AI', enabled: true, roles: Object.freeze([...ALL]) }),
  media: Object.freeze({ label: 'Media & Dokumen', enabled: true, roles: Object.freeze([...ALL]) }),
  vip: Object.freeze({ label: 'Manajemen VIP', enabled: true, roles: Object.freeze([ROLES.ADMIN]) }),
  system: Object.freeze({ label: 'Manajemen Sistem', enabled: true, roles: Object.freeze([ROLES.ADMIN]) }),
  rvo: Object.freeze({ label: 'Media Berizin (.rvo)', enabled: true, roles: Object.freeze([...ALL]) }),
  downloader: Object.freeze({ label: 'Downloader Publik', enabled: true, roles: Object.freeze([ROLES.ADMIN, ROLES.VIP]) })
})

const enabledKey = (name) => `feature.${name}`
const rolesKey = (name) => `feature.${name}.roles`

function parseEnabled(raw, fallback) {
  if (raw === null || raw === undefined) return fallback
  if (typeof raw === 'boolean') return raw
  const value = String(raw).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(value)) return true
  if (['0', 'false', 'no', 'off', ''].includes(value)) return false
  return fallback
}

function parseRoles(raw, fallback) {
  if (raw === null || raw === undefined) return fallback
  let parsed = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw) } catch { parsed = raw.split(',') }
  }
  if (Array.isArray(parsed)) {
    return parsed.map((r) => String(r).trim().toUpperCase()).filter(Boolean)
  }
  return String(parsed).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
}

function ensureSeeded() {
  for (const [name, meta] of Object.entries(FEATURES)) {
    if (getSetting(enabledKey(name), null) === null) setSetting(enabledKey(name), meta.enabled ? '1' : '0')
    if (getSetting(rolesKey(name), null) === null) setSetting(rolesKey(name), JSON.stringify(meta.roles))
  }
}

function readFeature(name) {
  ensureSeeded()
  const meta = FEATURES[name]
  const enabled = parseEnabled(getSetting(enabledKey(name), null), meta ? meta.enabled : false)
  const roles = parseRoles(getSetting(rolesKey(name), null), meta ? [...meta.roles] : [])
  return { name, label: meta ? meta.label : name, enabled, roles }
}

function roleAllowed(roles, role) {
  if (role === null || role === undefined || role === '') return true
  return roles.includes(String(role).toUpperCase())
}

export function listFeatures(role = null) {
  ensureSeeded()
  return Object.keys(FEATURES).map((name) => {
    const feature = readFeature(name)
    return { ...feature, allowed: feature.enabled && roleAllowed(feature.roles, role) }
  })
}

export function isFeatureEnabled(name, role = null) {
  const feature = readFeature(name)
  return feature.enabled && roleAllowed(feature.roles, role)
}

export function setFeature(name, enabled, roles) {
  ensureSeeded()
  if (!Object.hasOwn(FEATURES, name)) throw new Error(`Fitur tidak dikenal: ${name}`)
  const current = readFeature(name)
  const nextEnabled = enabled === undefined ? current.enabled : parseEnabled(enabled, current.enabled)
  const nextRoles = roles === undefined ? current.roles : parseRoles(roles, current.roles)
  setSetting(enabledKey(name), nextEnabled ? '1' : '0')
  setSetting(rolesKey(name), JSON.stringify(nextRoles))
  return { name, label: FEATURES[name].label, enabled: nextEnabled, roles: nextRoles }
}

export function countActiveFeatures(role = null) {
  return listFeatures(role).filter((feature) => feature.allowed).length
}

export const featureService = { FEATURES, listFeatures, isFeatureEnabled, setFeature, countActiveFeatures }
