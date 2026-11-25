import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

const KEY = 'sk-media-test-key'
const VISION_A = {
  id: 'meta-llama/llama-3.2-11b-vision-instruct:free',
  name: 'Llama Vision Free',
  pricing: { prompt: '0', completion: 0 },
  input_modalities: ['text', 'image'],
}
const VISION_B = {
  id: 'google/flash:free',
  name: 'Flash Free',
  pricing: { prompt: 0, completion: '0' },
  architecture: { input_modalities: ['text', 'image'] },
}
const VISION_C = {
  id: 'openrouter/vision-mini:free',
  name: 'Vision Mini',
  pricing: { prompt: 0, completion: 0 },
}
const PAID = {
  id: 'openrouter/paid-vision',
  name: 'Paid Vision',
  pricing: { prompt: '0.001', completion: '0.002' },
  input_modalities: ['image'],
}
const TEXT_ONLY = { id: 'openrouter/text-only:free', name: 'Text Only', pricing: { prompt: 0, completion: 0 } }
const CHEAP_TRICK = {
  id: 'openrouter/fake-vision:free',
  name: 'Fake Vision',
  pricing: { prompt: '0.0001', completion: 0 },
  input_modalities: ['image'],
}

const seen = { models: 0, chat: 0, auth: [], bodies: [] }
const queued = []

const server = http.createServer(async (req, res) => {
  const json = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)) }
  seen.auth.push(req.headers.authorization || '')
  if (req.method === 'GET' && req.url === '/v1/models') {
    seen.models += 1
    return json(200, { data: [VISION_A, VISION_B, VISION_C, PAID, TEXT_ONLY, CHEAP_TRICK] })
  }
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    seen.chat += 1
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw || '{}')
    seen.bodies.push(body)
    if (queued.length) return json(200, queued.shift())
    return json(200, { choices: [{ message: { role: 'assistant', content: 'Jawaban dari server uji.' } }] })
  }
  return json(404, { error: { message: 'not found' } })
})
await new Promise((resolve) => server.listen(0, resolve))

process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`
process.env.OPENROUTER_API_KEY = KEY
process.env.AI_PROVIDER = 'openrouter'
process.env.AI_TIMEOUT_MS = '5000'
process.env.AI_MAX_ANSWER_TOKENS = '1024'
process.env.AI_MAX_ANSWER_CHARS = '3000'

const { config } = await import('../src/config.js')
const { SYSTEM_PROMPT } = await import('../src/ai/client.js')
const { freeVisionModels, analyzeImage, extractPdfText, analyzePdfText } = await import('../src/ai/mediaService.js')

// PDF minimal dengan xref yang dihitung dari offset sebenarnya.
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

  let pdf = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefAt = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

test('freeVisionModels hanya mengembalikan model gratis dengan dukungan gambar', async () => {
  const models = await freeVisionModels()
  assert.deepEqual(models.map((m) => m.id), [VISION_B.id, VISION_A.id, VISION_C.id])
  assert.equal(models.some((m) => [PAID.id, TEXT_ONLY.id, CHEAP_TRICK.id].includes(m.id)), false)
  for (const model of models) {
    assert.deepEqual(Object.keys(model).sort(), ['id', 'name', 'provider'])
    assert.equal(model.name.length > 0, true)
    assert.equal(model.provider.length > 0, true)
  }
  assert.ok(seen.auth.includes(`Bearer ${KEY}`))
})

test('analyzeImage sukses mengirim teks + data URL gambar ke model vision gratis', async () => {
  queued.push({ choices: [{ message: { role: 'assistant', content: 'Gambar ini berisi kucing.' } }] })
  const answer = await analyzeImage({
    buffer: png,
    mimetype: 'image/png',
    question: 'Apa isi gambar ini?',
    modelId: VISION_A.id,
  })
  assert.equal(answer, 'Gambar ini berisi kucing.')
  const body = seen.bodies.at(-1)
  assert.equal(body.model, VISION_A.id)
  assert.equal(body.max_tokens, config.aiMaxAnswerTokens)
  assert.equal(body.messages[0].content[0].type, 'text')
  assert.equal(body.messages[0].content[0].text, SYSTEM_PROMPT)
  assert.deepEqual(body.messages[1].content[0], { type: 'text', text: 'Apa isi gambar ini?' })
  assert.deepEqual(body.messages[1].content[1], {
    type: 'image_url',
    image_url: { url: `data:image/png;base64,${png.toString('base64')}` },
  })
})

test('analyzeImage memakai reasoning sebagai fallback bila content kosong', async () => {
  queued.push({ choices: [{ message: { content: null, reasoning: 'Hasil pengamatan: ada kucing.' } }] })
  const answer = await analyzeImage({
    buffer: png,
    mimetype: 'image/png',
    question: 'Deskripsikan gambar',
    modelId: VISION_B.id,
  })
  assert.equal(answer, 'Hasil pengamatan: ada kucing.')
})

test('model non-vision ditolak tanpa memanggil /chat/completions', async () => {
  const before = seen.chat
  await assert.rejects(
    () => analyzeImage({ buffer: png, mimetype: 'image/png', question: 'Apa ini?', modelId: TEXT_ONLY.id }),
    { message: 'Model aktif tidak mendukung vision. Minta admin memilih model gratis yang kompatibel.' },
  )
  assert.equal(seen.chat, before)
  await assert.rejects(
    () => analyzeImage({ buffer: png, mimetype: 'image/png', question: 'Apa ini?', modelId: PAID.id }),
    { message: 'Model aktif tidak mendukung vision. Minta admin memilih model gratis yang kompatibel.' },
  )
  assert.equal(seen.chat, before)
})

test('extractPdfText membaca marker halaman dan mematuhi batas halaman/karakter', async () => {
  const pdf = makePdf(['Isi halaman satu.', 'Isi halaman dua.'])
  const full = await extractPdfText(pdf)
  assert.equal(full.pages, 2)
  assert.equal(full.truncated, false)
  assert.match(full.text, /\[Halaman 1\]/)
  assert.match(full.text, /Isi halaman satu\./)
  assert.match(full.text, /\[Halaman 2\]/)
  assert.match(full.text, /Isi halaman dua\./)

  const clipped = await extractPdfText(pdf, { maxPages: 1, maxChars: 12 })
  assert.equal(clipped.pages, 1)
  assert.equal(clipped.truncated, true)
  assert.ok(clipped.text.length <= 12)
  assert.doesNotMatch(clipped.text, /Halaman 2/)
})

test('analyzePdfText mengirim teks PDF + pertanyaan dan mengembalikan jawaban', async () => {
  queued.push({ choices: [{ message: { role: 'assistant', content: 'Ringkasan: dokumen berisi dua halaman.' } }] })
  const pdf = await extractPdfText(makePdf(['Isi halaman satu.', 'Isi halaman dua.']))
  const answer = await analyzePdfText({ text: pdf.text, question: 'Ringkas isi PDF!', modelId: VISION_C.id })
  assert.equal(answer, 'Ringkasan: dokumen berisi dua halaman.')
  const body = seen.bodies.at(-1)
  assert.equal(body.model, VISION_C.id)
  const prompt = body.messages.at(-1).content
  assert.match(prompt, /\[Halaman 1\]/)
  assert.match(prompt, /Isi halaman dua\./)
  assert.match(prompt, /Pertanyaan: Ringkas isi PDF!/)
  assert.ok(!JSON.stringify(seen.bodies).includes(KEY), 'API key tidak boleh masuk body request')
})

test.after(() => { server.close() })
