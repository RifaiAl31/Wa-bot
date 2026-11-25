import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import sharp from 'sharp'
import { testEnv, ADMIN, GROUP } from './helpers.js'

testEnv('images')
const { initDb } = await import('../src/db/index.js')
initDb({ force: true })
const { groupService } = await import('../src/services/groups.js')
groupService.upsert(GROUP, 'Grup Uji', 3)
groupService.upsert('628888888888@g.us', 'Grup B', 3)
const { config } = await import('../src/config.js')
const { handleMessage } = await import('../src/commands/router.js')
const { QUOTE_MODES, handleQuoteCommand, parseImageInput, parseTiktokInput } = await import('../src/images/generator.js')
const { extractImageTarget, validateImagePayload } = await import('../src/images/media.js')
const { fitText, page, wrapLines } = await import('../src/images/engine.js')

const source = await sharp({ create: { width: 900, height: 700, channels: 3, background: { r: 30, g: 90, b: 160 } } })
  .png().toBuffer()
const LONG = 'Biar apa? biarin 🤭😛 '.repeat(12) + '\nBaris baru dengan emoji 🚀🔥 dan teks panjang yang harus dibungkus rapi.'
const EMOJI = 'Halo 🤭😛💯🚀🔥✨👍🏽'

function makeSock() {
  const calls = []
  return {
    calls, isConnected: () => true,
    async sendMessage(jid, content) { calls.push({ jid, content }); return { key: { id: `m${calls.length}` } } },
  }
}
const ctx = (sock, text, opts = {}) => ({
  sock, bot: null, jid: opts.jid || GROUP, adminJid: opts.user || ADMIN, text,
  admin: true, isGroup: true, isRegisteredAdmin: true,
  messageKey: opts.key || { id: 'IMG-1', remoteJid: opts.jid || GROUP, participant: opts.user || ADMIN },
  message: opts.message,
})
const imageCalls = (sock) => sock.calls.filter(c => Buffer.isBuffer(c.content.image))
const texts = (sock) => sock.calls.filter(c => c.content.text).map(c => c.content.text)
const reacts = (sock) => (sock.calls || sock.sent).filter(c => c.content.react).map(c => c.content.react.text)

function imageMessage(caption, mimetype = 'image/png') {
  return {
    key: { id: 'IMG-SOURCE', remoteJid: GROUP, participant: '628999999999@s.whatsapp.net' },
    message: { imageMessage: { caption, mimetype, fileLength: source.length } },
  }
}

test('flag --raw dikenali dan dihapus dari teks', () => {
  assert.deepEqual(parseImageInput('halo dunia --raw'), { text: 'halo dunia', raw: true })
  assert.deepEqual(parseImageInput('halo --asli'), { text: 'halo', raw: true })
  assert.deepEqual(parseImageInput('halo biasa'), { text: 'halo biasa', raw: false })
})

test('mode raw merender foto asli sebagai gambar utama', async () => {
  for (const mode of Object.values(QUOTE_MODES)) {
    const png = await mode.render({ text: 'Foto asli', source: { buffer: source }, raw: true })
    assert.equal((await sharp(png).metadata()).format, 'png')
    assert.ok(png.length > 3000)
  }
})

test('template quote yang terdaftar merender PNG valid tanpa gambar', async () => {
  for (const [cmd, mode] of Object.entries(QUOTE_MODES)) {
    const png = await mode.render({ text: EMOJI })
    const meta = await sharp(png).metadata()
    assert.equal(meta.format, 'png')
    assert.ok(meta.width >= 1000 && meta.height >= 900)
    assert.ok(png.length > 3000, `${cmd} menghasilkan gambar nyata`)
  }
})

test('template merender dengan gambar, teks panjang, dan emoji campuran', async () => {
  for (const mode of Object.values(QUOTE_MODES)) {
    const png = await mode.render({ text: LONG, source: { buffer: source } })
    assert.equal((await sharp(png).metadata()).format, 'png')
  }
  const { ctx } = page(500, 200)
  const fitted = fitText(ctx, LONG, 400, { start: 48, min: 18, maxLines: 8 })
  assert.ok(fitted.lines.length <= 8)
  assert.ok(fitted.size >= 18)
  ctx.font = `${fitted.size}px sans-serif`
  assert.ok(wrapLines(ctx, EMOJI, 120).length >= 1)
})

