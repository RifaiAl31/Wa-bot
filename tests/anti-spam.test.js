import test from 'node:test'
import assert from 'node:assert/strict'
import { testEnv } from './helpers.js'

process.env.AI_COOLDOWN_NOTICE_SECONDS = '60'
testEnv('anti-spam')

const { initDb, closeDb, get } = await import('../src/db/index.js')
const { WhatsAppBot } = await import('../src/whatsapp/connection.js')
const { shouldProcessMessage, clearDedupe } = await import('../src/whatsapp/messageDedupe.js')
const { shouldNotifyCooldown, clearCooldownNotices } = await import('../src/commands/cooldownNotice.js')
const vipSession = await import('../src/services/vipSession.js')

initDb({ force: true })
clearDedupe()
clearCooldownNotices()

function fakeEv() {
  const handlers = new Map()
  return {
    handlers,
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event).add(fn)
    },
    removeListener(event, fn) { handlers.get(event)?.delete(fn) },
    listenerCount(event) { return handlers.get(event)?.size || 0 },
  }
}

test('satu message ID hanya diproses sekali', () => {
  const msg = { key: { id: 'MSG-1', remoteJid: '628111@s.whatsapp.net', participant: '628111@s.whatsapp.net' }, message: { conversation: '/ask hai' } }
  assert.equal(shouldProcessMessage(msg), true)
  assert.equal(shouldProcessMessage(msg), false)
  const other = { ...msg, key: { ...msg.key, id: 'MSG-2' } }
  assert.equal(shouldProcessMessage(other), true)
})

test('messages.upsert duplikat memanggil onMessage sekali', async () => {
  clearDedupe()
  const received = []
  const bot = new WhatsAppBot({ onMessage: (ctx) => received.push(ctx) })
  const msg = { key: { id: 'DUP-1', remoteJid: '628111@s.whatsapp.net', participant: '628111@s.whatsapp.net' }, message: { conversation: '/ask hai' } }
  await bot.onMessagesUpsert({ type: 'notify', messages: [msg] })
  await bot.onMessagesUpsert({ type: 'notify', messages: [msg] })
  assert.equal(received.length, 1)
})

test('pesan dari akun bot sendiri diabaikan', async () => {
  clearDedupe()
  const received = []
  const bot = new WhatsAppBot({ onMessage: (ctx) => received.push(ctx) })
  const msg = { key: { id: 'SELF-1', remoteJid: '628222@g.us', participant: '6281234567890@s.whatsapp.net', fromMe: true }, message: { conversation: '/ask hai' } }
  await bot.onMessagesUpsert({ type: 'notify', messages: [msg] })
  assert.equal(received.length, 0)
})

test('listener socket lama dilepas saat koneksi dibuat ulang', async () => {
  const bot = new WhatsAppBot({ onMessage: () => {} })
  const ev = fakeEv()
  bot.sock = { ev }
  bot._eventHandlers = {
    'messages.upsert': () => {},
    'connection.update': () => {},
    'creds.update': () => {},
  }
  for (const [event, fn] of Object.entries(bot._eventHandlers)) ev.on(event, fn)
  assert.equal(ev.listenerCount('messages.upsert'), 1)
  bot.detachListeners()
  assert.equal(ev.listenerCount('messages.upsert'), 0)
  assert.equal(ev.listenerCount('connection.update'), 0)
  assert.equal(bot._eventHandlers, null)
})

test('notifikasi cooldown hanya keluar sekali per jendela', () => {
  clearCooldownNotices()
  assert.equal(shouldNotifyCooldown('628111@s.whatsapp.net', 'ask'), true)
  assert.equal(shouldNotifyCooldown('628111@s.whatsapp.net', 'ask'), false)
  assert.equal(shouldNotifyCooldown('628222@s.whatsapp.net', 'ask'), true)
  assert.equal(shouldNotifyCooldown('628111@s.whatsapp.net', 'img'), true)
})

test('sesi VIP persisten setelah database dibuka ulang', () => {
  const user = '628111000999@s.whatsapp.net'
  const session = vipSession.startSession(user, [], '628222@g.us')
  assert.ok(session)
  assert.equal(session.expiresAt > Date.now(), true)
  closeDb()
  initDb()
  const reloaded = vipSession.getSession(user)
  assert.ok(reloaded)
  assert.equal(reloaded.key, '628111000999')
})

test('alias LID grup dan JID private dipetakan ke sesi yang sama', () => {
  const lid = '111222333@lid'
  const phone = '628999000111@s.whatsapp.net'
  const session = vipSession.startSession(lid, ['628999000111'], '628222@g.us')
  assert.ok(session)
  const fromPrivate = vipSession.getSession(phone)
  assert.ok(fromPrivate)
  assert.equal(fromPrivate.key, session.key)
})

test('dua pesan /vip bersamaan tidak membuat dua sesi atau mereset attempts', () => {
  const user = '628111000888@s.whatsapp.net'
  const first = vipSession.startSession(user, [], '628222@g.us')
  vipSession.failAttempt(user)
  const second = vipSession.startSession(user, [], '628222@g.us')
  assert.equal(second.key, first.key)
  assert.equal(second.attempts, 1)
  assert.equal(get('SELECT COUNT(*) n FROM vip_activation_sessions WHERE user_key=?', '628111000888').n, 1)
})

test('sesi yang benar-benar kedaluwarsa ditolak', () => {
  const user = '628111000777@s.whatsapp.net'
  vipSession.startSession(user, [], '628222@g.us')
  vipSession.expireSession(user)
  assert.equal(vipSession.getSession(user), null)
})

test('cleanup tidak menghapus sesi terkunci', () => {
  const user = '628111000666@s.whatsapp.net'
  vipSession.startSession(user, [], '628222@g.us')
  for (let i = 0; i < 3; i += 1) vipSession.failAttempt(user)
  vipSession.expireSession(user)
  const locked = vipSession.getSession(user)
  assert.equal(locked.locked, true)
  vipSession.cleanup()
  assert.ok(vipSession.getSession(user))
})
