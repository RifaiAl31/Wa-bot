import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { testEnv } from './helpers.js'
import { setWaDownloader } from '../src/services/waMedia.js'
import { config } from '../src/config.js'

testEnv('ig')

const { handleIgCommand } = await import('../src/features/ig/index.js')

const png = await sharp({ create: { width: 60, height: 40, channels: 3, background: '#ff3366' } }).png().toBuffer()
setWaDownloader(async () => png)
test.after(() => setWaDownloader(null))

function makeSock() {
  const sent = []
  return { sent, isConnected: () => true,
    async sendMessage(jid, content, options) { sent.push({ jid, content, options }); return { key: { id: 'ig' } } } }
}
function ctx(sock, cmd, arg, { image = false, badMime = false } = {}) {
  const message = image
    ? { key: { id: 'ig1' }, message: { imageMessage: { mimetype: badMime ? 'application/pdf' : 'image/png', fileLength: png.length } } }
    : { key: { id: 'ig1' }, message: {} }
  return { sock, jid: '628222222222@g.us', adminJid: '628111111111@s.whatsapp.net',
    text: `${cmd} ${arg}`, arg, message, isGroup: true, bot: null }
}
function assertImage(sock) {
  const item = sock.sent.find((s) => s.content?.image)
  assert.ok(item, 'tidak ada gambar yang dikirim')
  assert.ok(Buffer.isBuffer(item.content.image))
  assert.equal(item.content.image.slice(1, 4).toString(), 'PNG')
  assert.match(item.content.caption, /MOCKUP \/ SIMULASI/)
  return item
}

test('.igqc menghasilkan comment card iOS', async () => {
  const sock = makeSock()
  const res = await handleIgCommand(ctx(sock, '.igqc', 'Jangan takut gagal | Rifai | ID | 999 | 0'), '.igqc', 'Jangan takut gagal | Rifai | ID | 999 | 0')
  assert.equal(res.ok, true)
  assertImage(sock)
})

test('.igpost dengan reply gambar menghasilkan mockup', async () => {
  const sock = makeSock()
  const arg = 'rifai.dev|1200|45|8'
  const res = await handleIgCommand(ctx(sock, '.igpost', arg, { image: true }), '.igpost', arg)
  assert.equal(res.ok, true)
  assertImage(sock)
})

test('.igstory dengan reply gambar menghasilkan mockup', async () => {
  const sock = makeSock()
  const arg = 'rifai.dev|Halo dari story|1200|30|2 jam'
  const res = await handleIgCommand(ctx(sock, '.igstory', arg, { image: true }), '.igstory', arg)
  assert.equal(res.ok, true)
  assertImage(sock)
})

test('.igprofile memvalidasi format dan menghasilkan mockup', async () => {
  const sock = makeSock()
  const bad = await handleIgCommand(ctx(sock, '.igprofile', 'rifai'), '.igprofile', 'rifai')
  assert.ok(bad?.messageId)
  const arg = 'rifai.dev|Pembuat bot WhatsApp|1200|85|42'
  const res = await handleIgCommand(ctx(sock, '.igprofile', arg), '.igprofile', arg)
  assert.equal(res.ok, true)
  assertImage(sock)
})

test('.igdm mockup lokal diberi label bukan Instagram asli', async () => {
  const sock = makeSock()
  const arg = 'teman.kayy|Halo mockup|Siap, simulasi lokal|09:41'
  const res = await handleIgCommand(ctx(sock, '.igdm', arg), '.igdm', arg)
  assert.equal(res.ok, true)
  assertImage(sock)
})

test('.ignote membatasi catatan 7 kata dan tetap menghasilkan gambar', async () => {
  const sock = makeSock()
  const tooLong = await handleIgCommand(ctx(sock, '.ignote', 'Rifai|satu dua tiga empat lima enam tujuh delapan|3m'), '.ignote', 'Rifai|satu dua tiga empat lima enam tujuh delapan|3m')
  assert.ok(tooLong?.messageId)
  const arg = 'Rifai|Aku ingin keduanya|3m'
  const res = await handleIgCommand(ctx(sock, '.ignote', arg), '.ignote', arg)
  assert.equal(res.ok, true)
  assertImage(sock)
})

test('media dengan MIME salah ditolak tanpa mengirim gambar', async () => {
  const sock = makeSock()
  await handleIgCommand(ctx(sock, '.igpost', 'rifai', { image: true, badMime: true }), '.igpost', 'rifai')
  assert.ok(sock.sent.some((s) => s.content?.text))
  assert.ok(!sock.sent.some((s) => s.content?.image))
})
