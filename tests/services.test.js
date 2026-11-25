import test from 'node:test'
import assert from 'node:assert/strict'
import { testEnv, GROUP } from './helpers.js'

testEnv('services')
const { initDb, getDb, all, get } = await import('../src/db/index.js')
const { isAdmin, addAdmin } = await import('../src/services/adminAuth.js')
const { groupService } = await import('../src/services/groups.js')
const ann = await import('../src/services/announcements.js')
const { editService } = await import('../src/services/editService.js')
const { nthWeekday, jakartaNow } = await import('../src/services/scheduler.js')

initDb({ force: true })

test('skema lengkap dan admin tervalidasi', () => {
  const tables = getDb().prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name)
  for (const t of ['admins', 'announcements', 'schedules', 'whatsapp_groups', 'announcement_targets', 'edit_sessions', 'delivery_logs', 'activity_logs', 'bot_settings', 'id_counters', 'schedule_runs']) {
    assert.ok(tables.includes(t), `tabel ${t} harus ada`)
  }
  assert.equal(isAdmin('628111111111@s.whatsapp.net'), true)
  assert.equal(isAdmin('628999999999@s.whatsapp.net'), false)
  addAdmin('628999999999')
  assert.equal(isAdmin('628999999999@s.whatsapp.net'), true)
})

test('nth weekday = kemunculan ke-N dalam bulan, bukan rentang tanggal', () => {
  // 1 Maret 2024 = Jumat. Jumat kedua = 8 Maret, bukan tanggal 8-14 secara kebetulan.
  assert.equal(nthWeekday(2024, 3, 5, 1), 1)
  assert.equal(nthWeekday(2024, 3, 5, 2), 8)
  // Februari 2021 hanya memiliki 4 hari Minggu -> minggu ke-5 tidak ada.
  assert.equal(nthWeekday(2021, 2, 0, 5), null)
  const now = jakartaNow(new Date('2026-11-24T17:30:00Z'))
  assert.equal(now.date, '2026-11-25')
  assert.equal(now.time, '00:30')
})

test('create announcement transaksional dengan ID otomatis dan target grup', () => {
  groupService.upsert(GROUP, 'Grup Uji', 3)
  const body = 'Assalamu\'alaikum.\n\nBaris dua.\nTerima kasih.'
  const id = ann.createAnnouncement({ title: 'Kerja Bakti', body, weekday: 0, week: 3, time: '07:00', targets: [GROUP], category: 'Kegiatan' }, '628111111111@s.whatsapp.net', GROUP)
  assert.equal(id, 'A1')
  const row = ann.getAnnouncement(id)
  assert.equal(row.body, body, 'isi pesan tidak boleh diubah')
  assert.equal(ann.getSchedule(id).week_of_month, 3)
  assert.deepEqual(ann.getTargets(id).map((g) => g.jid), [GROUP])
  const id2 = ann.createAnnouncement({ title: 'Rapat', body: 'Isi rapat', weekday: 5, week: 0, time: '19:00', targets: [GROUP] })
  assert.equal(id2, 'A2')
})

test('two-phase edit: draft tidak menyentuh data utama sampai commit', () => {
  const admin = '628111111111@s.whatsapp.net'
  assert.equal(editService.get(admin), null)
  editService.start(admin, 'A1')
  editService.patch(admin, { title: 'Judul Diubah', targets: [] })
  assert.equal(ann.getAnnouncement('A1').title, 'Kerja Bakti', 'data utama belum berubah')
  const diff = editService.diff(admin)
  assert.equal(diff.changes.length, 2)
  editService.commit(admin)
  assert.equal(ann.getAnnouncement('A1').title, 'Judul Diubah')
  assert.deepEqual(ann.getTargets('A1'), [])
  assert.equal(editService.get(admin), null)
  assert.ok(get("SELECT * FROM activity_logs WHERE action='edit_commit'"))
})

test('batal edit membuang draf', () => {
  const admin = '628111111111@s.whatsapp.net'
  editService.start(admin, 'A1')
  editService.patch(admin, { title: 'Tidak Jadi' })
  editService.cancel(admin)
  assert.equal(editService.get(admin), null)
  assert.equal(ann.getAnnouncement('A1').title, 'Judul Diubah')
})

test('klaim jadwal hanya satu kali', () => {
  const insert = () => getDb().prepare(`INSERT OR IGNORE INTO schedule_runs(announcement_id, run_date, run_time, status, created_at) VALUES (?,?,?,'claimed',?)`).run('A1', '2026-11-25', '07:00', new Date().toISOString())
  assert.equal(insert().changes, 1)
  assert.equal(insert().changes, 0)
  assert.equal(all('SELECT * FROM schedule_runs').length, 1)
})

test('nonaktifkan dan detail ID tidak ditemukan', () => {
  ann.setActive('A1', false)
  assert.equal(ann.getAnnouncement('A1').is_active, 0)
  assert.equal(ann.getAnnouncement('A999'), undefined)
})