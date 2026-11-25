import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { logger } from '../logger.js'
import { COMMAND_GROUPS } from './registry.js'
import { roleOf } from '../services/roleService.js'
import { featureService } from '../services/featureService.js'
import { getCurrentWeather } from '../services/weatherService.js'
import { normalizeJid } from '../config.js'

const menuChoices = new Map()
const videoSentAt = new Map()

function pad(value) { return String(value).padStart(2, '0') }

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

export function visibleCommands(role) {
  const out = []
  for (const group of COMMAND_GROUPS) {
    for (const item of group.commands) {
      if (item.admin && role !== 'ADMIN') continue
      if (item.vip && !['ADMIN', 'VIP'].includes(role)) continue
      out.push(item)
    }
  }
  return [...new Map(out.map((x) => [x.cmd, x])).values()]
}

export function countCommands(role) { return visibleCommands(role).length }

function weatherLines(weather) {
  if (!weather?.available) return ['│ 🌤️ Cuaca: Weather unavailable']
  return [
    `│ 📍 Lokasi: ${weather.location}`,
    `│ 🌡️ Suhu: ${weather.temperature}°C`,
    `│ ☁️ Kondisi: ${weather.condition}`,
    `│ 💧 Kelembapan: ${weather.humidity}%`,
  ]
}

export async function buildPersonalMenu(ctx) {
  const role = roleOf(ctx.adminJid)
  const clock = jakartaClock()
  const weather = await getCurrentWeather()
  const features = featureService.countActiveFeatures(role)
  const commands = countCommands(role)
  const account = 'ACTIVE'
  const botStatus = ctx.bot?.status?.() || {}
  const online = botStatus.connected !== false
  const mode = ctx.isGroup ? 'GROUP' : 'PRIVATE'
  const mention = `@${normalizeJid(ctx.adminJid)}`
  const dateText = `${clock.weekday}, ${clock.day} ${MONTHS[clock.month - 1]} ${clock.year}`

  const lines = [
    '╭━━━「 KAYY ASSISTANT 」━━━╮',
    '│',
    `│ 👋 Halo, ${mention}!`,
    '│ Selamat datang di WhatsApp Bot.',
    '│',
    `│ 👤 Status: ${account}`,
    `│ 🏷️ Role: ${role}`,
    `│ 🟢 Account: ${account}`,
    '│',
    `│ 🤖 Bot: ${online ? 'ONLINE' : 'OFFLINE'}`,
    `│ ⚙️ Mode: ${mode}`,
    `│ ✨ Total Features: ${features}`,
    `│ ⌨️ Commands: ${commands}`,
    '│',
    `│ 🕒 Waktu: ${clock.time} WIB`,
    `│ 📅 ${dateText}`,
    '│',
    ...weatherLines(weather),
    '│',
    '╰━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    '1. 📋 Pengumuman  (.list)',
    '2. 🤖 Tanya AI  (.ask pertanyaan)',
    '3. 👤 Identitas saya  (.user)',
    '',
    'Ketik 1/2/3 atau langsung command.',
    'KAYY ASSISTANT — Powered by Dev RifaiAl',
  ]
  return { text: lines.join('\n'), mentions: [String(ctx.adminJid)], role, features, commands, weather }
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
  menuChoices.delete(key)
  if (entry.expiresAt < Date.now()) return null
  const index = Number(String(text || '').trim())
  if (!Number.isInteger(index) || index < 1 || index > entry.choices.length) return null
  return entry.choices[index - 1]
}

async function sendHeaderMedia(ctx) {
  if (config.menuVideoEnabled === false) return false
  const key = `${ctx.jid}|${ctx.adminJid}`
  const now = Date.now()
  const previous = videoSentAt.get(key) || 0
  if (now - previous < Number(config.menuVideoTtlMs || 30 * 60_000)) return false

  const videoPath = path.join(config.root, 'assets', 'menu-background.mp4')
  const posterPath = path.join(config.root, 'assets', 'menu-poster.png')
  try {
    if (fs.existsSync(videoPath)) {
      await ctx.sock.sendMessage(ctx.jid, {
        video: fs.readFileSync(videoPath),
        mimetype: 'video/mp4',
        caption: 'KAYY ASSISTANT — By Dev RifaiAl',
      })
      videoSentAt.set(key, now)
      return true
    }
  } catch (err) {
    logger.warn(`Gagal mengirim video menu, pakai poster: ${err.message}`)
  }
  try {
    if (fs.existsSync(posterPath)) {
      await ctx.sock.sendMessage(ctx.jid, {
        image: fs.readFileSync(posterPath),
        mimetype: 'image/png',
        caption: 'KAYY ASSISTANT — By Dev RifaiAl',
      })
      videoSentAt.set(key, now)
      return true
    }
  } catch { /* fallback ke teks saja */ }
  return false
}

export async function sendPersonalMenu(ctx) {
  await sendHeaderMedia(ctx)
  const menu = await buildPersonalMenu(ctx)
  setMenuChoices(ctx, ['.list', '.ask', '.user'])
  await ctx.sock.sendMessage(ctx.jid, { text: menu.text, mentions: menu.mentions })
  return menu
}
