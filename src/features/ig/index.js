// Modul mockup antarmuka Instagram gaya iPhone.
// Diadaptasi dari source vanXone v7:
//   plugins/image/igqc.js + lib/kernel/plugins/canvas/commentquote.js
//   plugins/image/igstory.js, igstoryimg.js + kernel canvas equivalents
//   plugins/maker/igpost.js, fakeigstory.js, fakeigprofile.js, noteig.js
// Atribusi: × - vanXone </>
// Catatan: semua hasil adalah SIMULASI/mockup lokal, bukan screenshot atau data Instagram asli.
// .igdm tidak memiliki source langsung di arsip; drawnya dibuat lokal memakai pola canvas yang sama
// dan diberi label mockup.
import fs from 'node:fs/promises'
import {
  FONT, font, page, toPng, roundRect, fillRoundRect, drawContain, drawCover, wrapLines,
  fitText, drawLines, defaultAvatar, imageFromBuffer, fitImage, blurredCover,
} from '../../images/engine.js'
import { reply } from '../../commands/context.js'
import { extractMediaTarget, downloadWaMedia, validateMedia } from '../../services/waMedia.js'
import { config } from '../../config.js'
import { logger } from '../../logger.js'

const MAX_TEXT = 500
const MAX_USER = 30
const LABEL = 'MOCKUP / SIMULASI — BUKAN INSTAGRAM ASLI'

const clean = (value, max = MAX_TEXT) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const parts = (arg, count) => {
  const out = String(arg || '').split('|').map((s) => s.trim())
  return Array.from({ length: count }, (_, i) => out[i] || '')
}
const num = (value, fallback = 0) => {
  const n = Number(String(value ?? '').replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 999999999) : fallback
}

function label(g, w, h) {
  g.save()
  g.font = font(14, '600')
  const tw = g.measureText(LABEL).width
  const bw = Math.min(w - 24, tw + 22)
  fillRoundRect(g, 12, h - 42, bw, 30, 15, 'rgba(0,0,0,0.62)')
  g.fillStyle = '#ffffff'
  g.textAlign = 'left'
  g.fillText(LABEL, 23, h - 22)
  g.restore()
}

function avatar(g, img, x, y, size) {
  g.save()
  roundRect(g, x, y, size, size, size / 2)
  g.clip()
  if (img) drawCover(g, img, x, y, size, size)
  else defaultAvatar(g, x, y, size, '#db2777')
  g.restore()
  g.strokeStyle = 'rgba(255,255,255,0.75)'
  g.lineWidth = 3
  roundRect(g, x, y, size, size, size / 2)
  g.stroke()
}

function statusBar(g, w, dark = false) {
  const color = dark ? '#ffffff' : '#111111'
  g.save()
  g.fillStyle = color
  g.font = font(19, '700')
  g.textAlign = 'left'
  g.fillText('9:41', 26, 34)
  g.textAlign = 'right'
  g.font = font(16, '600')
  g.fillText('●●●  ▰', w - 24, 33)
  g.textAlign = 'left'
  const notchW = 118; const notchH = 22
  fillRoundRect(g, (w - notchW) / 2, 8, notchW, notchH, 11, color)
  g.restore()
}

function heart(g, x, y, s, color, filled = true) {
  g.save()
  g.beginPath()
  g.arc(x + s * 0.3, y + s * 0.33, s * 0.26, Math.PI, 0)
  g.arc(x + s * 0.7, y + s * 0.33, s * 0.26, Math.PI, 0)
  g.lineTo(x + s * 0.5, y + s * 0.92)
  g.closePath()
  if (filled) { g.fillStyle = color; g.fill() }
  else { g.strokeStyle = color; g.lineWidth = Math.max(2, s * 0.07); g.stroke() }
  g.restore()
}

