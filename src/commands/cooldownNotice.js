import { config } from '../config.js'
import { logger } from '../logger.js'

// Satu notifikasi cooldown per pengguna per fitur dalam satu jendela.
// Mencegah pesan "Tunggu X detik" berulang bila pesan masuk dobel.
const lastNotice = new Map()

export function shouldNotifyCooldown(jid, feature, suppressMs = config.cooldownNoticeMs) {
  const key = `${jid || ''}|${feature || 'ai'}`
  const now = Date.now()
  const previous = lastNotice.get(key) || 0
  if (now - previous < suppressMs) return false
  lastNotice.set(key, now)
  logger.info(`Cooldown triggered: ${key}`)
  if (lastNotice.size > 5000) {
    for (const [k, at] of lastNotice) if (now - at >= suppressMs) lastNotice.delete(k)
  }
  return true
}

export function clearCooldownNotices() { lastNotice.clear() }
