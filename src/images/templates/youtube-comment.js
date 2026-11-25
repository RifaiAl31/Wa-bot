import {
  page, toPng, fillRoundRect, drawWatermark, drawCover,
  imageFromBuffer, fitText, drawLines, defaultAvatar, FONT
} from '../engine.js'

export async function render({ text = '', name = 'Pengguna', source = null }) {
  const W = 1080
  const PAD = 64
  const avatarSize = 92
  const textX = PAD + avatarSize + 28
  const textWidth = W - textX - PAD
  const measure = page(W, 10).ctx
  measure.font = `600 30px ${FONT}`
  const fitted = fitText(measure, String(text), textWidth, {
    start: 38,
    min: 24,
    maxLines: 60,
  })
  const lineHeight = Math.round(fitted.size * 1.4)
  const contentH = Math.max(220, 92 + fitted.lines.length * lineHeight + 112)
  const avatarY = 213
  const H = Math.max(1000, avatarY + contentH + 250)
  const { canvas, ctx } = page(W, H)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#ff0033'
  ctx.fillRect(0, 0, W, 14)

  ctx.fillStyle = '#202124'
  ctx.font = `700 42px ${FONT}`
  ctx.fillText('▶ YouTube', PAD, 86)
  ctx.fillStyle = '#606060'
  ctx.font = `500 27px ${FONT}`
  ctx.fillText('Komentar', PAD, 158)

  ctx.save()
  ctx.beginPath()
  ctx.arc(PAD + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
  ctx.clip()
  if (source) {
    const avatar = await imageFromBuffer(source.buffer)
    drawCover(ctx, avatar, PAD, avatarY, avatarSize, avatarSize)
  } else {
    defaultAvatar(ctx, PAD, avatarY, avatarSize, '#777777')
  }
  ctx.restore()

  ctx.fillStyle = '#0f0f0f'
  ctx.font = `600 30px ${FONT}`
  const username = String(name || 'Pengguna')
  ctx.fillText(username, textX, avatarY + 35)
  ctx.fillStyle = '#606060'
  ctx.font = `400 24px ${FONT}`
  measure.font = `600 30px ${FONT}`
  ctx.fillText('·  2 jam yang lalu', textX + measure.measureText(username).width + 12, avatarY + 35)

  ctx.fillStyle = '#0f0f0f'
  ctx.font = `${fitted.size}px ${FONT}`
  drawLines(ctx, fitted.lines, textX, avatarY + 88, lineHeight)

  const actionsY = avatarY + contentH - 28
  ctx.fillStyle = '#606060'
  ctx.font = `500 25px ${FONT}`
  ctx.fillText('♡   12     ♧', textX, actionsY)
  ctx.fillStyle = '#0f0f0f'
  ctx.font = `600 24px ${FONT}`
  ctx.fillText('Balas', textX + 260, actionsY)

  ctx.strokeStyle = '#e5e5e5'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, H - 80)
  ctx.lineTo(W - PAD, H - 80)
  ctx.stroke()
  ctx.fillStyle = '#606060'
  ctx.font = `400 23px ${FONT}`
  ctx.fillText('Komentar ini adalah mockup simulasi', PAD, H - 42)

  fillRoundRect(ctx, W - 270, 42, 206, 54, 27, '#fff0f2')
  ctx.fillStyle = '#b00020'
  ctx.font = `700 20px ${FONT}`
  ctx.textAlign = 'center'
  ctx.fillText('SIMULASI', W - 167, 77)
  ctx.textAlign = 'left'
  drawWatermark(ctx, W, H)
  return toPng(canvas)
}
