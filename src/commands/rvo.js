import fs from 'node:fs/promises'
import { config } from '../config.js'
import { reply } from './context.js'
import { roleOf } from '../services/roleService.js'
import { featureService } from '../services/featureService.js'
import { groupService } from '../services/groups.js'
import { extractMediaTarget, downloadWaMedia } from '../services/waMedia.js'
import { logger } from '../logger.js'

function isViewOnce(ctx) {
  const m = ctx?.message?.message || {}
  return Boolean(m.viewOnceMessage || m.viewOnceMessageV2 || m.viewOnceMessageV2Extension)
}

export async function rvoCommand(ctx, arg = '') {
  const role = roleOf(ctx.adminJid)
  if (!featureService.isFeatureEnabled('rvo', role)) {
    return reply(ctx, 'Fitur .rvo tidak tersedia untuk role Anda.')
  }
  if (isViewOnce(ctx)) {
    return reply(ctx, '.rvo tidak memproses foto sekali lihat. Kirim foto biasa jika ingin diproses.')
  }
  const target = extractMediaTarget(ctx)
  if (!target || target.type !== 'image') {
    return reply(ctx, [
      '🖼️ *RVO MEDIA*', '',
      'Kirim foto biasa dengan caption `.rvo`, atau reply foto biasa dengan `.rvo`.',
      'Foto sekali lihat tidak diproses. File sementara dihapus setelah selesai.',
      '', 'KAYY ASSISTANT — Powered by Dev RifaiAl',
    ].join('\n'))
  }
  if (ctx.isGroup && !groupService.get(ctx.jid)?.is_registered) return

  let media = null
  try {
    media = await downloadWaMedia(target, config.imageTempDir)
    await ctx.sock.sendMessage(ctx.jid, {
      image: media.buffer,
      mimetype: target.content?.mimetype || 'image/jpeg',
      caption: '🖼️ Foto diteruskan sesuai izin grup.\nKAYY ASSISTANT — By Dev RifaiAl',
    })
    logger.info(`.rvo memproses gambar ${media.buffer.length} bytes untuk ${ctx.jid}`)
    return reply(ctx, '✅ Foto berhasil diteruskan. Kualitas asli dipertahankan.')
  } catch (err) {
    logger.warn(`.rvo gagal: ${err.message}`)
    return reply(ctx, `Gagal memproses foto: ${err.message}`)
  } finally {
    if (media?.file) {
      try { await fs.unlink(media.file) } catch { /* sudah terhapus */ }
    }
  }
}