function commentBubble(g, x, y, s, color, filled = false) {
  g.save()
  roundRect(g, x, y, s, s * 0.72, s * 0.2)
  if (filled) { g.fillStyle = color; g.fill() }
  else { g.strokeStyle = color; g.lineWidth = Math.max(2, s * 0.07); g.stroke() }
  g.beginPath()
  g.moveTo(x + s * 0.26, y + s * 0.7)
  g.lineTo(x + s * 0.26, y + s * 0.94)
  g.lineTo(x + s * 0.52, y + s * 0.69)
  g.closePath()
  if (filled) { g.fillStyle = color; g.fill() }
  else { g.strokeStyle = color; g.stroke() }
  g.restore()
}

function shareArrow(g, x, y, s, color) {
  g.save()
  g.strokeStyle = color
  g.lineWidth = Math.max(2, s * 0.07)
  g.lineCap = 'round'; g.lineJoin = 'round'
  g.beginPath()
  g.moveTo(x + s * 0.08, y + s * 0.52)
  g.lineTo(x + s * 0.92, y + s * 0.08)
  g.stroke()
  g.beginPath()
  g.moveTo(x + s * 0.92, y + s * 0.08)
  g.lineTo(x + s * 0.62, y + s * 0.12)
  g.moveTo(x + s * 0.92, y + s * 0.08)
  g.lineTo(x + s * 0.86, y + s * 0.4)
  g.stroke()
  g.restore()
}

function bookmark(g, x, y, s, color) {
  g.save()
  g.strokeStyle = color
  g.lineWidth = Math.max(2, s * 0.07)
  g.beginPath()
  g.moveTo(x + s * 0.16, y + s * 0.05)
  g.lineTo(x + s * 0.84, y + s * 0.05)
  g.lineTo(x + s * 0.84, y + s * 0.95)
  g.lineTo(x + s * 0.5, y + s * 0.68)
  g.lineTo(x + s * 0.16, y + s * 0.95)
  g.closePath()
  g.stroke()
  g.restore()
}

function verified(g, x, y, s) {
  g.save()
  g.beginPath(); g.arc(x, y, s / 2, 0, Math.PI * 2)
  g.fillStyle = '#0095f6'; g.fill()
  g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(2, s * 0.1)
  g.beginPath()
  g.moveTo(x - s * 0.22, y); g.lineTo(x - s * 0.05, y + s * 0.17); g.lineTo(x + s * 0.25, y - s * 0.18)
  g.stroke()
  g.restore()
}

function tabBar(g, w, h, dark = false, active = 'home') {
  const bg = dark ? '#000000' : '#ffffff'
  const fg = dark ? '#ffffff' : '#111111'
  g.fillStyle = bg
  g.fillRect(0, h - 92, w, 92)
  g.strokeStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)'
  g.lineWidth = 1
  g.beginPath(); g.moveTo(0, h - 92); g.lineTo(w, h - 92); g.stroke()
  const items = [
    ['home', '⌂'], ['search', '⌕'], ['reels', '▷'], ['shop', '◇'], ['user', '◎'],
  ]
  g.font = font(32, active ? '700' : '400')
  g.textAlign = 'center'
  items.forEach(([key, glyph], i) => {
    g.fillStyle = key === active ? fg : (dark ? '#8e8e8e' : '#8e8e8e')
    g.fillText(glyph, w * (i + 0.5) / 5, h - 38)
  })
  g.textAlign = 'left'
}

async function readReplyImage(ctx) {
  const target = extractMediaTarget(ctx)
  if (!target || target.type !== 'image') return null
  const media = await downloadWaMedia(target, config.imageTempDir)
  try {
    const fitted = await fitImage(media.buffer)
    return await imageFromBuffer(fitted)
  } finally {
    await fs.unlink(media.file).catch(() => {})
  }
}

