import fs from 'node:fs'
import path from 'node:path'
import { config } from '../src/config.js'
import { initDb, getDb, closeDb } from '../src/db/index.js'

initDb()
fs.mkdirSync(config.backupDir, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const target = path.join(config.backupDir, `bot-${stamp}.db`)
getDb().exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
console.log('Backup dibuat:', target, `(${(fs.statSync(target).size / 1024).toFixed(1)} KB)`)
closeDb()
