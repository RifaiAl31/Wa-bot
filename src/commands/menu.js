import { createCanvas } from '@napi-rs/canvas'
import { COMMAND_GROUPS, buildMenuText, commandIsVisible, normalizeCommand } from './registry.js'
import { roleOf } from '../services/roleService.js'
import { featureService } from '../services/featureService.js'
import { getCurrentWeather } from '../services/weatherService.js'
import { config, normalizeJid } from '../config.js'
import { fillRoundRect, fitText, FONT } from '../images/engine.js'

const menuChoices = new Map()

export function jakartaClock(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit',
    day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'long',
  })
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]))
  return {
    time: `${p.hour}:${p.minute}:${p.second}`,
    weekday: p.weekday,
    day: Number(p.day),
    month: Number(p.month),
    year: Number(p.year),
  }
}

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

export function visibleCommands(role, options = {}) {
  const out = []
  for (const group of COMMAND_GROUPS) {
    for (const item of group.commands) {
      if (!commandIsVisible(item, {
        ...options,
        admin: role === 'ADMIN',
        vip: ['ADMIN', 'VIP'].includes(role),
      })) continue
      out.push(item)
    }
  }
  return out
}

export function countCommands(role, options = {}) {
  return new Set(visibleCommands(role, options).map((item) => item.cmd)).size
}

function drawText(ctx, text, x, y, maxWidth, size, color, weight = '400') {
  const fitted = fitText(ctx, String(text ?? ''), maxWidth, {
    start: size, min: 18, maxLines: 1, weight,
  })
  ctx.fillStyle = color
  ctx.font = `${weight} ${fitted.size}px ${FONT}`
  ctx.textAlign = 'left'
  ctx.fillText(fitted.lines[0] || '', x, y)
}

function renderMenuCard(menu) {
  const W = 1080
  const H = 1420
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  const background = ctx.createLinearGradient(0, 0, W, H)
  background.addColorStop(0, '#07131c')
  background.addColorStop(0.55, '#10252e')
  background.addColorStop(1, '#071820')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, W, H)

  const glow = ctx.createRadialGradient(840, 220, 12, 840, 220, 520)
  glow.addColorStop(0, 'rgba(0, 221, 170, 0.19)')
  glow.addColorStop(1, 'rgba(0, 221, 170, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  fillRoundRect(ctx, 42, 42, 996, 1336, 42, '#101e28')
  ctx.strokeStyle = 'rgba(139, 191, 194, 0.18)'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.fillStyle = '#42d6ae'
  ctx.beginPath()
  ctx.arc(98, 112, 13, 0, Math.PI * 2)
  ctx.fill()
  drawText(ctx, 'LUX BOT', 132, 124, 590, 45, '#f3f7f8', '700')
  drawText(ctx, 'WHATSAPP BOT  •  MENU UTAMA', 134, 166, 560, 22, '#9cb2b8', '500')

  fillRoundRect(ctx, 806, 87, 190, 62, 31, menu.online ? '#163b37' : '#45252b')
  ctx.fillStyle = menu.online ? '#42d6ae' : '#ff8585'
  ctx.beginPath()
  ctx.arc(838, 118, 8, 0, Math.PI * 2)
  ctx.fill()
  drawText(ctx, menu.online ? 'ONLINE' : 'OFFLINE', 858, 127, 120, 23, '#f2f6f7', '700')

  drawText(ctx, `Halo, ${menu.mention}!`, 92, 250, 880, 39, '#f3f7f8', '700')
  drawText(ctx, 'Ringkasan akun dan akses bot Anda', 94, 291, 880, 24, '#9cb2b8', '400')

  const stat = (x, y, label, value, accent) => {
    fillRoundRect(ctx, x, y, 426, 150, 26, '#172832')
    ctx.fillStyle = accent
    ctx.fillRect(x + 26, y + 26, 6, 98)
    drawText(ctx, label, x + 50, y + 58, 330, 21, '#91a8af', '600')
    drawText(ctx, value, x + 50, y + 106, 340, 34, '#f3f7f8', '700')
  }
  stat(92, 340, 'ROLE / AKUN', `${menu.role}  •  ${menu.account}`, '#42d6ae')
  stat(562, 340, 'MODE CHAT', menu.mode, '#7ab8ff')
  stat(92, 516, 'FITUR AKTIF', `${menu.features} fitur`, '#ffca70')
  stat(562, 516, 'COMMAND TERSEDIA', `${menu.commands} command`, '#d69cff')

  fillRoundRect(ctx, 92, 692, 896, 142, 26, '#172832')
  drawText(ctx, 'RUNTIME BOT', 122, 740, 330, 21, '#91a8af', '600')
  drawText(ctx, menu.runtime, 122, 789, 560, 33, '#f3f7f8', '700')
  drawText(ctx, `${menu.clock.time} WIB`, 728, 789, 225, 28, '#42d6ae', '700')

  fillRoundRect(ctx, 92, 860, 896, 198, 26, '#172832')
  drawText(ctx, 'CUACA', 122, 908, 330, 21, '#91a8af', '600')
  if (menu.weather?.available) {
    drawText(ctx, `${menu.weather.location}  •  ${menu.weather.condition}`, 122, 958, 790, 29, '#f3f7f8', '600')
    drawText(ctx, `${menu.weather.temperature}°C  •  Kelembapan ${menu.weather.humidity}%`, 122, 1010, 790, 25, '#b8c8cc', '400')
  } else {
    drawText(ctx, 'Data cuaca belum tersedia', 122, 972, 790, 28, '#b8c8cc', '400')
  }

  drawText(ctx, menu.dateText, 96, 1112, 880, 25, '#b8c8cc', '500')
  fillRoundRect(ctx, 92, 1170, 896, 132, 28, '#075c50')
  drawText(ctx, 'BUKA MENU', 372, 1227, 336, 31, '#ffffff', '700')
  drawText(ctx, 'Daftar kategori dan command ada di pesan berikutnya', 210, 1270, 660, 21, '#c6f4e9', '500')

  return canvas.toBuffer('image/png')
}