async function profileImage(ctx) {
  const sock = ctx?.sock
  if (typeof sock?.profilePictureUrl !== 'function') return null
  try {
    const jid = ctx?.adminJid || ctx?.jid
    const url = await sock.profilePictureUrl(jid, 'image')
    if (!url || !/^https:\/\//i.test(url)) return null
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok || !/image\//i.test(res.headers.get('content-type') || '')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length || buf.length > config.imageMaxBytes) return null
    return await imageFromBuffer(await fitImage(buf))
  } catch { return null }
}

async function avatarImage(ctx) {
  try { return await readReplyImage(ctx) || await profileImage(ctx) }
  catch { return await profileImage(ctx).catch(() => null) }
}

async function postMedia(ctx) {
  const target = extractMediaTarget(ctx)
  if (!target || target.type !== 'image') return null
  const media = await downloadWaMedia(target, config.imageTempDir)
  try {
    const buffer = await fitImage(media.buffer)
    return { buffer, image: await imageFromBuffer(buffer) }
  } finally {
    await fs.unlink(media.file).catch(() => {})
  }
}

async function postImage(ctx) {
  try { return (await postMedia(ctx))?.image || null }
  catch { return null }
}

function smallFlag(g, code, x, y, w = 26, h = 18) {
  const c = String(code || 'ID').toUpperCase()
  g.save()
  g.fillStyle = '#ffffff'; g.fillRect(x, y, w, h)
  if (c === 'ID') {
    g.fillStyle = '#ce1126'; g.fillRect(x, y, w, h / 2)
    g.fillStyle = '#ffffff'; g.fillRect(x, y + h / 2, w, h / 2)
  } else {
    g.fillStyle = '#dddddd'; g.fillRect(x, y, w, h)
    g.fillStyle = '#0095f6'; g.font = font(10, '700'); g.fillText(c, x + 3, y + h - 4)
  }
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.strokeRect(x, y, w, h)
  g.restore()
}

// 1. Instagram Comment iOS — adaptasi commentquote.js (header biru, like/unlike, bendera, reply).
async function renderIgQc(ctx, arg) {
  const [raw, rawName, rawCountry, rawLike, rawUnlike] = parts(arg, 5)
  const text = clean(raw || (ctx?.quotedText || ''), MAX_TEXT)
  if (!text) return reply(ctx, `Format: .igqc teks | nama | negara | like | unlike\nContoh: .igqc Jangan takut gagal | Rifai | ID | 999 | 0`)
  const name = clean(rawName || 'Rifai', MAX_USER)
  const country = /^[a-z]{2}$/i.test(rawCountry) ? rawCountry.toUpperCase() : 'ID'
  const like = num(rawLike, 999)
  const unlike = num(rawUnlike, 0)

  const W = 720
  const probe = page(W, 1000)
  probe.ctx.font = font(24)
  const lines = wrapLines(probe.ctx, text, 620, 12)
  const bodyH = 92 + lines.length * 30 + 70
  const H = Math.max(300, bodyH + 60)
  const { canvas, ctx: g } = page(W, H)

  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#000090'); bg.addColorStop(1, '#000066')
  g.fillStyle = bg; g.fillRect(0, 0, W, H)
  g.fillStyle = '#4169e1'; g.fillRect(36, 16, W - 72, H - 32)
  g.fillStyle = '#000090'; g.fillRect(37, 17, W - 74, H - 34)

  smallFlag(g, country, 49, 50)
  g.font = font(20, '700'); g.fillStyle = '#ffffff'; g.fillText(name, 84, 67)
  g.font = font(18); g.textAlign = 'right'; g.fillText('2 jam', W - 49, 66); g.textAlign = 'left'

  g.font = font(24)
  drawLines(g, lines, 49, 116, 30, '#ffffff')

  const ay = 116 + lines.length * 30 + 32
  heart(g, 49, ay, 27, '#ffffff', true)
  g.font = font(20, '700'); g.fillText(like.toLocaleString('id-ID'), 86, ay + 22)
  heart(g, 170, ay, 27, '#ffffff', false)
  g.fillText(unlike.toLocaleString('id-ID'), 207, ay + 22)
  g.font = font(18); g.fillText('Balas  •  Laporkan', 300, ay + 22)

  fillRoundRect(g, 49, ay + 48, 96, 36, 8, '#2640cf')
  g.fillStyle = '#000090'; g.font = font(18, '600'); g.fillText('Balas', 76, ay + 72)
  g.font = font(17); g.fillStyle = '#a9bfff'; g.fillText('Tampilkan 1 balasan', 49, ay + 114)
  label(g, W, H)
  return toPng(canvas)
}

// 2. Instagram Post iOS — adaptasi igpost.js (username|like|comment|repost + gambar reply).
async function renderIgPost(ctx, arg) {
  const [rawUser, rawLike, rawComment, rawRepost] = parts(arg, 4)
  const username = clean(rawUser || 'kayy.assistant', MAX_USER)
  const like = num(rawLike, 1240)
  const comment = num(rawComment, 38)
  const repost = num(rawRepost, 7)
  const W = 720; const H = 1280
  const { canvas, ctx: g } = page(W, H)
  const bg = g.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#fafafa')
  g.fillStyle = bg; g.fillRect(0, 0, W, H)
  statusBar(g, W)

  const pp = await avatarImage(ctx)
  avatar(g, pp, 20, 58, 52)
  g.fillStyle = '#111111'; g.font = font(21, '700'); g.fillText(username, 86, 82)
  verified(g, 86 + Math.min(g.measureText(username).width, 260) + 18, 75, 22)
  g.fillStyle = '#8e8e8e'; g.font = font(15); g.fillText('Kayy Assistant • mockup', 86, 104)
  g.fillStyle = '#111'; g.font = font(26); g.textAlign = 'right'; g.fillText('···', W - 24, 88); g.textAlign = 'left'

  const img = await postImage(ctx)
  if (img) drawContain(g, img, 0, 126, W, 720, '#111111')
  else {
    const grad = g.createLinearGradient(0, 126, W, 846)
    grad.addColorStop(0, '#262638'); grad.addColorStop(1, '#0f172a')
    g.fillStyle = grad; g.fillRect(0, 126, W, 720)
    g.fillStyle = '#cbd5e1'; g.font = font(28, '600'); g.textAlign = 'center'
    g.fillText('Tidak ada gambar postingan', W / 2, 486)
    g.textAlign = 'left'
  }

  const ay = 864
  heart(g, 20, ay, 38, '#111', false)
  commentBubble(g, 76, ay + 4, 36, '#111', false)
  shareArrow(g, 132, ay + 4, 36, '#111')
  bookmark(g, W - 58, ay + 2, 36, '#111')
  g.fillStyle = '#111'; g.font = font(20, '700')
  g.fillText(`${like.toLocaleString('id-ID')} suka`, 20, ay + 68)
  g.font = font(19)
  g.fillStyle = '#555'
  g.fillText(`${comment.toLocaleString('id-ID')} komentar  •  ${repost.toLocaleString('id-ID')} repost`, 20, ay + 100)
  g.fillStyle = '#111'; g.font = font(19, '600')
  g.fillText(`${username} `, 20, ay + 134)
  g.font = font(19)
  g.fillText('Mockup postingan Instagram — dibuat lokal, bukan unggahan asli.', 20, ay + 164)
  g.fillStyle = '#8e8e8e'; g.font = font(16); g.fillText('2 jam lalu', 20, ay + 196)
  tabBar(g, W, H, false, 'home')
  label(g, W, H)
  return toPng(canvas)
}

// 3. Instagram Story iOS — adaptasi igstory.js/igstoryimg.js (blur, progress, ikon bawah).
async function renderIgStory(ctx, arg) {
  const [rawUser, rawCaption, rawLike, rawComment, rawTime] = parts(arg, 5)
  const username = clean(rawUser || 'kayy.assistant', MAX_USER)
  const caption = clean(rawCaption || 'Halo dari mockup story!', 180)
  const like = num(rawLike, 1289)
  const comment = num(rawComment, 42)
  const time = clean(rawTime || '2 jam', 20)
  const W = 720; const H = 1280
  const { canvas, ctx: g } = page(W, H)

  const media = await postMedia(ctx)
  const img = media?.image || null
  if (img) {
    try {
      const blur = await blurredCover(media.buffer, W, H)
      const bgImg = await imageFromBuffer(await fitImage(blur))
      drawCover(g, bgImg, 0, 0, W, H)
    } catch { g.fillStyle = '#0c0f14'; g.fillRect(0, 0, W, H) }
  } else {
    const grad = g.createLinearGradient(0, 0, W, H)
    grad.addColorStop(0, '#1d2b64'); grad.addColorStop(1, '#0c0f14')
    g.fillStyle = grad; g.fillRect(0, 0, W, H)
  }
  g.fillStyle = 'rgba(0,0,0,0.42)'; g.fillRect(0, 0, W, H)
  statusBar(g, W, true)

  for (let i = 0; i < 3; i += 1) {
    fillRoundRect(g, 18 + i * 90, 54, 76, 5, 3, i === 0 ? '#ffffff' : 'rgba(255,255,255,0.4)')
  }
  const pp = await avatarImage(ctx)
  avatar(g, pp, 18, 74, 54)
  g.fillStyle = '#ffffff'; g.font = font(20, '600'); g.fillText(username, 86, 96)
  verified(g, 86 + Math.min(g.measureText(username).width, 220) + 16, 89, 20)
  g.font = font(15); g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText(time, 86, 118)
  g.textAlign = 'right'; g.font = font(24); g.fillText('···', W - 22, 101); g.textAlign = 'left'

  const photoY = 150; const photoH = 720
  if (img) drawContain(g, img, 0, photoY, W, photoH, 'rgba(0,0,0,0.25)')

  const cap = fitText(g, caption, W - 60, { start: 30, min: 18, maxLines: 3, weight: '600' })
  g.font = font(cap.size, '600'); g.textAlign = 'center'
  drawLines(g, cap.lines, W / 2, photoY + photoH + 56, cap.size + 8, '#ffffff', 'center')

  const by = 1000
  heart(g, 20, by, 40, '#ffffff', false)
  g.font = font(21, '600'); g.fillStyle = '#ffffff'; g.fillText(like.toLocaleString('id-ID'), 70, by + 29)
  commentBubble(g, 190, by + 4, 38, '#ffffff', false)
  g.fillText(comment.toLocaleString('id-ID'), 240, by + 29)
  shareArrow(g, 390, by + 4, 38, '#ffffff')
  bookmark(g, W - 60, by + 2, 38, '#ffffff')

  fillRoundRect(g, 20, 1100, W - 40, 72, 36, 'rgba(255,255,255,0.16)')
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = font(20)
  g.fillText('Kirim pesan…', 50, 1144)
  label(g, W, H)
  return toPng(canvas)
}

// 4. Instagram Profile iOS — adaptasi fakeigprofile.js (username|bio|pengikut|mengikuti|postingan).
async function renderIgProfile(ctx, arg) {
  const [rawUser, rawBio, rawFollowers, rawFollowing, rawPosts] = parts(arg, 5)
  if (!rawUser || !rawBio) {
    return reply(ctx, `Format: .igprofile username|bio|pengikut|mengikuti|postingan\nContoh: .igprofile rifai.dev|Pembuat bot WhatsApp|1200|85|42`)
  }
  const username = clean(rawUser, MAX_USER)
  const bio = clean(rawBio, 120)
  const followers = num(rawFollowers, 0).toLocaleString('id-ID')
  const following = num(rawFollowing, 0).toLocaleString('id-ID')
  const posts = num(rawPosts, 0).toLocaleString('id-ID')
  const W = 720; const H = 1280
  const { canvas, ctx: g } = page(W, H)
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H)
  statusBar(g, W)

  g.fillStyle = '#111'; g.font = font(25, '700'); g.fillText(username, 20, 90)
  g.textAlign = 'right'; g.font = font(24); g.fillText('☰', W - 22, 90); g.textAlign = 'left'

  const pp = await avatarImage(ctx)
  avatar(g, pp, 20, 118, 130)

  const stats = [['Postingan', posts], ['Pengikut', followers], ['Mengikuti', following]]
  stats.forEach(([key, val], i) => {
    const x = 186 + i * 172
    g.textAlign = 'center'
    g.fillStyle = '#111'; g.font = font(22, '700'); g.fillText(val, x, 150)
    g.font = font(17); g.fillStyle = '#555'; g.fillText(key, x, 180)
  })
  g.textAlign = 'left'
  g.fillStyle = '#111'; g.font = font(19, '600'); g.fillText(username, 20, 278)
  g.font = font(18); g.fillText(bio, 20, 306)
  g.fillStyle = '#0095f6'; g.fillText('diadaptasi • mockup lokal', 20, 334)

  fillRoundRect(g, 20, 362, W - 40, 46, 10, '#0095f6')
  g.fillStyle = '#ffffff'; g.font = font(19, '700'); g.textAlign = 'center'
  g.fillText('Mengikuti', W / 2, 392)
  g.textAlign = 'left'
  const tabs = ['POSTINGAN', 'REELS', 'DISIMPAN']
  g.font = font(17, '700')
  tabs.forEach((t, i) => {
    g.fillStyle = i === 0 ? '#111' : '#9a9a9a'
    g.fillText(t, 60 + i * 220, 456)
  })
  g.strokeStyle = '#111'; g.lineWidth = 3
  g.beginPath(); g.moveTo(50, 472); g.lineTo(190, 472); g.stroke()

  const gridImg = await postImage(ctx)
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const x = col * 240; const y = 490 + row * 240
      if (gridImg) drawCover(g, gridImg, x, y, 238, 238)
      else {
        g.fillStyle = ['#e2e8f0', '#f1f5f9', '#dbeafe'][(row + col) % 3]
        g.fillRect(x, y, 238, 238)
        g.fillStyle = '#94a3b8'; g.font = font(34, '700'); g.textAlign = 'center'
        g.fillText('◇', x + 119, y + 130); g.textAlign = 'left'
      }
      g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.strokeRect(x, y, 238, 238)
    }
  }
  tabBar(g, W, H, false, 'user')
  label(g, W, H)
  return toPng(canvas)
}

