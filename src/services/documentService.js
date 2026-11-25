import path from 'node:path'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import { config } from '../config.js'

const ALLOWED = new Set(['.pdf', '.docx', '.txt', '.md'])

export function allowedExtensions() { return [...ALLOWED] }

export function isAllowed(filename) {
  return ALLOWED.has(path.extname(String(filename || '')).toLowerCase())
}

// Hasil ekstraksi selalu ditampilkan untuk diedit admin sebelum disimpan.
// Tidak ada file yang dikirim ke grup: pengumuman yang dikirim tetap teks biasa.
export function normalizeExtractedText(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function extractPdf(buffer) {
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return result.text || ''
  } finally {
    await parser.destroy()
  }
}

async function extractDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer })
  return result.value || ''
}

export async function extractDocument({ buffer, originalname, mimetype }) {
  if (!buffer || !buffer.length) throw new Error('File kosong')
  if (buffer.length > config.maxUploadMb * 1024 * 1024) {
    throw new Error(`Ukuran file melebihi batas ${config.maxUploadMb} MB`)
  }
  const ext = path.extname(String(originalname || '')).toLowerCase()
  if (!ALLOWED.has(ext)) {
    if (ext === '.doc') throw new Error('Format .doc lama tidak didukung. Simpan ulang sebagai .docx.')
    throw new Error(`Format ${ext || 'tidak dikenal'} tidak didukung. Gunakan PDF, DOCX, TXT, atau MD.`)
  }
  let raw
  try {
    if (ext === '.pdf') raw = await extractPdf(buffer)
    else if (ext === '.docx') raw = await extractDocx(buffer)
    else raw = buffer.toString('utf8')
  } catch (err) {
    throw new Error(`Gagal membaca dokumen: ${err.message}`)
  }
  const text = normalizeExtractedText(raw)
  if (!text) throw new Error('Tidak ada teks yang bisa diekstrak dari dokumen ini')
  return {
    text,
    meta: {
      filename: String(originalname || 'dokumen'),
      mimetype: mimetype || 'application/octet-stream',
      extension: ext,
      chars: text.length,
      truncated: text.length > 20000,
    },
  }
}
