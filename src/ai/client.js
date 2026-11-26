import { config } from '../config.js'
import { logger } from '../logger.js'

const EMPTY_ANSWER = 'Maaf, model AI sedang tidak dapat memberikan jawaban. Silakan coba kembali beberapa saat lagi.'
const REASONING_MODEL = /(nemotron|reasoning|thinking|deepseek-r|qwq|qwen3|o[134])/i

export class AIError extends Error {
  constructor(message, code = 'api_error') {
    super(message)
    this.name = 'AIError'
    this.code = code
  }
}

const provider = () => config.aiProvider
const apiKey = () => provider() === 'gemini' ? config.geminiApiKey : config.openRouterApiKey

function requireKey() {
  const key = String(apiKey() || '').trim()
  if (!key) {
    throw new AIError(
      'Fitur AI belum dikonfigurasi. Isi OPENROUTER_API_KEY atau GEMINI_API_KEY di .env lalu restart bot.',
      'no_key',
    )
  }
  return key
}

function httpError(status) {
  const name = provider() === 'gemini' ? 'Gemini' : 'OpenRouter'
  if (status === 401 || status === 403) return new AIError(`API key ${name} tidak valid.`, 'auth')
  if (status === 402 || status === 429) return new AIError(`Kuota/rate limit ${name} sudah habis. Coba lagi nanti.`, 'quota')
  if (status === 400 || status === 404) return new AIError('Model AI tidak tersedia atau nama model salah.', 'not_found')
  return new AIError('Layanan AI sedang tidak tersedia.', 'offline')
}

function safeDiagnostic(value) {
  const key = String(apiKey() || '').trim()
  let text = String(value || '')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]+/g, '[redacted]')
  if (key) text = text.replaceAll(key, '[redacted]')
  return text.slice(0, 500)
}

function requestUrl(base, endpoint) {
  try {
    const url = new URL(`${base}${endpoint}`)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol')
    return url
  } catch {
    throw new AIError('Base URL layanan AI tidak valid.', 'config')
  }
}

function responseRequestId(response, payload) {
  return response.headers.get('x-request-id')
    || response.headers.get('x-openrouter-request-id')
    || payload?.id
    || null
}

