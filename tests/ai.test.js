import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { testEnv, ADMIN, GROUP } from './helpers.js'

const FREE_A = { id: 'openrouter/alpha:free', name: 'Alpha Free', pricing: { prompt: '0', completion: '0' }, context_length: 8192 }
const FREE_B = { id: 'openrouter/beta:free', name: 'Beta Free', pricing: { prompt: 0, completion: 0 } }
const PAID = { id: 'openrouter/paid', name: 'Paid Model', pricing: { prompt: '0.001', completion: '0.002' } }
const TRICKY = { id: 'openrouter/tricky:free', name: 'Tricky Free', pricing: { prompt: '0.0001', completion: '0' } }

const mode = { badKey: false, modelDown: false }
const requests = { models: 0, chat: 0, bodies: [] }
const queuedResponses = []
const answers = new Map([
  ['Apa itu AI? Jawab dengan bahasa Indonesia.', 'AI adalah kecerdasan buatan, yaitu teknologi yang membuat komputer mampu melakukan tugas yang biasanya membutuhkan kecerdasan manusia.'],
  ['Apa itu AI Agent?', 'AI Agent adalah sistem AI yang memahami tujuan, merencanakan langkah, dan menjalankan tugas untuk mencapai tujuan tersebut.'],
  ['Jelaskan fungsi Linux.', 'Linux adalah sistem operasi yang mengelola perangkat keras dan menjalankan aplikasi; Linux banyak dipakai pada server, komputer, dan perangkat tertanam.'],
  ['Apa perbedaan RAM dan ROM?', 'RAM menyimpan data sementara saat perangkat bekerja, sedangkan ROM menyimpan instruksi yang tetap tersedia setelah perangkat dimatikan.'],
  ['Jelaskan pengertian jaringan komputer.', 'Jaringan komputer menghubungkan dua atau lebih perangkat agar dapat bertukar data dan berbagi sumber daya.'],
])

