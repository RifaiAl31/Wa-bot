import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sticker-test-'))
const tempDir = path.join(root, 'temp')
process.env.IMAGE_TEMP_DIR = tempDir
process.env.FFMPEG = process.env.FFMPEG || 'ffmpeg'

const { setWaDownloader } = await import('../src/services/waMedia.js')
const { handleStickerCommand, readExifFromWebp, imageToSticker, hasFFmpeg, runFfmpeg } = await import('../src/features/sticker/index.js')

const JID = '1203630@g.us'
const png = await sharp({ create: { width: 96, height: 64, channels: 4, background: { r: 220, g: 40, b: 40, alpha: 1 } } }).png().toBuffer()
const stickerWebp = await imageToSticker(png, { packname: 'Uji', author: 'Tester' })

let mediaBuffer = png
let mediaMime = 'image/png'
setWaDownloader(async () => mediaBuffer)

function makeSock() {
  const sent = []
  return {
    sent,
    isConnected: () => true,
    async sendMessage(jid, content, opts) {
      sent.push({ jid, content, opts })
      return { key: { id: `msg-${sent.length}` } }
    },
  }
}

function makeCtx(sock, cmd, arg = '', options = {}) {
  const type = options.type || 'imageMessage'
  const mime = options.mime || mediaMime
  const content = { mimetype: mime, fileLength: options.fileLength ?? mediaBuffer.length }
  if (options.seconds !== undefined) content.seconds = options.seconds
  const message = {
    key: { id: 'M1', remoteJid: JID, participant: '6281234@s.whatsapp.net' },
    message: options.quoted
      ? { extendedTextMessage: { text: cmd + ' ' + arg, contextInfo: { quotedMessage: { [type]: content, key: { participant: '6281234@s.whatsapp.net' } } } } }
      : { [type]: content },
  }
  return {
    sock, bot: null, jid: JID, adminJid: '6281234@s.whatsapp.net', isGroup: true,
    text: `${cmd} ${arg}`.trim(), cmd, arg, message, messageKey: message.key,
  }
}

const stickers = (s) => s.sent.filter((x) => Buffer.isBuffer(x.content.sticker)).map((x) => x.content.sticker)
const textReplies = (s) => s.sent.filter((x) => typeof x.content.text === 'string').map((x) => x.content.text)
const isWebp = (b) => Buffer.isBuffer(b) && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP'

test('.sticker dari gambar menghasilkan WEBP dengan EXIF pack/author', async () => {
  mediaBuffer = png
  mediaMime = 'image/png'
  const sock = makeSock()
  assert.equal(await handleStickerCommand(makeCtx(sock, '.s', 'PackUji|AuthorUji'), '.s', 'PackUji|AuthorUji'), true)
  const out = stickers(sock)
  assert.equal(out.length, 1)
  assert.ok(isWebp(out[0]))
  const exif = readExifFromWebp(out[0])
  assert.equal(exif['sticker-pack-name'], 'PackUji')
  assert.equal(exif['sticker-pack-publisher'], 'AuthorUji')
  const meta = await sharp(out[0]).metadata()
  assert.equal(meta.width, 512)
  assert.equal(meta.height, 512)
})

test('.ttp tanpa gambar sukses membuat stiker teks transparan', async () => {
  const sock = makeSock()
  assert.equal(await handleStickerCommand(makeCtx(sock, '.ttp', '#00ff00 halo dunia'), '.ttp', '#00ff00 halo dunia'), true)
  const out = stickers(sock)
  assert.equal(out.length, 1)
  assert.ok(isWebp(out[0]))
  assert.ok(readExifFromWebp(out[0]))
})

