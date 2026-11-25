import {
  page, toPng, fillRoundRect, drawWatermark, drawCover, drawContain, imageFromBuffer, fitImage,
  fitText, drawLines, FONT
} from '../engine.js'

export const MODE_NAME = 'Windows Quote Creator'

export async function render({ text = '', source = null, raw = false }) {
  const W = 1080; const H = 1080
  const { canvas, ctx } = page(W, H)

  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#3a6ea5'); bg.addColorStop(1, '#0b2a5b')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

  const x = 54; const y = 70; const w = W - 108; const h = H - 140
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 40
  fillRoundRect(ctx, x, y, w, h, 8, '#f6f6f6')
  ctx.restore()

  const title = ctx.createLinearGradient(x, y, x + w, y)
  title.addColorStop(0, '#0a246a'); title.addColorStop(1, '#3a8ed8')
  ctx.save(); ctx.beginPath(); ctx.rect(x + 3, y + 3, w - 6, 74); ctx.clip()
  ctx.fillStyle = title; ctx.fillRect(x, y, w, 80); ctx.restore()
  ctx.fillStyle = '#ffffff'; ctx.font = `600 28px ${FONT}`
  ctx.fillText('Windows Media Player', x + 28, y + 51)
  ctx.textAlign = 'right'; ctx.font = `22px ${FONT}`
  ctx.fillText('▁   ▢   ✕', x + w - 28, y + 51); ctx.textAlign = 'left'

  fillRoundRect(ctx, x + 26, y + 104, w - 52, 58, 6, '#e8f0fb')
  ctx.fillStyle = '#315b8f'; ctx.font = `500 24px ${FONT}`
  ctx.fillText('File   Edit   View   Help', x + 46, y + 142)

  const body = String(text || '...')
  const hasImage = Boolean(source)
  const textW = hasImage ? w - 470 : w - 130
  const fitted = fitText(ctx, body, textW, { start: 82, min: 26, maxLines: 7 })
  ctx.font = `${fitted.size}px ${FONT}`
  const lineH = Math.round(fitted.size * 1.24)

  if (hasImage && raw) {
    const original = await imageFromBuffer(source.buffer)
    drawContain(ctx, original, x + 70, y + 170, w - 140, h - 340, '#dbe9fb')
    fillRoundRect(ctx, x + 56, y + 180, w - 112, fitted.lines.length * lineH + 36, 10, 'rgba(255,255,255,0.86)')
    drawLines(ctx, fitted.lines, x + 74, y + 180 + lineH, lineH, '#17233b')
  } else {
    drawLines(ctx, fitted.lines, x + 70, y + 250, lineH, '#17233b')
    if (hasImage) {
      const buf = await fitImage(source.buffer)
      const img = await imageFromBuffer(buf)
      const ix = x + w - 400; const iy = y + 210; const iw = 330; const ih = 430
      ctx.save(); ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip()
      drawCover(ctx, img, ix, iy, iw, ih); ctx.restore()
      ctx.strokeStyle = '#3a6ea5'; ctx.lineWidth = 8; ctx.strokeRect(ix, iy, iw, ih)
    } else {
    const cx = x + w / 2
    fillRoundRect(ctx, cx - 110, y + h - 330, 220, 170, 14, '#3a8ed8')
    ctx.fillStyle = '#ffffff'; ctx.font = `700 64px ${FONT}`
    ctx.textAlign = 'center'; ctx.fillText('W', cx, y + h - 218); ctx.textAlign = 'left'
    ctx.strokeStyle = '#3a6ea5'; ctx.lineWidth = 6
    ctx.strokeRect(cx - 110, y + h - 330, 220, 170)
    }
  }

  fillRoundRect(ctx, x + 30, y + h - 116, w - 60, 82, 6, '#e8f0fb')
  ctx.fillStyle = '#315b8f'; ctx.font = `500 22px ${FONT}`
  ctx.fillText('1 objek      100%      Windows Classic', x + 50, y + h - 86)
  ctx.textAlign = 'center'; ctx.font = `30px ${FONT}`
  ctx.fillText('◀   ▶   ■', x + w / 2, y + h - 40); ctx.textAlign = 'left'

  drawWatermark(ctx, W, H)
  return toPng(canvas)
}