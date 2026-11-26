// Diadaptasi dari vanXone v7: plugins/maker/logo3d.js & logogold.js
// Atribusi: × - vanXone </>. Render lokal dengan @napi-rs/canvas (tanpa API eksternal).
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { reply } from '../../commands/context.js'
import { extractMediaTarget, downloadWaMedia } from '../../services/waMedia.js'
import { config } from '../../config.js'
import { logger } from '../../logger.js'

const COLORS = {
  pink: { light: '#ff6b9d', dark: '#c41e3a', mid: '#ff2a6d' },
  blue: { light: '#4facfe', dark: '#00f2fe', mid: '#3b82f6' },
  purple: { light: '#c084fc', dark: '#7c3aed', mid: '#a855f7' },
  gold: { light: '#fbbf24', dark: '#d97706', mid: '#f59e0b' },
  red: { light: '#f87171', dark: '#dc2626', mid: '#ef4444' },
  green: { light: '#34d399', dark: '#059669', mid: '#10b981' },
}

function colorOf(text) {
  const lower = String(text).toLowerCase()
  const key = Object.keys(COLORS).find((name) => lower.includes(name))
  return COLORS[key || 'pink']
}

function fitFont(ctx, text, maxWidth, start = 68) {
  let size = start
  do {
    ctx.font = `bold ${size}px "Segoe UI", "Arial Black", sans-serif`
    if (ctx.measureText(text).width <= maxWidth) break
    size -= 4
  } while (size > 22)
  return size
}

async function optionalBackground(ctx, c, width, height, opacity) {
  const target = extractMediaTarget(c)
  if (!target || target.type !== 'image') return null
  const media = await downloadWaMedia(target, config.imageTempDir)
  try {
    const img = await loadImage(media.buffer)
    ctx.globalAlpha = opacity
    ctx.drawImage(img, 0, 0, width, height)
    ctx.globalAlpha = 1
  } finally { /* buffer dipakai langsung, tidak ada file lain */ }
  return media
}

export async function renderLogo3d(ctx) {
  const text = String(ctx.arg || '').trim() || 'LUX BOT'
  const width = 800; const height = 400
  const canvas = createCanvas(width, height)
  const g = canvas.getContext('2d')
  const color = colorOf(text)

  const bg = g.createLinearGradient(0, 0, width, height)
  bg.addColorStop(0, '#0f0c1a'); bg.addColorStop(0.5, '#1a1535'); bg.addColorStop(1, '#0f0c1a')
  g.fillStyle = bg; g.fillRect(0, 0, width, height)

  let media = null
  try { media = await optionalBackground(g, ctx, width, height, 0.25) }
  catch (err) { logger.warn(`logo3d background: ${err.message}`) }

  g.globalAlpha = 0.1; g.strokeStyle = color.light; g.lineWidth = 0.5
  for (let x = 0; x < width; x += 50) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, height); g.stroke() }
  for (let y = 0; y < height; y += 50) { g.beginPath(); g.moveTo(0, y); g.lineTo(width, y); g.stroke() }
  g.globalAlpha = 1

  const centerX = width / 2; const centerY = height / 2
  const upper = text.toUpperCase()
  const fontSize = fitFont(g, upper, width - 90)
  g.textAlign = 'center'
  const textWidth = g.measureText(upper).width

  const depth = 12
  for (let i = depth; i > 0; i -= 1) {
    const offset = i * 2
    const grad = g.createLinearGradient(centerX - textWidth / 2 - 10, centerY - fontSize / 2,
      centerX + textWidth / 2 + 10, centerY + fontSize / 2)
    grad.addColorStop(0, color.dark); grad.addColorStop(1, color.mid)
    g.fillStyle = grad
    g.globalAlpha = (1 - (i / depth) * 0.7) * 0.5
    g.fillText(upper, centerX + offset, centerY + offset + 10)
  }

  g.globalAlpha = 1; g.shadowBlur = 15; g.shadowColor = color.light
  const front = g.createLinearGradient(centerX - textWidth / 2, centerY - fontSize / 2,
    centerX + textWidth / 2, centerY + fontSize / 2)
  front.addColorStop(0, color.light); front.addColorStop(0.5, color.mid); front.addColorStop(1, color.dark)
  g.fillStyle = front; g.fillText(upper, centerX, centerY + 10)

  g.shadowBlur = 8; g.shadowColor = '#ffffff'
  g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillText(upper, centerX - 2, centerY + 8)
  g.shadowBlur = 0; g.strokeStyle = '#ffffff'; g.lineWidth = 2
  g.strokeText(upper, centerX, centerY + 10)

  g.globalAlpha = 0.3; g.fillStyle = '#000000'
  g.fillText(upper, centerX + 5, centerY + fontSize - 5); g.globalAlpha = 1

  g.shadowBlur = 5; g.shadowColor = color.light; g.strokeStyle = color.mid; g.lineWidth = 3
  for (const [x, y, sx] of [[30, 50, 1], [width - 30, 50, -1], [30, height - 50, 1], [width - 30, height - 50, -1]]) {
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 40 * sx, y); g.lineTo(x + 40 * sx, y + (y < height / 2 ? -20 : 20)); g.stroke()
  }
  g.shadowBlur = 0
  return await canvas.encode('png')
}

