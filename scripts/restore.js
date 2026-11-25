import fs from 'node:fs'
import { initDb, closeDb } from '../src/db/index.js'
import { restoreBackup } from '../src/system/backupService.js'
import { stopBot, startBot } from '../src/system/processManager.js'
import { logger } from '../src/logger.js'

const name = process.argv[2]
if (!name) { console.error('Usage: node scripts/restore.js <nama-backup.db>'); process.exit(1) }

let source
try { source = restoreBackup(name) } catch (err) { console.error(err.message); process.exit(1) }

initDb()
stopBot()
closeDb()
fs.copyFileSync(source, process.env.DB_PATH || 'data/bot.db')
logger.info(`Database dipulihkan dari ${name}. WhatsApp session sengaja tidak diubah.`)
const started = startBot()
console.log(`Restore selesai. Bot start: ${JSON.stringify(started)}`)
process.exit(0)
