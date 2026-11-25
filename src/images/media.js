import fs from 'node:fs'
import path from 'node:path'
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import sharp from 'sharp'
import { config } from '../config.js'

export const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])

// Mendukung: gambar + caption perintah, dan reply gambar dengan perintah.
export function extractImageTarget(ctx) {
  const message = ctx?.message || {}
  const content = message.message || message
  if (content?.imageMessage) return { message, content: content.imageMessage, quoted: false }
  const quoted = content?.extendedTextMessage?.contextInfo?.quotedMessage
  if (quoted?.imageMessage) {
    return {
      message: { key: message.key, message: quoted },
      content: quoted.imageMessage,
      quoted: true,
    }
  }
  return null
}

export function validateImagePayload(content = {}) {
  const mime = String(content.mimetype || '').toLowerCase()
  if (!ALLOWED_MIMES.has(mime)) {
    throw new Error('Format gambar tidak didukung. Kirim JPG, PNG, atau WEBP.')
  }
  const declared = Number(content.fileLength || 0)
  if (declared > config.imageMaxBytes) {
    throw new Error(`Gambar terlalu besar. Maksimal ${config.imageMaxBytes / 1024 / 1024} MB.`)
  }
  return { mime }
}

export async function downloadImage(target, tempDir, downloader = downloadMediaMessage) {
  validateImagePayload(target.content)
  const buffer = await downloader(target.message, 'buffer', {}, {})
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Gambar gagal diunduh.')
  if (buffer.length > config.imageMaxBytes) throw new Error('Gambar terlalu besar setelah diunduh.')
  let metadata
  try { metadata = await sharp(buffer).metadata() }
  catch { throw new Error('File gambar tidak valid atau rusak.') }
  if (!metadata.width || !metadata.height) throw new Error('Metadata gambar tidak terbaca.')
  if (metadata.width > 12000 || metadata.height > 12000) throw new Error('Dimensi gambar terlalu besar.')
  const file = path.join(tempDir, `source-${Date.now()}.img`)
  await fs.promises.writeFile(file, buffer)
  return { buffer, file, metadata: { width: metadata.width, height: metadata.height, format: metadata.format } }
}
