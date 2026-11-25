// Sticker feature core: port of the original vanXone sticker kit (sharp/canvas/ffmpeg)
// without its adapter layer. Every command works through ctx (sock/jid/message).
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { createCanvas } from '@napi-rs/canvas'
import { config } from '../../config.js'
import { downloadWaMedia } from '../../services/waMedia.js'

const execFileAsync = promisify(execFile)
const SIZE = 512
const MAX_SECONDS = 20
const TTP_COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#0a84ff', '#bf5af2', '#ff2d92', '#ffffff']
const EMOJI_RE = /\p{Extended_Pictographic}/gu

// ---------------------------------------------------------------------------
// Pack metadata (the .pack command can override it at runtime)
// ---------------------------------------------------------------------------
const defaults = () => ({
  packname: process.env.STICKER_PACK || 'Bot',
  author: process.env.STICKER_AUTHOR || 'Bot',
  packId: process.env.STICKER_PACK_ID || 'com.bot.sticker',
  emojis: ['🤖'],
})
let metadataOverride = null

export function getStickerMetadata() {
  return { ...defaults(), ...(metadataOverride || {}) }
}

export function setStickerMetadata(patch = {}) {
  metadataOverride = { ...getStickerMetadata(), ...patch }
  return getStickerMetadata()
}

// .s [crop] [packname|author]
export function parseStickerArg(arg = '') {
  let text = String(arg ?? '').trim()
  const crop = /^crop\b/i.test(text)
  if (crop) text = text.replace(/^crop\b\s*/i, '')
  const [pack, ...rest] = text.split('|')
  const meta = getStickerMetadata()
  return {
    crop,
    packname: pack.trim() || meta.packname,
    author: rest.join('|').trim() || meta.author,
  }
}

// ---------------------------------------------------------------------------
// EXIF — exact byte layout from engine/plugins.js (createExif + fallback)
// ---------------------------------------------------------------------------
export function createExif(options = {}) {
  const meta = { ...getStickerMetadata(), ...options }
  const payload = {
    'sticker-pack-id': meta.packId,
    'sticker-pack-name': meta.packname,
    'sticker-pack-publisher': meta.author,
    emojis: meta.emojis,
    'is-avatar-sticker': 0,
    'android-app-store-link': '',
    'ios-app-store-link': '',
  }
  const json = Buffer.from(JSON.stringify(payload), 'utf8')
  const header = Buffer.from([73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 65, 87, 7, 0, 0, 0, 0, 0, 22, 0, 0, 0])
  const out = Buffer.concat([header, json])
  out.writeUIntLE(json.length, 14, 4)
  return out
}

export function assertWebp(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16 ||
      buffer.subarray(0, 4).toString('latin1') !== 'RIFF' ||
      buffer.subarray(8, 12).toString('latin1') !== 'WEBP') {
    throw new Error('Hasil bukan file WEBP yang valid.')
  }
  return buffer
}

function replaceExifInWebp(buffer, exif) {
  const at = buffer.indexOf(Buffer.from('EXIF'))
  if (at < 0) return injectExifIntoWebp(buffer, exif)
  const size = buffer.readUInt32LE(at + 4)
  const pad = size % 2 === 1 ? 1 : 0
  const head = buffer.subarray(0, at)
  const tail = buffer.subarray(at + 8 + size + pad)
  const chunk = Buffer.concat([Buffer.from('EXIF'), uint32(exif.length), exif, exif.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)])
  const out = Buffer.concat([head, chunk, tail])
  out.writeUInt32LE(out.length - 8, 4)
  return out
}

function uint32(value) {
  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(value >>> 0, 0)
  return buf
}

// WEBP EXIF chunk injection from the original source (node-webpmux fallback).
function injectExifIntoWebp(buffer, exif) {
  const chunk = Buffer.concat([Buffer.from('EXIF'), uint32(exif.length), exif, exif.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)])
  const body = Buffer.concat([buffer.subarray(12), chunk])
  return Buffer.concat([buffer.subarray(0, 4), uint32(4 + body.length), buffer.subarray(8, 12), body])
}

export function addExifToWebp(buffer, options = {}) {
  assertWebp(buffer)
  const exif = createExif(options)
  return buffer.indexOf(Buffer.from('EXIF')) >= 0
    ? replaceExifInWebp(buffer, exif)
    : injectExifIntoWebp(buffer, exif)
}

