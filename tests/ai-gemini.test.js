import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { testEnv, ADMIN, GROUP } from './helpers.js'

const mode = { badKey: false }
const calls = []
const server = http.createServer(async (req, res) => {
  const json = (status, obj) => { res.writeHead(status, { 'content-type':'application/json' }); res.end(JSON.stringify(obj)) }
  if (req.method === 'POST' && req.url.startsWith('/v1beta/models/') && req.url.endsWith(':generateContent')) {
    calls.push({ url: req.url, key: req.headers['x-goog-api-key'], body: req.body })
    if (mode.badKey) return json(403, { error: { message: 'forbidden' } })
    let raw = ''
    for await (const chunk of req) raw += chunk
    const parsed = JSON.parse(raw || '{}')
    calls.at(-1).model = decodeURIComponent(req.url.split('/').at(-1).replace(':generateContent', ''))
    calls.at(-1).contents = parsed.contents
    return json(200, { candidates: [{ content: { parts: [{ text: 'Gemini menjelaskan: AI Agent menjalankan tugas.' }] } }] })
  }
  return json(404, { error: { message: 'not found' } })
})
await new Promise((r) => server.listen(0, r))
process.env.AI_PROVIDER = 'gemini'
process.env.GEMINI_API_KEY = '***'
process.env.GEMINI_BASE_URL = `http://127.0.0.1:${server.address().port}/v1beta`
process.env.GEMINI_FREE_MODELS = 'gemini-2.0-flash,gemini-1.5-flash'
process.env.AI_COOLDOWN_SECONDS = '0'
process.env.AI_TIMEOUT_MS = '5000'
testEnv('ai-gemini')

const { initDb } = await import('../src/db/index.js')
const { aiService } = await import('../src/ai/service.js')
const { config } = await import('../src/config.js')
const { handleMessage } = await import('../src/commands/router.js')
const { createApp } = await import('../src/api/routes.js')

initDb({ force: true })

function makeSock() {
  const sent = []
  return {
    sent, isConnected: () => true,
    async sendMessage(jid, content) { sent.push({ jid, content }); return { key: { id: `m${sent.length}` } } },
  }
}
const KEY = { id: 'G-1', remoteJid: GROUP, participant: ADMIN }
const ctx = (sock, text, user = ADMIN) => ({
  sock, bot: null, jid: GROUP, adminJid: user, text, admin: true, isGroup: true,
  isRegisteredAdmin: true, messageKey: KEY, message: { key: KEY },
})
const texts = (s) => s.sent.filter(x => x.content.text).map(x => x.content.text)
const reacts = (s) => s.sent.filter(x => x.content.react).map(x => x.content.react.text)

test('provider gemini aktif dan daftar model berasal dari konfigurasi free', async () => {
  assert.equal(config.aiProvider, 'gemini')
  const models = await aiService.freeModels({ force: true })
  assert.deepEqual(models.map(m => m.id), ['gemini-1.5-flash', 'gemini-2.0-flash'])
  assert.ok(models.every(m => m.provider === 'Gemini'))
})

test('/models dan /model menampilkan model Gemini', async () => {
  const list = makeSock()
  await handleMessage(ctx(list, '/models'))
  assert.match(texts(list)[0], /DAFTAR MODEL AI GRATIS/)
  assert.match(texts(list)[0], /gemini-2\.0-flash/)

  const info = makeSock()
  await handleMessage(ctx(info, '/model'))
  assert.match(texts(info)[0], /Provider: Gemini/)
})

test('model bisa ditulis manual: /model gemini-1.5-flash diterima, model asing ditolak', async () => {
  const ok = makeSock()
  await handleMessage(ctx(ok, '/model gemini-1.5-flash'))
  assert.match(texts(ok)[0], /berhasil diganti/)
  assert.equal((await aiService.currentModel()).id, 'gemini-1.5-flash')

  const bad = makeSock()
  await handleMessage(ctx(bad, '/model gemini-2.5-pro'))
  assert.match(texts(bad)[0], /Pilihan tidak valid/)
  assert.equal((await aiService.currentModel()).id, 'gemini-1.5-flash')
})

test('/ask Gemini: ⏳→✅, satu jawaban, API key tidak bocor', async () => {
  const before = calls.length
  const sock = makeSock()
  await handleMessage(ctx(sock, '/ask Jelaskan AI Agent', '628111111111@s.whatsapp.net'))
  assert.deepEqual(reacts(sock), ['⏳', '✅'])
  assert.equal(texts(sock).length, 1)
  assert.match(texts(sock)[0], /JAWABAN AI/)
  assert.match(texts(sock)[0], /Model: gemini-1.5-flash \(Free\)/)
  assert.doesNotMatch(texts(sock)[0], /sk-test/)
  assert.equal(calls.length, before + 1)
  assert.equal(calls.at(-1).key, process.env.GEMINI_API_KEY)
})

test('API key Gemini salah → ❌ dan pesan jelas', async () => {
  mode.badKey = true
  try {
    const sock = makeSock()
    await handleMessage(ctx(sock, '/ask halo', '628222222222@s.whatsapp.net'))
    assert.deepEqual(reacts(sock), ['⏳', '❌'])
    assert.match(texts(sock)[0], /API key Gemini tidak valid/)
    assert.doesNotMatch(texts(sock)[0], /sk-test/)
  } finally { mode.badKey = false }
})

test('web: status AI melaporkan provider Gemini', async () => {
  const app = createApp({
    bot: { status: () => ({ connected:false, connection:'close', qrAvailable:false, reconnectAttempts:0 }), sock:null, qrDataUrl:null },
    scheduler: { task:null, ticks:0, lastTick:null, lastError:null, upcoming:()=>[] },
  })
  const srv = app.listen(0)
  await new Promise(r => srv.once('listening', r))
  const base = `http://127.0.0.1:${srv.address().port}`
  const status = await (await fetch(base + '/api/ai/status')).json()
  assert.equal(status.configured, true)
  assert.equal(status.provider, 'gemini')
  assert.equal(status.keyVariable, 'GEMINI_API_KEY')
  srv.close()
})

test.after(() => server.close())
