import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'

function available() {
  const probe = spawnSync('yt-dlp', ['--version'], { timeout: 8000, encoding: 'utf8' })
  return !probe.error && probe.status === 0
}

export const ytDlpExtractor = {
  name: 'yt-dlp',
  available,
  async download(url, { platform, tempDir }) {
    if (!available()) {
      throw new Error('Extractor yt-dlp belum terpasang. Di Termux: pkg install python && pip install yt-dlp')
    }
    const output = path.join(tempDir, `${platform}-%(id)s.%(ext)s`)
    const args = [
      '--no-playlist', '--no-warnings', '--no-call-home',
      '--socket-timeout', '20', '--retries', '2',
      '--max-filesize', `${Math.max(1, Number(config.downloaderMaxMb) || 50)}M`,
      '-o', output, '--print', 'after_move:filepath', url,
    ]
    const result = spawnSync('yt-dlp', args, {
      timeout: Number(config.downloaderTimeoutMs) || 120000,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    })
    if (result.error) throw new Error(result.error.message)
    if (result.status !== 0) {
      const detail = String(result.stderr || '').trim().split('\n').slice(-3).join(' ').slice(0, 300)
      throw new Error(`Gagal mengambil media publik (${result.status}). ${detail}`)
    }
    const file = String(result.stdout || '').trim().split('\n').map((x) => x.trim()).filter(Boolean).at(-1)
    if (!file || !fs.existsSync(file)) throw new Error('Extractor selesai tetapi file tidak ditemukan.')
    const bytes = fs.statSync(file).size
    if (bytes > (Number(config.downloaderMaxMb) || 50) * 1024 * 1024) {
      fs.unlinkSync(file)
      throw new Error('File melebihi batas ukuran yang diizinkan.')
    }
    return { file, bytes, ext: path.extname(file).toLowerCase() }
  },
}
