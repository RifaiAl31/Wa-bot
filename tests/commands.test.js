import test from 'node:test'
import assert from 'node:assert/strict'
import { testEnv, fakeSock, ADMIN, GROUP, ctxFor } from './helpers.js'

testEnv('commands')
const { initDb, get } = await import('../src/db/index.js')
const { groupService } = await import('../src/services/groups.js')
const { getAnnouncement, getTargets } = await import('../src/services/announcements.js')
const { editService } = await import('../src/services/editService.js')
const { handleMessage } = await import('../src/commands/router.js')

initDb({ force: true })
groupService.upsert(GROUP, 'Grup Uji', 3)

const sock = fakeSock()
async function send(text, opts = {}) {
  const before = sock.sent.length
  await handleMessage(ctxFor(sock, text, opts.adminJid || ADMIN, opts.admin !== false, opts.jid || GROUP))
  return sock.sent.slice(before).map((s) => s.text).join('\n')
}

test('alur /set lengkap sampai tersimpan dengan isi pesan utuh', async () => {
  const body = 'Assalamu\'alaikum Wr. Wb.\n\nDiberitahukan kerja bakti.\nHari: Minggu\n\nTerima kasih.'
  await send('/set')
  await send('Pengumuman Kerja Bakti')
  await send(body)
  await send('0') // Minggu
  await send('3') // minggu ketiga
  await send('07.00')
  const preview = await send('1')
  assert.match(preview, /PRIVIEW PENGUMUMAN/)
  assert.match(preview, /Grup Uji/)
  const saved = await send('/ya')
  assert.match(saved, /A1/)
  assert.equal(getAnnouncement('A1').body, body)
  assert.deepEqual(getTargets('A1').map((g) => g.jid), [GROUP])
})

test('/edit → /update → /ya hanya menyimpan setelah konfirmasi', async () => {
  await send('/edit A1')
  await send('1')
  await send('Judul Revisi')
  assert.equal(getAnnouncement('A1').title, 'Pengumuman Kerja Bakti')
  const diff = await send('/update')
  assert.match(diff, /RINGKASAN PERUBAHAN/)
  assert.match(diff, /Judul Revisi/)
  assert.equal(getAnnouncement('A1').title, 'Pengumuman Kerja Bakti')
  const done = await send('/ya')
  assert.match(done, /berhasil disimpan/)
  assert.equal(getAnnouncement('A1').title, 'Judul Revisi')
  assert.equal(editService.get(ADMIN), null)
})

test('/batal membuang sesi edit', async () => {
  await send('/edit A1')
  await send('2')
  await send('Isi baru yang dibatalkan')
  await send('/batal')
  assert.equal(getAnnouncement('A1').body.startsWith('Assalamu'), true)
  assert.equal(editService.get(ADMIN), null)
})

test('/update tanpa sesi ditolak', async () => {
  const out = await send('/update')
  assert.match(out, /ditolak/)
})

test('daftar grup hanya untuk admin', async () => {
  const out = await send('/grup', { adminJid: '628999999999@s.whatsapp.net', admin: false })
  assert.match(out, /hanya dapat dilihat admin terdaftar/)
  assert.equal(get("SELECT * FROM activity_logs WHERE action='unauthorized_command'") !== undefined, true)
})

const { config } = await import('../src/config.js')

test('anggota biasa boleh memakai perintah selain daftar grup', async () => {
  config.openAccess = true
  try {
    const out = await send('/list', { adminJid: '628999999999@s.whatsapp.net', admin: false })
    assert.doesNotMatch(out, /hanya untuk admin terdaftar/)
    assert.match(out, /A1/)
  } finally {
    config.openAccess = false
  }
})

let quickId = null
test('/set <teks> langsung menyimpan isi utuh dan /list menampilkan kode + isi', async () => {
  const body = '*PENGUMUMAN*\n\n📌 *Pengajian Muda-Mudi*\n📅 : sabtu 21 November 2026\n🕌 : Torikunnajjah'
  const out = await send(`/set ${body}`)
  assert.match(out, /PENGUMUMAN TERSIMPAN \(mode cepat\)/)
  quickId = /A\d+/.exec(out)?.[0]
  assert.ok(quickId)
  const row = getAnnouncement(quickId)
  assert.equal(row.body, body)
  assert.equal(row.is_active, 0)
  assert.deepEqual(getTargets(quickId).map((g) => g.jid), [GROUP])

  const list = await send('/list')
  assert.match(list, new RegExp(quickId))
  assert.match(list, /Pengajian Muda-Mudi/)
  assert.match(list, /Isi pesan:/)
})

test('/send Ax mengirim manual isi pesan apa adanya', async () => {
  const short = quickId
  const out = await send(`/send ${short}`)
  assert.doesNotMatch(out, /HASIL PENGIRIMAN|Mengirim /, 'status hanya reaction, bukan pesan')
  const body = getAnnouncement(quickId).body
  assert.equal(sock.sent.some((s) => s.jid === GROUP && s.text === body), true)
})

test('perintah lain: list, search, aktifkan, hapus dengan konfirmasi', async () => {
  assert.match(await send('/list'), /A1/)
  assert.match(await send('/search kerja'), /A1/)
  assert.match(await send('/nonaktifkan A1'), /NONAKTIF/)
  assert.match(await send('/aktifkan A1'), /AKTIF/)
  assert.match(await send('/hapus A1'), /YAKIN MENGHAPUS/)
  await send('/ya')
  assert.equal(getAnnouncement('A1'), undefined)
})