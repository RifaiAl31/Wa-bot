import test from 'node:test'
import assert from 'node:assert/strict'
import { testEnv, ADMIN, GROUP } from './helpers.js'

process.env.VIP_PASSWORD = 'rahasia-vip'
process.env.AI_COOLDOWN_SECONDS = '0'
process.env.AI_MAX_PER_USER = '5'
process.env.VIP_MAX_ATTEMPTS = '3'
process.env.VIP_LOCK_MS = '300000'
testEnv('vip')
const { groupService } = await import('../src/services/groups.js')

const { initDb, get } = await import('../src/db/index.js')
const { handleMessage } = await import('../src/commands/router.js')
const { checkLimits, recordUsage } = await import('../src/ai/limits.js')
const { isVip, listVips } = await import('../src/services/vipService.js')
const vipSession = await import('../src/services/vipSession.js')
const { createApp } = await import('../src/api/routes.js')

initDb({ force: true })
groupService.upsert(GROUP, 'Grup Uji', 3)
let apiServer = null
const PASSWORD = 'rahasia-vip'

function makeSock(opts = {}) {
  const sent = []
  return { sent, isConnected: () => true,
    async getContact() { return opts.contact || null },
    async sendMessage(jid, content) { sent.push({ jid, content }); return { key: { id: `m${sent.length}` } } } }
}
function ctx(sock, text, opts = {}) {
  const user = opts.user || ADMIN
  const isGroup = opts.isGroup !== false
  const number = String(user).replace(/\D/g, '')
  const jid = isGroup ? GROUP : `${number}@s.whatsapp.net`
  return {
    sock, bot: opts.bot || null, jid, adminJid: user, text, admin: true, isGroup,
    isRegisteredAdmin: user === ADMIN,
    messageKey: { id: opts.id || 'V1', remoteJid: jid, participant: user },
    message: { key: { id: opts.id || 'V1', remoteJid: jid, participant: user }, message: { conversation: text } },
  }
}
const texts = (s) => s.sent.filter(x => x.content.text).map(x => x.content.text)
const deletes = (s) => s.sent.filter(x => x.content.delete)
const userJid = (n) => `${n}@s.whatsapp.net`

test('.vip di grup hanya mengarahkan ke chat pribadi, password tidak diminta', async () => {
  const sock = makeSock()
  await handleMessage(ctx(sock, `.vip ${PASSWORD}`))
  assert.equal(texts(sock).length, 1)
  assert.match(texts(sock)[0], /VIP ACTIVATION/)
  assert.match(texts(sock)[0], /private chat bot/i)
  assert.doesNotMatch(texts(sock)[0], new RegExp(PASSWORD))
  assert.equal(listVips().length, 0)
})

test('.vip di chat pribadi memulai sesi tanpa meminta password di grup', async () => {
  const sock = makeSock()
  await handleMessage(ctx(sock, '.vip', { isGroup: false, user: userJid('628111000001') }))
  assert.match(texts(sock)[0], /Silakan masukkan password VIP Anda/)
  assert.match(texts(sock)[0], /2 menit/)
  assert.doesNotMatch(texts(sock)[0], new RegExp(PASSWORD))
  assert.ok(vipSession.getSession('628111000001'))
})

test('password salah maksimal 3 kali lalu sesi dikunci', async () => {
  const sock = makeSock()
  const user = userJid('628111000002')
  await handleMessage(ctx(sock, '.vip', { isGroup: false, user }))
  for (let i = 0; i < 3; i += 1) {
    await handleMessage(ctx(sock, 'salah-saja', { isGroup: false, user }))
  }
  assert.match(texts(sock).at(-1), /Terlalu banyak percobaan/)
  assert.equal(vipSession.getSession(user).locked, true)
  assert.equal(isVip(user), false)
  // Password benar tetap ditolak saat sesi terkunci
  const again = makeSock()
  await handleMessage(ctx(again, PASSWORD, { isGroup: false, user }))
  assert.doesNotMatch(texts(again).join('\n'), /VIP ACTIVATED SUCCESSFULLY/)
  assert.equal(isVip(user), false)
})

test('password benar di chat pribadi mengaktifkan VIP dan pesan dihapus bila memungkinkan', async () => {
  const user = userJid('628111000003')
  const start = makeSock()
  await handleMessage(ctx(start, '.vip', { isGroup: false, user }))
  const sock = makeSock()
  await handleMessage(ctx(sock, PASSWORD, { isGroup: false, user }))
  assert.match(texts(sock)[0], /VIP ACTIVATED SUCCESSFULLY/)
  assert.doesNotMatch(texts(sock)[0], new RegExp(PASSWORD))
  assert.equal(isVip(user), true)
  assert.equal(vipSession.getSession(user), null)
  assert.equal(deletes(sock).length, 1)
})

