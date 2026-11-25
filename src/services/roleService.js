import { isRegisteredAdmin } from './adminAuth.js'
import { isVip } from './vipService.js'

// Peran diambil dari sumbernya masing-masing. OPEN_ACCESS tidak pernah
// mengubah peran: ADMIN hanya berasal dari admin terdaftar di database.
export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  VIP: 'VIP',
  USER: 'USER',
})

export function roleOf(jid) {
  if (isRegisteredAdmin(jid)) return ROLES.ADMIN
  if (isVip(jid)) return ROLES.VIP
  return ROLES.USER
}

function normalizeRoles(roles) {
  if (Array.isArray(roles)) return roles.map((r) => String(r).toUpperCase())
  if (roles == null || roles === '') return []
  return [String(roles).toUpperCase()]
}

export function hasRole(jid, rolesArray) {
  const allowed = normalizeRoles(rolesArray)
  if (!allowed.length) return false
  return allowed.includes(roleOf(jid))
}

export function isAdminRole(jid) {
  return roleOf(jid) === ROLES.ADMIN
}

export function isVipRole(jid) {
  return roleOf(jid) === ROLES.VIP
}

export function isUserRole(jid) {
  return roleOf(jid) === ROLES.USER
}