export function readExifFromWebp(buffer) {
  assertWebp(buffer)
  const at = buffer.indexOf(Buffer.from('EXIF'))
  if (at < 0) return null
  const size = buffer.readUInt32LE(at + 4)
  const raw = buffer.subarray(at + 8, at + 8 + size).toString('utf8')
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)) } catch { return raw }
  }
  return raw
}

// ---------------------------------------------------------------------------
// sharp / ffmpeg helpers
// ---------------------------------------------------------------------------
export async function imageToWebp(buffer, { resize = true } = {}) {
  try {
    let image = sharp(buffer)
    if (resize) image = image.resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    const webp = await image.webp({ quality: 80 }).toBuffer()
    return assertWebp(webp)
  } catch (err) {
    if (err?.message === 'Hasil bukan file WEBP yang valid.') throw err
    throw new Error(`Gagal mengubah gambar ke WEBP: ${err.message}`)
  }
}

export async function imageToSticker(buffer, options = {}, sharpOptions = {}) {
  return addExifToWebp(await imageToWebp(buffer, sharpOptions), options)
}

export function ffmpegBin() {
  return process.env.FFMPEG || 'ffmpeg'
}

export function explainFfmpeg(error) {
  const detail = String(error?.stderr || error?.message || error || '').trim().split('\n').slice(-2).join(' ').slice(0, 300)
  return `ffmpeg tidak tersedia atau gagal (${ffmpegBin()}). ${detail || 'Pasang ffmpeg / set FFMPEG=/path/to/ffmpeg.'}`
}

let ffmpegCache = null
export async function hasFFmpeg() {
  if (ffmpegCache !== null) return ffmpegCache
  try {
    await execFileAsync(ffmpegBin(), ['-version'], { timeout: 5000, maxBuffer: 64 * 1024 })
    ffmpegCache = true
  } catch {
    ffmpegCache = false
  }
  return ffmpegCache
}

export async function runFfmpeg(args, timeoutMs = config.imageTimeoutMs || 60000) {
  try {
    await execFileAsync(ffmpegBin(), args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 })
  } catch (err) {
    throw new Error(explainFfmpeg(err))
  }
}

export async function videoToWebp(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 100) throw new Error('Buffer video tidak valid.')
  if (!await hasFFmpeg()) throw new Error('ffmpeg belum terpasang di server (sudo apt install ffmpeg).')
  const dir = options.workDir || await makeWorkDir()
  const isGif = buffer.subarray(0, 4).toString('latin1') === 'GIF8'
  const input = path.join(dir, `in-${randomUUID()}.${isGif ? 'gif' : 'bin'}`)
  const output = path.join(dir, `out-${randomUUID()}.webp`)
  try {
    await fs.writeFile(input, buffer)
    const fps = Number(options.fps) || 12
    const duration = Math.min(Number(options.duration) || 6, MAX_SECONDS)
    await runFfmpeg([
      '-y', '-t', String(duration), '-i', input,
      '-vf', `fps=${fps},scale='min(${SIZE},iw)':'min(${SIZE},ih)':force_original_aspect_ratio=decrease,pad=${SIZE}:${SIZE}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,setsar=1`,
      '-vcodec', 'libwebp', '-quality', '50', '-loop', '0', '-an', output,
    ])
    const out = await fs.readFile(output)
    if (out.length < 100) throw new Error('Hasil konversi video kosong.')
    return addExifToWebp(out, options.meta || {})
  } finally {
    await fs.rm(input, { force: true }).catch(() => {})
    await fs.rm(output, { force: true }).catch(() => {})
  }
}

// ---------------------------------------------------------------------------
// Media extraction / validation. waMedia.downloadWaMedia owns the downloader
// override used by tests; its validator only knows PDF/images, so we validate
// sticker/video/document media here and hand it a normalized descriptor.
// ---------------------------------------------------------------------------
const MIME_TYPES = {
  image: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  video: new Set(['video/mp4', 'video/webm', 'video/quicktime', 'image/gif']),
  sticker: new Set(['image/webp', 'video/webp']),
  document: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4']),
}

