import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { logger } from '../logger.js'

// Mencegah dua proses memakai database ATAU folder auth yang sama (dual socket).
// Kunci mencakup DB_PATH dan AUTH_DIR: dua proses dengan DB berbeda tetapi akun
// WhatsApp yang sama tetap diblokir, karena itu penyebab umum Bad MAC.
function alive(pid) {
  if (!pid || Number.isNaN(pid) || pid === process.pid) return false
  try { process.kill(pid, 0); return true } catch (err) { return err.code === 'EPERM' }
}

export function instanceKey(dbPath, authDir) {
  return crypto.createHash('sha256').update(`${dbPath}\n${authDir}`).digest('hex').slice(0, 12)
}

export function ensureSingleInstance() {
  if (process.env.ALLOW_MULTI_INSTANCE === '1') return null
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true })
  const hash = instanceKey(config.dbPath, config.authDir)
  const lockPath = path.join(config.root, 'data', `bot-${hash}.pid`)
  if (fs.existsSync(lockPath)) {
    const pid = Number(fs.readFileSync(lockPath, 'utf8').trim())
    if (alive(pid)) throw new Error(`Bot dengan database/sesi WhatsApp ini sudah berjalan (PID ${pid}). Hentikan instance tersebut atau set ALLOW_MULTI_INSTANCE=1.`)
  }
  fs.writeFileSync(lockPath, String(process.pid))
  const release = () => {
    try {
      if (fs.readFileSync(lockPath, 'utf8').trim() === String(process.pid)) fs.unlinkSync(lockPath)
    } catch { /* sudah dihapus */ }
  }
  process.once('exit', release)
  process.once('SIGINT', release)
  process.once('SIGTERM', release)
  logger.info(`Single-instance lock aktif: ${lockPath}`)
  return lockPath
}
