import {
  page, toPng, fillRoundRect, drawWatermark, drawCover, imageFromBuffer,
  blurredCover, drawContain, fitText, drawLines, FONT
} from '../engine.js'

export const MODE_NAME = 'iPhone Quote Creator'

const REACTIONS = ['😂', '😍', '😠', '♥️', '😭', '😔', '+']
const ACTIONS = ['Beri Bintang', 'Balas', 'Teruskan', 'Salin', 'Hapus']

function drawStatusBar(ctx, width) {
  ctx.fillStyle = '#f5f5f7'
  ctx.beginPath()
  ctx.moveTo(24, 24)
  ctx.lineTo(48, 21)
  ctx.lineTo(39, 10)
  ctx.lineTo(45, 8)
  ctx.lineTo(61, 20)
  ctx.lineTo(74, 18)
  ctx.lineTo(80, 22)
  ctx.lineTo(63, 29)
  ctx.lineTo(48, 39)
  ctx.lineTo(43, 36)
  ctx.lineTo(52, 26)
  ctx.lineTo(28, 30)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#f5f5f7'
  ctx.lineWidth = 3
  for (const radius of [10, 17, 24]) {
    ctx.beginPath()
    ctx.arc(104, 35, radius, Math.PI * 1.17, Math.PI * 1.83)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(104, 35, 3, 0, Math.PI * 2)
  ctx.fill()

  ctx.textAlign = 'center'
  ctx.font = `600 28px ${FONT}`
  ctx.fillText('18:22', width / 2, 39)
  ctx.textAlign = 'right'
  ctx.font = `500 25px ${FONT}`
  ctx.fillText('◉ 70%', width - 63, 39)
  ctx.strokeStyle = '#f5f5f7'
  ctx.lineWidth = 3
  fillRoundRect(ctx, width - 48, 17, 38, 22, 5, 'rgba(0,0,0,0)')
  ctx.stroke()
  ctx.fillStyle = '#f5f5f7'
  ctx.fillRect(width - 8, 24, 4, 8)
  ctx.fillRect(width - 43, 21, 25, 14)
  ctx.textAlign = 'left'
}

function drawBackdrop(ctx, width, height) {
  ctx.fillStyle = '#08090b'
  ctx.fillRect(0, 0, width, height)
  const glow = ctx.createRadialGradient(width * 0.9, height * 0.7, 5, width * 0.9, height * 0.7, width * 0.55)
  glow.addColorStop(0, 'rgba(24,78,75,0.24)')
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.globalAlpha = 0.13
  ctx.filter = 'blur(24px)'
  fillRoundRect(ctx, 78, 195, 735, 118, 34, '#7b7d80')
  fillRoundRect(ctx, 110, 357, 530, 98, 32, '#686a6d')
  fillRoundRect(ctx, 420, 665, 565, 112, 34, '#526b6b')
  ctx.restore()
}

function drawReactionBar(ctx, x, y) {
  fillRoundRect(ctx, x, y, 630, 100, 50, '#202124')
  REACTIONS.forEach((emoji, index) => {
    ctx.fillStyle = '#f5f5f7'
    ctx.font = `${emoji === '+' ? 32 : 46}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(emoji, x + 49 + index * 88, y + 66)
  })
  ctx.textAlign = 'left'
}

function drawActionMenu(ctx, x, y, width) {
  const rowHeight = 116
  const menuHeight = ACTIONS.length * rowHeight
  fillRoundRect(ctx, x, y, width, menuHeight, 30, '#171719')
  ACTIONS.forEach((label, index) => {
    const rowY = y + index * rowHeight
    if (index > 0) {
      ctx.strokeStyle = '#303033'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x + 2, rowY)
      ctx.lineTo(x + width - 2, rowY)
      ctx.stroke()
    }
    const isDelete = label === 'Hapus'
    ctx.fillStyle = isDelete ? '#d77f86' : '#f0f0f2'
    ctx.font = `400 37px ${FONT}`
    ctx.fillText(label, x + 40, rowY + 72)
    drawActionIcon(ctx, index, x + width - 65, rowY + 58, isDelete ? '#d77f86' : '#f0f0f2')
  })

  const moreY = y + menuHeight + 18
  fillRoundRect(ctx, x, moreY, width, 126, 28, '#171719')
  ctx.fillStyle = '#f0f0f2'
  ctx.font = `400 37px ${FONT}`
  ctx.fillText('Lainnya...', x + 40, moreY + 79)
  return moreY + 126
}

function drawActionIcon(ctx, index, x, y, color) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (index === 0) {
    ctx.beginPath()
    for (let point = 0; point < 10; point += 1) {
      const radius = point % 2 ? 10 : 22
      const angle = -Math.PI / 2 + point * Math.PI / 5
      const px = x + Math.cos(angle) * radius
      const py = y + Math.sin(angle) * radius
      if (point === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.stroke()
  } else if (index === 1) {
    ctx.beginPath()
    ctx.moveTo(x + 18, y + 18)
    ctx.lineTo(x - 9, y - 5)
    ctx.lineTo(x - 9, y + 4)
    ctx.quadraticCurveTo(x - 28, y + 4, x - 28, y + 20)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x - 9, y - 5)
    ctx.lineTo(x - 9, y + 9)
    ctx.stroke()
  } else if (index === 2) {
    ctx.beginPath()
    ctx.moveTo(x - 24, y)
    ctx.lineTo(x + 9, y)
    ctx.lineTo(x + 9, y - 12)
    ctx.lineTo(x + 27, y + 3)
    ctx.lineTo(x + 9, y + 18)
    ctx.lineTo(x + 9, y + 7)
    ctx.lineTo(x - 24, y + 7)
    ctx.closePath()
    ctx.stroke()
  } else if (index === 3) {
    ctx.strokeRect(x - 17, y - 18, 25, 32)
    ctx.strokeRect(x - 7, y - 8, 25, 32)
  } else {
    ctx.beginPath()
    ctx.moveTo(x - 20, y - 13)
    ctx.lineTo(x + 20, y - 13)
    ctx.moveTo(x - 13, y - 19)
    ctx.lineTo(x + 13, y - 19)
    ctx.moveTo(x - 15, y - 11)
    ctx.lineTo(x - 12, y + 21)
    ctx.lineTo(x + 12, y + 21)
    ctx.lineTo(x + 15, y - 11)
    ctx.moveTo(x - 5, y - 6)
    ctx.lineTo(x - 5, y + 15)
    ctx.moveTo(x + 5, y - 6)
    ctx.lineTo(x + 5, y + 15)
    ctx.stroke()
  }
  ctx.restore()
}

export async function render({ text = '', source = null, raw = false }) {
  const W = 1080
  const BASE_H = 1920
  const measure = page(W, 10).ctx
  const maxBubbleW = 535
  const fitted = fitText(measure, String(text), maxBubbleW - 78, { start: 37, min: 25, maxLines: 60 })
  const textWidth = Math.max(...fitted.lines.map((line) => measure.measureText(line).width))
  const bubbleW = Math.min(maxBubbleW, Math.max(300, Math.ceil(textWidth + 76)))
  const lineHeight = Math.round(fitted.size * 1.38)
  const bubbleH = fitted.lines.length * lineHeight + 96
  const bubbleX = 46
  const bubbleY = 985
  const menuX = 44
  const menuW = 770
  const menuY = bubbleY + bubbleH + 52
  const menuBottom = menuY + ACTIONS.length * 116 + 18 + 126
  const H = Math.max(BASE_H, menuBottom + 100)
  const { canvas, ctx } = page(W, H)

  if (source) {
    if (raw) {
      const original = await imageFromBuffer(source.buffer)
      drawContain(ctx, original, 0, 0, W, H, '#08090b')
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      ctx.fillRect(0, 0, W, H)
    } else {
      const background = await imageFromBuffer(await blurredCover(source.buffer, W, H))
      ctx.drawImage(background, 0, 0, W, H)
      ctx.fillStyle = 'rgba(0,0,0,0.80)'
      ctx.fillRect(0, 0, W, H)
    }
  } else {
    drawBackdrop(ctx, W, H)
  }

  drawStatusBar(ctx, W)
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = `600 54px ${FONT}`
  ctx.textAlign = 'center'
  ctx.fillText('Hasil nya', W / 2, 575)
  ctx.restore()

  fillRoundRect(ctx, bubbleX, bubbleY, bubbleW, bubbleH, 30, '#202124')
  ctx.beginPath()
  ctx.moveTo(bubbleX + 34, bubbleY + bubbleH - 5)
  ctx.lineTo(bubbleX + 5, bubbleY + bubbleH + 28)
  ctx.lineTo(bubbleX + 46, bubbleY + bubbleH - 2)
  ctx.closePath()
  ctx.fillStyle = '#202124'
  ctx.fill()
  ctx.font = `${fitted.size}px ${FONT}`
  drawLines(ctx, fitted.lines, bubbleX + 32, bubbleY + 52, lineHeight, '#f3f3f5')
  ctx.fillStyle = '#8d8d92'
  ctx.font = `400 22px ${FONT}`
  ctx.textAlign = 'right'
  ctx.fillText('18:22', bubbleX + bubbleW - 22, bubbleY + bubbleH - 18)
  ctx.textAlign = 'left'

  drawReactionBar(ctx, bubbleX, bubbleY - 122)
  drawActionMenu(ctx, menuX, menuY, menuW)
  drawWatermark(ctx, W, H)
  return toPng(canvas)
}
