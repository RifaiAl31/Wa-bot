// Public entry point for the sticker feature.
// Usage from the router: await handleStickerCommand(ctx, ctx.cmd, ctx.arg)
import { reply } from '../../commands/context.js'
import {
  cmdSticker, cmdTtp, cmdAttp, cmdQc, cmdBrat, cmdEmojimix, cmdToimg, cmdPack,
} from './service.js'

export {
  createExif, addExifToWebp, readExifFromWebp, assertWebp,
  imageToWebp, imageToSticker, getStickerMetadata, setStickerMetadata,
  parseStickerArg, extractStickerTarget, validateStickerTarget,
  hasFFmpeg, ffmpegBin, explainFfmpeg, makeWorkDir,
} from './service.js'

const COMMANDS = {
  s: cmdSticker,
  sticker: cmdSticker,
  stiker: cmdSticker,
  sgif: cmdSticker,
  ttp: cmdTtp,
  teksstiker: cmdTtp,
  attp: cmdAttp,
  attp2: cmdAttp,
  attp3: cmdAttp,
  qc: cmdQc,
  quotechat: cmdQc,
  brat: cmdBrat,
  bratblack: (ctx, arg) => cmdBrat(ctx, `hitam ${arg || ''}`.trim()),
  bratgreen: (ctx, arg) => cmdBrat(ctx, `hijau ${arg || ''}`.trim()),
  brat2: (ctx, arg) => cmdBrat(ctx, `hijau ${arg || ''}`.trim()),
  bratimg: cmdBrat,
  brattext: cmdBrat,
  emojimix: cmdEmojimix,
  mixemoji: cmdEmojimix,
  emix: cmdEmojimix,
  toimg: cmdToimg,
  toimage: cmdToimg,
  pack: cmdPack,
}

export const STICKER_COMMANDS = new Set(Object.keys(COMMANDS))

export function isStickerCommand(cmd) {
  const name = String(cmd || '').trim().toLowerCase().replace(/^\./, '')
  return COMMANDS[name] ? name : null
}

export async function handleStickerCommand(ctx, cmd, arg = '') {
  const name = isStickerCommand(cmd ?? ctx?.cmd)
  if (!name) return false
  const run = COMMANDS[name]
  try {
    await run(ctx, arg ?? ctx?.arg ?? '')
    return true
  } catch (err) {
    await reply(ctx, `❌ ${err?.message || String(err)}`)
    return false
  }
}

export default handleStickerCommand
