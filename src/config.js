import path from 'node:path'
import dotenv from 'dotenv'

dotenv.config()

export const ROOT = path.resolve(import.meta.dirname, '..')

function resolveFromRoot(p, fallback) {
  const value = p || fallback
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value)
}

export const config = {
  root: ROOT,
  env: process.env.NODE_ENV || 'production',
  port: Number(process.env.PORT || 3000),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 10),
  imageTempDir: resolveFromRoot(process.env.IMAGE_TEMP_DIR, './data/tmp'),
  imageMaxBytes: Number(process.env.IMAGE_MAX_MB || 8) * 1024 * 1024,
  imageMaxTextChars: Number(process.env.IMAGE_MAX_TEXT || 500),
  imageTimeoutMs: Number(process.env.IMAGE_TIMEOUT_MS || 30000),
  imageMaxSide: Number(process.env.IMAGE_MAX_SIDE || 1600),
  // true = semua anggota grup boleh memakai semua perintah (tanpa daftar admin).
  // Set OPEN_ACCESS=false untuk kembali membatasi perintah ke admin terdaftar.
  openAccess: process.env.OPEN_ACCESS !== 'false',
  vipPassword: process.env.VIP_PASSWORD || '',
  vipSessionTtlMs: Number(process.env.VIP_SESSION_TTL_MS || 2 * 60 * 1000),
  vipMaxAttempts: Number(process.env.VIP_MAX_ATTEMPTS || 3),
  vipLockMs: Number(process.env.VIP_LOCK_MS || 5 * 60 * 1000),

  // AI Assistant (OpenRouter). API key TIDAK pernah disimpan di database.
  // Penyedia AI: openrouter atau gemini. Pilih otomatis dari key yang tersedia.
  aiProvider: String(process.env.AI_PROVIDER || (process.env.OPENROUTER_API_KEY ? 'openrouter' : process.env.GEMINI_API_KEY ? 'gemini' : 'none')).toLowerCase(),
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openRouterModel: process.env.OPENROUTER_MODEL || '',
  openRouterBaseUrl: (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || '',
  geminiBaseUrl: (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, ''),
  geminiVisionModels: (process.env.GEMINI_VISION_MODELS || 'gemini-2.5-flash,gemini-2.0-flash,gemini-1.5-flash')
    .split(',').map((s) => s.trim()).filter(Boolean),
  geminiVisionModel: process.env.GEMINI_VISION_MODEL || '',
  geminiFreeModels: (process.env.GEMINI_FREE_MODELS || 'gemini-2.0-flash,gemini-1.5-flash,gemini-1.5-flash-latest,gemini-2.5-flash')
    .split(',').map((s) => s.trim()).filter(Boolean),
  aiCooldownMs: Number(process.env.AI_COOLDOWN_SECONDS || 20) * 1000,
  aiWindowMs: Number(process.env.AI_WINDOW_MINUTES || 60) * 60 * 1000,
  aiMaxPerUser: Number(process.env.AI_MAX_PER_USER || 20),
  aiGlobalMax: Number(process.env.AI_GLOBAL_MAX || 60),
  aiMaxQuestionChars: Number(process.env.AI_MAX_QUESTION_CHARS || 1200),
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 20000),
  aiMaxAnswerTokens: Number(process.env.AI_MAX_ANSWER_TOKENS || 4000),
  aiMaxAnswerChars: Number(process.env.AI_MAX_ANSWER_CHARS || 3000),
  aiPdfMaxPages: Number(process.env.AI_PDF_MAX_PAGES || 50),
  aiPdfMaxChars: Number(process.env.AI_PDF_MAX_CHARS || 12000),
  aiModelsCacheMs: Number(process.env.AI_MODELS_CACHE_MINUTES || 30) * 60 * 1000,
  aiContextMessages: Number(process.env.AI_CONTEXT_MESSAGES || 0),
  dbPath: resolveFromRoot(process.env.DB_PATH, './data/bot.db'),
  authDir: resolveFromRoot(process.env.AUTH_DIR, './data/auth'),
  qrPath: resolveFromRoot(process.env.QR_PATH, './data/qr.png'),
  backupDir: resolveFromRoot(process.env.BACKUP_DIR, './data/backups'),
  timezone: process.env.TZ || 'Asia/Jakarta',
  logLevel: process.env.LOG_LEVEL || 'info',
  retryLimit: Number(process.env.RETRY_LIMIT || 2),
  retryDelayMs: Number(process.env.RETRY_DELAY_MS || 1500),
  adminNumbers: (process.env.ADMIN_NUMBERS || '')
    .split(',')
    .map((s) => s.replace(/\D/g, ''))
    .filter(Boolean),
}

export function normalizeJid(jid) {
  if (!jid) return ''
  return String(jid).split(':')[0].split('@')[0].replace(/\D/g, '')
}