// Validasi gratis dari metadata harga, bukan dari teks nama model.
// Akhiran :free hanya dipakai sebagai petunjuk tambahan pada tampilan.
export function isFreeByPricing(pricing) {
  const number = (value) => {
    if (value === undefined || value === null || value === '') return null
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  const input = number(pricing?.prompt)
  const output = number(pricing?.completion)
  return input !== null && output !== null && input === 0 && output === 0
}

export function toFreeModels(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : []
  return rows
    .filter((m) => m && m.id && isFreeByPricing(m.pricing))
    .map((m) => ({
      id: m.id,
      name: m.name || m.id.split('/').pop(),
      provider: m.provider || (m.id.includes('/') ? m.id.split('/')[0] : 'OpenRouter'),
      prompt: m.pricing.prompt,
      completion: m.pricing.completion,
      contextLength: m.context_length || null,
      freeHint: m.id.endsWith(':free'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function requestJson(url, options = {}, diagnostic = {}) {
  const key = requireKey()
  const activeProvider = provider()
  const timeoutMs = Number(config.aiTimeoutMs)
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new AIError('AI_TIMEOUT_MS harus berupa bilangan positif.', 'config')
  }
  const headers = activeProvider === 'gemini'
    ? { 'x-goog-api-key': key, 'Content-Type': 'application/json' }
    : { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
        'HTTP-Referer': 'https://localhost/wa-bot', 'X-Title': 'WA Announcement Bot' }
  let res
  try {
    res = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(timeoutMs) })
  } catch (err) {
    logger.error({
      provider: activeProvider,
      ...diagnostic,
      stage: 'request',
      timeout: err?.name === 'TimeoutError' || err?.name === 'AbortError',
      error: safeDiagnostic(err?.message || 'network error'),
    }, 'AI API request failed')
    throw new AIError('Layanan AI sedang tidak tersedia (gangguan koneksi/timeout).', 'offline')
  }
  let payload = null
  let parseFailed = false
  try {
    const raw = await res.text()
    payload = raw ? JSON.parse(raw) : null
  } catch {
    parseFailed = true
  }
  const requestId = responseRequestId(res, payload)
  if (!res.ok) {
    logger.error({
      provider: activeProvider,
      ...diagnostic,
      stage: 'http',
      status: res.status,
      requestId,
      error: safeDiagnostic(payload?.error?.message || payload?.message || (parseFailed ? 'invalid JSON error response' : '')),
    }, 'AI API returned an HTTP error')
    throw httpError(res.status)
  }
  if (parseFailed) {
    logger.error({
      provider: activeProvider,
      ...diagnostic,
      stage: 'json_parse',
      status: res.status,
      requestId,
      error: 'invalid JSON response',
    }, 'AI API response could not be parsed')
    throw new AIError('Respons AI tidak dapat dibaca.', 'bad_response')
  }
  return { data: payload, status: res.status, requestId }
}

// Gemini API tidak menyediakan katalog harga; kandidat free-tier diatur
// lewat GEMINI_FREE_MODELS di .env dan bisa ditambah sendiri.
export async function fetchModels() {
  if (provider() === 'gemini') {
    requireKey()
    return {
      data: config.geminiFreeModels.map((id) => ({
        id,
        name: id,
        provider: 'Gemini',
        pricing: { prompt: '0', completion: '0' },
      })),
    }
  }
  return (await requestJson(requestUrl(config.openRouterBaseUrl, '/models'))).data
}

export const SYSTEM_PROMPT = `Kamu adalah asisten AI yang membantu pengguna menjawab pertanyaan.

Selalu jawab menggunakan bahasa Indonesia yang jelas dan mudah dipahami, kecuali pengguna meminta bahasa lain.

Jawab pertanyaan secara langsung, relevan, dan informatif.

Jika pengguna meminta penjelasan, berikan penjelasan beserta contoh sederhana jika diperlukan.

Jangan mengembalikan respons kosong ketika pertanyaan dapat dijawab.

Jika tidak mengetahui jawaban, jelaskan keterbatasanmu secara jujur.`

function textFromContent(content) {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (!part || typeof part !== 'object') return ''
        if (typeof part.text === 'string') return part.text
        if (typeof part.refusal === 'string') return part.refusal
        if (part.content !== undefined) return textFromContent(part.content)
        if (Array.isArray(part.parts)) return textFromContent(part.parts)
        return ''
      })
      .filter(Boolean)
      .join('\n')
      .trim()
  }
  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') return content.text.trim()
    if (typeof content.content === 'string') return content.content.trim()
    if (Array.isArray(content.parts)) return textFromContent(content.parts)
  }
  return ''
}

function completionDetails(payload, status, requestId, modelId) {
  const choices = payload?.choices
  const choicesArray = Array.isArray(choices) ? choices : []
  return {
    provider: 'openrouter',
    model: modelId,
    status,
    requestId,
    choicesIsArray: Array.isArray(choices),
    choicesCount: choicesArray.length,
    choices: choicesArray.map((choice, index) => {
      const message = choice?.message
      const content = message?.content
      return {
        index: choice?.index ?? index,
        finishReason: choice?.finish_reason || choice?.native_finish_reason || null,
        messageAvailable: Boolean(message),
        messageKeys: message && typeof message === 'object' ? Object.keys(message) : [],
        contentType: content === null ? 'null' : Array.isArray(content) ? 'array' : typeof content,
        contentEmpty: !textFromContent(content),
        contentBlockTypes: Array.isArray(content)
          ? content.map((part) => typeof part === 'object' && part ? part.type || typeof part : typeof part)
          : [],
        refusalAvailable: Boolean(message?.refusal),
        legacyTextAvailable: Boolean(choice?.text),
      }
    }),
    usage: payload?.usage ? {
      promptTokens: payload.usage.prompt_tokens ?? null,
      completionTokens: payload.usage.completion_tokens ?? null,
      totalTokens: payload.usage.total_tokens ?? null,
    } : null,
    apiError: safeDiagnostic(payload?.error?.message || payload?.error?.code || ''),
  }
}

