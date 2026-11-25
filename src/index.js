import { initDb, closeDb } from './db/index.js'
import { migrateAnnouncementIds } from './db/migrateIds.js'
import { config } from './config.js'
import { logger } from './logger.js'
import { bootstrapAdmins } from './services/adminAuth.js'
import * as vipSession from './services/vipSession.js'
import { handleMessage } from './commands/router.js'
import { WhatsAppBot } from './whatsapp/connection.js'
import { Scheduler } from './services/scheduler.js'
import { createApp } from './api/routes.js'

// libsignal (dependensi Baileys) mencetak "Closing session: SessionEntry {...}"
// lewat console.info. Ini normal, bukan error — diamkan agar log bot tetap bersih.
const originalConsoleInfo = console.info.bind(console)
console.info = (...args) => {
  if (typeof args[0] === 'string' && args[0].startsWith('Closing session:')) return
  originalConsoleInfo(...args)
}

initDb()
try {
  const result = migrateAnnouncementIds()
  if (result.migrated) logger.info(`ID lama dimigrasikan ke format baru (${result.migrated} pengumuman).`)
} catch (err) { logger.error('Migrasi ID gagal:', err.message) }
bootstrapAdmins()
setInterval(() => vipSession.cleanup(), Math.min(config.vipSessionTtlMs, 60_000)).unref()

export const bot = new WhatsAppBot({ onMessage: (ctx) => handleMessage(ctx) })
export const scheduler = new Scheduler(() => bot.sock)

const app = createApp({ bot, scheduler })
const server = app.listen(config.port, () => {
  logger.info(`Dashboard/API siap di http://localhost:${config.port}`)
  logger.info(`Admin terdaftar dari ADMIN_NUMBERS: ${config.adminNumbers.length} nomor`)
})

if (process.env.SKIP_WHATSAPP === '1') {
  logger.warn('SKIP_WHATSAPP=1 — koneksi WhatsApp dan scheduler dinonaktifkan (mode verifikasi web).')
} else {
  scheduler.start()
  bot.start().catch((err) => logger.error('Gagal memulai WhatsApp:', err.message))
}

function shutdown(signal) {
  logger.info(`${signal} diterima. Menghentikan scheduler dan server...`)
  scheduler.stop()
  server.close(() => { closeDb(); process.exit(0) })
  setTimeout(() => { closeDb(); process.exit(0) }, 3000).unref()
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('unhandledRejection', (err) => logger.error('Unhandled rejection:', err?.message || err))