test('parser TQC memisahkan nama dari teks pada pemisah pertama', () => {
  assert.deepEqual(parseTiktokInput('Raiden|kenapa yhh?? 🤭|lanjut'), {
    name: 'Raiden',
    text: 'kenapa yhh?? 🤭|lanjut',
  })
  assert.deepEqual(parseTiktokInput('pesan tanpa nama'), {
    name: 'Raiden',
    text: 'pesan tanpa nama',
  })
})

test('TQC meneruskan nama dan teks persis ke template', async () => {
  const sock = makeSock()
  let received
  await handleQuoteCommand({ ...ctx(sock, '.tqc Raiden|teks 🤭|lanjutan'), cmd: '.tqc', arg: 'Raiden|teks 🤭|lanjutan' }, {
    render: async (input) => { received = input; return source },
  })
  assert.equal(received.name, 'Raiden')
  assert.equal(received.text, 'teks 🤭|lanjutan')
  assert.equal(imageCalls(sock).length, 1)
})

test('validator menolak format dan ukuran di luar batas', () => {
  assert.throws(() => validateImagePayload({ mimetype: 'application/pdf' }), /Format gambar tidak didukung/)
  assert.doesNotMatch(validateImagePayload({ mimetype: 'image/png', fileLength: 10 }).mime, /pdf/)
})

test('.iqc tanpa gambar: satu gambar terkirim + caption + reaction', async () => {
  const sock = makeSock()
  await handleMessage(ctx(sock, '.iqc biar apa? biarin 🤭😛'))
  assert.deepEqual(reacts(sock), ['⏳', '✅'])
  assert.equal(imageCalls(sock).length, 1)
  assert.match(imageCalls(sock)[0].content.caption, /✅ Done!/)
  assert.match(imageCalls(sock)[0].content.caption, /Mode: iPhone Quote Creator/)
  assert.equal((await sharp(imageCalls(sock)[0].content.image).metadata()).format, 'png')
})

test('.tqc dan .wq memakai mode masing-masing', async () => {
  for (const [cmd, name] of [['.tqc', 'TikTok Quote Creator'], ['.wq', 'Windows Quote Creator']]) {
    const sock = makeSock()
    await handleMessage(ctx(sock, `${cmd} kenapa yahh??`))
    assert.equal(imageCalls(sock).length, 1)
    assert.match(imageCalls(sock)[0].content.caption, new RegExp(name))
  }
})

test('.iqc5, .tiktokchat, dan .ytcomment menghasilkan mockup lokal berlabel', async () => {
  const cases = [
    ['.iqc5', 'teks iPhone'],
    ['.iqc2', 'status baterai'],
    ['.iqcdark', 'tema gelap'],
    ['.iqcpink', 'tema pink'],
    ['.iqcpinkv2', 'tema pink kedua'],
    ['.iqcmerah', 'tema merah'],
    ['.iqcwin', 'tema Windows'],
    ['.tiktokchat', 'nama|pesan TikTok'],
    ['.ytcomment', 'username|komentar YouTube'],
  ]
  for (const [cmd, arg] of cases) {
    const sock = makeSock()
    await handleMessage(ctx(sock, `${cmd} ${arg}`))
    assert.equal(imageCalls(sock).length, 1, `${cmd} mengirim satu gambar`)
    assert.match(imageCalls(sock)[0].content.caption, /MOCKUP|simulasi/i)
    assert.equal((await sharp(imageCalls(sock)[0].content.image).metadata()).format, 'png')
  }
})

test('.ytcomment memakai reply gambar sebagai avatar', async () => {
  const sock = makeSock()
  const request = {
    ...ctx(sock, '.ytcomment Nama|komentar 🤭', { message: imageMessage('.ytcomment Nama|komentar 🤭') }),
    cmd: '.ytcomment',
    arg: 'Nama|komentar 🤭',
  }
  let downloaded = false
  await handleQuoteCommand(request, {
    download: async (target) => {
      downloaded = target.content.mimetype === 'image/png'
      return { buffer: source, file: 'avatar.png' }
    },
  })
  assert.ok(downloaded)
  assert.equal(imageCalls(sock).length, 1)
  assert.match(imageCalls(sock)[0].content.caption, /YouTube Comment Mockup/)
})

