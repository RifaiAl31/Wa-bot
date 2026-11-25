// Menghasilkan aset background menu ORIGINAL (tanpa hak cipta pihak ketiga).
// Frame digambar programatis dengan @napi-rs/canvas lalu dirangkai ffmpeg.
import { createCanvas } from '@napi-rs/canvas'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const W = 768
const H = 432
const FPS = 12
const SECONDS = 8
const FRAMES = FPS * SECONDS
const OUT_DIR = path.resolve('assets')
const FFMPEG = process.env.FFMPEG || 'ffmpeg'

fs.mkdirSync(OUT_DIR, { recursive: true })

function rng(seed) {
  let x = seed >>> 0
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0
    return x / 4294967296
  }
}

const stars = (() => {
  const r = rng(20261125)
  return Array.from({ length: 90 }, () => ({ x: r() * W, y: r() * H * 0.55, s: 0.6 + r() * 1.6, p: r() * Math.PI * 2 }))
})()

async function drawFrame(i) {
  const c = createCanvas(W, H)
  const g = c.getContext('2d')
  const t = i / FRAMES

  const bg = g.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#050816')
  bg.addColorStop(0.45, '#101a38')
  bg.addColorStop(1, '#1b1033')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)

  const glow = g.createRadialGradient(W * 0.72, H * 0.28, 8, W * 0.72, H * 0.28, 190)
  glow.addColorStop(0, 'rgba(120,180,255,0.42)')
  glow.addColorStop(0.5, 'rgba(126,80,255,0.16)')
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = glow
  g.fillRect(0, 0, W, H)

  for (const s of stars) {
    const a = 0.35 + 0.4 * Math.sin(t * Math.PI * 2 + s.p)
    g.fillStyle = `rgba(200,225,255,${Math.max(0.08, a)})`
    g.beginPath(); g.arc(s.x, s.y, s.s, 0, Math.PI * 2); g.fill()
  }

  const moonX = W * 0.72 + Math.sin(t * Math.PI * 2) * 4
  const moonY = H * 0.28 + Math.cos(t * Math.PI * 2) * 3
  g.fillStyle = 'rgba(210,228,255,0.92)'
  g.beginPath(); g.arc(moonX, moonY, 34, 0, Math.PI * 2); g.fill()
  g.strokeStyle = 'rgba(120,200,255,0.35)'
  g.lineWidth = 1
  for (let k = 1; k <= 3; k += 1) {
    g.beginPath(); g.arc(moonX, moonY, 42 + k * 10, 0, Math.PI * 2); g.stroke()
  }

  function mountain(baseY, color, shift, peaks) {
    g.fillStyle = color
    g.beginPath()
    g.moveTo(0, H)
    g.lineTo(0, baseY)
    for (let x = 0; x <= W; x += 28) {
      const y = baseY + Math.sin((x + shift) / peaks) * 26 + Math.sin((x + shift) / (peaks * 0.37)) * 9
      g.lineTo(x, y)
    }
    g.lineTo(W, H)
    g.closePath()
    g.fill()
  }

  mountain(H * 0.62 + Math.sin(t * Math.PI * 2) * 2, '#111b3a', t * 14, 70)
  mountain(H * 0.74 + Math.cos(t * Math.PI * 2) * 3, '#0a1330', t * 22, 52)
  mountain(H * 0.86, '#060c20', t * 30, 40)

  for (let k = 0; k < 5; k += 1) {
    const y = H * 0.9 + k * 12
    const x = ((t * 160 + k * 190) % (W + 200)) - 100
    const streak = g.createLinearGradient(x - 90, y, x + 90, y)
    streak.addColorStop(0, 'rgba(80,160,255,0)')
    streak.addColorStop(0.5, 'rgba(120,200,255,0.22)')
    streak.addColorStop(1, 'rgba(180,100,255,0)')
    g.fillStyle = streak
    g.fillRect(x - 90, y, 180, 1.5)
  }

  const vignette = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.9)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.55)')
  g.fillStyle = vignette
  g.fillRect(0, 0, W, H)

  return await c.encode('png')
}

const ffmpegArgs = [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
  path.join(OUT_DIR, 'menu-background.mp4'),
]
const frames = []
for (let i = 0; i < FRAMES; i += 1) frames.push(await drawFrame(i))
const result = spawnSync(FFMPEG, ffmpegArgs, {
  input: Buffer.concat(frames),
  maxBuffer: 32 * 1024 * 1024,
})
if (result.status !== 0) {
  console.error(result.stderr?.toString() || 'Gagal membuat video')
  process.exit(1)
}

fs.writeFileSync(path.join(OUT_DIR, 'menu-poster.png'), frames[0])
console.log(`Aset original dibuat: ${FRAMES} frame, ${SECONDS}s (${fs.statSync(path.join(OUT_DIR, 'menu-background.mp4')).size} bytes)`)
