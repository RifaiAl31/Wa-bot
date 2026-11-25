import { logger } from '../logger.js'
import { rememberMessageId } from '../whatsapp/sentCache.js'

export const REACTION_PENDING = '⏳'
export const REACTION_SUCCESS = '✅'
export const REACTION_FAILED = '❌'

// Target reaction adalah pesan perintah admin, bukan pesan baru dari bot.
export function commandKey(ctx) {
  return ctx?.messageKey || ctx?.message?.key || null
}

// Reaction gagal tidak boleh menghentikan proses utama.
export async function sendReaction(ctx, text) {
  const key = commandKey(ctx)
  if (!text || !key || !ctx?.sock) return false
  try {
    const result = await ctx.sock.sendMessage(ctx.jid, { react: { text, key } })
    rememberMessageId(result?.key?.id)
    return true
  } catch (err) {
    logger.warn(`Gagal mengirim reaction ${text}: ${err.message}`)
    return false
  }
}

function isFailure(result) {
  if (result === false || result === null || result === undefined) return true
  if (typeof result !== 'object') return false
  if (result.error) return true
  if (result.allOk !== undefined) return !result.allOk
  return result.ok === false
}

// Bungkus proses panjang: ⏳ saat mulai, ✅/❌ pada key pesan yang sama.
// Baileys mengganti reaction lama ketika react baru dikirim ke key yang sama.
export async function withReaction(ctx, task) {
  if (!commandKey(ctx)) return task()
  await sendReaction(ctx, REACTION_PENDING)
  let result
  try {
    result = await task()
  } catch (err) {
    await sendReaction(ctx, REACTION_FAILED)
    throw err
  }
  await sendReaction(ctx, isFailure(result) ? REACTION_FAILED : REACTION_SUCCESS)
  return result
}
