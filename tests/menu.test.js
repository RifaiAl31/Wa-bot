import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { testEnv, ADMIN, GROUP } from './helpers.js'

process.env.OPEN_ACCESS = 'false' // aturan baru diuji walau mode tertutup
process.env.WEATHER_BASE_URL = 'http://127.0.0.1:1/forecast'
testEnv('menu')
const { groupService } = await import('../src/services/groups.js')
const { initDb, all, get } = await import('../src/db/index.js')
const { handleMessage, FLOW_COMMANDS } = await import('../src/commands/router.js')
const { buildPersonalMenu } = await import('../src/commands/menu.js')
const { ALL_COMMANDS, COMMAND_GROUPS, normalizeCommand, RESTRICTED_COMMANDS } = await import('../src/commands/registry.js')

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

test('registry memiliki metadata lengkap dan semua command memakai prefix titik', () => {
  for (const cmd of ALL_COMMANDS) assert.match(cmd, /^\.[a-z0-9]+$/)
  for (const group of COMMAND_GROUPS) {
    for (const item of group.commands) {
      assert.equal(item.category, group.title)
      assert.equal(item.description, item.desc)
      assert.equal(item.example, item.usage)
      assert.ok(item.permission)
      assert.equal(typeof item.active, 'boolean')
    }
  }
  assert.equal(new Set(COMMAND_GROUPS.map((group) => group.title)).size, COMMAND_GROUPS.length)
  assert.equal(normalizeCommand('/set'), '.set')
  assert.equal(normalizeCommand('.kirim'), '.send')
  assert.equal(normalizeCommand('.free'), '.models')
  assert.ok(FLOW_COMMANDS.has('.update'))
  assert.deepEqual(RESTRICTED_COMMANDS, [
    '.grup', '.grupaktif', '.daftargrup', '.nondaftargrup', '.no',
    '.template', '.setngaji', '.editngaji', '.previewngaji',
    '.sendngaji', '.jadwalngaji', '.aturngaji', '.aktifngaji', '.nonaktifngaji',
  ])
})

test('.menu admin: kartu ringkasan diikuti daftar command lengkap', async () => {
  const sock = makeSock()
  const menu = await buildPersonalMenu(ctx(sock, '.menu', true))
  await handleMessage(ctx(sock, '.menu', true))
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
  assert.match(out, /LUX BOT/)
  assert.match(out, /👤 \*MENU UTAMA\*/)
  assert.match(out, /📢 \*PENGUMUMAN\*/)
  assert.match(out, /◈ `\.igqc`/)
  assert.match(out, /◈ `\.igdm`/)
  assert.match(out, /◈ `\.iqc <teks>`/)
  assert.match(out, /◈ `\.iqcpink <teks>`/)
  assert.match(out, /◈ `\.ytcomment/)
  assert.match(out, /◈ `\.grup` — .* \(Admin\)/)
  assert.doesNotMatch(out, /\/(?:set|list|ask|vip|grup)\b/)
  assert.match(out, /Dev By Rifai/)
  assert.equal((out.match(/◈ `\.vip`/g) || []).length, 2, 'VIP entry point intentionally appears in main and VIP sections')
  assert.doesNotMatch(out, /◈ `\.aiedit|◈ `\.sologo/)
  assert.equal(menu.role, 'ADMIN')
  assert.ok(menu.features > 0)
  assert.ok(menu.commands > 0)
  assert.match(menu.runtime, /\d+ (hari|jam|menit)/)
  assert.match(menu.clock.time, /^\d{2}:\d{2}:\d{2}$/)
  assert.equal(sock.sent.filter(s => s.content.react).length, 0)
})

test('.menu non-admin: kartu ringkasan dan daftar tanpa command admin/VIP', async () => {
  const sock = makeSock()
  const menu = await buildPersonalMenu(ctx(sock, '.menu', false))
  await handleMessage(ctx(sock, '.menu', false))
  assert.equal(images(sock).length, 1)
  assert.equal(texts(sock).length, 1)
  const out = texts(sock).join('\n')
  assert.match(out, /LUX BOT/)
  assert.equal(menu.role, 'USER')
  assert.doesNotMatch(out, /Konfigurasi Admin/)
  assert.match(out, /👤 \*MENU UTAMA\*/)
  assert.match(out, /◈ `\.igqc`/)
  assert.doesNotMatch(out, /◈ `\.grup`/)
  assert.doesNotMatch(out, /◈ `\.daftargrup/)
  assert.doesNotMatch(out, /◈ `\.tiktok\b/)
})

test('.menu tidak mengubah database dan tidak mengirim pengumuman', async () => {
  const before = {
    activity: all('SELECT COUNT(*) n FROM activity_logs').n,
    delivery: all('SELECT COUNT(*) n FROM delivery_logs').n,
    announcements: all('SELECT COUNT(*) n FROM announcements').n,
  }
  const sock = makeSock()
  await handleMessage(ctx(sock, '.menu', true))
  assert.equal(all('SELECT COUNT(*) n FROM activity_logs').n, before.activity)
  assert.equal(all('SELECT COUNT(*) n FROM delivery_logs').n, before.delivery)
  assert.equal(all('SELECT COUNT(*) n FROM announcements').n, before.announcements)
})

test('shortcut menu tidak mengonsumsi pesan biasa dan angka bekerja setelah menu', async () => {
  const sock = makeSock()
  await handleMessage(ctx(sock, '.menu', true))
  const sentAfterMenu = sock.sent.length
  await handleMessage(ctx(sock, 'catatan biasa', true))
  assert.equal(sock.sent.length, sentAfterMenu)
  await handleMessage(ctx(sock, '1', true))
  assert.match(texts(sock).at(-1), /Belum ada pengumuman|DAFTAR PENGUMUMAN/)
})

test('.menu bisa dipanggil kapan saja tanpa merusak sesi .set', async () => {
  const sock = makeSock()
  await handleMessage(ctx(sock, '.set', true))
  await handleMessage(ctx(sock, '.menu', true))
  assert.match(texts(sock).join('\n'), /LUX BOT/)
  await handleMessage(ctx(sock, 'Judul dari sesi', true))
  assert.match(texts(sock).at(-1), /isi pengumuman/i, 'sesi wizard tetap berjalan')
})

test('non-admin boleh .set, tetapi pengelolaan grup ditolak', async () => {
  const a = makeSock()
  await handleMessage(ctx(a, '.set', false))
  assert.match(texts(a)[0], /Ketik judul pengumuman/)

  for (const cmd of ['.grup', '.grupaktif', '.daftargrup 1', '.nondaftargrup 1']) {
    const sock = makeSock()
    await handleMessage(ctx(sock, cmd, false))
    assert.equal(texts(sock).length, 1)
    if (['.grup', '.grupaktif'].includes(cmd)) {
      assert.match(texts(sock)[0], /daftar grup .* hanya dapat dilihat admin/i)
    } else {
      assert.match(texts(sock)[0], /hanya untuk admin terdaftar/i)
    }
  }
  const ngaji = makeSock()
  await handleMessage(ctx(ngaji, '.setngaji', false))
  assert.match(texts(ngaji)[0], /hanya untuk admin terdaftar/i)
})

test('admin bot dapat mengubah dan mengembalikan pendaftaran grup', async () => {
  const sock = makeSock()
  await handleMessage(ctx(sock, '.nondaftargrup 1', true))
  assert.equal(groupService.get(GROUP).is_registered, 0)
  await handleMessage(ctx(sock, '.daftargrup 1', true))
  assert.equal(groupService.get(GROUP).is_registered, 1, texts(sock).join('\n'))
})
