import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { config } from '../config.js'

function safeName(name) {
  return /^[A-Za-z0-9._-]+$/.test(String(name || '')) && !name.includes('..')
}

export function backupNow({ config: withConfig = true } = {}) {
  const result = spawnSync(process.execPath, ['scripts/backup.js'], {
    cwd: config.root, encoding: 'utf8', timeout: 60_000,
  })
  if (result.status !== 0) throw new Error(result.stderr?.trim() || 'Backup database gagal.')
  const match = (result.stdout + result.stderr).match(/Backup dibuat:\s*(\S+)/)
  const dbPath = match ? match[1] : null
  let configPath = null
  if (withConfig && fs.existsSync(config.envFile || path.join(config.root, '.env'))) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    configPath = path.join(config.backupDir, `config-${stamp}.env`)
    fs.mkdirSync(config.backupDir, { recursive: true })
    fs.copyFileSync(path.join(config.root, '.env'), configPath, fs.constants.COPYFILE_EXCL)
    fs.chmodSync(configPath, 0o600)
  }
  return { dbPath, configPath }
}

export function listBackups() {
  try {
    return fs.readdirSync(config.backupDir)
      .filter((f) => /^(bot|config)-.+\.(db|env)$/.test(f))
      .map((name) => {
        const stat = fs.statSync(path.join(config.backupDir, name))
        return { name, bytes: stat.size, createdAt: stat.mtime.toISOString() }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50)
  } catch { return [] }
}

export function restoreBackup(name) {
  if (!safeName(name)) throw new Error('Nama backup tidak valid.')
  const source = path.join(config.backupDir, name)
  if (!fs.existsSync(source)) throw new Error('Backup tidak ditemukan.')
  if (!name.endsWith('.db')) throw new Error('Restore kini hanya mendukung backup database (.db).')
  return source
}
