import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { testEnv, ADMIN, GROUP } from './helpers.js'

process.env.DOWNLOADER_ENABLED = 'true'
process.env.WEATHER_BASE_URL = 'http://127.0.0.1:1/forecast'
testEnv('new-features')
const { initDb } = await import('../src/db/index.js')
const { groupService } = await import('../src/services/groups.js')
const { handleMessage } = await import('../src/commands/router.js')
const { validatePublicUrl, resolvePublicUrl, setDnsResolver } = await import('../src/downloaders/safeUrl.js')
const { setDownloaderExtractor } = await import('../src/downloaders/index.js')
const { registerVip, isVip, setVipExpiry, removeVip } = await import('../src/services/vipService.js')

initDb({ force: true })
groupService.upsert(GROUP, 'Grup Uji', 3)
const NO_ACCESS = '628999999999@g.us'
const USER = '628777000111@s.whatsapp.net'

function makeSock() {
  const sent = []
  return {
    sent, isConnected: () => true,
    async sendMessage(jid, content) {
      sent.push({ jid, content })
      return { key: { id: `m${sent.length}` } }
    },
  }
}
function ctx(sock, text, opts = {}) {
  const user = opts.user || ADMIN
  return {
    sock, bot: opts.bot || { status: () => ({ connected: true }) },
    jid: opts.jid || GROUP, adminJid: user, text, admin: opts.admin !== false,
    isGroup: opts.isGroup !== false, isRegisteredAdmin: opts.isRegisteredAdmin !== false,
    messageKey: { id:'NF-1', remoteJid: opts.jid || GROUP, participant: user },
    message: { key: { id:'NF-1', remoteJid: opts.jid || GROUP, participant: user }, message: opts.message || { conversation: text } },
  }
}
const texts = (sock) => sock.sent.map((s) => s.content.text).filter(Boolean)

test('grup tanpa izin tidak mendapat respons apa pun', async () => {
  const sock = makeSock()
  await handleMessage(ctx(sock, '/menu', { jid: NO_ACCESS }))
  assert.equal(sock.sent.length, 0)
})

test('.user menampilkan role dari JID, bukan nama kontak', async () => {
  const admin = makeSock()
  await handleMessage(ctx(admin, '.user'))
  assert.match(texts(admin)[0], /Role: ADMIN/)
  const user = makeSock()
  await handleMessage(ctx(user, '.user', { user: USER, isRegisteredAdmin: false }))
  assert.match(texts(user)[0], /Role: USER/)
})

test('.rvo menolak view-once dan memberi petunjuk tanpa media', async () => {
  const once = makeSock()
  await handleMessage(ctx(once, '.rvo', { message: { viewOnceMessage: { message: { imageMessage: {} } } } }))
  assert.match(texts(once)[0], /tidak memproses foto sekali lihat/i)
  const plain = makeSock()
  await handleMessage(ctx(plain, '.rvo'))
  assert.match(texts(plain)[0], /Kirim foto biasa dengan caption/i)
})

test('safeUrl menolak IP privat dan domain lain', () => {
  assert.throws(() => validatePublicUrl('http://127.0.0.1/x', 'tiktok'), /https/)
  assert.throws(() => validatePublicUrl('https://localhost/x', 'tiktok'), /privat/)
  assert.throws(() => validatePublicUrl('https://example.com/x', 'tiktok'), /domain/)
  assert.equal(validatePublicUrl('https://www.tiktok.com/@user/video/123', 'tiktok').hostname, 'www.tiktok.com')
})

test('resolver DNS menolak domain publik yang mengarah ke IP privat', async () => {
  await assert.rejects(
    resolvePublicUrl('https://www.tiktok.com/@user/video/123', 'tiktok', async () => [{ address:'127.0.0.1' }]),
    /privat/,
  )
  setDnsResolver(async () => [{ address:'13.224.0.1' }])
  const ok = await resolvePublicUrl('https://www.tiktok.com/@user/video/123', 'tiktok')
  assert.equal(ok.hostname, 'www.tiktok.com')
})

test('downloader mengirim file dan success box, watermark asli tidak dihapus', async () => {
  const file = path.join(testEnvDir, 'video.mp4')
  await fs.writeFile(file, Buffer.from('fake-video'))
  setDownloaderExtractor({ name:'fake', available:() => true, async download() { return { file, bytes:10, ext:'.mp4' } } })
  const sock = makeSock()
  await handleMessage(ctx(sock, '.tiktok https://www.tiktok.com/@user/video/123'))
  assert.ok(sock.sent.some((s) => s.content.video))
  assert.ok(texts(sock).some((t) => /DOWNLOAD SUCCESS/.test(t) && /Platform: TikTok/.test(t)))
  const last = texts(sock).at(-1)
  assert.match(last, /atribusi|watermark/i)
})

test('downloader tidak tersedia untuk USER biasa', async () => {
  const sock = makeSock()
  await handleMessage(ctx(sock, '.instagram https://www.instagram.com/p/abc/', { user: USER, isRegisteredAdmin: false }))
  assert.match(texts(sock)[0], /tidak tersedia/i)
})

test('masa aktif VIP tersimpan dan kedaluwarsa otomatis', () => {
  const number = '628555000222'
  registerVip(number, 'test', new Date(Date.now() + 3600_000).toISOString())
  assert.equal(isVip(number), true)
  const expiry = setVipExpiry(number, new Date(Date.now() - 1000).toISOString())
  assert.ok(expiry)
  assert.equal(isVip(number), false)
  removeVip(number)
})

// path unik untuk file uji downloader
const testEnvDir = path.dirname(process.env.DB_PATH || '/tmp/x')
