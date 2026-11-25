import { config } from '../config.js'
import { checkLimits, recordUsage } from '../ai/limits.js'
import { aiService } from '../ai/service.js'
import * as modelConfig from '../ai/modelConfig.js'
import { isVip } from '../services/vipService.js'
import { analyzeImage, analyzePdfText } from '../ai/mediaService.js'
import { reply } from './context.js'
import { withReaction } from './reactions.js'
import {
  createContext, buildChoices, getActiveContext, clearContext,
} from './quickReplies.js'
import { COMMAND_GROUPS } from './registry.js'
import { shouldNotifyCooldown } from './cooldownNotice.js'

const IMG_ACTIONS = ['🔍 Analisis Lebih Detail', '📝 Ambil Semua Teks (OCR)', '💡 Jelaskan Isi Gambar']
const PDF_ACTIONS = ['📚 Ringkas Dokumen', '🔎 Cari Poin Penting', '❓ Tanya Isi PDF']
const ASK_ACTIONS = ['📖 Jelaskan Lebih Detail', '💡 Berikan Contoh', '🔄 Sederhanakan Jawaban']
const MENU_ACTIONS = ['📢 Pengumuman', '🤖 AI Assistant', '📄 Dokumen & Gambar']

function guard(ctx, feature) {
  const limit = checkLimits(ctx.adminJid, ctx.jid)
  if (!limit.ok) {
    if (limit.kind !== 'cooldown' || shouldNotifyCooldown(ctx.adminJid, feature)) reply(ctx, limit.reason)
    return null
  }
  return limit
}

function usage(ctx, limit, status, reason = '', promptChars = 0, responseChars = 0) {
  recordUsage({
    userJid: ctx.adminJid, groupJid: ctx.jid, command: ctx.cmd || '/ask',
    modelId: ctx.modelId || null, status, reason, promptChars, responseChars,
    windowStart: limit?.windowStart,
  })
}

async function sendWithChoices(ctx, text, kind, payload, labels) {
  createContext(kind, payload, ctx)
  return reply(ctx, buildChoices(text, labels))
}

function firstTitle(text) {
  const lines = String(text || '').split('\n').map((s) => s.trim())
    .map((s) => s.replace(/^\[Halaman \d+\]\s*/, ''))
    .filter(Boolean)
  return (lines[0] || '').slice(0, 90)
}

export async function runAsk(ctx, question) {
  return withReaction(ctx, async () => {
    const result = await aiService.ask(question, ctx)
    if (!result.ok) { if (result.message) await reply(ctx, result.message); return { ok: false } }
    const sent = await sendWithChoices(ctx, result.text, 'ask', { question, answer: result.text }, ASK_ACTIONS)
    return { ok: Boolean(sent?.ok) }
  })
}

export async function runImageAnalysis(ctx, { buffer, mimetype, question }, deps = {}) {
  return withReaction(ctx, async () => {
    const limit = guard(ctx, 'img')
    if (!limit) return { ok: false, reason: 'limit' }
    let model = null
    try {
      const vip = isVip(ctx.adminJid)
      model = await modelConfig.currentModel('vision', { vip })
      const analyze = deps.analyzeImage || analyzeImage
      const answer = await analyze({ buffer, mimetype, question, modelId: model.id })
      usage(ctx, { ...limit, modelId: model.id }, 'success', '', String(question).length, String(answer).length)
      ctx.modelId = model.id
      await sendWithChoices(ctx, [
        '🖼️ *HASIL ANALISIS GAMBAR*', '', answer, '', `Model: ${model.name || model.id} (Free)`,
      ].join('\n'), 'img', { buffer, mimetype }, IMG_ACTIONS)
      return { ok: true }
    } catch (err) {
      usage(ctx, { ...limit, modelId: model?.id || null }, 'failed', err.message, String(question).length, 0)
      await reply(ctx, `Gagal menganalisis gambar: ${err.message}`)
      return { ok: false, error: err.message }
    }
  })
}

