import sharp from 'sharp'
import { config } from '../config.js'
import { logger } from '../logger.js'
import { withReaction } from '../commands/reactions.js'
import { reply } from '../commands/context.js'
import * as engine from './engine.js'
import * as media from './media.js'
import { render as renderIphone, MODE_NAME as IPHONE_NAME } from './templates/iphone.js'
import { render as renderTiktok, MODE_NAME as TIKTOK_NAME } from './templates/tiktok.js'
import { render as renderWindows, MODE_NAME as WINDOWS_NAME } from './templates/windows.js'
import {
  render as renderIqc5,
  renderDark as renderIqcDark,
  renderPink as renderIqcPink,
  renderPinkV2 as renderIqcPinkV2,
  renderRed as renderIqcRed,
  MODE_NAME as IQC5_NAME,
} from './templates/iqc5.js'
import { render as renderYoutubeComment } from './templates/youtube-comment.js'

export const QUOTE_MODES = {
  '.iqc': { name: IPHONE_NAME, render: renderIphone },
  '.tqc': { name: TIKTOK_NAME, render: renderTiktok },
  '.wq': { name: WINDOWS_NAME, render: renderWindows },
  '.iqc5': { name: IQC5_NAME, render: renderIqc5 },
  '.qc5': { name: IQC5_NAME, render: renderIqc5 },
  '.iqc2': { name: 'iPhone Quote Creator 2 (lokal)', render: renderIqc5 },
  '.iqcdark': { name: 'iPhone Quote Dark Mockup (lokal)', render: renderIqcDark },
  '.iqcpink': { name: 'iPhone Quote Pink Mockup (lokal)', render: renderIqcPink },
  '.iqcpinkv2': { name: 'iPhone Quote Pink V2 Mockup (lokal)', render: renderIqcPinkV2 },
  '.iqcmerah': { name: 'iPhone Quote Merah Mockup (lokal)', render: renderIqcRed },
  '.iqc-red': { name: 'iPhone Quote Merah Mockup (lokal)', render: renderIqcRed },
  '.rediqc': { name: 'iPhone Quote Merah Mockup (lokal)', render: renderIqcRed },
  '.iqcwin': { name: 'Windows Classic Quote Mockup (lokal)', render: renderWindows },
  '.iqcwindow': { name: 'Windows Classic Quote Mockup (lokal)', render: renderWindows },
  '.tiktokchat': { name: 'TikTok Chat Mockup (lokal)', render: renderTiktok },
  '.ttchat': { name: 'TikTok Chat Mockup (lokal)', render: renderTiktok },
  '.ytcomment': { name: 'YouTube Comment Mockup (lokal)', render: renderYoutubeComment },
}

export function parseTiktokInput(input) {
  const raw = String(input || '')
  const separator = raw.indexOf('|')
  if (separator < 0) return { name: 'Raiden', text: raw }
  return {
    name: raw.slice(0, separator).trim(),
    text: raw.slice(separator + 1).replace(/^\s+/, ''),
  }
}

export function parseNamedQuoteInput(input) {
  return parseTiktokInput(input)
}

export function parseImageInput(text = '') {
  const raw = /\s--(raw|original|asli|nofilter)\b/i.test(String(text))
  const clean = String(text).replace(/\s--(raw|original|asli|nofilter)\b/ig, '').trim()
  return { text: clean, raw }
}

function quotedFrom(ctx) {
  if (!ctx?.message?.key || !ctx?.message?.message) return undefined
  return { key: ctx.message.key, message: ctx.message.message }
}

export async function handleQuoteCommand(ctx, deps = {}) {
  const mode = QUOTE_MODES[ctx.cmd]
  if (!mode) return { ok: false, error: 'Mode tidak dikenal' }
  const input = String(ctx.arg || '')
  const flags = parseImageInput(input)
  const needsName = ['.tqc', '.tiktokchat', '.ttchat', '.ytcomment'].includes(ctx.cmd)
  const explicitName = ['.tiktokchat', '.ttchat', '.ytcomment'].includes(ctx.cmd)
  const parsed = needsName ? parseNamedQuoteInput(flags.text) : { name: 'Raiden', text: flags.text }
  const modeName = {
    '.ttchat': 'TikTok Chat Mockup (lokal)',
    '.iqc2': 'iPhone Quote Creator 2 (lokal)',
    '.qc5': IQC5_NAME,
  }[ctx.cmd] || mode.name
  const render = deps.render || mode.render

  return withReaction(ctx, async () => {
    let tmp
    try {
      tmp = engine.makeTempDir()
      if (explicitName && !flags.text.includes('|')) {
        throw new Error(`Gunakan format ${ctx.cmd} nama|teks.`)
      }
      if (!parsed.text.trim()) {
        throw new Error(needsName && input.includes('|')
          ? `Teks quote kosong. Gunakan format ${ctx.cmd} nama|teks.`
          : `Teks quote kosong. Contoh: ${ctx.cmd} teks`)
      }
      if (parsed.text.length > config.imageMaxTextChars) {
        throw new Error(`Teks terlalu panjang. Maksimal ${config.imageMaxTextChars} karakter.`)
      }
      if (needsName && input.includes('|') && !parsed.name) {
        throw new Error(`Nama kosong. Gunakan format ${ctx.cmd} nama|teks.`)
      }
      if (!render) throw new Error('Template belum tersedia.')
      const target = media.extractImageTarget(ctx)
      let source = null
      if (target) {
        media.validateImagePayload(target.content)
        source = await withTimeout(
          deps.download
            ? deps.download(target, tmp)
            : media.downloadImage(target, tmp, deps.downloader),
          config.imageTimeoutMs,
          'Unduhan gambar melewati batas waktu.'
        )
      }
      const png = await withTimeout(
        render({ text: parsed.text, name: parsed.name, source, raw: flags.raw }),
        config.imageTimeoutMs,
        'Proses rendering melewati batas waktu.'
      )
      if (!Buffer.isBuffer(png) || !png.length) throw new Error('Hasil rendering kosong.')
      const metadata = await sharp(png).metadata()
      if (metadata.format !== 'png' || !metadata.width || !metadata.height) {
        throw new Error('File hasil bukan PNG yang valid.')
      }
      const caption = [
        '✅ Done!', '',
        'Image berhasil dibuat.', '',
        `Mode: ${modeName}`,
        'Hasil edit/mockup — bukan percakapan asli.',
      ].join('\n')
      await ctx.sock.sendMessage(ctx.jid, {
        image: png,
        caption,
        quoted: quotedFrom(ctx),
      })
      logger.info(`${ctx.cmd}: gambar ${modeName} dikirim ke ${ctx.jid} (${png.length} bytes)`)
      return { ok: true, bytes: png.length }
    } catch (err) {
      logger.warn(`${ctx.cmd} gagal: ${err.message}`)
      await reply(ctx, `Gagal membuat gambar: ${err.message}`)
      return { ok: false, error: err.message }
    } finally {
      engine.cleanupTemp(tmp)
    }
  })
}

function withTimeout(promise, timeoutMs, message) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    }),
  ]).finally(() => clearTimeout(timer))
}