// 5. Instagram DM iOS — tidak ada source langsung di arsip; mockup lokal berbasis pola canvas vanXone.
async function renderIgDm(ctx, arg) {
  const [rawUser, rawMsg, rawReply, rawTime] = parts(arg, 4)
  const username = clean(rawUser || 'teman.kayy', MAX_USER)
  const msg = clean(rawMsg || 'Halo, ini mockup DM Instagram.', 220)
  const replyText = clean(rawReply || 'Siap! Ini simulasi lokal ya.', 220)
  const time = clean(rawTime || '09:41', 20)
  const W = 720; const H = 1280
  const { canvas, ctx: g } = page(W, H)
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H)
  statusBar(g, W)

  const pp = await avatarImage(ctx)
  avatar(g, pp, 18, 58, 54)
  g.fillStyle = '#111'; g.font = font(21, '700'); g.fillText(username, 86, 84)
  g.font = font(15); g.fillStyle = '#8e8e8e'; g.fillText('aktif 2 jam lalu • mockup', 86, 106)
  g.fillStyle = '#111'; g.font = font(26); g.fillText('···', W - 34, 92)

  g.strokeStyle = '#eeeeee'; g.lineWidth = 1
  g.beginPath(); g.moveTo(0, 132); g.lineTo(W, 132); g.stroke()

  const bubble = (text, mine, y) => {
    g.font = font(21)
    const lines = wrapLines(g, text, 470, 5)
    const bw = Math.min(500, Math.max(...lines.map((l) => g.measureText(l).width)) + 40)
    const bh = 34 + lines.length * 29
    const x = mine ? W - bw - 20 : 20
    fillRoundRect(g, x, y, bw, bh, 20, mine ? '#3797f0' : '#efeff0')
    g.font = font(21)
    drawLines(g, lines, x + 20, y + 31, 29, mine ? '#ffffff' : '#111111')
    g.font = font(13); g.fillStyle = '#9a9a9a'
    g.textAlign = mine ? 'right' : 'left'
    g.fillText(time, mine ? W - 22 : 24, y + bh + 22)
    g.textAlign = 'left'
    return y + bh + 44
  }
  let y = 190
  y = bubble(msg, false, y)
  y = bubble(replyText, true, y)

  fillRoundRect(g, 16, H - 150, W - 32, 60, 30, '#efeff0')
  g.fillStyle = '#8e8e8e'; g.font = font(20); g.fillText('Pesan…', 40, H - 112)
  g.fillStyle = '#0095f6'; g.font = font(28); g.fillText('↑', W - 52, H - 110)
  tabBar(g, W, H, false, 'user')
  label(g, W, H)
  return toPng(canvas)
}