export async function runPdfAnalysis(ctx, { buffer, text, question, filename }, deps = {}) {
  return withReaction(ctx, async () => {
    const limit = guard(ctx, 'pdf')
    if (!limit) return { ok: false, reason: 'limit' }
    let model = null
    try {
      model = await modelConfig.currentModel('pdf', { vip: isVip(ctx.adminJid) })
      const analyze = deps.analyzePdfText || analyzePdfText
      const answer = await analyze({ text, question, modelId: model.id })
      usage(ctx, { ...limit, modelId: model.id }, 'success', '', String(question).length, String(answer).length)
      ctx.modelId = model.id
      await sendWithChoices(ctx, [
        '📄 *HASIL ANALISIS PDF*', '',
        `Judul: ${firstTitle(text) || filename || '-'}`, '',
        answer, '', `Model: ${model.name || model.id} (Free)`,
      ].join('\n'), 'pdf', { text, question, filename }, PDF_ACTIONS)
      return { ok: true }
    } catch (err) {
      usage(ctx, { ...limit, modelId: model?.id || null }, 'failed', err.message, String(question).length, 0)
      await reply(ctx, `Gagal membaca PDF: ${err.message}`)
      return { ok: false, error: err.message }
    }
  })
}

export async function handlePdfQuestion(ctx, text) {
  const context = getActiveContext(ctx)
  if (!context || context.kind !== 'pdf_ask') return false
  clearContext(ctx)
  await runPdfAnalysis(ctx, { text: context.payload.text, question: text, filename: context.payload.filename })
  return true
}

function menuCategoryText(admin, index) {
  const keys = ['PENGUMUMAN', 'AI ASSISTANT', 'DOKUMEN']
  const group = COMMAND_GROUPS.find((g) => g.title.includes(keys[index]))
  if (!group) return 'Kategori tidak tersedia.'
  const lines = ['🤖 *MENU BOT WHATSAPP*', '', group.title]
  for (const item of group.commands.filter((x) => admin || !x.admin)) {
    lines.push(`- \`${item.usage}\` — ${item.desc}${item.admin ? ' (Admin)' : ''}`)
  }
  return lines.join('\n')
}

export async function handleQuickChoice(ctx, choice, deps = {}) {
  const admin = ctx.isRegisteredAdmin !== undefined ? Boolean(ctx.isRegisteredAdmin) : false
  if (choice.kind === 'menu') {
    const map = { 1: 0, 2: 1, 3: 2 }
    await reply(ctx, menuCategoryText(admin, map[choice.actionIndex] ?? 0))
    return
  }
  if (choice.kind === 'img') {
    const { buffer, mimetype } = choice.payload || {}
    const questions = {
      1: 'Analisis gambar ini lebih mendalam: jelaskan objek, konteks, dan detail penting yang terlihat.',
      2: 'Ambil semua tulisan yang terlihat pada gambar ini (OCR). Pertahankan baris baru dan susunan teks.',
      3: 'Jelaskan isi gambar ini dengan bahasa sederhana untuk pemula.',
    }
    await runImageAnalysis(ctx, { buffer, mimetype, question: questions[choice.actionIndex] }, deps)
    return
  }
  if (choice.kind === 'pdf') {
    if (choice.actionIndex === 3) {
      const context = getActiveContext(ctx)
      const payload = context?.payload || choice.payload || {}
      createContext('pdf_ask', payload, ctx)
      await reply(ctx, '❓ Ketik pertanyaan Anda tentang dokumen PDF ini.')
      return
    }
    const questions = {
      1: 'Ringkas dokumen PDF ini secara jelas dan terstruktur.',
      2: 'Ambil poin-poin penting dari dokumen PDF ini.',
    }
    await runPdfAnalysis(ctx, { text: choice.payload?.text, question: questions[choice.actionIndex], filename: choice.payload?.filename }, deps)
    return
  }
  if (choice.kind === 'ask') {
    const { question, answer } = choice.payload || {}
    const followups = {
      1: `Jelaskan lebih detail tentang pertanyaan ini: ${question}\n\nJawaban sebelumnya: ${answer}`,
      2: `Berikan contoh konkret yang relevan untuk pertanyaan ini: ${question}\n\nJawaban sebelumnya: ${answer}`,
      3: `Sederhanakan jawaban ini dengan bahasa yang lebih mudah dipahami:\n\n${answer}`,
    }
    await runAsk(ctx, followups[choice.actionIndex] || question)
  }
}
