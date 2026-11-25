import { config, normalizeJid } from '../config.js'
import { logger } from '../logger.js'

// Baileys dapat mengirim update.messages.upsert yang sama lebih dari sekali
// (notify + history) atau dari socket lama setelah reconnect. Dedup by message ID.
const seen = new Map()

function keyOf(msg) {
  const key = msg?.key
  if (!key?.id) return null
  const jid = key.remoteJid || ''
  const sender = key.participant || jid
  return `${normalizeJid(jid)}|${normalizeJid(sender)}|${key.id}|${key.fromMe ? 'me' : 'in'}`
}

export function shouldProcessMessage(msg) {
  const key = keyOf(msg)
  if (!key) return true
  const now = Date.now()
  const previous = seen.get(key)
  if (previous && now - previous < config.messageDedupeTtlMs) {
    logger.info(`Duplicate message ignored: ${key}`)
    return false
  }
  seen.set(key, now)
  if (seen.size > 10_000) {
    for (const [k, at] of seen) {
      if (now - at >= config.messageDedupeTtlMs) seen.delete(k)
    }
  }
  logger.info(`Message received: ${key}`)
  return true
}

export function clearDedupe() { seen.clear() }
