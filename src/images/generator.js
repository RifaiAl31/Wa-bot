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

export const QUOTE_MODES = {
  '.iqc': { name: IPHONE_NAME, render: renderIphone },
  '.tqc': { name: TIKTOK_NAME, render: renderTiktok },
  '.wq': { name: WINDOWS_NAME, render: renderWindows },
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
  const parsed = ctx.cmd === '.tqc' ? parseTiktokInput(flags.text) : { name: 'Raiden', text: flags.text }

  return withReaction(ctx, async () => {
    let tmp
    try {
      tmp = engine.makeTempDir()
      if (!parsed.text.trim()) {
        throw new Error(ctx.cmd === '.tqc' && input.includes('|')
          ? 'Teks quote kosong. Gunakan format .tqc nama|teks.'
          : `Teks quote kosong. Contoh: ${ctx.cmd} teks`)
      }
      if (parsed.text.length > config.imageMaxTextChars) {
        throw new Error(`Teks terlalu panjang. Maksimal ${config.imageMaxTextChars} karakter.`)
      }
      if (ctx.cmd === '.tqc' && input.includes('|') && !parsed.name) {
        throw new Error('Nama kontak kosong. Gunakan format .tqc nama|teks.')
      }
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
      const render = deps.render || mode.render
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
        `Mode: ${mode.name}`,
        'Hasil edit/mockup — bukan percakapan asli.',
      ].join('\n')
      await ctx.sock.sendMessage(ctx.jid, {
        image: png,
        caption,
        quoted: quotedFrom(ctx),
      })
      logger.info(`${ctx.cmd}: gambar ${mode.name} dikirim ke ${ctx.jid} (${png.length} bytes)`)
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
