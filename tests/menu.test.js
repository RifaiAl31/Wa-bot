import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { testEnv, ADMIN, GROUP } from './helpers.js'

process.env.OPEN_ACCESS = 'false' // aturan baru diuji walau mode tertutup
testEnv('menu')
const { initDb, all, get } = await import('../src/db/index.js')
const { handleMessage, FLOW_COMMANDS } = await import('../src/commands/router.js')
const { ALL_COMMANDS, RESTRICTED_COMMANDS } = await import('../src/commands/registry.js')

initDb({ force: true })

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

test('setiap perintah di /menu benar-benar diimplementasikan', () => {
  const src = fs.readFileSync(path.resolve('src/commands/router.js'), 'utf8')
  for (const cmd of ALL_COMMANDS) {
    const implemented = src.includes(`case '${cmd}':`) || FLOW_COMMANDS.has(cmd)
    assert.ok(implemented, `${cmd} terdaftar di menu tetapi tidak diimplementasikan`)
  }
  assert.deepEqual(RESTRICTED_COMMANDS, ['/grup', '/grupaktif'])
})

test('/menu admin: satu pesan, berisi semua perintah termasuk daftar grup', async () => {
  const sock = makeSock()
  await handleMessage(ctx(sock, '/menu', true))
  assert.equal(texts(sock).length, 1, 'menu harus satu pesan')
  const out = texts(sock).join('\n')
  assert.match(out, /🤖 \*MENU BOT WHATSAPP\*/)
  assert.match(out, /📄 \*DOKUMEN DAN GAMBAR\*/)
  assert.match(out, /\.iqc/)
  assert.match(out, /\.tqc <nama>\|<teks>/)
  assert.match(out, /\.wq <teks>/)
  for (const cmd of ALL_COMMANDS) assert.ok(out.includes(cmd), `${cmd} harus ada di menu admin`)
  assert.ok(out.includes('`/grup`') && out.includes('`/grupaktif`') && out.includes('`/no vip @user`'))
  const numbers = [...out.matchAll(/^(\d+)\. /gm)].map(m => Number(m[1]))
  assert.deepEqual(numbers, numbers.map((_, i) => i + 1), 'nomor urut tanpa duplikat')
  assert.equal(new Set(numbers).size, numbers.length)
  assert.equal(sock.sent.filter(s => s.content.react).length, 0)
})

test('/menu non-admin: satu pesan, semua perintah kecuali admin', async () => {
  const sock = makeSock()
  await handleMessage(ctx(sock, '/menu', false))
  assert.equal(texts(sock).length, 1)
  const out = texts(sock).join('\n')
  assert.match(out, /`\/set`/)
  assert.match(out, /`\/send A1`/)
  assert.match(out, /`\/menu`/)
  assert.doesNotMatch(out, /`\/grup`|`\/grupaktif`|`\/no vip @user`/)
  assert.match(out, /khusus admin/)
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
  assert.match(texts(sock).join('\n'), /MENU BOT WHATSAPP/)
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
})
