import { initDb, closeDb } from '../src/db/index.js'
import { addAdmin, listAdmins } from '../src/services/adminAuth.js'

const number = process.argv[2]
initDb()
if (!number) {
  console.log('Penggunaan: node scripts/add-admin.js 6281234567890 [Nama]')
  console.log('\nAdmin saat ini:')
  console.table(listAdmins())
} else {
  const saved = addAdmin(number, process.argv[3] || null)
  console.log(`Admin ${saved} berhasil didaftarkan/diaktifkan.`)
  console.table(listAdmins())
}
closeDb()
