import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { testEnv, ADMIN, GROUP } from './helpers.js'

process.env.OPEN_ACCESS = 'false' // aturan baru diuji walau mode tertutup
process.env.WEATHER_BASE_URL = 'http://127.0.0.1:1/forecast'
testEnv('menu')
const { groupService } = await import('../src/services/groups.js')
const { initDb, all, get } = await import('../src/db/index.js')
const { handleMessage, FLOW_COMMANDS } = await import('../src/commands/router.js')
const { buildPersonalMenu } = await import('../src/commands/menu.js')
const { ALL_COMMANDS, RESTRICTED_COMMANDS } = await import('../src/commands/registry.js')

initDb({ force: true })
groupService.upsert(GROUP, 'Grup Uji', 3)

const KEY = { id: 'MENU-1', remoteJid: GROUP, participant: ADMIN }
function makeSock() {
  const sent = []
  return {
    sent,
    isConnected: () => true,
    async sendMessage(jid, content) {
      sent.push({ jid, content })
      return { key: { id: `m${sent.length}` } }
    },
  }
}
const ctx = (sock, text, admin = true) => ({
  sock, bot:null, jid:GROUP, adminJid:admin ? ADMIN : '628999999999@s.whatsapp.net',
  text, admin, isGroup:true, messageKey:KEY, message:{ key:KEY },
})
const texts = (sock) => sock.sent.filter(s => s.content.text).map(s => s.content.text)
const images = (sock) => sock.sent.filter(s => Buffer.isBuffer(s.content.image))

test('setiap perintah di /menu benar-benar diimplementasikan', () => {
  const src = fs.readFileSync(path.resolve('src/commands/router.js'), 'utf8')
  for (const cmd of ALL_COMMANDS) {
    const implemented = src.includes(`case '${cmd}':`) || FLOW_COMMANDS.has(cmd)
    assert.ok(implemented, `${cmd} terdaftar di menu tetapi tidak diimplementasikan`)
  }
  assert.deepEqual(RESTRICTED_COMMANDS, [
    '/grup', '/grupaktif', '/template', '/setngaji', '/editngaji', '/previewngaji',
    '/sendngaji', '/jadwalngaji', '/aturngaji', '/aktifngaji', '/nonaktifngaji',
  ])
})

test('/menu admin: kartu ringkasan diikuti daftar command lengkap', async () => {
  const sock = makeSock()
  const menu = await buildPersonalMenu(ctx(sock, '/menu', true))
  await handleMessage(ctx(sock, '/menu', true))
  assert.equal(sock.sent.length, 2, 'kartu visual lalu daftar command')
  assert.equal(images(sock).length, 1)
  assert.deepEqual(images(sock)[0].content.image.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const cardMetadata = await sharp(images(sock)[0].content.image).metadata()
  assert.equal(cardMetadata.format, 'png')
  assert.equal(cardMetadata.width, 1080)
  assert.equal(cardMetadata.height, 1420)
  assert.match(images(sock)[0].content.caption, /Daftar kategori dan command/)
  assert.equal(texts(sock).length, 1, 'daftar command dikirim satu kali')
  const out = texts(sock).join('\n')
  assert.match(out, /KAYY ASSISTANT/)
  assert.match(out, /DAFTAR PERINTAH/)
  assert.match(out, /• \.igqc\b/)
  assert.match(out, /• \.igdm\b/)
  assert.match(out, /• \.iqc\b/)
  assert.match(out, /• \.iqcpink\b/)
  assert.match(out, /• \.ytcomment\b/)
  assert.match(out, /• \/grup .* \(Admin\)/)
  assert.equal(menu.role, 'ADMIN')
  assert.ok(menu.features > 0)
  assert.ok(menu.commands > 0)
  assert.match(menu.runtime, /\d+ (hari|jam|menit)/)
  assert.match(menu.clock.time, /^\d{2}:\d{2}:\d{2}$/)
  const numbers = [...out.matchAll(/^(\d+)\. /gm)].map(m => Number(m[1]))
  assert.deepEqual(numbers, numbers.map((_, i) => i + 1), 'nomor urut tanpa duplikat')
  assert.equal(new Set(numbers).size, numbers.length)
  assert.equal(sock.sent.filter(s => s.content.react).length, 0)
})

test('/menu non-admin: kartu ringkasan dan daftar tanpa command admin/VIP', async () => {
  const sock = makeSock()
  const menu = await buildPersonalMenu(ctx(sock, '/menu', false))
  await handleMessage(ctx(sock, '/menu', false))
  assert.equal(images(sock).length, 1)
  assert.equal(texts(sock).length, 1)
  const out = texts(sock).join('\n')
  assert.match(out, /KAYY ASSISTANT/)
  assert.equal(menu.role, 'USER')
  assert.doesNotMatch(out, /Konfigurasi Admin/)
  assert.match(out, /DAFTAR PERINTAH/)
  assert.match(out, /• \.igqc\b/)
  assert.doesNotMatch(out, /• \/grup\b/)
  assert.doesNotMatch(out, /• \.tiktok\b/)
})

test('/menu tidak mengubah database dan tidak mengirim pengumuman', async () => {
  const before = {
    activity: all('SELECT COUNT(*) n FROM activity_logs').n,
    delivery: all('SELECT COUNT(*) n FROM delivery_logs').n,
    announcements: all('SELECT COUNT(*) n FROM announcements').n,
  }
  const sock = makeSock()
  await handleMessage(ctx(sock, '/menu', true))
  assert.equal(all('SELECT COUNT(*) n FROM activity_logs').n, before.activity)
  assert.equal(all('SELECT COUNT(*) n FROM delivery_logs').n, before.delivery)
  assert.equal(all('SELECT COUNT(*) n FROM announcements').n, before.announcements)
})

test('/menu bisa dipanggil kapan saja tanpa merusak sesi /set', async () => {
  const sock = makeSock()
  await handleMessage(ctx(sock, '/set', true))
  await handleMessage(ctx(sock, '/menu', true))
  assert.match(texts(sock).join('\n'), /KAYY ASSISTANT/)
  await handleMessage(ctx(sock, 'Judul dari sesi', true))
  assert.match(texts(sock).at(-1), /isi pengumuman/i, 'sesi wizard tetap berjalan')
})

test('non-admin boleh /set, tapi /grup dan /grupaktif ditolak', async () => {
  const a = makeSock()
  await handleMessage(ctx(a, '/set', false))
  assert.match(texts(a)[0], /Ketik judul pengumuman/)

  for (const cmd of ['/grup', '/grupaktif']) {
    const sock = makeSock()
    await handleMessage(ctx(sock, cmd, false))
    assert.equal(texts(sock).length, 1)
    assert.match(texts(sock)[0], /daftar grup .* hanya dapat dilihat admin/i)
  }
  const ngaji = makeSock()
  await handleMessage(ctx(ngaji, '/setngaji', false))
  assert.match(texts(ngaji)[0], /hanya untuk admin terdaftar/i)
})
