import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { testEnv, ADMIN, GROUP } from './helpers.js'

const MODEL = { id: 'openrouter/free:free', name: 'Free Test', pricing: { prompt: '0', completion: '0' } }
const server = http.createServer(async (req, res) => {
  const json = (status, obj) => { res.writeHead(status, { 'content-type':'application/json' }); res.end(JSON.stringify(obj)) }
  if (req.method === 'GET' && req.url === '/v1/models') return json(200, { data: [MODEL] })
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    for await (const _chunk of req) { /* baca body */ }
    return json(200, { choices: [{ message: { role:'assistant', content:'Jawaban AI untuk hi.' } }] })
  }
  return json(404, { error: { message:'not found' } })
})
await new Promise((r) => server.listen(0, r))
process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`
process.env.OPENROUTER_API_KEY = 'sk-test-route-scope'
process.env.OPENROUTER_MODEL = ''
process.env.AI_COOLDOWN_SECONDS = '0'
process.env.AI_TIMEOUT_MS = '5000'
process.env.AI_MAX_PER_USER = '20'
testEnv('chat-scope')

const { initDb } = await import('../src/db/index.js')
const { groupService } = await import('../src/services/groups.js')
const { handleMessage } = await import('../src/commands/router.js')

initDb({ force: true })
groupService.upsert(GROUP, 'Grup Uji', 3)
const PRIVATE = '628111000123@s.whatsapp.net'
const KEY = { id:'SCOPE-1', remoteJid:GROUP, participant:ADMIN }

function makeSock() {
  const sent = []
  return {
    sent,
    isConnected: () => true,
    async sendMessage(jid, content) {
      sent.push({ jid, text: content.text })
      return { key: { id: `m${sent.length}` } }
    },
  }
}
const groupCtx = (sock, text) => ({
  sock, bot:null, jid:GROUP, adminJid:ADMIN, text, admin:true, isGroup:true,
  isRegisteredAdmin:true, messageKey:KEY, message:{ key:KEY },
})
const privateCtx = (sock, text) => ({
  sock, bot:null, jid:PRIVATE, adminJid:PRIVATE, text, admin:true, isGroup:false,
  isRegisteredAdmin:false, messageKey:{ ...KEY, remoteJid:PRIVATE, participant:PRIVATE },
  message:{ key:{ ...KEY, remoteJid:PRIVATE, participant:PRIVATE } },
})
const texts = (sock) => sock.sent.map((s) => s.text).filter(Boolean)

test('chat pribadi: "Halo" diabaikan tanpa balasan', async () => {
  const sock = makeSock()
  await handleMessage(privateCtx(sock, 'Halo'))
  assert.equal(texts(sock).length, 0)
})

test('chat pribadi: "Apa kabar?" diabaikan tanpa balasan', async () => {
  const sock = makeSock()
  await handleMessage(privateCtx(sock, 'Apa kabar?'))
  assert.equal(texts(sock).length, 0)
})

test('chat pribadi: shortcut angka tanpa menu tidak diproses', async () => {
  const sock = makeSock()
  await handleMessage(privateCtx(sock, '1'))
  assert.equal(texts(sock).length, 0)
})

test('chat pribadi: command AI tidak diizinkan tanpa private allowlist', async () => {
  const sock = makeSock()
  await handleMessage(privateCtx(sock, '.ask hi'))
  await handleMessage(privateCtx(sock, '/ask hi'))
  assert.equal(texts(sock).length, 0)
})

test('chat pribadi: prefix lama tidak diproses', async () => {
  const sock = makeSock()
  await handleMessage(privateCtx(sock, '/vip'))
  assert.equal(texts(sock).length, 0)
})

test('menu private hanya menampilkan command yang diizinkan di private chat', async () => {
  const sock = makeSock()
  await handleMessage(privateCtx(sock, '.menu'))
  const out = texts(sock).join('\n')
  assert.match(out, /◈ `\.menu umum`/)
  assert.match(out, /◈ `\.menu vip`/)
  assert.match(out, /◈ `\.menu sticker`/)
  assert.doesNotMatch(out, /◈ `\.menu pengumuman`|◈ `\.menu ai`/)
  await handleMessage(privateCtx(sock, '.menu umum'))
  const general = texts(sock).at(-1)
  assert.match(general, /◈ `\.vip`/)
  assert.match(general, /◈ `\.user`/)
  assert.doesNotMatch(general, /◈ `\.set`|◈ `\.ask`/)
  await handleMessage(privateCtx(sock, '.menu sticker'))
  const sticker = texts(sock).at(-1)
  assert.match(sticker, /◈ `\.ttp/)
  assert.doesNotMatch(sticker, /◈ `\.pack/)
  const sentAfterMenu = sock.sent.length
  await handleMessage(privateCtx(sock, '1'))
  assert.equal(sock.sent.length, sentAfterMenu)
})

test('chat pribadi: .vip tetap diproses sesuai alur VIP', async () => {
  const sock = makeSock()
  await handleMessage(privateCtx(sock, '.vip'))
  assert.match(texts(sock)[0], /VIP ACTIVATION/)
  assert.match(texts(sock)[0], /password VIP/i)
})

test('grup: .ask hi tetap merespons dengan AI', async () => {
  const sock = makeSock()
  await handleMessage(groupCtx(sock, '.ask hi'))
  assert.ok(texts(sock).some((t) => /JAWABAN AI/.test(t)))
  assert.ok(texts(sock).some((t) => /Jawaban AI untuk hi/.test(t)))
})

test('grup: .models dan alias .free menampilkan daftar model', async () => {
  for (const command of ['.models', '.free']) {
    const sock = makeSock()
    await handleMessage(groupCtx(sock, command))
    assert.ok(texts(sock).some((text) => /DAFTAR MODEL AI GRATIS/.test(text)), command)
  }
})

test('grup: .menu tetap tampil', async () => {
  const sock = makeSock()
  await handleMessage(groupCtx(sock, '.menu'))
  assert.ok(texts(sock).some((t) => /LUX BOT/.test(t)))
})

test('grup: pesan biasa tanpa prefix diabaikan', async () => {
  const sock = makeSock()
  await handleMessage(groupCtx(sock, 'halo semua'))
  assert.equal(texts(sock).length, 0)
})

test('grup: .pdf dan .img tetap dikenali', async () => {
  const pdf = makeSock()
  await handleMessage(groupCtx(pdf, '.pdf'))
  assert.match(texts(pdf)[0], /caption `\.pdf`/)
  const img = makeSock()
  await handleMessage(groupCtx(img, '.img'))
  assert.match(texts(img)[0], /caption `\.img`/)
})

test.after(() => server.close())
