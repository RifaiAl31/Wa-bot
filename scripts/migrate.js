// Migrasi inkremental. Saat ini hanya menjalankan schema (CREATE TABLE IF NOT EXISTS)
// sehingga aman dijalankan berulang kali pada database yang sudah ada.
import { initDb, getDb, closeDb, getSetting, setSetting } from '../src/db/index.js'
import { migrateAnnouncementIds } from '../src/db/migrateIds.js'

initDb()
const idMigration = migrateAnnouncementIds()
console.log('Migrasi ID pengumuman:', idMigration.migrated ? `${idMigration.migrated} diubah` : 'sudah format A1, A2, ...')
if (idMigration.backup) console.log('Backup:', idMigration.backup)
const VERSION = '1'
const current = getSetting('schema_version', '0')

if (current === VERSION) {
  console.log(`Database sudah pada versi ${VERSION}. Tidak ada migrasi.`)
} else {
  // Tambahan migrasi masa depan masuk di sini, satu blok per versi.
  setSetting('schema_version', VERSION)
  console.log(`Migrasi ${current} -> ${VERSION} selesai.`)
}

const db = getDb()
const check = db.pragma('foreign_key_check')
console.log('Foreign key check:', check.length ? check : 'OK')
closeDb()