function classify(type, mime) {
  if (type === 'stickerMessage') return 'sticker'
  if (type === 'videoMessage' || mime.startsWith('video/') || mime === 'image/gif') return 'video'
  if (type === 'documentMessage') return 'document'
  return 'image'
}

export function extractStickerTarget(ctx) {
  const root = ctx?.message?.message || ctx?.message || {}
  const pick = (source, quoted) => {
    if (!source) return null
    const type = ['imageMessage', 'videoMessage', 'stickerMessage', 'documentMessage']
      .find((key) => source[key])
    if (!type) return null
    const content = source[type]
    const mime = String(content?.mimetype || '').toLowerCase()
    return {
      type,
      kind: classify(type, mime),
      content,
      mime,
      quoted,
      message: quoted ? { key: ctx?.message?.key, message: source } : ctx.message,
    }
  }
  const direct = pick(root, false)
  if (direct) return direct
  const quoted = root.extendedTextMessage?.contextInfo?.quotedMessage || root.quotedMessage
  return pick(quoted, true)
}

export function validateStickerTarget(target) {
  if (!target) throw new Error('Lampiran tidak ditemukan. Kirim/balas gambar, video, GIF, atau stiker.')
  const allowed = MIME_TYPES[target.kind] || MIME_TYPES.image
  if (!allowed.has(target.mime)) {
    throw new Error(target.kind === 'video'
      ? 'Format video tidak didukung. Kirim MP4, WebM, atau GIF.'
      : 'Format media tidak didukung. Kirim JPG, PNG, WEBP, GIF, atau video.')
  }
  const declared = Number(target.content?.fileLength || 0)
  if (declared > config.imageMaxBytes) throw new Error(`File terlalu besar. Maksimal ${Math.round(config.imageMaxBytes / 1024 / 1024)} MB.`)
  const seconds = Number(target.content?.seconds || target.content?.duration || 0)
  if (seconds > MAX_SECONDS) throw new Error(`Video terlalu panjang, maksimal ${MAX_SECONDS} detik (yang dipakai 6 detik pertama).`)
  return target
}

export async function downloadStickerMedia(ctx, workDir) {
  const target = validateStickerTarget(extractStickerTarget(ctx))
  const downloaded = await downloadWaMedia({
    type: 'image',
    content: { mimetype: 'image/webp', fileLength: target.content.fileLength || 0, fileName: 'sticker-media' },
    message: target.message,
  }, workDir)
  if (target.kind !== 'video' && target.kind !== 'sticker') {
    try { await sharp(downloaded.buffer).metadata() }
    catch { throw new Error('File gambar tidak valid atau rusak.') }
  }
  return { ...downloaded, mime: target.mime, kind: target.kind, target }
}

export async function makeWorkDir() {
  await fs.mkdir(config.imageTempDir, { recursive: true })
  return fs.mkdtemp(path.join(config.imageTempDir, `sticker-${randomUUID()}-`))
}

async function sendSticker(ctx, buffer, extra = {}) {
  assertWebp(buffer)
  await ctx.sock.sendMessage(ctx.jid, { sticker: buffer, ...extra }, { quoted: ctx.message })
  return buffer
}

function quotedText(ctx) {
  const root = ctx?.message?.message || ctx?.message || {}
  const quoted = root.extendedTextMessage?.contextInfo?.quotedMessage || root.quotedMessage
  const value = quoted?.conversation || quoted?.extendedTextMessage?.text || quoted?.imageMessage?.caption || quoted?.videoMessage?.caption || ''
  return String(value || '')
}

export function commandText(ctx, arg) {
  if (arg !== undefined && arg !== null && String(arg).trim()) return String(arg).trim()
  return String(ctx?.text || '').trim()
}

