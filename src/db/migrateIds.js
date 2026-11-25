import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { logger } from '../logger.js'
import { getDb } from './index.js'

const CHILD_TABLES = ['schedules', 'announcement_targets', 'delivery_logs', 'schedule_runs', 'edit_sessions']

// Migrasi ID ANN-001 -> A1 tanpa menghapus data. Backup dibuat sebelum perubahan.
export function migrateAnnouncementIds({ makeBackup = true } = {}) {
  const db = getDb()
  const oldRows = db.prepare("SELECT id FROM announcements WHERE UPPER(id) LIKE 'ANN-%' ORDER BY id").all()
  if (!oldRows.length) return { migrated: 0 }

  let backup = null
  if (makeBackup) {
    fs.mkdirSync(config.backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    backup = path.join(config.backupDir, `before-id-migration-${stamp}.db`)
    db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`)
    logger.info(`Backup sebelum migrasi ID: ${backup}`)
  }

  const used = new Set(db.prepare('SELECT id FROM announcements').all().map((r) => r.id))
  let maxUsed = Math.max(0, ...[...used].map((id) => Number(String(id).replace(/^A/i, '')) || 0))
  const mapping = []
  for (const row of oldRows) {
    const num = Number(String(row.id).replace(/\D/g, '')) || 1
    let next = `A${num}`
    if (used.has(next)) { maxUsed += 1; next = `A${maxUsed}` }
    used.add(next)
    maxUsed = Math.max(maxUsed, num)
    mapping.push([row.id, next])
  }

  db.pragma('foreign_keys = OFF')
  try {
    db.transaction(() => {
      for (const [oldId, newId] of mapping) {
        db.prepare('UPDATE announcements SET id = ? WHERE id = ?').run(newId, oldId)
        for (const table of CHILD_TABLES) {
          db.prepare(`UPDATE ${table} SET announcement_id = ? WHERE announcement_id = ?`).run(newId, oldId)
        }
        db.prepare('UPDATE activity_logs SET detail = REPLACE(detail, ?, ?) WHERE detail LIKE ?')
          .run(oldId, newId, `%${oldId}%`)
      }
      db.prepare(`INSERT INTO id_counters(category, next_value) VALUES ('announcement', ?)
                  ON CONFLICT(category) DO UPDATE SET next_value=MAX(next_value, excluded.next_value)`)
        .run(maxUsed + 1)
    })()
  } finally {
    db.pragma('foreign_keys = ON')
  }

  const problems = db.pragma('foreign_key_check')
  if (problems.length) throw new Error(`Migrasi ID gagal, foreign key rusak: ${JSON.stringify(problems)}`)
  logger.info(`Migrasi ID selesai: ${mapping.length} pengumuman`)
  return { migrated: mapping.length, backup, mapping }
}
