import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas'
import sharp from 'sharp'
import { config } from '../config.js'

// Font emoji lokal dipakai supaya emoji tidak berubah menjadi kotak (tofu).
try {
  const EMOJI_FONT = '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf'
  if (fs.existsSync(EMOJI_FONT)) GlobalFonts.registerFromPath(EMOJI_FONT, 'Noto Color Emoji')
} catch { /* fallback ke font sistem */ }

export const FONT = '"Noto Sans", "Noto Color Emoji", "DejaVu Sans", sans-serif'
export const font = (size, weight = '400') => `${weight} ${size}px ${FONT}`.trim()

const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('id', { granularity:'grapheme' }) : null
const graphemes = (text) => segmenter ? [...segmenter.segment(text)].map((s) => s.segment) : Array.from(text)

export function makeTempDir() {
  const dir = path.join(config.imageTempDir, crypto.randomUUID())
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function cleanupTemp(dir) {
  if (!dir) return
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* abaikan */ }
}

export async function fitImage(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: config.imageMaxSide, height: config.imageMaxSide, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer()
}

export async function blurredCover(buffer, width, height) {
  return sharp(buffer).rotate().resize(width, height, { fit: 'cover' }).blur(14).png().toBuffer()
}

export async function imageFromBuffer(buffer) { return loadImage(buffer) }

export function page(width, height) {
  const canvas = createCanvas(width, height)
  return { canvas, ctx: canvas.getContext('2d') }
}

export async function toPng(canvas) { return Buffer.from(await canvas.encode('png')) }

export function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

export function fillRoundRect(ctx, x, y, w, h, r, color) {
  roundRect(ctx, x, y, w, h, r)
  ctx.fillStyle = color
  ctx.fill()
}

// Memasukkan foto utuh apa adanya (tanpa crop), dengan ruang kosong bila
// proporsinya berbeda dari kanvas.
export function drawContain(ctx, image, x, y, w, h, background = '#0b1220') {
  ctx.fillStyle = background
  ctx.fillRect(x, y, w, h)
  const scale = Math.min(w / image.width, h / image.height)
  const dw = image.width * scale
  const dh = image.height * scale
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

export function drawCover(ctx, image, x, y, w, h) {
  const scale = Math.max(w / image.width, h / image.height)
  const sw = w / scale
  const sh = h / scale
  const sx = (image.width - sw) / 2
  const sy = (image.height - sh) / 2
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h)
}

export function wrapLines(ctx, text, maxWidth, maxLines = 10) {
  const lines = []
  for (const paragraph of String(text || '').split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) { lines.push(''); continue }
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (ctx.measureText(candidate).width <= maxWidth) { current = candidate; continue }
      if (current) lines.push(current)
      // Kata sangat panjang dipecah per grapheme, kata normal dipindah utuh.
      if (ctx.measureText(word).width > maxWidth) {
        let piece = ''
        for (const ch of graphemes(word)) {
          if (ctx.measureText(piece + ch).width > maxWidth && piece) { lines.push(piece); piece = ch }
          else piece += ch
        }
        current = piece
      } else current = word
      if (lines.length >= maxLines) break
    }
    lines.push(current)
    if (lines.length >= maxLines) break
  }
  if (lines.length > maxLines) lines.length = maxLines
  return lines
}

export function fitText(ctx, text, maxWidth, { start = 46, min = 20, maxLines = 8, weight = '400', family = FONT } = {}) {
  for (let size = start; size >= min; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`
    const lines = wrapLines(ctx, text, maxWidth, maxLines)
    const last = lines.at(-1) || ''
    const truncated = last.length > 2 && /[.!?,;:)\]}]$/.test(last)
    if (lines.length <= maxLines && !truncated) return { size, lines }
  }
  ctx.font = `${weight} ${min}px ${family}`
  return { size: min, lines: wrapLines(ctx, text, maxWidth, maxLines) }
}

export function drawLines(ctx, lines, x, y, lineHeight, color = '#111', align = 'left') {
  ctx.fillStyle = color
  ctx.textAlign = align
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight))
  ctx.textAlign = 'left'
}

export function drawWatermark(ctx, width, height) {
  ctx.save()
  ctx.font = `600 22px ${FONT}`
  const label = 'EDIT / MOCKUP'
  const w = ctx.measureText(label).width + 26
  const h = 34
  fillRoundRect(ctx, width - w - 24, height - h - 24, w, h, 17, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = '#ffffff'
  ctx.fillText(label, width - w - 11, height - h - 24 + 23)
  ctx.restore()
}

export function defaultAvatar(ctx, x, y, size, color = '#25D366') {
  fillRoundRect(ctx, x, y, size, size, size / 2, color)
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 ${Math.round(size * 0.45)}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.fillText('Q', x + size / 2, y + size * 0.68)
  ctx.textAlign = 'left'
}
