import { sendText } from '../services/delivery.js'
import { logger } from '../logger.js'

export async function reply(ctx, text) {
  const result = await sendText(ctx.sock, ctx.jid, String(text))
  if (!result.ok) logger.warn(`Gagal membalas di ${ctx.jid}: ${result.reason}`)
  return result
}

export const flowKey = (ctx) => `${ctx.jid}|${ctx.adminJid}`
