import test from 'node:test'
import assert from 'node:assert/strict'
import { testEnv, ADMIN, GROUP } from './helpers.js'

process.env.RETRY_LIMIT = '0'
testEnv('reactions')

const { initDb, all } = await import('../src/db/index.js')
const { groupService } = await import('../src/services/groups.js')
const { createAnnouncement } = await import('../src/services/announcements.js')
const { handleMessage } = await import('../src/commands/router.js')
const { withReaction } = await import('../src/commands/reactions.js')

const GROUP2 = '628333333333@g.us'
const CHAT = '628444444444@g.us' // grup tempat perintah diketik, berbeda dari grup tujuan
const KEY = { id: 'CMD-1', remoteJid: CHAT, participant: ADMIN }

initDb({ force: true })
groupService.upsert(GROUP, 'Grup Satu', 3)
groupService.upsert(GROUP2, 'Grup Dua', 4)
groupService.upsert(CHAT, 'Grup Perintah', 3)
const idAll = createAnnouncement({ title:'Semua', body:'Pesan reaction', weekday:0, week:0, time:'08:00', targets:[GROUP, GROUP2] })
const idOne = createAnnouncement({ title:'Satu', body:'Pesan satu', weekday:0, week:0, time:'08:00', targets:[GROUP] })

function makeSock({ failTargets = [], failReact = false } = {}) {
  const calls = []
  return {
    calls,
    isConnected: () => true,
    async sendMessage(jid, content) {
      calls.push({ jid, content })
      if (content.react) {
        if (failReact) throw new Error('reaction diblokir')
        return { key: { id: `r${calls.length}` } }
      }
      if (content.text && failTargets.includes(jid)) throw new Error('pengiriman ditolak')
      return { key: { id: `m${calls.length}` } }
    },
  }
}

const ctxFor = (sock, text) => ({ sock, bot:null, jid:CHAT, adminJid:ADMIN, text, admin:true, isGroup:true, messageKey:KEY, message:{ key:KEY } })
const reactions = (sock) => sock.calls.filter(c => c.content.react).map(c => c.content.react.text)
const texts = (sock) => sock.calls.filter(c => c.content.text)

test('/send: ⏳ lalu ✅, tanpa pesan status tambahan', async () => {
  const sock = makeSock()
  await handleMessage(ctxFor(sock, `/send ${idAll}`))
  assert.deepEqual(reactions(sock), ['⏳', '✅'])
  assert.equal(texts(sock).filter(c => c.jid === CHAT).length, 0, 'tidak boleh ada pesan status di grup perintah')
  const logs = all('SELECT * FROM delivery_logs WHERE announcement_id = ?', idAll)
  assert.equal(logs.length, 2)
  assert.ok(logs.every(l => l.status === 'sent'))
  // reaction menargetkan key pesan perintah, bukan pesan baru
  for (const c of sock.calls.filter(c => c.content.react)) assert.equal(c.content.react.key, KEY)
})

test('/kirim alias: pola reaction sama', async () => {
  const sock = makeSock()
  await handleMessage(ctxFor(sock, `/kirim ${idOne}`))
  assert.deepEqual(reactions(sock), ['⏳', '✅'])
  assert.equal(texts(sock).filter(c => c.jid === CHAT).length, 0)
})

test('sebagian grup gagal → ❌, detail kegagalan tercatat per grup', async () => {
  const sock = makeSock({ failTargets: [GROUP2] })
  await handleMessage(ctxFor(sock, `/send ${idAll}`))
  assert.deepEqual(reactions(sock), ['⏳', '❌'])
  assert.equal(texts(sock).filter(c => c.jid === CHAT).length, 0)
  const logs = all('SELECT * FROM delivery_logs WHERE announcement_id = ? ORDER BY id', idAll)
  assert.equal(logs.length, 4) // 2 dari tes pertama + 2 sekarang
  const latest = logs.slice(-2)
  assert.equal(latest[0].status, 'sent')
  assert.equal(latest[1].status, 'failed')
  assert.match(latest[1].reason, /ditolak/)
})

test('semua grup gagal → ❌', async () => {
  const sock = makeSock({ failTargets: [GROUP, GROUP2] })
  await handleMessage(ctxFor(sock, `/send ${idAll}`))
  assert.deepEqual(reactions(sock), ['⏳', '❌'])
})

test('reaction gagal tidak menghentikan pengiriman', async () => {
  const sock = makeSock({ failReact: true })
  await handleMessage(ctxFor(sock, `/send ${idOne}`))
  assert.equal(reactions(sock).length, 2) // ⏳ dicoba, ❌/✅ tetap dicoba
  assert.equal(texts(sock).filter(c => c.jid !== CHAT).length, 1, 'pesan tetap terkirim ke grup tujuan')
})

test('ID tidak ditemukan → pesan kesalahan, tanpa reaction', async () => {
  const sock = makeSock()
  await handleMessage(ctxFor(sock, '/send A999'))
  assert.equal(reactions(sock).length, 0)
  assert.equal(texts(sock).length, 1)
  assert.match(texts(sock)[0].content.text, /tidak ditemukan/)
})

test('withReaction: task melempar error → ❌ dan error tetap dilempar', async () => {
  const sock = makeSock()
  const ctx = ctxFor(sock, '/send')
  await assert.rejects(() => withReaction(ctx, async () => { throw new Error('boom') }), /boom/)
  assert.deepEqual(reactions(sock), ['⏳', '❌'])
})