import test from 'node:test'
import assert from 'node:assert/strict'
import { testEnv } from './helpers.js'

testEnv('connection-session')
const { initDb } = await import('../src/db/index.js')
const { WhatsAppBot } = await import('../src/whatsapp/connection.js')
const { config } = await import('../src/config.js')
const { instanceKey } = await import('../src/whatsapp/singleInstance.js')
const { clearDedupe } = await import('../src/whatsapp/messageDedupe.js')

initDb({ force: true })
clearDedupe()

test('kunci instance membedakan database DAN folder auth', () => {
  const a = instanceKey('/db/bot.db', '/auth/akun1')
  const same = instanceKey('/db/bot.db', '/auth/akun1')
  const otherAuth = instanceKey('/db/bot.db', '/auth/akun2')
  const otherDb = instanceKey('/db/lain.db', '/auth/akun1')
  assert.equal(a, same)
  assert.notEqual(a, otherAuth)
  assert.notEqual(a, otherDb)
})

test('retireCurrentSocket menutup socket lama dan melepas listener', () => {
  const bot = new WhatsAppBot({ onMessage: () => {} })
  let ended = false
  let removed = 0
  const handler = () => {}
  bot.sock = {
    ev: { removeListener: () => { removed += 1 } },
    end: () => { ended = true },
  }
  bot._eventHandlers = { 'messages.upsert': handler, 'creds.update': handler }
  const original = bot.sock
  const old = bot.retireCurrentSocket()
  assert.equal(old, original)
  assert.equal(ended, true)
  assert.equal(removed, 2)
  assert.equal(bot.sock, null)
  assert.equal(bot._eventHandlers, null)
})

test('reconnect berhenti setelah batas kegagalan', () => {
  const oldMax = config.botMaxReconnectAttempts
  config.botMaxReconnectAttempts = 1
  try {
    const bot = new WhatsAppBot({ onMessage: () => {} })
    bot.reconnectAttempts = 1
    bot.scheduleReconnect()
    assert.equal(bot.reconnectBlocked, true)
    assert.equal(bot.reconnecting, false)
    assert.equal(bot.status().reconnectBlocked, true)
  } finally {
    config.botMaxReconnectAttempts = oldMax
  }
})

test('pesan gagal decrypt dan protocolMessage diabaikan', async () => {
  clearDedupe()
  const received = []
  const bot = new WhatsAppBot({ onMessage: (ctx) => received.push(ctx) })
  const base = { remoteJid: '628111aaa@s.whatsapp.net', participant: '628111aaa@s.whatsapp.net' }
  await bot.onMessagesUpsert({ type: 'notify', messages: [
    { key: { ...base, id: 'DEC-1' } }, // tidak ada field message = decrypt gagal
    { key: { ...base, id: 'DEC-2' }, message: { protocolMessage: { type: 0 } } }, // pesan dihapus/revoke
  ] })
  assert.equal(received.length, 0)
})

test('pesan append baru diproses, append lama diabaikan', async () => {
  clearDedupe()
  const received = []
  const bot = new WhatsAppBot({ onMessage: (ctx) => received.push(ctx) })
  const base = { remoteJid: '628333ccc@s.whatsapp.net', participant: '628333ccc@s.whatsapp.net' }
  const fresh = Math.floor(Date.now() / 1000)
  const old = fresh - 3600
  await bot.onMessagesUpsert({ type:'append', messages:[
    { key:{ ...base, id:'APP-OLD' }, messageTimestamp:old, message:{ conversation:'/menu' } },
    { key:{ ...base, id:'APP-NEW' }, messageTimestamp:fresh, message:{ conversation:'/menu' } },
  ] })
  assert.equal(received.length, 1)
  assert.equal(received[0].text, '/menu')
  assert.equal(bot.status().messageStats.received, 2)
  assert.equal(bot.status().messageStats.processed, 1)
  assert.equal(bot.status().messageStats.skipped, 1)
})

test('pesan perintah normal tetap diproses setelah perlindungan decrypt', async () => {
  clearDedupe()
  const received = []
  const bot = new WhatsAppBot({ onMessage: (ctx) => received.push(ctx) })
  const msg = {
    key: { id: 'DEC-3', remoteJid: '628222bbb@s.whatsapp.net', participant: '628222bbb@s.whatsapp.net' },
    message: { conversation: '/menu' },
  }
  await bot.onMessagesUpsert({ type: 'notify', messages: [msg] })
  assert.equal(received.length, 1)
  assert.equal(received[0].text, '/menu')
})