// ---------------------------------------------------------------------------
// Canvas rendering
// ---------------------------------------------------------------------------
function wrapLines(g, text, maxWidth) {
  const words = String(text ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (g.measureText(candidate).width <= maxWidth || !line) {
      line = candidate
    } else {
      lines.push(line)
      line = word
    }
    while (g.measureText(line).width > maxWidth && line.length > 1) {
      let cut = line.length
      while (cut > 1 && g.measureText(line.slice(0, cut)).width > maxWidth) cut -= 1
      lines.push(line.slice(0, cut))
      line = line.slice(cut).trimStart()
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

function fitFont(g, text, { maxWidth = SIZE - 48, maxHeight = SIZE - 48, start = 150, min = 20, family = 'Impact, Arial, sans-serif' } = {}) {
  let size = start
  let lines
  do {
    g.font = `bold ${size}px ${family}`
    lines = wrapLines(g, text, maxWidth)
    if (lines.length * (size + 14) > maxHeight || lines.some((l) => g.measureText(l).width > maxWidth)) size -= 6
    else break
  } while (size > min)
  g.font = `bold ${size}px ${family}`
  return { size, lines }
}

export function renderTtp(text, color, frame = 0, frames = 1) {
  const cv = createCanvas(SIZE, SIZE)
  const g = cv.getContext('2d')
  const { size, lines } = fitFont(g, text)
  const lineHeight = size + 14
  const shift = frames > 1 ? Math.sin((frame / frames) * Math.PI * 2) * 12 : 0
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  g.lineWidth = Math.max(6, size / 6)
  let y = SIZE / 2 - ((lines.length - 1) * lineHeight) / 2 + shift
  for (const line of lines) {
    g.strokeStyle = '#000000'
    g.strokeText(line, SIZE / 2, y)
    g.fillStyle = color || TTP_COLORS[Math.floor(Math.random() * TTP_COLORS.length)]
    g.fillText(line, SIZE / 2, y)
    y += lineHeight
  }
  return cv.encode('png')
}

export function renderQc(text, name = 'User') {
  const cv = createCanvas(SIZE, SIZE)
  const g = cv.getContext('2d')
  g.fillStyle = '#0f172a'
  g.fillRect(0, 0, SIZE, SIZE)
  g.fillStyle = '#2563eb'
  g.beginPath()
  g.arc(74, 84, 42, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#ffffff'
  g.font = 'bold 44px Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(String(name).slice(0, 1).toUpperCase(), 74, 86)
  g.textAlign = 'left'
  g.fillStyle = '#e2e8f0'
  g.font = 'bold 26px Arial, sans-serif'
  g.fillText(String(name).slice(0, 22), 132, 78)
  g.fillStyle = '#64748b'
  g.font = '18px Arial, sans-serif'
  g.fillText('Quote Sticker', 132, 106)
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.roundRect(28, 146, 456, 300, 28)
  g.fill()
  g.beginPath()
  g.moveTo(58, 446)
  g.lineTo(58, 492)
  g.lineTo(108, 446)
  g.fill()
  g.fillStyle = '#0f172a'
  const { size, lines } = fitFont(g, text, { maxWidth: 400, maxHeight: 240, start: 46, min: 18, family: 'Arial, sans-serif' })
  g.font = `bold ${size}px Arial, sans-serif`
  let y = 180
  for (const line of lines.slice(0, 6)) {
    g.fillText(line, 56, y)
    y += size + 12
  }
  g.fillStyle = '#94a3b8'
  g.font = '16px Arial, sans-serif'
  g.fillText('— ' + String(name).slice(0, 28), 56, 458)
  return cv.encode('png')
}

export function renderBrat(text, theme = 'white', blur = 0) {
  const bg = { green: '#8ace00', black: '#000000', white: '#ffffff' }[theme] || '#ffffff'
  const fg = theme === 'black' ? '#ffffff' : '#000000'
  const cv = createCanvas(SIZE, SIZE)
  const g = cv.getContext('2d')
  g.fillStyle = bg
  g.fillRect(0, 0, SIZE, SIZE)
  const { size, lines } = fitFont(g, text, { maxWidth: SIZE - 48, maxHeight: SIZE - 64, start: 82, min: 18, family: 'Arial, sans-serif' })
  g.font = `bold ${size}px Arial, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = fg
  g.strokeStyle = fg
  g.lineWidth = 1
  g.shadowColor = fg
  g.shadowBlur = Math.min(3, Math.max(0, Number(blur) || 0)) * 6
  let y = SIZE / 2 - ((lines.length - 1) * (size + 8)) / 2
  for (const line of lines) {
    g.fillText(line, SIZE / 2, y)
    y += size + 8
  }
  return cv.encode('png')
}

export function renderEmojiMix(emoji1, emoji2) {
  const cv = createCanvas(SIZE, SIZE)
  const g = cv.getContext('2d')
  const gradient = g.createLinearGradient(0, 0, SIZE, SIZE)
  gradient.addColorStop(0, '#fef9c3')
  gradient.addColorStop(1, '#dbeafe')
  g.fillStyle = gradient
  g.fillRect(0, 0, SIZE, SIZE)
  g.font = '180px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(emoji1, 150, 268)
  g.fillText(emoji2, 362, 268)
  g.fillStyle = '#475569'
  g.font = 'bold 28px Arial, sans-serif'
  g.fillText('×', 256, 270)
  g.fillText(`${emoji1} + ${emoji2}`, 256, 454)
  return cv.encode('png')
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------
export async function cmdSticker(ctx, arg) {
  const workDir = await makeWorkDir()
  try {
    const media = await downloadStickerMedia(ctx, workDir)
    const meta = parseStickerArg(arg)
    const dynamic = media.kind === 'video' || media.kind === 'sticker' && media.mime === 'video/webp'
    if (media.target.content?.seconds > MAX_SECONDS) throw new Error(`Video terlalu panjang, maksimal ${MAX_SECONDS} detik.`)
    const webp = dynamic
      ? await videoToWebp(media.buffer, { workDir, meta, duration: 6 })
      : await imageToSticker(media.buffer, meta, { resize: true })
    return await sendSticker(ctx, webp)
  } finally {
    await fs.rm(workDir, { recursive: true, force: true })
  }
}

export async function cmdTtp(ctx, arg) {
  const words = String(arg ?? '').trim().split(/\s+/).filter(Boolean)
  let color = null
  if (/^#[0-9a-f]{6}$/i.test(words[0] || '')) color = words.shift()
  const text = (words.join(' ') || quotedText(ctx)).replace(/\s+/g, ' ').trim()
  if (!text) throw new Error('Masukkan teksnya. Contoh: .ttp halo semua (atau .ttp #ff0000 halo).')
  if (text.length > 80) throw new Error('Teks terlalu panjang. Maksimal 80 karakter.')
  const png = await renderTtp(text, color)
  return sendSticker(ctx, await imageToSticker(png, parseStickerArg('')))
}

export async function cmdAttp(ctx, arg) {
  const text = String(arg ?? '').trim() || quotedText(ctx)
  if (!text) throw new Error('Masukkan teksnya. Contoh: .attp halo semua.')
  if (text.length > 100) throw new Error('Teks terlalu panjang. Maksimal 100 karakter.')
  const workDir = await makeWorkDir()
  try {
    const frames = 8
    const color = TTP_COLORS[Math.floor(Math.random() * TTP_COLORS.length)]
    const first = await renderTtp(text, color, 0, 1)
    if (!await hasFFmpeg()) {
      const sticker = await sendSticker(ctx, await imageToSticker(first, parseStickerArg('')))
      await ctx.sock.sendMessage(ctx.jid, {
        text: 'FFmpeg tidak tersedia; .attp dikirim sebagai stiker statis.',
      })
      return sticker
    }
    const pattern = path.join(workDir, 'frame-%03d.png')
    for (let i = 0; i < frames; i += 1) {
      const frameColor = TTP_COLORS[(TTP_COLORS.indexOf(color) + i) % TTP_COLORS.length]
      await fs.writeFile(path.join(workDir, `frame-${String(i).padStart(3, '0')}.png`), await renderTtp(text, frameColor, i, frames))
    }
    const out = path.join(workDir, 'animated.webp')
    await runFfmpeg(['-y', '-framerate', '8', '-i', pattern, '-vcodec', 'libwebp', '-quality', '60', '-loop', '0', '-an', out])
    const animated = assertWebp(await fs.readFile(out))
    return sendSticker(ctx, addExifToWebp(animated, parseStickerArg('')))
  } finally {
    await fs.rm(workDir, { recursive: true, force: true })
  }
}

export async function cmdQc(ctx, arg) {
  const text = String(arg ?? '').trim() || quotedText(ctx)
  if (!text) throw new Error('Masukkan teks untuk membuat Quote Sticker. Contoh: .qc Halo Semuanya!')
  if (text.length > 200) throw new Error('Teks terlalu panjang. Maksimal 200 karakter.')
  const root = ctx?.message?.message || ctx?.message || {}
  const quoted = root.extendedTextMessage?.contextInfo?.quotedMessage || root.quotedMessage
  const sender = String(quoted?.key?.participant || ctx?.adminJid || ctx?.jid || '').split('@')[0].split(':')[0]
  const name = quoted?.pushName || ctx?.pushName || sender || 'User'
  return sendSticker(ctx, await imageToSticker(await renderQc(text, name), parseStickerArg('')))
}

export async function cmdBrat(ctx, arg) {
  const words = String(arg ?? '').trim().split(/\s+/).filter(Boolean)
  let theme = null
  let blur = 0
  const themes = { putih: 'white', white: 'white', hitam: 'black', black: 'black', hijau: 'green', green: 'green' }
  while (words.length && (themes[words[0].toLowerCase()] || /^blur[0-3]$/i.test(words[0]))) {
    const word = words.shift()
    if (themes[word.toLowerCase()]) theme = themes[word.toLowerCase()]
    else blur = Number(word.replace(/^blur/i, ''))
  }
  const text = words.join(' ').trim() || quotedText(ctx)
  if (!text) throw new Error('Masukkan teksnya (atau reply pesan). Contoh: .brat hijau blur1 halo semua.')
  if (text.length > 200) throw new Error('Teks terlalu panjang! Maksimal 200 karakter.')
  const png = await renderBrat(text, theme || 'white', blur)
  return sendSticker(ctx, await imageToSticker(png, parseStickerArg('')))
}

export async function cmdEmojimix(ctx, arg) {
  const text = String(arg ?? '').trim() || quotedText(ctx)
  const emojis = text.match(EMOJI_RE)
  if (!emojis || emojis.length < 2) throw new Error('Masukkan minimal 2 emoji. Contoh: .emojimix 😂🔥')
  const png = await renderEmojiMix(emojis[0], emojis[1])
  return sendSticker(ctx, await imageToSticker(png, { ...parseStickerArg(''), emojis: emojis.slice(0, 2) }))
}

export async function cmdToimg(ctx, arg) {
  const workDir = await makeWorkDir()
  try {
    const media = await downloadStickerMedia(ctx, workDir)
    const meta = await sharp(media.buffer, { animated: true }).metadata()
    if (meta.pages && meta.pages > 1) {
      const gif = await sharp(media.buffer, { animated: true }).gif().toBuffer()
      if (await hasFFmpeg()) {
        const gifPath = path.join(workDir, 'animated.gif')
        const mp4Path = path.join(workDir, 'animated.mp4')
        await fs.writeFile(gifPath, gif)
        try {
          await runFfmpeg(['-y', '-i', gifPath, '-movflags', 'faststart', '-pix_fmt', 'yuv420p',
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', mp4Path])
          const video = await fs.readFile(mp4Path)
          await ctx.sock.sendMessage(ctx.jid, { video, mimetype: 'video/mp4', gifPlayback: true }, { quoted: ctx.message })
          return video
        } catch {
          // Fall back to animated GIF when the MP4 muxer is unavailable.
        }
      }
      await ctx.sock.sendMessage(ctx.jid, { video: gif, mimetype: 'image/gif', gifPlayback: true }, { quoted: ctx.message })
      return gif
    }
    const png = await sharp(media.buffer).png().toBuffer()
    await ctx.sock.sendMessage(ctx.jid, { image: png }, { quoted: ctx.message })
    return png
  } finally {
    await fs.rm(workDir, { recursive: true, force: true })
  }
}

export async function cmdPack(ctx, arg) {
  const text = String(arg ?? '').trim()
  if (!text) {
    const m = getStickerMetadata()
    await ctx.sock.sendMessage(ctx.jid, {
      text: [
        '📦 *Sticker Pack*',
        `Nama: ${m.packname}`,
        `Author: ${m.author}`,
        `ID: ${m.packId}`,
        `Emoji: ${m.emojis.join(' ')}`,
        '',
        `Ubah: \`.pack nama|author\``,
      ].join('\n'),
    })
    return getStickerMetadata()
  }
  const [pack, ...rest] = text.split('|')
  const patch = {}
  if (pack.trim()) patch.packname = pack.trim()
  if (rest.join('|').trim()) patch.author = rest.join('|').trim()
  const next = setStickerMetadata(patch)
  await ctx.sock.sendMessage(ctx.jid, { text: `✅ Pack disimpan: ${next.packname} | ${next.author}` })
  return next
}
