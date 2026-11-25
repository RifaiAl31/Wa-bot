import test from 'node:test'
import assert from 'node:assert/strict'
import { testEnv, ADMIN, GROUP } from './helpers.js'

testEnv('ngaji')
process.env.OPEN_ACCESS = 'false'
const { initDb, get, all } = await import('../src/db/index.js')
const { handleMessage } = await import('../src/commands/router.js')
const { groupService } = await import('../src/services/groups.js')
const ngaji = await import('../src/services/ngajiService.js')
const { processNgaji } = await import('../src/services/ngajiService.js')

initDb({ force: true })
groupService.upsert(GROUP, 'Grup Uji', 3)
groupService.setRegistered(GROUP, true)

const KEY = { id: 'NGAJI-1', remoteJid: GROUP, participant: ADMIN }
function makeSock() {
  const sent = []
  return {
    sent,
    isConnected: () => true,
    async sendMessage(jid, content) {
      sent.push({ jid, text: content.text })
      return { key: { id: `m${sent.length}` } }
    },
  }
}
function ctx(sock, text, admin = true) {
  return { sock, bot:null, jid:GROUP, adminJid:admin ? ADMIN : '628999999999@s.whatsapp.net',
    text, admin, isGroup:true, messageKey:KEY, message:{ key:KEY, message:{ conversation:text } } }
}
const texts = (sock) => sock.sent.map((s) => s.text).filter(Boolean)

const EXPECTED = [
  '*PENGUMUMAN*', '',
  '📌 *Pengajian Muda-Mudi*',
  '📅 : Sabtu 21 November 2026',
  '🕰️ : Bada 18.20 - selesai',
  '🕌 : Torikunnajjah',
  '👤 : Praremaja dan Remaja',
  '📗 : Makna Hadist', '',
  'Kerjakan karena Alloh semoga Alloh paring aman, selamat, lancar, sehat, kuat dan barokah.', '',
  'اَلْحَمْدُلِلّهِ جَزَاكُمُ اللّهُ خَيْرَا',
].join('\n')

test('template awal sesuai contoh dan tersimpan permanen', async () => {
  const sock = makeSock()
  await handleMessage(ctx(sock, '/template ngaji'))
  const out = texts(sock)[0]
  assert.match(out, /TEMPLATE PENGUMUMAN NGAJI/)
  assert.match(out, /Pengajian Muda-Mudi/)
  assert.match(out, /Torikunnajjah/)
  assert.match(out, /Makna Hadist/)
  assert.equal(ngaji.getTemplate().tanggal, 21)
  assert.equal(ngaji.getTemplate().tahun, 2026)
})

test('format pesan persis sesuai template', () => {
  assert.equal(ngaji.renderNgaji('2026-11-21'), EXPECTED)
})

test('/setngaji baru mengembalikan nilai awal', async () => {
  const sock = makeSock()
  await handleMessage(ctx(sock, '/setngaji baru'))
  assert.match(texts(sock)[0], /nilai awal|dikembalikan/i)
  assert.equal(ngaji.getTemplate().materi, 'Makna Hadist')
})

test('editngaji mengubah materi dan lokasi tanpa mengubah format', async () => {
  const a = makeSock()
  await handleMessage(ctx(a, '/editngaji'))
  assert.match(texts(a).at(-1), /9\. materi/i)
  await handleMessage(ctx(a, '9'))
  assert.match(texts(a).at(-1), /materi kegiatan/i)
  await handleMessage(ctx(a, 'Materi Uji'))
  assert.equal(ngaji.getTemplate().materi, 'Materi Uji')

  const b = makeSock()
  await handleMessage(ctx(b, '/editngaji'))
  await handleMessage(ctx(b, '7'))
  await handleMessage(ctx(b, 'Lokasi Uji'))
  assert.equal(ngaji.getTemplate().lokasi, 'Lokasi Uji')
  assert.match(ngaji.renderNgaji('2026-11-21'), /🕌 : Lokasi Uji/)
  assert.match(ngaji.renderNgaji('2026-11-21'), /📗 : Materi Uji/)
})

