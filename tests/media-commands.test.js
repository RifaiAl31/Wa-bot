import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { testEnv, ADMIN, GROUP } from './helpers.js'

const TEXT_MODEL = 'openrouter/text-free:free'
const VISION_MODEL = 'openrouter/vision-free:free'
process.env.OPENROUTER_API_KEY = 'sk-test'
process.env.OPENROUTER_MODEL = TEXT_MODEL
process.env.OPENROUTER_BASE_URL = ''
process.env.GEMINI_API_KEY = 'sk-gemini-test'
process.env.GEMINI_VISION_MODELS = 'gemini-2.5-flash'
process.env.GEMINI_VISION_MODEL = 'gemini-2.5-flash'
process.env.GEMINI_BASE_URL = ''
process.env.AI_COOLDOWN_SECONDS = '0'
process.env.AI_MAX_PER_USER = '20'
process.env.VIP_PASSWORD = 'sandi-uji'
testEnv('media-commands')

const server = http.createServer(async (req, res) => {
  const json = (status, obj) => { res.writeHead(status, { 'content-type':'application/json' }); res.end(JSON.stringify(obj)) }
  if (req.url === '/v1/models') {
    return json(200, { data: [
      { id: TEXT_MODEL, name: 'Text Free', pricing: { prompt:'0', completion:'0' }, input_modalities:['text'] },
      { id: VISION_MODEL, name: 'Vision Free', pricing: { prompt:'0', completion:'0' }, input_modalities:['text','image'] },
      { id: 'openrouter/paid', name:'Paid', pricing:{ prompt:'0.01', completion:'0.02' }, input_modalities:['text','image'] },
    ] })
  }
  if (req.url.startsWith('/v1beta/models/') && req.url.endsWith(':generateContent')) {
    return json(200, { candidates: [{ content: { parts: [{ text: 'Jawaban Gemini vision.' }] } }] })
  }
  if (req.url === '/v1/chat/completions') {
    let raw = ''
    for await (const chunk of req) raw += chunk
    return json(200, { choices: [{ message: { role:'assistant', content:'Jawaban uji dari AI.' } }] })
  }
  return json(404, { error:{ message:'not found' } })
})
await new Promise((r) => server.listen(0, r))
process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`
process.env.GEMINI_BASE_URL = `http://127.0.0.1:${server.address().port}/v1beta`
const { groupService } = await import('../src/services/groups.js')

const { initDb, getDb } = await import('../src/db/index.js')
const { handleMessage } = await import('../src/commands/router.js')
const { registerVip, isVip } = await import('../src/services/vipService.js')
const { setWaDownloader, downloadWaMedia, extractMediaTarget } = await import('../src/services/waMedia.js')
const { extractPdfText } = await import('../src/ai/mediaService.js')
const { handleChoice, _contexts } = await import('../src/commands/quickReplies.js')
const modelConfig = await import('../src/ai/modelConfig.js')

initDb({ force: true })
groupService.upsert(GROUP, 'Grup Uji', 3)
const db = getDb()
function setModel(id) {
  db.prepare(`INSERT INTO ai_settings(key,value,updated_at) VALUES ('active_model_id',?,datetime('now'))
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(id)
}
function setVisionModel(id, provider = 'OpenRouter') {
  for (const [key, value] of [['active_vision_model_id', id], ['active_vision_model_name', id], ['active_vision_provider', provider]]) {
    db.prepare(`INSERT INTO ai_settings(key,value,updated_at) VALUES (?,?,datetime('now'))
                ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, value)
  }
}
setModel(TEXT_MODEL)