export async function renderLogoGold(ctx) {
  const text = String(ctx.arg || '').trim() || 'LUX BOT'
  const width = 800; const height = 350
  const canvas = createCanvas(width, height)
  const g = canvas.getContext('2d')

  const bg = g.createLinearGradient(0, 0, width, height)
  bg.addColorStop(0, '#0a0a0a'); bg.addColorStop(0.3, '#1a0f0a')
  bg.addColorStop(0.7, '#0a0505'); bg.addColorStop(1, '#000000')
  g.fillStyle = bg; g.fillRect(0, 0, width, height)

  try { await optionalBackground(g, ctx, width, height, 0.15) } catch { /* abaikan */ }

  g.strokeStyle = '#FFD700'; g.lineWidth = 2; g.strokeRect(15, 15, width - 30, height - 30)
  g.strokeStyle = '#DAA520'; g.lineWidth = 1; g.strokeRect(20, 20, width - 40, height - 40)
  for (const p of [[20, 20], [width - 20, 20], [20, height - 20], [width - 20, height - 20]]) {
    g.beginPath(); g.moveTo(p[0] - 10, p[1]); g.lineTo(p[0], p[1]); g.lineTo(p[0], p[1] - 10)
    g.strokeStyle = '#FFD700'; g.lineWidth = 2; g.stroke()
    g.beginPath(); g.arc(p[0], p[1], 4, 0, Math.PI * 2); g.fillStyle = '#FFD700'; g.fill()
    g.beginPath(); g.arc(p[0], p[1], 2, 0, Math.PI * 2); g.fillStyle = '#B8860B'; g.fill()
  }

  const centerX = width / 2; const centerY = height / 2
  const upper = text.toUpperCase()
  const fontSize = fitFont(g, upper, width - 100, 62)
  const textWidth = g.measureText(upper).width
  for (let i = 8; i > 0; i -= 1) {
    const offset = i * 1.5
    const dark = g.createLinearGradient(centerX - textWidth / 2, centerY - fontSize / 2,
      centerX + textWidth / 2, centerY + fontSize / 2)
    dark.addColorStop(0, `rgba(139,69,19,${0.2 - i * 0.015})`)
    dark.addColorStop(1, `rgba(101,67,33,${0.15 - i * 0.01})`)
    g.fillStyle = dark; g.fillText(upper, centerX + offset, centerY + offset + 8)
  }
  const gold = g.createLinearGradient(centerX - textWidth / 2 - 20, centerY - fontSize / 2 - 10,
    centerX + textWidth / 2 + 20, centerY + fontSize / 2 + 10)
  for (const [stop, color] of [[0, '#FFF8DC'], [0.15, '#FFD700'], [0.3, '#FFC125'], [0.45, '#DAA520'],
    [0.6, '#B8860B'], [0.75, '#DAA520'], [0.9, '#FFD700'], [1, '#FFC125']]) gold.addColorStop(stop, color)
  g.fillStyle = gold; g.fillText(upper, centerX, centerY + 8)

  g.save(); g.globalCompositeOperation = 'source-atop'
  for (let i = 0; i < 150; i += 1) {
    g.fillStyle = `rgba(255,255,200,${Math.random() * 0.6})`
    g.beginPath()
    g.arc(centerX - textWidth / 2 - 10 + Math.random() * (textWidth + 20),
      centerY - fontSize / 2 + Math.random() * fontSize, Math.random() * 2, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
  g.fillStyle = 'rgba(255,255,200,0.5)'; g.fillText(upper, centerX - 2, centerY + 6)
  g.strokeStyle = '#B8860B'; g.lineWidth = 2; g.strokeText(upper, centerX, centerY + 8)
  g.strokeStyle = 'rgba(255,250,210,0.6)'; g.lineWidth = 1; g.strokeText(upper, centerX - 0.5, centerY + 7.5)

  const crownY = centerY - fontSize / 2 - 15
  g.beginPath(); g.moveTo(centerX - 20, crownY + 10); g.lineTo(centerX - 12, crownY)
  g.lineTo(centerX, crownY + 8); g.lineTo(centerX + 12, crownY); g.lineTo(centerX + 20, crownY + 10)
  g.closePath(); g.fillStyle = '#FFD700'; g.fill()
  return await canvas.encode('png')
}

export async function handleMakerCommand(ctx, cmd, arg) {
  if (cmd === '.sologo') {
    return reply(ctx, '.sologo memerlukan layanan image-generation ber-API key yang tidak tersedia di bot ini. Gunakan .logo3d atau .logogold untuk logo lokal.')
  }
  const makerCtx = { ...ctx, arg }
  try {
    const buffer = cmd === '.logo3d' ? await renderLogo3d(makerCtx) : await renderLogoGold(makerCtx)
    await ctx.sock.sendMessage(ctx.jid, {
      image: buffer,
      caption: `✨ ${cmd === '.logo3d' ? 'LOGO 3D' : 'LOGO GOLD'}\nLUX BOT — Dev By Rifai`,
    })
    return { ok: true }
  } catch (err) {
    logger.warn(`maker ${cmd} gagal: ${err.message}`)
    return reply(ctx, `Gagal membuat logo: ${err.message}`)
  }
}