export async function buildPersonalMenu(ctx) {
  const role = roleOf(ctx.adminJid)
  const clock = jakartaClock()
  const weather = await getCurrentWeather()
  const features = featureService.countActiveFeatures(role)
  const menuOptions = {
    admin: role === 'ADMIN',
    vip: ['ADMIN', 'VIP'].includes(role),
    privateChat: !ctx.isGroup,
    privateCommands: config.privateDotCommands.map(normalizeCommand).filter(Boolean),
  }
  const commands = countCommands(role, menuOptions)
  const account = 'ACTIVE'
  const botStatus = ctx.bot?.status?.() || {}
  const online = botStatus.connected !== false
  const mode = ctx.isGroup ? 'GROUP' : 'PRIVATE'
  const mention = `@${normalizeJid(ctx.adminJid)}`
  const dateText = `${clock.weekday}, ${clock.day} ${MONTHS[clock.month - 1]} ${clock.year}`
  const runtime = (() => {
    const total = Math.floor(process.uptime())
    const days = Math.floor(total / 86400)
    const hours = Math.floor((total % 86400) / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    return days ? `${days} hari ${hours} jam ${minutes} menit` : `${hours} jam ${minutes} menit`
  })()
  const lines = [
    buildMenuText(menuOptions),
    '',
    '🎯 *SHORTCUT MENU*',
    ...(ctx.isGroup
      ? ['Shortcut: 1. .list  |  2. .ask  |  3. .user', 'Ketik angka hanya setelah menu grup dibuka.']
      : ['Shortcut angka hanya aktif setelah menu dibuka di grup.']),
  ]
  return {
    text: lines.join('\n'),
    cardCaption: `👋 Halo, ${mention}!\n📚 Daftar kategori dan command dikirim setelah kartu menu ini.`,
    mentions: [String(ctx.adminJid)],
    mention,
    role,
    features,
    commands,
    weather,
    clock,
    dateText,
    runtime,
    account,
    online,
    mode,
  }
}

export function setMenuChoices(ctx, choices) {
  const key = `${ctx.jid}|${ctx.adminJid}`
  menuChoices.set(key, { choices, expiresAt: Date.now() + 5 * 60_000 })
  if (menuChoices.size > 2000) {
    for (const [k, v] of menuChoices) if (v.expiresAt < Date.now()) menuChoices.delete(k)
  }
}

export function consumeMenuChoice(ctx, text) {
  const key = `${ctx.jid}|${ctx.adminJid}`
  const entry = menuChoices.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    menuChoices.delete(key)
    return null
  }
  const index = Number(String(text || '').trim())
  if (!Number.isInteger(index) || index < 1 || index > entry.choices.length) return null
  menuChoices.delete(key)
  return entry.choices[index - 1]
}

export async function sendPersonalMenu(ctx) {
  const menu = await buildPersonalMenu(ctx)
  const card = renderMenuCard(menu)
  if (ctx.isGroup) setMenuChoices(ctx, ['.list', '.ask', '.user'])
  await ctx.sock.sendMessage(ctx.jid, {
    image: card,
    mimetype: 'image/png',
    caption: menu.cardCaption,
    mentions: menu.mentions,
  })
  await ctx.sock.sendMessage(ctx.jid, { text: menu.text, mentions: menu.mentions })
  return menu
}