test('.toimg stiker statis menghasilkan PNG', async () => {
  mediaBuffer = stickerWebp
  mediaMime = 'image/webp'
  const sock = makeSock()
  const ctx = makeCtx(sock, '.toimg', '', { type: 'stickerMessage' })
  assert.equal(await handleStickerCommand(ctx, '.toimg', ''), true)
  const images = sock.sent.filter((x) => Buffer.isBuffer(x.content.image))
  assert.equal(images.length, 1)
  assert.equal(images[0].content.image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  const meta = await sharp(images[0].content.image).metadata()
  assert.equal(meta.format, 'png')
})

test('media rusak ditolak tanpa mengirim stiker', async () => {
  mediaBuffer = Buffer.from('bukan-file-gambar-yang-valid')
  mediaMime = 'image/png'
  const sock = makeSock()
  assert.equal(await handleStickerCommand(makeCtx(sock, '.s', ''), '.s', ''), false)
  assert.equal(stickers(sock).length, 0)
  assert.ok(textReplies(sock).some((t) => /gagal|rusak|invalid/i.test(t)), JSON.stringify(textReplies(sock)))
})

test('video lebih dari 20 detik ditolak', async () => {
  mediaBuffer = png
  mediaMime = 'video/mp4'
  const sock = makeSock()
  const ok = await handleStickerCommand(makeCtx(sock, '.s', '', { type: 'videoMessage', seconds: 21 }), '.s', '')
  assert.equal(ok, false)
  assert.ok(textReplies(sock).some((t) => /20 detik/.test(t)))
  assert.equal(stickers(sock).length, 0)
})

test('.sticker menerima gambar yang direply', async () => {
  mediaBuffer = png
  mediaMime = 'image/png'
  const sock = makeSock()
  const ctx = makeCtx(sock, '.s', '', { quoted: true })
  assert.equal(await handleStickerCommand(ctx, '.s', ''), true)
  assert.ok(isWebp(stickers(sock)[0]))
})

test('.sticker menolak media yang melewati batas ukuran', async () => {
  mediaBuffer = png
  mediaMime = 'image/png'
  const sock = makeSock()
  const ctx = makeCtx(sock, '.s', '', { fileLength: 1_000_000_000 })
  assert.equal(await handleStickerCommand(ctx, '.s', ''), false)
  assert.ok(textReplies(sock).some((text) => /terlalu besar/i.test(text)))
  assert.equal(stickers(sock).length, 0)
})

test('.sticker mengonversi GIF animasi ke WEBP bila FFmpeg tersedia', async (t) => {
  if (!await hasFFmpeg()) return t.skip('FFmpeg tidak terpasang.')
  const workDir = await fs.mkdtemp(path.join(root, 'gif-source-'))
  const input = path.join(workDir, 'source.gif')
  await runFfmpeg([
    '-y', '-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=6:duration=1', input,
  ])
  mediaBuffer = await fs.readFile(input)
  mediaMime = 'image/gif'
  try {
    const sock = makeSock()
    assert.equal(await handleStickerCommand(makeCtx(sock, '.sticker', ''), '.sticker', ''), true)
    const out = stickers(sock)[0]
    assert.ok(isWebp(out))
    assert.ok((await sharp(out, { animated: true }).metadata()).pages > 1)
  } finally {
    await fs.rm(workDir, { recursive: true, force: true })
  }
})

test('.sticker mengonversi video MP4 ke WEBP animasi bila FFmpeg tersedia', async (t) => {
  if (!await hasFFmpeg()) return t.skip('FFmpeg tidak terpasang.')
  const workDir = await fs.mkdtemp(path.join(root, 'video-source-'))
  try {
    const input = path.join(workDir, 'source.mp4')
    await runFfmpeg([
      '-y', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:d=1:r=6',
      '-an', '-c:v', 'mpeg4', '-pix_fmt', 'yuv420p', input,
    ])
    mediaBuffer = await fs.readFile(input)
    mediaMime = 'video/mp4'
    const sock = makeSock()
    const ctx = makeCtx(sock, '.sticker', '', { type: 'videoMessage', seconds: 1 })
    assert.equal(await handleStickerCommand(ctx, '.sticker', ''), true)
    const out = stickers(sock)[0]
    assert.ok(isWebp(out))
    assert.ok((await sharp(out, { animated: true }).metadata()).pages > 1)
  } finally {
    await fs.rm(workDir, { recursive: true, force: true })
  }
})

test('.qc, .brat dan .emojimix menghasilkan stiker WEBP', async () => {
  for (const [cmd, arg] of [['.qc', 'Halo dari uji'], ['.brat', 'hijau halo brat'], ['.emojimix', '😂🔥']]) {
    const sock = makeSock()
    assert.equal(await handleStickerCommand(makeCtx(sock, cmd, arg), cmd, arg), true, cmd)
    assert.ok(isWebp(stickers(sock)[0]), cmd)
  }
})

test('.attp menghasilkan WEBP (animasi bila ffmpeg ada, statis sebagai fallback)', async () => {
  const sock = makeSock()
  assert.equal(await handleStickerCommand(makeCtx(sock, '.attp', 'Halo animasi'), '.attp', 'Halo animasi'), true)
  const out = stickers(sock)
  assert.equal(out.length, 1)
  assert.ok(isWebp(out[0]))
  const meta = await sharp(out[0], { animated: true }).metadata()
  assert.ok(meta.pages === undefined || meta.pages >= 1)
  if (await hasFFmpeg()) {
    assert.ok(meta.pages > 1 || isWebp(out[0]))
  } else {
    assert.ok(textReplies(sock).some((text) => /statis/i.test(text)))
  }
})

test('.pack menampilkan dan menyimpan metadata', async () => {
  mediaBuffer = png
  mediaMime = 'image/png'
  const sock = makeSock()
  await handleStickerCommand(makeCtx(sock, '.pack', ''), '.pack', '')
  assert.ok(textReplies(sock).some((t) => /Sticker Pack/.test(t)))
  const sock2 = makeSock()
  await handleStickerCommand(makeCtx(sock2, '.pack', 'PaketBaru|Penulis'), '.pack', 'PaketBaru|Penulis')
  assert.ok(textReplies(sock2).some((t) => /PaketBaru/.test(t)))
  const sock3 = makeSock()
  await handleStickerCommand(makeCtx(sock3, '.s', ''), '.s', '')
  assert.equal(readExifFromWebp(stickers(sock3)[0])['sticker-pack-name'], 'PaketBaru')
})

test('tidak ada file sementara yang tertinggal', async () => {
  const entries = await fs.readdir(tempDir).catch(() => [])
  assert.deepEqual(entries, [])
  await fs.rm(root, { recursive: true, force: true })
})
