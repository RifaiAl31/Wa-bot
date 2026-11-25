import { get, run } from '../db/index.js'
import { config } from '../config.js'
import { isRegisteredAdmin } from '../services/adminAuth.js'

export const LIMIT_MESSAGE = 'Maaf, batas penggunaan AI sementara sudah tercapai. Silakan coba lagi nanti.'

export function checkLimits(userJid, groupJid) {
  const hasKey = config.aiProvider === 'gemini' ? config.geminiApiKey : config.openRouterApiKey
  if (!hasKey) {
    return { ok: false, reason: 'Fitur AI belum dikonfigurasi. Isi OPENROUTER_API_KEY atau GEMINI_API_KEY di .env lalu restart bot.', kind: 'config' }
  }
  // Admin terdaftar bebas kuota dan cooldown. User/VIP tetap mengikuti batas.
  if (isRegisteredAdmin(userJid)) return { ok: true, windowStart: Date.now(), unlimited: true }

  const now = Date.now()
  const row = get('SELECT * FROM ai_user_limits WHERE user_jid = ?', userJid || '')
  if (row && now - row.last_request_ms < config.aiCooldownMs) {
    const seconds = Math.ceil((config.aiCooldownMs - (now - row.last_request_ms)) / 1000)
    return { ok: false, reason: `Tunggu ${seconds} detik sebelum bertanya lagi.`, kind: 'cooldown' }
  }
  const windowExpired = !row || now - row.window_start_ms >= config.aiWindowMs
  const windowStart = windowExpired ? now : row.window_start_ms
  const count = windowExpired ? 0 : row.count
  if (count >= config.aiMaxPerUser) return { ok: false, reason: LIMIT_MESSAGE, kind: 'user' }

  const globalCount = get('SELECT COUNT(*) n FROM ai_usage_logs WHERE created_at >= ?',
    new Date(now - config.aiWindowMs).toISOString()).n
  if (globalCount >= config.aiGlobalMax) return { ok: false, reason: LIMIT_MESSAGE, kind: 'global' }
  return { ok: true, windowStart }
}

export function recordUsage({ userJid, groupJid, command, modelId, status, reason, promptChars = 0, responseChars = 0, windowStart }) {
  run(`INSERT INTO ai_usage_logs(user_jid, group_jid, command, model_id, status, reason, prompt_chars, response_chars, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    userJid || null, groupJid || null, command || '/ask', modelId || null, status,
    reason || null, promptChars, responseChars, new Date().toISOString())
  if (status === 'success' || status === 'failed') {
    run(`INSERT INTO ai_user_limits(user_jid, group_jid, window_start_ms, count, last_request_ms)
         VALUES (?,?,?,1,?)
         ON CONFLICT(user_jid) DO UPDATE SET
           group_jid=excluded.group_jid,
           window_start_ms=CASE WHEN ai_user_limits.window_start_ms <> excluded.window_start_ms
                                THEN excluded.window_start_ms ELSE ai_user_limits.window_start_ms END,
           count=CASE WHEN ai_user_limits.window_start_ms <> excluded.window_start_ms
                      THEN 1 ELSE ai_user_limits.count+1 END,
           last_request_ms=excluded.last_request_ms`,
      userJid || '', groupJid || null, windowStart || Date.now(), Date.now())
  }
}
