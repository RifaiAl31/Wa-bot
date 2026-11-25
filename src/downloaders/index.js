import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config.js'
import { reply } from '../commands/context.js'
import { roleOf } from '../services/roleService.js'
import { featureService } from '../services/featureService.js'
import { logger } from '../logger.js'
import { validatePublicUrl } from './safeUrl.js'
import { ytDlpExtractor } from './ytDlp.js'

let extractor = ytDlpExtractor
const rate = new Map()

export function setDownloaderExtractor(next) { extractor = next || ytDlpExtractor }

function allowedRequest(jid) {
  const limit = Math.max(1, Number(config.downloaderRateLimit) || 5)
  const now = Date.now()
  const row = rate.get(jid)
  if (!row || now - row.at > 10 * 60_000) { rate.set(jid, { at: now, count: 1 }); return true }
  row.count += 1
  return row.count <= limit
}

function successText(platform, filename) {
  return [
    '╭━━━「 DOWNLOAD SUCCESS 」━━━╮',
    '│',
    '│ Status: SUCCESS',
    `│ Platform: ${platform}`,
    `│ File: ${filename}`,
    '│',
    '╰━━━━━━━━━━━━━━━━━━━━━━╯',
    'Atribusi/watermark asli tetap dipertahankan.',
    'KAYY ASSISTANT — Powered by Dev RifaiAl',
  ].join('\n')
}

export async function downloaderCommand(ctx, cmd, arg = '') {
  const role = roleOf(ctx.adminJid)
  if (!config.downloaderEnabled || !featureService.isFeatureEnabled('downloader', role)) {
    return reply(ctx, 'Fitur downloader tidak tersedia.')
  }
  const platform = cmd === '.tiktok' ? 'TikTok' : 'Instagram'
  const raw = String(arg || '').trim()
  if (!raw || !/^https?:\/\//i.test(raw)) {
    return reply(ctx, `Contoh: ${cmd} https://www.${platform === 'TikTok' ? 'tiktok' : 'instagram'}.com/...`)
  }
  if (!allowedRequest(ctx.adminJid)) return reply(ctx, 'Terlalu banyak permintaan download. Coba lagi dalam 10 menit.')

  let url
  try { url = validatePublicUrl(raw, platform.toLowerCase()) } catch (err) { return reply(ctx, err.message) }

  const tempDir = path.join(config.root, 'data', 'tmp', 'downloads')
  await fs.mkdir(tempDir, { recursive: true })
  let downloaded = null
  try {
    downloaded = await extractor.download(url.href, { platform: platform.toLowerCase(), tempDir })
    const buffer = await fs.readFile(downloaded.file)
    const ext = downloaded.ext || path.extname(downloaded.file)
    const caption = `${platform} — KAYY ASSISTANT — By Dev RifaiAl`
    if (['.mp4', '.webm', '.mov'].includes(ext)) {
      await ctx.sock.sendMessage(ctx.jid, { video: buffer, mimetype: ext === '.webm' ? 'video/webm' : 'video/mp4', caption })
    } else {
      await ctx.sock.sendMessage(ctx.jid, {
        document: buffer,
        fileName: path.basename(downloaded.file),
        mimetype: 'application/octet-stream',
        caption,
      })
    }
    await reply(ctx, successText(platform, path.basename(downloaded.file)))
    logger.info(`Downloader ${platform} berhasil (${downloaded.bytes} bytes)`)
  } catch (err) {
    logger.warn(`Downloader ${platform} gagal: ${err.message}`)
    await reply(ctx, `Gagal mengunduh: ${err.message}`)
  } finally {
    if (downloaded?.file) {
      try { await fs.unlink(downloaded.file) } catch { /* sudah terhapus */ }
    }
  }
}