const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000100a5f645400000000049454e44ae426082', 'hex')
function makePdf(pageTexts) {
  const fontId = 3 + pageTexts.length * 2
  const kids = pageTexts.map((_, i) => `${3 + i * 2} 0 R`).join(' ')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${pageTexts.length} >>`,
  ]
  pageTexts.forEach((line, i) => {
    const safe = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${4 + i * 2} 0 R >>`)
    const stream = `BT /F1 16 Tf 72 700 Td (${safe}) Tj ET`
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`)
  })
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  let out = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(out))
    out += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefAt = Buffer.byteLength(out)
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}
const pdf = makePdf(['Materi Jaringan Komputer'])

let downloadKind = 'document'
setWaDownloader(async () => downloadKind === 'document' ? Buffer.from(pdf) : Buffer.from(png))
const directExtract = await extractPdfText(pdf, { maxPages: 50, maxChars: 12000 })
const directMedia = await downloadWaMedia({ type:'document', content:{ mimetype:'application/pdf', fileName:'x.pdf' }, message:{} }, '/tmp')
const viaDownloader = await extractPdfText(directMedia.buffer, { maxPages: 50, maxChars: 12000 })

function makeSock() {
  const sent = []
  return { sent, isConnected: () => true,
    async sendMessage(jid, content) { sent.push({ jid, content }); return { key: { id: `m${sent.length}` } } } }
}
function ctx(sock, text, opts = {}) {
  const user = opts.user || ADMIN
  const message = opts.message || { key: { id:'M1', remoteJid: GROUP, participant: user }, message: { conversation: text } }
  return { sock, bot:null, jid:GROUP, adminJid:user, text, admin:true, isGroup:true,
    isRegisteredAdmin: opts.admin !== false, messageKey: message.key, message,
    cmd: opts.cmd, arg: opts.arg }
}
const texts = (s) => s.sent.filter(x => x.content.text).map(x => x.content.text)
const reacts = (s) => s.sent.filter(x => x.content.react).map(x => x.content.react.text)

test('/no vip hanya admin dan mencabut status langsung', async () => {
  const target = '628123456789@s.whatsapp.net'
  registerVip(target)
  assert.equal(isVip(target), true)
  const denied = makeSock()
  await handleMessage(ctx(denied, '/no vip @628123456789', { admin:false }))
  assert.match(texts(denied)[0], /hanya untuk admin/)
  assert.equal(isVip(target), true)

  const sock = makeSock()
  const msg = { key:{ id:'N1', remoteJid:GROUP, participant:ADMIN },
    message:{ extendedTextMessage:{ text:'/no vip @628123456789', contextInfo:{ mentionedJid:[target] } } } }
  await handleMessage(ctx(sock, '/no vip @628123456789', { message:msg }))
  assert.match(texts(sock)[0], /STATUS VIP BERHASIL DICABUT/)
  assert.equal(isVip(target), false)
})

test('.img dengan gambar menghasilkan analisis + 3 pilihan', async () => {
  downloadKind = 'image'
  setVisionModel(VISION_MODEL)
  const sock = makeSock()
  const msg = { key:{ id:'I1', remoteJid:GROUP, participant:ADMIN }, message:{ imageMessage:{ caption:'.img Jelaskan gambar ini', mimetype:'image/png' } } }
  await handleMessage(ctx(sock, '.img Jelaskan gambar ini', { cmd:'.img', arg:'Jelaskan gambar ini', message:msg }))
  assert.deepEqual(reacts(sock), ['⏳', '✅'])
  const out = texts(sock).join('\n')
  assert.match(out, /HASIL ANALISIS GAMBAR/)
  assert.match(out, /1\. 🔍 Analisis Lebih Detail/)
  assert.match(out, /3\. 💡 Jelaskan Isi Gambar/)

  const follow = makeSock()
  await handleMessage(ctx(follow, '1'))
  assert.deepEqual(reacts(follow), ['⏳', '✅'])
  assert.match(texts(follow)[0], /HASIL ANALISIS GAMBAR/)
})

test('.img menolak model tanpa vision', async () => {
  downloadKind = 'image'
  setVisionModel(TEXT_MODEL)
  const sock = makeSock()
  const msg = { key:{ id:'I2', remoteJid:GROUP, participant:ADMIN }, message:{ imageMessage:{ caption:'.img apa ini', mimetype:'image/png' } } }
  await handleMessage(ctx(sock, '.img apa ini', { cmd:'.img', arg:'apa ini', message:msg }))
  assert.deepEqual(reacts(sock), ['⏳', '❌'])
  assert.match(texts(sock)[0], /tidak tersedia|tidak gratis|tidak mendukung vision/)
})

test('.pdf dengan caption PDF menghasilkan ringkasan + 3 pilihan', async () => {
  downloadKind = 'document'
  _contexts.clear()
  const sock = makeSock()
  const msg = { key:{ id:'P1', remoteJid:GROUP, participant:ADMIN }, message:{ documentMessage:{ caption:'.pdf', mimetype:'application/pdf', fileName:'materi.pdf' } } }
  await handleMessage(ctx(sock, '.pdf', { cmd:'.pdf', arg:'', message:msg }))
  assert.deepEqual(reacts(sock), ['⏳', '✅'], JSON.stringify(texts(sock)))
  const out = texts(sock).join('\n')
  assert.match(out, /HASIL ANALISIS PDF/)
  assert.match(out, /Judul: Materi Jaringan/)
  assert.match(out, /1\. 📚 Ringkas Dokumen/)
})

test('pilihan PDF "Tanya Isi PDF" membuka sesi pertanyaan', async () => {
  downloadKind = 'document'
  _contexts.clear()
  const first = makeSock()
  const msg = { key:{ id:'P2', remoteJid:GROUP, participant:ADMIN }, message:{ documentMessage:{ caption:'.pdf', mimetype:'application/pdf', fileName:'materi.pdf' } } }
  await handleMessage(ctx(first, '.pdf', { cmd:'.pdf', arg:'', message:msg }))
  const click = makeSock()
  await handleMessage(ctx(click, '3'))
  assert.match(texts(click)[0], /Ketik pertanyaan Anda/)
  const ask = makeSock()
  await handleMessage(ctx(ask, 'Apa judul dokumen?'))
  assert.match(texts(ask)[0], /HASIL ANALISIS PDF/)
})

test('pilihan hanya berlaku untuk pengguna+grup yang sama', () => {
  const sock = makeSock()
  const owner = ctx(sock, '.pdf')
  const other = { ...owner, adminJid: '628999999999@s.whatsapp.net' }
  assert.equal(handleChoice(other, '1'), null)
})

test('model text, vision, dan pdf tersimpan terpisah', async () => {
  setModel(TEXT_MODEL)
  setVisionModel(VISION_MODEL)
  const beforeVision = db.prepare("SELECT value FROM ai_settings WHERE key='active_vision_model_id'").get().value
  await modelConfig.changeModel('text', TEXT_MODEL, 'test')
  assert.equal(db.prepare("SELECT value FROM ai_settings WHERE key='active_vision_model_id'").get().value, beforeVision)
  await modelConfig.changeModel('vision', VISION_MODEL, 'test')
  assert.equal(db.prepare("SELECT value FROM ai_settings WHERE key='active_model_id'").get().value, TEXT_MODEL)
  assert.equal(db.prepare("SELECT value FROM ai_settings WHERE key='active_vision_model_id'").get().value, VISION_MODEL)
  const pdf = await modelConfig.currentModel('pdf')
  assert.ok(pdf)
})

test('model berbayar dan model tanpa vision ditolak sebelum request', async () => {
  await assert.rejects(() => modelConfig.changeModel('vision', 'openrouter/paid', 'test'), /tidak valid/)
  setVisionModel(TEXT_MODEL)
  await assert.rejects(() => modelConfig.currentModel('vision', { vip: false }), /tidak tersedia|tidak gratis/)
})

test('Gemini vision hanya untuk VIP', async () => {
  downloadKind = 'image'
  setVisionModel('gemini-2.5-flash', 'Gemini')
  const nonVip = makeSock()
  const msg = { key:{ id:'GV1', remoteJid:GROUP, participant:'628111000001@s.whatsapp.net' }, message:{ imageMessage:{ caption:'.img', mimetype:'image/png' } } }
  await handleMessage(ctx(nonVip, '.img coba', { user:'628111000001@s.whatsapp.net', cmd:'.img', arg:'coba', message:msg }))
  assert.deepEqual(reacts(nonVip), ['⏳', '❌'])
  assert.match(texts(nonVip)[0], /VIP/)

  const vipUser = '628111000002@s.whatsapp.net'
  registerVip(vipUser)
  const vip = makeSock()
  const msg2 = { key:{ id:'GV2', remoteJid:GROUP, participant:vipUser }, message:{ imageMessage:{ caption:'.img', mimetype:'image/png' } } }
  await handleMessage(ctx(vip, '.img coba', { user:vipUser, cmd:'.img', arg:'coba', message:msg2 }))
  assert.deepEqual(reacts(vip), ['⏳', '✅'], JSON.stringify(texts(vip)))
  assert.match(texts(vip)[0], /Gemini vision/)
  setVisionModel(VISION_MODEL)
})

test.after(() => server.close())