test('.tiktokchat dan .ytcomment menolak format tanpa username eksplisit', async () => {
  for (const cmd of ['.tiktokchat', '.ytcomment']) {
    const sock = makeSock()
    await handleMessage(ctx(sock, `${cmd} hanya teks`))
    assert.equal(imageCalls(sock).length, 0)
    assert.match(texts(sock).join('\n'), new RegExp(`Gunakan format ${cmd}`))
  }
})

test('gambar + caption perintah dan reply gambar dikenali', () => {
  assert.equal(extractImageTarget({ message: imageMessage('.iqc halo') }).quoted, false)
  const quoted = {
    key: { id: 'CMD', remoteJid: GROUP, participant: ADMIN },
    message: {
      extendedTextMessage: {
        text: '.tqc halo',
        contextInfo: { quotedMessage: { imageMessage: { caption: '', mimetype: 'image/png' } } },
      },
    },
  }
  const target = extractImageTarget({ message: quoted })
  assert.equal(target.quoted, true)
  assert.equal(target.content.mimetype, 'image/png')
})

test('gambar diunduh saat ada lampiran; file sementara dibersihkan', async () => {
  const before = fs.existsSync(config.imageTempDir) ? fs.readdirSync(config.imageTempDir).length : 0
  const sock = makeSock()
  const request = { ...ctx(sock, '.iqc pakai foto', { message: imageMessage('.iqc pakai foto') }), cmd: '.iqc', arg: 'pakai foto' }
  await handleQuoteCommand(request, {
    download: async (target, dir) => {
      assert.ok(target.content.mimetype.startsWith('image/'))
      return { buffer: source, file: 'fake' }
    },
  })
  assert.equal(imageCalls(sock).length, 1)
  const after = fs.existsSync(config.imageTempDir) ? fs.readdirSync(config.imageTempDir).length : 0
  assert.equal(after, before, 'tidak ada file sementara yang tertinggal')
})

test('reply gambar diunduh dan dipakai oleh TQC', async () => {
  const sock = makeSock()
  const quotedMessage = {
    key: { id: 'CMD-QUOTE', remoteJid: GROUP, participant: ADMIN },
    message: {
      extendedTextMessage: {
        text: '.tqc Raiden|pose kak ✌️',
        contextInfo: { quotedMessage: { imageMessage: { caption: '', mimetype: 'image/png' } } },
      },
    },
  }
  const request = {
    ...ctx(sock, '.tqc Raiden|pose kak ✌️', { message: quotedMessage }),
    cmd: '.tqc',
    arg: 'Raiden|pose kak ✌️',
  }
  let wasQuoted = false
  await handleQuoteCommand(request, {
    download: async (target) => {
      wasQuoted = target.quoted
      return { buffer: source, file: 'fake' }
    },
  })
  assert.equal(wasQuoted, true)
  assert.equal(imageCalls(sock).length, 1)
  assert.match(imageCalls(sock)[0].content.caption, /TikTok Quote Creator/)
})

test('gambar ber-caption TQC dipakai sebagai sumber', async () => {
  const sock = makeSock()
  const request = {
    ...ctx(sock, '.tqc Raiden|pose kak', { message: imageMessage('.tqc Raiden|pose kak') }),
    cmd: '.tqc',
    arg: 'Raiden|pose kak',
  }
  let downloaded = false
  await handleQuoteCommand(request, {
    download: async (target) => {
      downloaded = !target.quoted && target.content.mimetype === 'image/png'
      return { buffer: source, file: 'fake' }
    },
  })
  assert.equal(downloaded, true)
  assert.equal(imageCalls(sock).length, 1)
})

test('input kosong, kegagalan unduh, dan kegagalan render memberi error tanpa gambar sukses', async () => {
  const emptySock = makeSock()
  await handleMessage(ctx(emptySock, '.iqc   '))
  assert.equal(imageCalls(emptySock).length, 0)
  assert.match(texts(emptySock).join('\n'), /Teks quote kosong/)

  const emptyTiktokSock = makeSock()
  await handleMessage(ctx(emptyTiktokSock, '.tqc Raiden|'))
  assert.equal(imageCalls(emptyTiktokSock).length, 0)
  assert.match(texts(emptyTiktokSock).join('\n'), /Teks quote kosong/)

  const downloadSock = makeSock()
  const imageRequest = {
    ...ctx(downloadSock, '.tqc Raiden|pose', { message: imageMessage('.tqc Raiden|pose') }),
    cmd: '.tqc',
    arg: 'Raiden|pose',
  }
  await handleQuoteCommand(imageRequest, { download: async () => { throw new Error('unduhan test gagal') } })
  assert.equal(imageCalls(downloadSock).length, 0)
  assert.match(texts(downloadSock).join('\n'), /unduhan test gagal/)

  const renderSock = makeSock()
  await handleQuoteCommand({ ...ctx(renderSock, '.iqc halo'), cmd: '.iqc', arg: 'halo' }, {
    render: async () => { throw new Error('render test gagal') },
  })
  assert.equal(imageCalls(renderSock).length, 0)
  assert.match(texts(renderSock).join('\n'), /render test gagal/)
})

