import { initDb, closeDb } from '../src/db/index.js'
import { setAdminPassword, managementConfigured } from '../src/api/auth.js'

initDb()
const value = process.env.ADMIN_PASSWORD || (process.env.PASSWORD_FILE
  ? (await import('node:fs')).readFileSync(process.env.PASSWORD_FILE, 'utf8').trim()
  : '')

if (!value) {
  console.error('Isi ADMIN_PASSWORD di environment atau PASSWORD_FILE=/path/ke/file. Password tidak boleh ditaruh di source.')
  process.exit(1)
}

setAdminPassword(value)
console.log(`Password management tersimpan sebagai hash: ${managementConfigured() ? 'ya' : 'tidak'}`)
closeDb()