test('user yang sudah VIP tidak didaftarkan ulang', async () => {
  const user = userJid('628111000003')
  const sock = makeSock()
  await handleMessage(ctx(sock, '.vip', { isGroup: false, user }))
  assert.match(texts(sock)[0], /sudah terdaftar sebagai VIP/)
  assert.equal(listVips().filter(v => v.number === '628111000003').length, 1)
})

test('sesi kedaluwarsa setelah batas waktu', async () => {
  const user = userJid('628111000004')
  await handleMessage(ctx(makeSock(), '.vip', { isGroup: false, user }))
  vipSession.expireSession(user)
  const sock = makeSock()
  await handleMessage(ctx(sock, PASSWORD, { isGroup: false, user }))
  assert.equal(texts(sock).length, 0, 'chat pribadi tanpa sesi aktif diabaikan')
  assert.equal(isVip(user), false)
})

test('sesi dibuat di grup bisa dilanjutkan di private chat dengan JID berbeda (LID → nomor)', async () => {
  const lid = '111999888@lid'
  const phone = '628777000111@s.whatsapp.net'
  const groupSock = makeSock({ contact: { jid: phone, lid } })
  await handleMessage(ctx(groupSock, '.vip', { user: lid, isGroup: true, id: 'GL1' }))
  assert.match(texts(groupSock)[0], /private chat bot/i)
  assert.ok(vipSession.getSession(phone))

  const privateSock = makeSock()
  await handleMessage(ctx(privateSock, '.vip', { user: phone, isGroup: false, id: 'PV1' }))
  assert.match(texts(privateSock)[0], /Sesi aktivasi masih aktif|Silakan masukkan password VIP Anda/)
  const done = makeSock()
  await handleMessage(ctx(done, PASSWORD, { user: phone, isGroup: false, id: 'PV2' }))
  assert.match(texts(done)[0], /VIP ACTIVATED SUCCESSFULLY/)
  assert.equal(isVip(phone), true)
  assert.equal(isVip(lid), false)
})

test('.cancel membatalkan sesi', async () => {
  const user = userJid('628111000005')
  await handleMessage(ctx(makeSock(), '.vip', { isGroup: false, user }))
  const sock = makeSock()
  await handleMessage(ctx(sock, '.cancel', { isGroup: false, user }))
  assert.match(texts(sock)[0], /dibatalkan/)
  assert.equal(vipSession.getSession(user), null)
})

test('dua pengguna bersamaan tidak tertukar', async () => {
  const a = userJid('628111000006')
  const b = userJid('628111000007')
  await Promise.all([
    handleMessage(ctx(makeSock(), '.vip', { isGroup: false, user: a, id: 'A' })),
    handleMessage(ctx(makeSock(), '.vip', { isGroup: false, user: b, id: 'B' })),
  ])
  const sockA = makeSock(); const sockB = makeSock()
  await Promise.all([
    handleMessage(ctx(sockA, PASSWORD, { isGroup: false, user: a, id: 'A2' })),
    handleMessage(ctx(sockB, 'salah', { isGroup: false, user: b, id: 'B2' })),
  ])
  assert.equal(isVip(a), true)
  assert.equal(isVip(b), false)
  assert.match(texts(sockA)[0], /VIP ACTIVATED SUCCESSFULLY/)
  assert.match(texts(sockB)[0], /Password VIP salah/)
})

test('password tidak pernah muncul di log aktivitas', () => {
  const rows = initDb && get("SELECT COUNT(*) n FROM activity_logs WHERE detail LIKE ?", `%${PASSWORD}%`)
  assert.equal(rows.n, 0)
})

test('admin bebas kuota AI, user biasa & VIP dibatasi 5/jam', async () => {
  assert.equal(checkLimits(ADMIN, GROUP).unlimited, true)
  for (const user of [userJid('628111000008'), userJid('628111000003')]) {
    const windowStart = Date.now()
    for (let i = 0; i < 5; i += 1) {
      recordUsage({ userJid: user, groupJid: GROUP, status: 'success', modelId: 'x', windowStart })
    }
    assert.equal(checkLimits(user, GROUP).kind, 'user')
  }
})

test('web: /api/vip tetap memakai sandi dan sistem lama', async () => {
  const app = createApp({
    bot: { status: () => ({ connected:false, connection:'close', qrAvailable:false, reconnectAttempts:0 }), sock:null, qrDataUrl:null },
    scheduler: { task:null, ticks:0, lastTick:null, lastError:null, upcoming:()=>[] },
  })
  apiServer = app.listen(0)
  await new Promise(r => apiServer.once('listening', r))
  const base = `http://127.0.0.1:${apiServer.address().port}`
  const post = (body) => fetch(base + '/api/vip', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) })
  assert.equal((await post({ password:'salah', number:'628666666666' })).status, 401)
  const res = await post({ password:PASSWORD, number:'628666666666', name:'Uji' })
  assert.equal(res.status, 201)
  assert.equal(isVip('628666666666@s.whatsapp.net'), true)
})

test.after(() => { if (apiServer) apiServer.close() })