test('proses rendering memiliki batas waktu', async () => {
  const sock = makeSock()
  const timeout = config.imageTimeoutMs
  config.imageTimeoutMs = 5
  try {
    await handleQuoteCommand({ ...ctx(sock, '.iqc lama'), cmd: '.iqc', arg: 'lama' }, {
      render: () => new Promise(() => {}),
    })
  } finally {
    config.imageTimeoutMs = timeout
  }
  assert.equal(imageCalls(sock).length, 0)
  assert.match(texts(sock).join('\n'), /melewati batas waktu/)
  assert.deepEqual(reacts(sock), ['⏳', '❌'])
})

test('gambar rusak dan gagal kirim media tidak menghasilkan respons sukses', async () => {
  const corruptSock = makeSock()
  const request = {
    ...ctx(corruptSock, '.iqc pakai foto', { message: imageMessage('.iqc pakai foto') }),
    cmd: '.iqc',
    arg: 'pakai foto',
  }
  await handleQuoteCommand(request, { download: async () => ({ buffer: Buffer.from('not an image'), file: 'fake' }) })
  assert.equal(imageCalls(corruptSock).length, 0)
  assert.match(texts(corruptSock).join('\n'), /gambar|format|metadata/i)

  const sent = []
  const failingSock = {
    sent,
    isConnected: () => true,
    async sendMessage(jid, content) {
      sent.push({ jid, content })
      if (Buffer.isBuffer(content.image)) throw new Error('media send failed')
      return { key: { id: `m${sent.length}` } }
    },
  }
  await handleMessage(ctx(failingSock, '.tqc Raiden|teks'))
  assert.equal(sent.filter((call) => Buffer.isBuffer(call.content.image)).length, 1)
  assert.match(sent.filter((call) => call.content.text).map((call) => call.content.text).join('\n'), /media send failed/)
  assert.deepEqual(reacts(failingSock), ['⏳', '❌'])
})

test('format invalid → ❌ dengan pesan, bukan gambar', async () => {
  const sock = makeSock()
  const request = { ...ctx(sock, '.iqc tes', { message: imageMessage('.iqc tes', 'application/pdf') }), cmd: '.iqc', arg: 'tes' }
  await handleQuoteCommand(request, { download: async () => ({ buffer: source, file: 'fake' }) })
  assert.equal(imageCalls(sock).length, 0)
  assert.deepEqual(reacts(sock), ['⏳', '❌'])
  assert.match(texts(sock).join('\n'), /Format gambar tidak didukung/)
})

test('.iqc --raw mengirim gambar dengan foto asli', async () => {
  const sock = makeSock()
  const request = {
    ...ctx(sock, '.iqc lihat foto --raw', { message: imageMessage('.iqc lihat foto --raw') }),
    cmd: '.iqc', arg: 'lihat foto --raw',
  }
  await handleQuoteCommand(request, { download: async () => ({ buffer: source, file: 'fake' }) })
  assert.equal(imageCalls(sock).length, 1)
  assert.match(imageCalls(sock)[0].content.caption, /iPhone Quote Creator/)
})

test('dua pengguna bersamaan tidak saling mencampur hasil', async () => {
  const a = makeSock(); const b = makeSock()
  await Promise.all([
    handleMessage(ctx(a, '.iqc pesan A', { user: ADMIN, key: { id: 'A', remoteJid: GROUP } })),
    handleMessage(ctx(b, '.wq pesan B', { user: '628777777777@s.whatsapp.net', jid: '628888888888@g.us', key: { id: 'B', remoteJid: '628888888888@g.us' } })),
  ])
  assert.equal(imageCalls(a).length, 1)
  assert.equal(imageCalls(b).length, 1)
  assert.match(imageCalls(a)[0].content.caption, /iPhone/)
  assert.match(imageCalls(b)[0].content.caption, /Windows/)
})
