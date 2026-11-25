import fs from 'node:fs/promises'
import path from 'node:path'
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import { config } from '../config.js'

const ALLOWED = {
  document: new Set(['application/pdf']),
  image: new Set(['image/jpeg', 'image/png', 'image/webp']),
}

export function extractMediaTarget(ctx) {
  const message = ctx?.message || {}
  const content = message.message || message
  if (content?.documentMessage) return { type: 'document', content: content.documentMessage, message, quoted: false }
  if (content?.imageMessage) return { type: 'image', content: content.imageMessage, message, quoted: false }

  const quoted = content?.extendedTextMessage?.contextInfo?.quotedMessage
  if (quoted?.documentMessage) {
    return { type: 'document', content: quoted.documentMessage, message: { key: message.key, message: quoted }, quoted: true }
  }
  if (quoted?.imageMessage) {
    return { type: 'image', content: quoted.imageMessage, message: { key: message.key, message: quoted }, quoted: true }
  }
  return null
}

export function validateMedia(target) {
  if (!target) throw new Error('Lampiran tidak ditemukan.')
  const mime = String(target.content?.mimetype || '').toLowerCase()
  const allowed = ALLOWED[target.type]
  if (!allowed || !allowed.has(mime)) {
    throw new Error(target.type === 'document'
      ? 'Format dokumen tidak didukung. Kirim file PDF.'
      : 'Format gambar tidak didukung. Kirim JPG, PNG, atau WEBP.')
  }
  const declared = Number(target.content?.fileLength || 0)
  if (declared > config.imageMaxBytes) {
    throw new Error(`File terlalu besar. Maksimal ${config.imageMaxBytes / 1024 / 1024} MB.`)
  }
  return mime
}

let downloaderOverride = null
export function setWaDownloader(fn) { downloaderOverride = fn }

export async function downloadWaMedia(target, tempDir, downloader = downloaderOverride || downloadMediaMessage) {
  validateMedia(target)
  const buffer = await downloader(target.message, 'buffer', {}, {})
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Lampiran gagal diunduh.')
  if (buffer.length > config.imageMaxBytes) throw new Error('File terlalu besar setelah diunduh.')
  const ext = target.type === 'document' ? '.pdf' : '.img'
  const file = path.join(tempDir, `${target.type}-${Date.now()}${ext}`)
  await fs.writeFile(file, buffer)
  return {
    buffer, file,
    mimetype: String(target.content?.mimetype || '').toLowerCase(),
    filename: String(target.content?.fileName || target.content?.fileName || (target.type === 'document' ? 'dokumen.pdf' : 'gambar')),
  }
}