function answerFromCompletion(payload) {
  const choices = Array.isArray(payload?.choices) ? payload.choices : []
  const parsed = choices.map((choice) => {
    const message = choice?.message
    const content = textFromContent(message?.content)
    const refusal = textFromContent(message?.refusal)
    const legacyText = textFromContent(choice?.text)
    return {
      text: content || refusal || legacyText,
      finishReason: choice?.finish_reason || choice?.native_finish_reason || null,
      refusal: Boolean(refusal || message?.refusal),
    }
  })
  const answer = parsed.find((choice) => choice.text)
  return {
    text: answer?.text || '',
    finishReason: answer?.finishReason || parsed[0]?.finishReason || null,
    refusal: parsed.some((choice) => choice.refusal),
  }
}

function validateChatInput(modelId, question) {
  if (typeof modelId !== 'string' || !modelId.trim()) {
    throw new AIError('Model AI tidak tersedia.', 'not_found')
  }
  if (typeof question !== 'string' || !question.trim()) {
    throw new AIError('Pertanyaan kosong. Contoh: .ask Apa itu AI Agent?', 'empty_question')
  }
  const tokens = Number(config.aiMaxAnswerTokens)
  if (!Number.isInteger(tokens) || tokens < 128) {
    throw new AIError('AI_MAX_ANSWER_TOKENS harus berupa bilangan bulat minimal 128.', 'config')
  }
  const maxChars = Number(config.aiMaxAnswerChars)
  if (!Number.isInteger(maxChars) || maxChars < 1) {
    throw new AIError('AI_MAX_ANSWER_CHARS harus berupa bilangan bulat positif.', 'config')
  }
  return { question: question.trim(), maxTokens: tokens, maxChars }
}

export async function askModel({ modelId, question, context = [] }) {
  const validated = validateChatInput(modelId, question)
  const prompt = validated.question
  if (provider() === 'gemini') {
    const contents = [
      ...context.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.content || '') }],
      })),
      { role: 'user', parts: [{ text: prompt }] },
    ]
    const { data } = await requestJson(
      requestUrl(config.geminiBaseUrl, `/models/${encodeURIComponent(modelId)}:generateContent`),
      {
        method: 'POST',
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: { maxOutputTokens: validated.maxTokens },
        }),
      },
    )
    const text = textFromContent(data?.candidates?.[0]?.content?.parts)
    if (!text) throw new AIError('Respons AI kosong atau diblokir. Silakan coba lagi.', 'empty')
    return text.slice(0, validated.maxChars)
  } else {
    const url = requestUrl(config.openRouterBaseUrl, '/chat/completions')
    const isReasoning = REASONING_MODEL.test(modelId)
    // Model reasoning memakai sebagian besar token untuk "reasoning". Beri
    // ruang lebih besar supaya tetap ada token untuk content jawaban.
    const budget = isReasoning ? Math.max(validated.maxTokens, 1800) : validated.maxTokens

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const requestBody = {
        model: modelId,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...context,
          { role: 'user', content: prompt },
        ],
        max_tokens: attempt === 0 ? budget : Math.max(budget + 2000, 6000),
      }
      if (isReasoning) requestBody.reasoning = { effort: 'low' }
      const { data, status, requestId } = await requestJson(url, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      }, { model: modelId })
      if (data?.error) {
        const details = completionDetails(data, status, requestId, modelId)
        logger.error(details, 'OpenRouter returned an API error')
        throw new AIError('Layanan AI sedang tidak tersedia.', 'api_error')
      }
      const result = answerFromCompletion(data)
      if (result.text) return result.text.slice(0, validated.maxChars)

      const details = {
        ...completionDetails(data, status, requestId, modelId),
        attempt: attempt + 1,
        finishReason: result.finishReason,
        messageAvailable: Boolean(data?.choices?.[0]?.message),
      }
      logger.warn(details, 'OpenRouter response contained no usable answer text')
      if (result.finishReason === 'content_filter' || result.refusal) {
        throw new AIError('Model tidak dapat menjawab permintaan ini. Silakan coba pertanyaan lain.', 'refusal')
      }
      if (attempt === 0) {
        logger.info({ model: modelId, requestId }, 'Retrying empty OpenRouter response once')
        continue
      }
      throw new AIError(result.finishReason === 'length'
        ? 'Model menghabiskan batas token untuk berpikir. Coba lagi atau pilih model lain lewat .models.'
        : EMPTY_ANSWER, 'empty')
    }
  }
  throw new AIError(EMPTY_ANSWER, 'empty')
}
