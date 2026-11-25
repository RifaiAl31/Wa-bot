import test from 'node:test'
import assert from 'node:assert/strict'
import { testEnv } from './helpers.js'

testEnv('role-feature')
// OPEN_ACCESS=true tidak boleh mengubah peran menjadi ADMIN.
process.env.OPEN_ACCESS = 'true'

const { initDb, closeDb, getSetting } = await import('../src/db/index.js')
const { isAdmin } = await import('../src/services/adminAuth.js')
const { registerVip } = await import('../src/services/vipService.js')
const {
  ROLES, roleOf, hasRole, isAdminRole, isVipRole, isUserRole,
} = await import('../src/services/roleService.js')
const {
  FEATURES, listFeatures, isFeatureEnabled, setFeature, countActiveFeatures,
} = await import('../src/services/featureService.js')

initDb({ force: true })

const ADMIN = '628111111111@s.whatsapp.net'
const VIP = '628111000001@s.whatsapp.net'
const USER = '628111000002@s.whatsapp.net'
registerVip(VIP)

test('roleOf: ADMIN berasal dari admin terdaftar walaupun OPEN_ACCESS aktif', () => {
  assert.equal(isAdmin(USER), true, 'OPEN_ACCESS membuka akses perintah')
  assert.equal(isAdminRole(ADMIN), true)
  assert.equal(roleOf(ADMIN), ROLES.ADMIN)
  assert.equal(roleOf(ADMIN), 'ADMIN')
  assert.equal(isVipRole(ADMIN), false)
  assert.equal(isUserRole(ADMIN), false)
})

test('roleOf: VIP jika terdaftar VIP, bukan admin', () => {
  assert.equal(roleOf(VIP), ROLES.VIP)
  assert.equal(isVipRole(VIP), true)
  assert.equal(isAdminRole(VIP), false)
  assert.equal(isUserRole(VIP), false)
  assert.equal(hasRole(VIP, [ROLES.ADMIN, ROLES.VIP]), true)
  assert.equal(hasRole(VIP, [ROLES.ADMIN]), false)
  assert.equal(hasRole(VIP, []), false)
})

test('roleOf: USER untuk pengirim tanpa hak admin maupun VIP', () => {
  assert.equal(roleOf(USER), ROLES.USER)
  assert.equal(isUserRole(USER), true)
  assert.equal(hasRole(USER, [ROLES.ADMIN, ROLES.VIP]), false)
  assert.equal(hasRole(USER, [ROLES.USER]), true)
  assert.equal(roleOf(null), ROLES.USER)
})

test('fitur di-seed sekali ke bot_settings saat pertama dipanggil', () => {
  assert.ok(Object.keys(FEATURES).length >= 5)
  // Pemanggilan pertama melakukan seed ke bot_settings.
  const features = listFeatures()
  assert.equal(getSetting('feature.ai'), '1')
  assert.deepEqual(JSON.parse(getSetting('feature.ai.roles')), ['ADMIN', 'VIP', 'USER'])
  assert.equal(getSetting('feature.system'), '1')
  assert.equal(features.length, Object.keys(FEATURES).length)
  for (const feature of features) {
    assert.equal(typeof feature.name, 'string')
    assert.equal(typeof feature.label, 'string')
    assert.equal(typeof feature.enabled, 'boolean')
    assert.ok(Array.isArray(feature.roles))
    assert.equal(typeof feature.allowed, 'boolean')
  }
})

test('listFeatures memfilter allowed berdasarkan peran', () => {
  const admin = listFeatures(ROLES.ADMIN)
  const vip = listFeatures(ROLES.VIP)
  const user = listFeatures(ROLES.USER)
  assert.ok(admin.every((f) => f.allowed))
  assert.equal(vip.find((f) => f.name === 'system').allowed, false)
  assert.equal(user.find((f) => f.name === 'system').allowed, false)
  assert.equal(user.find((f) => f.name === 'ai').allowed, true)
  assert.equal(listFeatures().every((f) => f.allowed), true)
})

test('setFeature menyimpan toggle dan peran ke bot_settings', () => {
  setFeature('ai', false)
  assert.equal(getSetting('feature.ai'), '0')
  assert.equal(isFeatureEnabled('ai', ROLES.ADMIN), false)
  assert.equal(listFeatures(ROLES.ADMIN).find((f) => f.name === 'ai').allowed, false)

  setFeature('ai', true, [ROLES.ADMIN, ROLES.VIP])
  assert.equal(getSetting('feature.ai'), '1')
  assert.deepEqual(JSON.parse(getSetting('feature.ai.roles')), ['ADMIN', 'VIP'])
  assert.equal(isFeatureEnabled('ai', ROLES.VIP), true)
  assert.equal(isFeatureEnabled('ai', ROLES.USER), false)
  assert.throws(() => setFeature('tidak-ada', true), /Fitur tidak dikenal/)
})

test('countActiveFeatures mengikuti perubahan toggle dan peran', () => {
  setFeature('ai', true, ['ADMIN', 'VIP', 'USER'])
  setFeature('media', true, ['ADMIN', 'VIP', 'USER'])
  const adminBefore = countActiveFeatures(ROLES.ADMIN)
  const userBefore = countActiveFeatures(ROLES.USER)
  const vipBefore = countActiveFeatures(ROLES.VIP)
  assert.equal(adminBefore, Object.keys(FEATURES).length)
  assert.equal(userBefore, Object.values(FEATURES).filter((f) => f.enabled && f.roles.includes(ROLES.USER)).length)

  setFeature('media', false)
  assert.equal(countActiveFeatures(ROLES.USER), userBefore - 1)
  assert.equal(countActiveFeatures(ROLES.ADMIN), adminBefore - 1)

  setFeature('media', true, [ROLES.ADMIN])
  assert.equal(countActiveFeatures(ROLES.USER), userBefore - 1)
  assert.equal(countActiveFeatures(ROLES.VIP), vipBefore - 1)
  assert.equal(countActiveFeatures(ROLES.ADMIN), adminBefore)

  setFeature('media', true, ['ADMIN', 'VIP', 'USER'])
  setFeature('ai', true, ['ADMIN', 'VIP', 'USER'])
  assert.equal(countActiveFeatures(ROLES.USER), userBefore)
})

test('fitur admin tidak bisa diakses VIP dan USER', () => {
  for (const name of ['announcements', 'scheduler', 'vip', 'system']) {
    assert.equal(isFeatureEnabled(name, ROLES.ADMIN), true)
    assert.equal(isFeatureEnabled(name, ROLES.VIP), false, `${name} harus ditolak untuk VIP`)
    assert.equal(isFeatureEnabled(name, ROLES.USER), false, `${name} harus ditolak untuk USER`)
  }
})

test.after(() => { closeDb() })