const server = http.createServer(async (req, res) => {
  const json = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)) }
  if (mode.badKey) return json(401, { error: { message: 'invalid key' } })
  if (req.method === 'GET' && req.url === '/v1/models') {
    requests.models += 1
    return json(200, { data: [FREE_A, FREE_B, PAID, TRICKY] })
  }
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    requests.chat += 1
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw || '{}')
    requests.bodies.push(body)
    if (mode.modelDown && body.model === FREE_B.id) return json(503, { error: { message: 'down' } })
    if (queuedResponses.length) return json(200, queuedResponses.shift())
    const question = body.messages.at(-1)?.content
    const content = answers.get(question) || 'AI Agent adalah sistem yang menjalankan tugas berdasarkan tujuan.'
    return json(200, { choices: [{ message: { role: 'assistant', content } }] })
  }
  return json(404, { error: { message: 'not found' } })
})
await new Promise((r) => server.listen(0, r))
process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`
process.env.OPENROUTER_API_KEY = 'sk-test-rahasia'
process.env.OPENROUTER_MODEL = ''
process.env.AI_COOLDOWN_SECONDS = '1'
process.env.AI_TIMEOUT_MS = '5000'
process.env.AI_MAX_PER_USER = '20'
process.env.AI_WINDOW_MINUTES = '60'
testEnv('ai')

const { initDb, get, all } = await import('../src/db/index.js')
const { groupService } = await import('../src/services/groups.js')
const { createAnnouncement } = await import('../src/services/announcements.js')
const { aiService } = await import('../src/ai/service.js')
const { toFreeModels, SYSTEM_PROMPT, AIError, askModel } = await import('../src/ai/client.js')
const { config } = await import('../src/config.js')
const { checkLimits, recordUsage } = await import('../src/ai/limits.js')
const { logger } = await import('../src/logger.js')
const { handleMessage } = await import('../src/commands/router.js')
const { createApp } = await import('../src/api/routes.js')

initDb({ force: true })
groupService.upsert(GROUP, 'Grup Uji', 3)

function makeSock() {
  const calls = []
  return {
    calls,
    isConnected: () => true,
    async sendMessage(jid, content) {
      calls.push({ jid, content })
      return { key: { id: `m${calls.length}` } }
    },
  }
}
const KEY = { id: 'AI-1', remoteJid: GROUP, participant: ADMIN }
const ctx = (sock, text, opts = {}) => ({
  sock, bot: null, jid: GROUP,
  adminJid: opts.user || ADMIN,
  text, admin: true, isGroup: true,
  isRegisteredAdmin: opts.registered !== false,
  messageKey: KEY, message: { key: KEY },
})
const texts = (sock) => sock.calls.filter(c => c.content.text).map(c => c.content.text)
const reacts = (sock) => sock.calls.filter(c => c.content.react).map(c => c.content.react.text)

test('filter model gratis berdasarkan harga, bukan nama', () => {
  const models = toFreeModels({ data: [FREE_A, FREE_B, PAID, TRICKY] })
  assert.deepEqual(models.map(m => m.id).sort(), [FREE_A.id, FREE_B.id].sort())
  assert.equal(models.some(m => m.name.includes('Paid')), false)
  assert.equal(models.some(m => m.name.includes('Tricky')), false, 'akhiran :free saja tidak cukup')
})

test('/models dan /free menampilkan model gratis dinamis', async () => {
  for (const cmd of ['/models', '/free']) {
    const sock = makeSock()
    await handleMessage(ctx(sock, cmd))
    assert.equal(texts(sock).length, 1)
    const out = texts(sock)[0]
    assert.match(out, /DAFTAR MODEL AI GRATIS/)
    assert.match(out, /Alpha Free/)
    assert.match(out, /Beta Free/)
    assert.doesNotMatch(out, /Paid Model|Tricky Free|sk-test/)
    assert.match(out, /Model aktif:/)
  }
})

test('/model menampilkan model aktif; non-admin tidak bisa mengganti', async () => {
  const info = makeSock()
  await handleMessage(ctx(info, '/model'))
  assert.match(texts(info)[0], /MODEL AI AKTIF/)
  assert.match(texts(info)[0], /Kategori: Free/)

  const denied = makeSock()
  await handleMessage(ctx(denied, '/model 2', { registered: false }))
  assert.match(texts(denied)[0], /Hanya admin terdaftar/)
})

test('/model 2 mengganti model, tersimpan di DB, tetap setelah cache di-refresh', async () => {
  const sock = makeSock()
  await handleMessage(ctx(sock, '/model 2'))
  assert.match(texts(sock)[0], /Beta Free/)
  assert.equal((await aiService.currentModel()).id, FREE_B.id)
  assert.equal(get("SELECT value FROM ai_settings WHERE key='active_model_id'").value, FREE_B.id)
  assert.ok(get("SELECT * FROM ai_model_history WHERE model_id=?", FREE_B.id))
  await aiService.freeModels({ force: true })
  assert.equal((await aiService.currentModel()).id, FREE_B.id, 'pilihan tetap setelah restart/cache refresh')
})

test('model aktif yang sudah tidak gratis tidak digunakan', async () => {
  await aiService.applyModel({ ...PAID, provider: 'OpenRouter' }, ADMIN)
  await assert.rejects(() => aiService.currentModel(), (err) => {
    assert.ok(err instanceof AIError)
    assert.match(err.message, /tidak tersedia dalam daftar model gratis/)
    return true
  })
  await aiService.applyModel({ ...FREE_B, provider: 'OpenRouter' }, ADMIN)
})

test('/ask sukses: ⏳→✅, satu jawaban, tanpa API key', async () => {
  const before = requests.chat
  const sock = makeSock()
  await handleMessage(ctx(sock, '/ask Apa itu AI Agent?', { user: '628111111111@s.whatsapp.net' }))
  assert.deepEqual(reacts(sock), ['⏳', '✅'])
  assert.equal(texts(sock).length, 1)
  const out = texts(sock)[0]
  assert.match(out, /🤖 \*JAWABAN AI\*/)
  assert.match(out, /Model: Beta Free \(Free\)/)
  assert.doesNotMatch(out, /sk-test|OPENROUTER_API_KEY/)
  assert.equal(requests.chat, before + 1)
  assert.ok(get("SELECT * FROM ai_usage_logs WHERE status='success'"))
  const body = requests.bodies.at(-1)
  assert.equal(body.model, FREE_B.id)
  assert.equal(body.messages[0].role, 'system')
  assert.equal(body.messages[0].content, SYSTEM_PROMPT)
  assert.match(SYSTEM_PROMPT, /bahasa Indonesia yang jelas/)
  assert.match(SYSTEM_PROMPT, /Jangan mengembalikan respons kosong/)
  assert.equal(body.messages.at(-1).role, 'user')
  assert.equal(body.messages.at(-1).content, 'Apa itu AI Agent?')
  assert.ok(body.max_tokens >= 128)
  assert.equal('temperature' in body, false)
})

test('/ask mengekstrak blok teks dalam content array', async () => {
  queuedResponses.push({
    id: 'array-response',
    choices: [{
      message: { role: 'assistant', content: [
        { type: 'text', text: 'Artificial Intelligence (AI) adalah kecerdasan buatan.' },
        { type: 'text', text: 'Contohnya, AI dapat mengenali suara.' },
      ] },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 15, completion_tokens: 21, total_tokens: 36 },
  })
  const sock = makeSock()
  await handleMessage(ctx(sock, '/ask Apa itu AI? Jawab dengan bahasa Indonesia.', { user: '628100000001@s.whatsapp.net' }))
  assert.deepEqual(reacts(sock), ['⏳', '✅'])
  assert.match(texts(sock)[0], /Artificial Intelligence.*kecerdasan buatan/)
  assert.match(texts(sock)[0], /Contohnya, AI dapat mengenali suara/)
})

test('/ask membaca teks dari choice berikutnya jika choice pertama kosong', async () => {
  queuedResponses.push({
    choices: [
      { finish_reason: 'stop', message: { content: null } },
      { finish_reason: 'stop', message: { content: [{ type: 'text', text: 'AI membantu komputer melakukan tugas.' }] } },
    ],
  })
  const before = requests.chat
  const sock = makeSock()
  await handleMessage(ctx(sock, '/ask Apa itu AI?', { user: '628100000004@s.whatsapp.net' }))
  assert.deepEqual(reacts(sock), ['⏳', '✅'])
  assert.match(texts(sock)[0], /AI membantu komputer melakukan tugas/)
  assert.equal(requests.chat, before + 1)
})

test('/ask mempertahankan teks refusal sebagai jawaban, tanpa retry', async () => {
  queuedResponses.push({
    choices: [{
      finish_reason: 'stop',
      message: { content: null, refusal: 'Maaf, saya tidak dapat membantu permintaan tersebut.' },
    }],
  })
  const before = requests.chat
  const sock = makeSock()
  await handleMessage(ctx(sock, '/ask pertanyaan dibatasi', { user: '628100000005@s.whatsapp.net' }))
  assert.deepEqual(reacts(sock), ['⏳', '✅'])
  assert.match(texts(sock)[0], /tidak dapat membantu permintaan/)
  assert.equal(requests.chat, before + 1)
})

test('/ask melakukan satu retry dengan model gratis yang sama saat content kosong', async () => {
  queuedResponses.push(
    {
      id: 'empty-response-1',
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: null } }],
      usage: { prompt_tokens: 9, completion_tokens: 0, total_tokens: 9 },
    },
    {
      id: 'empty-response-2',
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: [{ type: 'text', text: 'AI adalah kecerdasan buatan.' }] } }],
    },
  )
  const before = requests.chat
  const sock = makeSock()
  await handleMessage(ctx(sock, '/ask Apa itu AI?', { user: '628100000002@s.whatsapp.net' }))
  assert.deepEqual(reacts(sock), ['⏳', '✅'])
  assert.match(texts(sock)[0], /AI adalah kecerdasan buatan/)
  assert.equal(requests.chat, before + 2)
  const [first, second] = requests.bodies.slice(-2)
  assert.equal(first.model, FREE_B.id)
  assert.equal(second.model, FREE_B.id)
  assert.deepEqual(first.messages, second.messages)
})

test('respons kosong setelah retry tercatat dan gagal dengan pesan yang jelas', async () => {
  queuedResponses.push(
    { id: 'empty-final-1', choices: [], usage: { prompt_tokens: 4, completion_tokens: 0, total_tokens: 4 } },
    { id: 'empty-final-2', choices: [{ finish_reason: 'stop' }, { message: { content: '' } }] },
  )
  const originalWarn = logger.warn
  const diagnostics = []
  logger.warn = (...args) => diagnostics.push(args)
  try {
    const before = requests.chat
    const sock = makeSock()
    await handleMessage(ctx(sock, '/ask Jelaskan Linux.', { user: '628100000003@s.whatsapp.net' }))
    assert.deepEqual(reacts(sock), ['⏳', '❌'])
    assert.equal(texts(sock).length, 1)
    assert.equal(texts(sock)[0], 'Maaf, model AI sedang tidak dapat memberikan jawaban. Silakan coba kembali beberapa saat lagi.')
    assert.equal(requests.chat, before + 2)
  } finally {
    logger.warn = originalWarn
  }
  const details = diagnostics.find(([data]) => data?.requestId === 'empty-final-1')?.[0]
  assert.equal(details.model, FREE_B.id)
  assert.equal(details.status, 200)
  assert.equal(details.choicesCount, 0)
  assert.equal(details.usage.promptTokens, 4)
  const missingMessage = diagnostics.find(([data]) => data?.requestId === 'empty-final-2')?.[0]
  assert.equal(missingMessage.choices[0].messageAvailable, false)
  assert.equal(missingMessage.choices[1].contentEmpty, true)
  assert.doesNotMatch(JSON.stringify(diagnostics), /sk-test-rahasia/)
})

test('/ask memakai Bahasa Indonesia untuk lima pertanyaan umum', async () => {
  const questions = [...answers.keys()]
  for (const [index, question] of questions.entries()) {
    const sock = makeSock()
    await handleMessage(ctx(sock, `/ask ${question}`, { user: `62810000001${index}@s.whatsapp.net` }))
    assert.deepEqual(reacts(sock), ['⏳', '✅'], question)
    assert.ok(texts(sock)[0]?.trim(), `${question} harus memiliki jawaban`)
    assert.ok(texts(sock)[0].includes(answers.get(question)), `${question} harus mendapatkan jawaban relevan`)
    assert.match(texts(sock)[0], /Model: Beta Free \(Free\)/)
    assert.match(requests.bodies.at(-1).messages.at(-1).content, new RegExp(question.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('batas per pengguna tetap 20 request per 60 menit', () => {
  assert.equal(config.aiMaxPerUser, 20)
  assert.equal(config.aiWindowMs, 60 * 60 * 1000)
  const userJid = '628100000099@s.whatsapp.net'
  const oldCooldown = config.aiCooldownMs
  config.aiCooldownMs = 0
  try {
    for (let count = 0; count < 20; count += 1) {
      const limit = checkLimits(userJid, GROUP)
      assert.equal(limit.ok, true)
      recordUsage({ userJid, groupJid: GROUP, command: '/ask', status: 'failed', windowStart: limit.windowStart })
    }
    assert.equal(checkLimits(userJid, GROUP).kind, 'user')
  } finally {
    config.aiCooldownMs = oldCooldown
  }
})

test('cooldown: pertanyaan kedua ditolak tanpa request API tambahan', async () => {
  const user = '628100000777@s.whatsapp.net'
  const before = requests.chat
  const sock = makeSock()
  await handleMessage(ctx(sock, '/ask Apa itu AI Agent?', { user }))
  await handleMessage(ctx(sock, '/ask Apa itu AI Agent?', { user }))
  assert.deepEqual(reacts(sock), ['⏳', '✅', '⏳', '❌'])
  assert.match(texts(sock).at(-1), /Tunggu .* detik/)
  assert.equal(requests.chat, before + 1)
})

test('gagal mengirim jawaban WhatsApp menghasilkan reaction gagal tanpa pesan status tambahan', async () => {
  const calls = []
  const sock = {
    calls,
    isConnected: () => true,
    async sendMessage(jid, content) {
      calls.push({ jid, content })
      if (content.text) throw new Error('WhatsApp send failed')
      return { key: { id: `m${calls.length}` } }
    },
  }
  await handleMessage(ctx(sock, '/ask Apa itu AI?', { user: '628100000006@s.whatsapp.net' }))
  assert.deepEqual(reacts(sock), ['⏳', '❌'])
  assert.equal(texts(sock).length, 1, 'hanya satu kali mengirim jawaban, tanpa pesan status tambahan')
  assert.equal(calls.filter(({ content }) => content.text).length, 1)
})

test('API key salah → ❌ dan pesan ramah', async () => {
  mode.badKey = true
  try {
    const sock = makeSock()
    await handleMessage(ctx(sock, '/ask Jelaskan Linux', { user: '628555555555@s.whatsapp.net' }))
    assert.deepEqual(reacts(sock), ['⏳', '❌'])
    assert.match(texts(sock)[0], /API key OpenRouter tidak valid/)
    assert.doesNotMatch(texts(sock)[0], /sk-test/)
  } finally { mode.badKey = false }
})

test('model tidak tersedia → ❌, tidak jatuh ke model berbayar', async () => {
  mode.modelDown = true
  try {
    const sock = makeSock()
    await handleMessage(ctx(sock, '/ask Jelaskan jaringan', { user: '628666666666@s.whatsapp.net' }))
    assert.deepEqual(reacts(sock), ['⏳', '❌'])
    assert.match(texts(sock)[0], /Layanan AI sedang tidak tersedia/)
    const log = get("SELECT * FROM ai_usage_logs WHERE status='failed' ORDER BY id DESC")
    assert.equal(log.model_id, FREE_B.id)
  } finally { mode.modelDown = false }
})

test('fitur pengumuman tetap berjalan setelah modul AI', async () => {
  const id = createAnnouncement({ title: 'Regresi', body: 'Pesan pengumuman tetap jalan', weekday: 0, week: 0, time: '08:00', targets: [GROUP] })
  const sock = makeSock()
  await handleMessage(ctx(sock, `/send ${id}`))
  assert.deepEqual(reacts(sock), ['⏳', '✅'])
  assert.equal(sock.calls.some(c => c.content.text === 'Pesan pengumuman tetap jalan'), true)
})

const apiApp = createApp({
  bot: { status: () => ({ connected:false, connection:'close', qrAvailable:false, reconnectAttempts:0 }), sock: null, qrDataUrl:null },
  scheduler: { task:null, ticks:0, lastTick:null, lastError:null, upcoming:()=>[] },
})
const apiServer = apiApp.listen(0)
await new Promise((r) => apiServer.once('listening', r))
const apiBase = `http://127.0.0.1:${apiServer.address().port}`

