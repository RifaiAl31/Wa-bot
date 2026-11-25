import {
  page, toPng, fillRoundRect, drawWatermark, drawCover, imageFromBuffer,
  blurredCover, drawContain, fitText, drawLines, defaultAvatar, FONT
} from '../engine.js'

export const MODE_NAME = 'TikTok Quote Creator'

const REACTIONS = ['❤️', '😂', '😭', '👍', '😡', '🤔']
const ACTIONS = ['Balas', 'Teruskan', 'Salin', 'Terjemahkan', 'Hapus untuk saya', 'Laporkan']

function drawHeader(ctx, name, source) {
  ctx.fillStyle = '#fbfafc'
  ctx.fillRect(0, 0, 1080, 110)
  ctx.strokeStyle = '#242328'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(61, 38)
  ctx.lineTo(35, 57)
  ctx.lineTo(61, 77)
  ctx.stroke()

  const avatarX = 92
  const avatarY = 14
  const avatarSize = 82
  ctx.save()
  ctx.beginPath()
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
  ctx.clip()
  if (source) drawCover(ctx, source, avatarX, avatarY, avatarSize, avatarSize)
  else defaultAvatar(ctx, avatarX, avatarY, avatarSize, '#7751bd')
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.rect(195, 0, 700, 110)
  ctx.clip()
  ctx.fillStyle = '#111114'
  ctx.font = `700 35px ${FONT}`
  ctx.fillText(name, 198, 67)
  ctx.restore()

  ctx.fillStyle = '#68676b'
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath()
    ctx.arc(1000 + i * 18, 56, 6, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawBackdrop(ctx, width, height) {
  ctx.fillStyle = '#f4f2f6'
  ctx.fillRect(0, 0, width, height)
  ctx.save()
  ctx.globalAlpha = 0.28
  ctx.filter = 'blur(14px)'
  fillRoundRect(ctx, 157, 250, 470, 94, 40, '#dedbe4')
  fillRoundRect(ctx, 84, 437, 560, 88, 38, '#e3e0e9')
  fillRoundRect(ctx, 490, 710, 430, 104, 40, '#d7c7f5')
  ctx.restore()
}

function drawReactionBar(ctx, x, y, width) {
  ctx.save()
  ctx.shadowColor = 'rgba(20,15,30,0.12)'
  ctx.shadowBlur = 20
  fillRoundRect(ctx, x, y, width, 108, 54, '#ffffff')
  ctx.restore()
  REACTIONS.forEach((emoji, index) => {
    ctx.fillStyle = '#18171b'
    ctx.font = `48px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(emoji, x + 75 + index * 130, y + 70)
  })
  ctx.textAlign = 'left'
}

function drawMenuIcon(ctx, index, x, y, color) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (index === 0) {
    ctx.beginPath()
    ctx.moveTo(x + 16, y + 12)
    ctx.lineTo(x - 8, y - 9)
    ctx.lineTo(x - 8, y)
    ctx.quadraticCurveTo(x - 26, y, x - 26, y + 16)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x - 8, y - 9)
    ctx.lineTo(x - 8, y + 5)
    ctx.stroke()
  } else if (index === 1) {
    ctx.beginPath()
    ctx.moveTo(x - 25, y - 3)
    ctx.lineTo(x + 9, y - 3)
    ctx.lineTo(x + 9, y - 15)
    ctx.lineTo(x + 27, y)
    ctx.lineTo(x + 9, y + 15)
    ctx.lineTo(x + 9, y + 4)
    ctx.lineTo(x - 25, y + 4)
    ctx.closePath()
    ctx.stroke()
  } else if (index === 2) {
    ctx.strokeRect(x - 17, y - 18, 24, 31)
    ctx.strokeRect(x - 7, y - 8, 24, 31)
  } else if (index === 3) {
    ctx.strokeRect(x - 24, y - 17, 48, 34)
    ctx.font = `600 18px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText('A 文', x, y + 6)
  } else if (index === 4) {
    ctx.beginPath()
    ctx.moveTo(x - 19, y - 13)
    ctx.lineTo(x + 19, y - 13)
    ctx.moveTo(x - 12, y - 19)
    ctx.lineTo(x + 12, y - 19)
    ctx.moveTo(x - 14, y - 11)
    ctx.lineTo(x - 11, y + 19)
    ctx.lineTo(x + 11, y + 19)
    ctx.lineTo(x + 14, y - 11)
    ctx.moveTo(x - 4, y - 6)
    ctx.lineTo(x - 4, y + 14)
    ctx.moveTo(x + 4, y - 6)
    ctx.lineTo(x + 4, y + 14)
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.moveTo(x - 5, y + 20)
    ctx.lineTo(x - 5, y - 16)
    ctx.lineTo(x + 18, y - 9)
    ctx.lineTo(x + 7, y + 1)
    ctx.lineTo(x - 5, y - 3)
    ctx.stroke()
  }
  ctx.restore()
}

function drawActionMenu(ctx, x, y, width) {
  const rowHeight = 100
  const height = ACTIONS.length * rowHeight
  ctx.save()
  ctx.shadowColor = 'rgba(15,10,20,0.12)'
  ctx.shadowBlur = 20
  fillRoundRect(ctx, x, y, width, height, 30, '#ffffff')
  ctx.restore()

  ACTIONS.forEach((label, index) => {
    const rowY = y + index * rowHeight
    const color = label === 'Laporkan' ? '#d75555' : '#17161a'
    if (index > 0) {
      ctx.strokeStyle = '#f0eef2'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x + 28, rowY)
      ctx.lineTo(x + width - 28, rowY)
      ctx.stroke()
    }
    drawMenuIcon(ctx, index, x + 59, rowY + 50, color)
    ctx.fillStyle = color
    ctx.font = `400 31px ${FONT}`
    ctx.fillText(label, x + 105, rowY + 63)
  })
}

function drawComposer(ctx, height) {
  const quickY = height - 220
  ctx.fillStyle = 'rgba(255,255,255,0.58)'
  fillRoundRect(ctx, 38, quickY, 1004, 78, 39, 'rgba(255,255,255,0.42)')
  const quick = ['❤️', '😂', '👍', '👆', '🐣 Streak Pet', '▶']
  const positions = [98, 260, 422, 584, 780, 974]
  quick.forEach((value, index) => {
    ctx.fillStyle = index === 5 ? '#995be8' : '#252329'
    ctx.font = index === 4 ? `500 24px ${FONT}` : `36px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(value, positions[index], quickY + 51)
  })

  const composeY = height - 124
  ctx.fillStyle = '#fdfcfe'
  ctx.fillRect(0, composeY, 1080, 124)
  ctx.fillStyle = '#f1eff3'
  fillRoundRect(ctx, 116, composeY + 20, 760, 82, 41, '#f1eff3')
  ctx.fillStyle = '#77757c'
  ctx.font = `400 28px ${FONT}`
  ctx.fillText('Kirim pesan...', 157, composeY + 71)
  ctx.fillStyle = '#55535a'
  ctx.font = `36px ${FONT}`
  ctx.fillText('◉', 44, composeY + 76)
  ctx.fillText('▣   ☻   ♩', 890, composeY + 76)
  ctx.textAlign = 'left'
}

export async function render({ text = '', name = 'Raiden', source = null, raw = false }) {
  const W = 1080
  const BASE_H = 2880
  const bubbleX = 145
  const measure = page(W, 10).ctx
  const maxBubbleW = 740
  const fitted = fitText(measure, String(text), maxBubbleW - 76, { start: 39, min: 25, maxLines: 60 })
  const textWidth = Math.max(...fitted.lines.map((line) => measure.measureText(line).width))
  const bubbleW = Math.min(maxBubbleW, Math.max(260, Math.ceil(textWidth + 76)))
  const lineHeight = Math.round(fitted.size * 1.38)
  const bubbleH = fitted.lines.length * lineHeight + 70
  const bubbleY = 985
  const menuX = 91
  const menuY = bubbleY + bubbleH + 32
  const menuW = 565
  const menuH = ACTIONS.length * 100
  const H = Math.max(BASE_H, menuY + menuH + 390)
  const { canvas, ctx } = page(W, H)
  const avatar = source ? await imageFromBuffer(source.buffer) : null

  if (source) {
    if (raw) {
      const original = await imageFromBuffer(source.buffer)
      drawContain(ctx, original, 0, 0, W, H, '#f4f2f6')
      ctx.fillStyle = 'rgba(248,247,250,0.58)'
      ctx.fillRect(0, 0, W, H)
    } else {
      const background = await imageFromBuffer(await blurredCover(source.buffer, W, H))
      ctx.drawImage(background, 0, 0, W, H)
      ctx.fillStyle = 'rgba(248,247,250,0.92)'
      ctx.fillRect(0, 0, W, H)
    }
  } else {
    drawBackdrop(ctx, W, H)
  }

  drawHeader(ctx, String(name || 'Raiden'), avatar)

  ctx.save()
  ctx.globalAlpha = 0.28
  ctx.fillStyle = '#99969f'
  ctx.font = `400 27px ${FONT}`
  ctx.fillText('Pesan sebelumnya', 170, 424)
  ctx.fillText('Hari ini', W / 2 - 45, 616)
  ctx.restore()

  const avatarX = 37
  const avatarY = bubbleY + bubbleH - 80
  ctx.save()
  ctx.beginPath()
  ctx.arc(avatarX + 40, avatarY + 40, 40, 0, Math.PI * 2)
  ctx.clip()
  if (avatar) drawCover(ctx, avatar, avatarX, avatarY, 80, 80)
  else defaultAvatar(ctx, avatarX, avatarY, 80, '#7751bd')
  ctx.restore()

  const reactionY = bubbleY - 137
  drawReactionBar(ctx, 120, reactionY, 830)

  ctx.save()
  ctx.shadowColor = 'rgba(35,25,45,0.08)'
  ctx.shadowBlur = 10
  fillRoundRect(ctx, bubbleX, bubbleY, bubbleW, bubbleH, 32, '#ffffff')
  ctx.restore()
  ctx.font = `${fitted.size}px ${FONT}`
  drawLines(ctx, fitted.lines, bubbleX + 38, bubbleY + 52, lineHeight, '#17161a')

  drawActionMenu(ctx, menuX, menuY, menuW)
  drawWatermark(ctx, W, H - 240)
  drawComposer(ctx, H)
  return toPng(canvas)
}
