import { PDFParse } from 'pdf-parse'
import { config } from '../config.js'
import { askModel, isFreeByPricing, SYSTEM_PROMPT } from './client.js'

const DEFAULT_MAX_PAGES = 50
const DEFAULT_MAX_CHARS = 12000
const VISION_HINT = /(vision|image)/i
const NO_VISION_ERROR = 'Model aktif tidak mendukung vision. Minta admin memilih model gratis yang kompatibel.'

function positiveInt(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback
}

function timeoutMs() {
  const n = Number(config.aiTimeoutMs)
  return Number.isFinite(n) && n > 0 ? n : 20000
}

function apiKey() {
  return String(config.openRouterApiKey || '').trim()
}

function requestHeaders() {
  return {
    Authorization: `Bearer ${apiKey()}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://localhost/wa-bot',
    'X-Title': 'WA Announcement Bot',
  }
}

function supportsVision(model) {
  const modalities = [
    ...(Array.isArray(model?.input_modalities) ? model.input_modalities : []),
    ...(Array.isArray(model?.architecture?.input_modalities) ? model.architecture.input_modalities : []),
    ...(typeof model?.input_modalities === 'string' ? [model.input_modalities] : []),
    ...(typeof model?.architecture?.input_modalities === 'string' ? [model.architecture.input_modalities] : []),
  ]
  const outputs = [
    ...(Array.isArray(model?.output_modalities) ? model.output_modalities : []),
    ...(Array.isArray(model?.architecture?.output_modalities) ? model.architecture.output_modalities : []),
  ]
  // Model yang menghasilkan audio (mis. Lyria) bukan model chat vision meski inputnya gambar.
  if (outputs.some((m) => /audio|music|speech/i.test(String(m)))) return false
  if (String(model?.id || '').includes(':batch')) return false
  if (modalities.some((m) => VISION_HINT.test(String(m)))) return true
  return VISION_HINT.test(`${model?.name || ''} ${model?.id || ''}`)
}

// Katalog model gratis yang benar-benar bisa menerima gambar.
export async function freeVisionModels() {
  if (!apiKey()) throw new Error('Fitur AI belum dikonfigurasi. Isi OPENROUTER_API_KEY di .env lalu restart bot.')
  let res
  try {
    res = await fetch(`${config.openRouterBaseUrl}/models`, {
      headers: requestHeaders(),
      signal: AbortSignal.timeout(timeoutMs()),
    })
  } catch {
    throw new Error('Gagal mengambil daftar model AI: layanan tidak tersedia.')
  }
  if (!res.ok) throw new Error(`Gagal mengambil daftar model AI (HTTP ${res.status}).`)
  let payload
  try {
    payload = await res.json()
  } catch {
    throw new Error('Respons daftar model AI tidak valid.')
  }
  const rows = Array.isArray(payload?.data) ? payload.data : []
  return rows
    .filter((m) => m && m.id && isFreeByPricing(m.pricing) && supportsVision(m))
    .map((m) => ({
      id: String(m.id),
      name: m.name || String(m.id).split('/').pop(),
      provider: m.provider || (String(m.id).includes('/') ? String(m.id).split('/')[0] : 'OpenRouter'),
    }))
    .concat(config.geminiApiKey
      ? config.geminiVisionModels.map((id) => ({ id, name: id, provider: 'Gemini' }))
      : [])
    .sort((a, b) => a.name.localeCompare(b.name))
}

function textFromContent(content) {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (!part || typeof part !== 'object') return ''
        if (typeof part.text === 'string') return part.text
        if (typeof part.reasoning === 'string') return part.reasoning
        if (typeof part.refusal === 'string') return part.refusal
        return ''
      })
      .filter(Boolean)
      .join('\n')
      .trim()
  }
  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') return content.text.trim()
    if (typeof content.content === 'string') return content.content.trim()
  }
  return ''
}

// Analisis gambar memakai model gratis yang terverifikasi mendukung vision.
export async function analyzeImage({ buffer, mimetype, question, modelId } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Gambar kosong atau tidak valid.')
  if (!String(question || '').trim()) throw new Error('Pertanyaan untuk gambar kosong.')
  if (!apiKey()) throw new Error('Fitur AI belum dikonfigurasi. Isi OPENROUTER_API_KEY di .env lalu restart bot.')

  const models = await freeVisionModels()
  if (!models.some((m) => m.id === modelId)) throw new Error(NO_VISION_ERROR)

  if (String(modelId).startsWith('gemini-')) {
    if (!config.geminiApiKey) throw new Error('API key Gemini belum dikonfigurasi.')
    const geminiBody = {
      contents: [{
        role: 'user',
        parts: [
          { text: String(question).trim() },
          { inline_data: { mime_type: mimetype || 'image/jpeg', data: buffer.toString('base64') } },
        ],
      }],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: { maxOutputTokens: positiveInt(config.aiMaxAnswerTokens, 4000) },
    }
    let geminiRes
    try {
      geminiRes = await fetch(`${config.geminiBaseUrl}/models/${encodeURIComponent(modelId)}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': config.geminiApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
        signal: AbortSignal.timeout(timeoutMs()),
      })
    } catch { throw new Error('Gagal menganalisis gambar: layanan Gemini tidak tersedia.') }
    if (!geminiRes.ok) throw new Error(`Gagal menganalisis gambar (Gemini HTTP ${geminiRes.status}).`)
    let geminiPayload
    try { geminiPayload = await geminiRes.json() } catch { throw new Error('Respons analisis Gemini tidak valid.') }
    const parts = geminiPayload?.candidates?.[0]?.content?.parts || []
    const geminiAnswer = textFromContent(parts)
    if (!geminiAnswer) throw new Error('Model Gemini tidak memberikan jawaban untuk gambar ini.')
    return geminiAnswer.slice(0, positiveInt(config.aiMaxAnswerChars, 3000))
  }

  const dataUrl = `data:${mimetype || 'image/jpeg'};base64,${buffer.toString('base64')}`
  const body = {
    model: modelId,
    messages: [
      { role: 'system', content: [{ type: 'text', text: SYSTEM_PROMPT }] },
      {
        role: 'user',
        content: [
          { type: 'text', text: String(question).trim() },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    max_tokens: positiveInt(config.aiMaxAnswerTokens, 4000),
  }

  let res
  try {
    res = await fetch(`${config.openRouterBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: requestHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs()),
    })
  } catch {
    throw new Error('Gagal menganalisis gambar: layanan tidak tersedia.')
  }
  if (!res.ok) throw new Error(`Gagal menganalisis gambar (HTTP ${res.status}).`)

  let payload
  try {
    payload = await res.json()
  } catch {
    throw new Error('Respons analisis gambar tidak valid.')
  }
  const message = payload?.choices?.[0]?.message || {}
  const answer = textFromContent(message.content)
    || textFromContent(message.reasoning)
    || textFromContent(message.reasoning_content)
    || textFromContent(message.reasoning_details)
  if (!answer) throw new Error('Model tidak memberikan jawaban untuk gambar ini.')
  return answer.slice(0, positiveInt(config.aiMaxAnswerChars, 3000))
}

// Ekstrak teks per halaman dari PDF dengan batas halaman dan karakter.
export async function extractPdfText(buffer, { maxPages, maxChars } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('PDF kosong atau tidak valid.')
  const pageLimit = positiveInt(maxPages, DEFAULT_MAX_PAGES)
  const charLimit = positiveInt(maxChars, DEFAULT_MAX_CHARS)
  const parser = new PDFParse({ data: buffer })
  let result
  try {
    result = await parser.getText()
  } finally {
    await parser.destroy()
  }

  const pageRows = Array.isArray(result?.pages) ? result.pages : []
  const hasPages = pageRows.length > 0
  const rows = hasPages
    ? pageRows.map((page, index) => ({
      num: Number(page?.num) || index + 1,
      text: String(page?.text || ''),
    }))
    : [{ num: 1, text: String(result?.text || '') }]

  const kept = rows.slice(0, pageLimit)
  let text = hasPages
    ? kept.map((page) => `[Halaman ${page.num}]\n${page.text}`.trim()).join('\n\n')
    : kept.map((page) => page.text).join('\n\n')
  const truncated = rows.length > kept.length || text.length > charLimit
  if (text.length > charLimit) text = text.slice(0, charLimit)
  const pages = hasPages ? kept.length : (Number(result?.total) || (text ? 1 : 0))
  return { text, pages, truncated }
}

// Tanya isi PDF yang sudah diekstrak memakai jalur AI biasa.
export async function analyzePdfText({ text, question, modelId } = {}) {
  const limit = positiveInt(config.aiMaxAnswerChars, 3000)
  const source = String(text || '')
  const clipped = source.slice(0, limit)
  const cutNote = source.length > clipped.length ? '\n[... dokumen dipotong ...]' : ''
  const prompt = `Gunakan isi dokumen PDF berikut sebagai konteks utama. Jawab pertanyaan dalam bahasa Indonesia berdasarkan dokumen itu. Jika jawaban tidak ada di dokumen, katakan demikian.

--- ISI DOKUMEN PDF ---
${clipped}${cutNote}
--- AKHIR DOKUMEN ---

Pertanyaan: ${String(question || '').trim()}`
  return askModel({ modelId, question: prompt })
}
