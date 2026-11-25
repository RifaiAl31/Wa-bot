import {
  page, toPng, fillRoundRect, drawWatermark, fitText, drawLines, FONT
} from '../engine.js'

export const MODE_NAME = 'iPhone Quote Creator 5 (lokal)'

const THEMES = {
  ios: { bg: '#f2f2f7', bubble: '#ffffff', text: '#111111', accent: '#0a84ff', muted: '#777777' },
  dark: { bg: '#08090b', bubble: '#202124', text: '#f3f3f5', accent: '#4da3ff', muted: '#a1a1aa' },
  pink: { bg: '#fff0f6', bubble: '#ffffff', text: '#391326', accent: '#ed4c9b', muted: '#8b6176' },
  pinkv2: { bg: '#fce4ec', bubble: '#f06292', text: '#ffffff', accent: '#ad1457', muted: '#6f1638' },
  red: { bg: '#fff1f0', bubble: '#ffffff', text: '#3f0b0b', accent: '#e53935', muted: '#8a4b4b' },
}

async function renderTheme({ text = '' }, theme) {
  const colors = THEMES[theme]
  const W = 1080
  const PAD = 56
  const bubbleY = 116
  const measure = page(W, 10).ctx
  const fitted = fitText(measure, String(text), W - PAD * 2 - 68, {
    start: 38,
    min: 24,
    maxLines: 60,
  })
  const lineHeight = 52
  const bubbleH = Math.max(160, 86 + fitted.lines.length * lineHeight)
  const H = Math.max(1000, bubbleY + bubbleH + 115)
  const { canvas, ctx } = page(W, H)

  ctx.fillStyle = colors.bg
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = colors.text
  ctx.font = `700 31px ${FONT}`
  ctx.fillText('9:41', PAD, 54)
  ctx.textAlign = 'right'
  ctx.font = `700 24px ${FONT}`
  ctx.fillText('LTE  100%  ▰', W - PAD, 54)
  ctx.textAlign = 'left'

  fillRoundRect(ctx, PAD, bubbleY, W - PAD * 2, bubbleH, 38, colors.bubble)
  ctx.fillStyle = colors.accent
  ctx.font = `700 25px ${FONT}`
  ctx.fillText('× - vanXone </>', PAD + 34, bubbleY + 46)

  ctx.fillStyle = colors.text
  ctx.font = `${fitted.size}px ${FONT}`
  drawLines(ctx, fitted.lines, PAD + 34, bubbleY + 104, lineHeight)

  ctx.fillStyle = colors.muted
  ctx.font = `400 23px ${FONT}`
  ctx.textAlign = 'right'
  ctx.fillText(new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date()), W - PAD - 34, bubbleY + bubbleH - 26)
  ctx.textAlign = 'left'

  drawWatermark(ctx, W, H)
  return toPng(canvas)
}

export async function render(input) { return renderTheme(input, 'ios') }
export async function renderDark(input) { return renderTheme(input, 'dark') }
export async function renderPink(input) { return renderTheme(input, 'pink') }
export async function renderPinkV2(input) { return renderTheme(input, 'pinkv2') }
export async function renderRed(input) { return renderTheme(input, 'red') }