test('web: status/model/usage AI bisa dikontrol tanpa menampilkan API key', async () => {
  const status = await (await fetch(apiBase + '/api/ai/status')).json()
  assert.equal(status.configured, true)
  assert.ok(status.activeModel)
  assert.ok(status.limits.maxPerUser > 0)

  const models = await (await fetch(apiBase + '/api/ai/models')).json()
  assert.deepEqual(models.models.map((m) => m.id).sort(), [FREE_A.id, FREE_B.id].sort())
  const html = JSON.stringify(models)
  assert.doesNotMatch(html, /sk-test/)

  const changed = await fetch(apiBase + '/api/ai/model', {
    method: 'POST', headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ model: FREE_A.id }),
  })
  assert.equal(changed.status, 200)
  assert.equal((await changed.json()).model.id, FREE_A.id)

  const usage = await (await fetch(apiBase + '/api/ai/usage')).json()
  assert.ok(Array.isArray(usage.logs))
  assert.ok(usage.history.length >= 1)
})

test('model reasoning: jawaban kosong karena batas token → retry dengan budget lebih besar', async () => {
  queuedResponses.length = 0
  queuedResponses.push(
    { choices: [{ finish_reason: 'length', message: { role:'assistant', content:null, reasoning:'sedang berpikir...' } }] },
    { choices: [{ finish_reason: 'stop', message: { role:'assistant', content:'Jawaban akhir dari reasoning.' } }] },
  )
  const before = requests.bodies.length
  const text = await askModel({ modelId: 'openrouter/nemotron-reasoning:free', question: 'Apa itu AI?' })
  assert.equal(text, 'Jawaban akhir dari reasoning.')
  assert.equal(requests.bodies.length - before, 2)
  const first = requests.bodies.at(-2)
  const second = requests.bodies.at(-1)
  assert.ok(first.max_tokens >= 1800)
  assert.deepEqual(first.reasoning, { effort: 'low' })
  assert.ok(second.max_tokens > first.max_tokens)
})

test.after(() => { server.close(); apiServer.close() })
