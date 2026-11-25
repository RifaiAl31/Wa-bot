import test from 'node:test'
import assert from 'node:assert/strict'
import { testEnv } from './helpers.js'

testEnv('document')
const { extractDocument, normalizeExtractedText, isAllowed } = await import('../src/services/documentService.js')

test('ekstrak TXT/MD dengan format baris baru dipertahankan', async () => {
  const text = 'Assalamu\'alaikum\n\nBaris kedua\n\nTerima kasih.'
  const result = await extractDocument({ buffer: Buffer.from(text), originalname: 'pengumuman.txt', mimetype: 'text/plain' })
  assert.equal(result.text, text)
  assert.equal(result.meta.extension, '.txt')
  assert.equal(isAllowed('file.docx'), true)
  assert.equal(isAllowed('file.exe'), false)
})

test('normalisasi tidak menghapus isi, hanya membersihkan spasi berlebih', () => {
  assert.equal(normalizeExtractedText('  a  \r\n\r\n\r\n\r\n  b  '), 'a\n\n  b')
})

test('format tidak didukung dan file rusak ditolak dengan pesan jelas', async () => {
  await assert.rejects(() => extractDocument({ buffer: Buffer.from('x'), originalname: 'file.doc' }), /Simpan ulang sebagai \.docx/)
  await assert.rejects(() => extractDocument({ buffer: Buffer.from('x'), originalname: 'file.exe' }), /tidak didukung/)
  await assert.rejects(() => extractDocument({ buffer: Buffer.from(''), originalname: 'a.txt' }), /kosong/)
})