// 6. Instagram Notes iOS — adaptasi noteig.js (nama|catatan|waktu, maksimal 7 kata).
async function renderIgNote(ctx, arg) {
  const [rawUser, rawNote, rawTime] = parts(arg, 3)
  const name = clean(rawUser || 'Rifai', MAX_USER)
  const note = clean(rawNote || 'Aku ingin keduanya', 140)
  const time = clean(rawTime || '3m', 12)
  const words = note.split(/\s+/).filter(Boolean)
  if (words.length > 7) return reply(ctx, 'Catatan maksimal 7 kata, sesuai source noteig vanXone.')
  const W = 720; const H = 1280
  const { canvas, ctx: g } = page(W, H)
  const bg = g.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#101020'); bg.addColorStop(0.55, '#182042'); bg.addColorStop(1, '#0b1020')
  g.fillStyle = bg; g.fillRect(0, 0, W, H)
  statusBar(g, W, true)

  g.fillStyle = '#ffffff'; g.font = font(30, '700'); g.textAlign = 'center'
  g.fillText('Catatan', W / 2, 110)
  g.font = font(17); g.fillStyle = '#9ca3af'; g.fillText('Mockup / simulasi', W / 2, 142)
  g.textAlign = 'left'

  const pp = await avatarImage(ctx)
  avatar(g, pp, 44, 194, 92)
  const noteText = fitText(g, note, 520, { start: 30, min: 20, maxLines: 3, weight: '600' })
  const bubbleH = 150
  fillRoundRect(g, 156, 198, 520, bubbleH, 30, '#262b46')
  g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 2
  roundRect(g, 156, 198, 520, bubbleH, 30); g.stroke()
  g.font = font(noteText.size, '600'); g.fillStyle = '#ffffff'; g.textAlign = 'center'
  drawLines(g, noteText.lines, 416, 248, noteText.size + 8, '#ffffff', 'center')
  g.textAlign = 'left'
  g.font = font(18, '700'); g.fillStyle = '#ffffff'; g.fillText(name, 44, 318)
  g.font = font(15); g.fillStyle = '#9ca3af'; g.fillText(`${time}  •  dibuat lokal`, 44, 344)

  fillRoundRect(g, 44, 400, W - 88, 1, 0, 'rgba(255,255,255,0.12)')
  g.font = font(17); g.fillStyle = '#8b93a7'; g.fillText('Catatan berikutnya akan tampil di sini', 44, 440)
  tabBar(g, W, H, true, 'user')
  label(g, W, H)
  return toPng(canvas)
}