test('preview tidak mencatat pengiriman', async () => {
  const before = get('SELECT COUNT(*) n FROM ngaji_deliveries').n
  const sock = makeSock()
  await handleMessage(ctx(sock, '/previewngaji'))
  assert.match(texts(sock)[0], /PREVIEW — BELUM DIKIRIM/)
  assert.match(texts(sock)[0], /📅 : /)
  assert.equal(get('SELECT COUNT(*) n FROM ngaji_deliveries').n, before)
})

ngaji.saveTemplate({ materi: 'Makna Hadist', lokasi: 'Torikunnajjah' })
const FUTURE = ngaji.addDays(ngaji.jakartaDate(), 3)
const FUTURE2 = ngaji.addDays(FUTURE, 7)
ngaji.saveSchedule({ mode:'specific', weekday:ngaji.weekdayOf(FUTURE), anchor_date:FUTURE, event_time:'18:20', send_time:'19:00', send_lead_days:1, targets:[GROUP], is_active:false })

test('tanggal mingguan otomatis berganti minggu, bulan, dan tahun', () => {
  const s = { mode:'weekly', weekday:6, anchor_date:'2026-11-21' }
  assert.equal(ngaji.nextEventDate(s, '2026-11-20'), '2026-11-21')
  assert.equal(ngaji.nextEventDate(s, '2026-11-22'), '2026-11-28')
  assert.equal(ngaji.nextEventDate(s, '2026-12-31'), '2027-01-02')
  const p = ngaji.dateParts('2026-12-05')
  assert.deepEqual([p.hari, p.tanggal, p.bulan, p.tahun], ['Sabtu', 5, 'Desember', 2026])
})

test('pengiriman manual hanya setelah konfirmasi dan tidak dobel', async () => {
  const sock = makeSock()
  await handleMessage(ctx(sock, '/sendngaji'))
  assert.match(texts(sock)[0], /KONFIRMASI PENGIRIMAN NGAJI/)
  assert.equal(get("SELECT COUNT(*) n FROM ngaji_deliveries WHERE status='sent'").n, 0)
  await handleMessage(ctx(sock, '/ya'))
  assert.equal(get("SELECT COUNT(*) n FROM ngaji_deliveries WHERE status='sent'").n, 1)
  const delivered = texts(sock).filter((t) => t === ngaji.renderNgaji(FUTURE))
  assert.equal(delivered.length, 1)

  const again = makeSock()
  await handleMessage(ctx(again, '/sendngaji'))
  await handleMessage(ctx(again, '/ya'))
  assert.match(texts(again).at(-1), /sudah dikirim/)
  assert.equal(get("SELECT COUNT(*) n FROM ngaji_deliveries WHERE status='sent'").n, 1)
})

test('scheduler mengirim otomatis sehari sebelum kegiatan', async () => {
  ngaji.saveSchedule({ anchor_date:FUTURE2, weekday:ngaji.weekdayOf(FUTURE2), mode:'weekly', is_active:true })
  const sock = makeSock()
  const before = sock.sent.length
  const sendDate = ngaji.addDays(FUTURE2, -1)
  const result = await processNgaji(sock, { date:sendDate, time:'19:00' })
  assert.deepEqual(result, { processed:1, ok:true, error:null })
  assert.equal(sock.sent.length - before, 1)
  const second = await processNgaji(sock, { date:sendDate, time:'19:00' })
  assert.equal(second.ok, false)
  assert.equal(sock.sent.length - before, 1)
})

test('jadwal dan status otomatis bisa dilihat serta dinonaktifkan', async () => {
  const sock = makeSock()
  await handleMessage(ctx(sock, '/jadwalngaji'))
  assert.match(texts(sock)[0], /JADWAL PENGAJIAN/)
  assert.match(texts(sock)[0], new RegExp(FUTURE2))
  const off = makeSock()
  await handleMessage(ctx(off, '/nonaktifngaji'))
  assert.match(texts(off)[0], /dinonaktifkan/)
  assert.equal(ngaji.getSchedule().is_active, 0)
})

test('non-admin tidak bisa memakai command pengajian', async () => {
  const sock = makeSock()
  await handleMessage(ctx(sock, '/aturngaji', false))
  assert.match(texts(sock)[0], /hanya untuk admin terdaftar/i)
  assert.equal(ngaji.getSchedule().is_active, 0)
})
