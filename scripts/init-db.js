import { initDb, closeDb, getDb } from '../src/db/index.js'
import { config } from '../src/config.js'

initDb()
const db = getDb()
console.log('Tabel:', db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name).join(', '))
console.log('Admin terdaftar:', db.prepare('SELECT COUNT(*) AS n FROM admins').get().n)
console.log('Database:', config.dbPath)
closeDb()