export const IG_COMMANDS = Object.freeze(['.igqc', '.igpost', '.igstory', '.igprofile', '.igdm', '.ignote'])

export async function handleIgCommand(ctx, cmd, arg = '') {
  const map = {
    '.igqc': renderIgQc,
    '.igpost': renderIgPost,
    '.igstory': renderIgStory,
    '.igprofile': renderIgProfile,
    '.igdm': renderIgDm,
    '.ignote': renderIgNote,
  }
  const render = map[cmd]
  if (!render) return false
  try {
    const target = extractMediaTarget(ctx)
    if (target) validateMedia(target)
    const buffer = await render(ctx, arg)
    if (!Buffer.isBuffer(buffer)) return buffer // pesan bantuan dari reply()
    await ctx.sock.sendMessage(ctx.jid, {
      image: buffer,
      caption: `${LABEL}\nMockup dibuat lokal oleh LUX BOT — Dev By Rifai`,
    }, { quoted: ctx.message })
    return { ok: true }
  } catch (err) {
    logger.warn(`ig ${cmd} gagal: ${err.message}`)
    return reply(ctx, `Gagal membuat mockup: ${err.message}`)
  }
}

export default handleIgCommand

// Diekspor untuk pengujian tanpa mengirim pesan WhatsApp.
export const _internal = { renderIgQc, renderIgPost, renderIgStory, renderIgProfile, renderIgDm, renderIgNote }
