// Fitur tulisan/kode berbasis AI (ESM).
//
// SUMBER POLA PROMPT / ATIBUSI:
//   vanxone_v7/plugins/ai/ai-rewriter.js — "Tulis ulang teks dengan tone tertentu",
//     format input <teks> | <tone> dan parseRewriteInput (diadaptasi menjadi "gaya | teks").
//   vanxone_v7/plugins/ai/fixcode.js — perbaiki kode: hasil berupa kode yang diperbaiki,
//     dilengkapi penjelasan singkat; pola prompt API /api/ai/fixcode.
//   vanxone_v7/plugins/ai/chatgpt.js — pola jawaban dimulai dengan penjelasan, blok kode,
//     lalu ringkasan; penanganan error "Terjadi kesalahan: ...".
//   vanxone_v7/plugins/ai/deepseek.js — penalaran: "Proses Berpikir" lalu jawaban;
//     diadaptasi menjadi penjelasan → penyebab → solusi.
//   vanxone_v7/plugins/ai/gemini.js — permintaan "jelaskan ..." dan jawaban dalam
//     bahasa pengguna; penanganan error respons gagal.
//   vanxone_v7/plugins/ai/glm-ai.js — input teks/pertanyaan langsung, pesan kosong
//     ditolak dengan contoh penggunaan.
// Semua prompt disusun ulang dalam bahasa Indonesia dan TIDAK pernah mengeksekusi kode.
// Kuota, model, dan provider sepenuhnya ditangani oleh aiService.askWithPrompt
// (kuota terpusat 20/user/60 menit, model gratis). Tidak ada fallback berbayar.

import { aiService } from '../../ai/service.js'
import { reply } from '../../commands/context.js'

export const SOURCE_ATTRIBUTION = Object.freeze({
  project: 'vanXone v7 — plugins/ai (terjemahan pola prompt, bukan salinan kode server)',
  files: Object.freeze([
    'vanxone_v7/plugins/ai/ai-rewriter.js',
    'vanxone_v7/plugins/ai/fixcode.js',
    'vanxone_v7/plugins/ai/chatgpt.js',
    'vanxone_v7/plugins/ai/deepseek.js',
    'vanxone_v7/plugins/ai/gemini.js',
    'vanxone_v7/plugins/ai/glm-ai.js',
  ]),
})

export const WRITING_COMMANDS = Object.freeze([
  '.aiwrite', '.rewrite', '.ringkas', '.fixcode', '.explaincode', '.debug',
])

const DEFAULT_STYLE = 'professional' // nilai bawaan parseRewriteInput di ai-rewriter.js

function normalizeCommand(cmd) {
  return String(cmd ?? '').trim().toLowerCase().replace(/^\.+/, '')
}

function splitRewrite(input) {
  const parts = String(input ?? '').split('|').map((part) => part.trim())
  if (parts.length < 2) return { style: DEFAULT_STYLE, text: parts[0] || '' }
  const style = parts.shift() || DEFAULT_STYLE
  return { style, text: parts.join(' | ').trim() }
}

// Pola coding: minta penjelasan, penyebab, solusi; Bahasa Indonesia; tanpa eksekusi.
function codingPrompt(task, code) {
  return [
    `Kamu adalah asisten pemrograman. ${task}`,
    '',
    'Jawab dalam bahasa Indonesia dengan bagian-bagian ini:',
    '1. Penjelasan',
    '2. Penyebab',
    '3. Solusi',
    '',
    'Jangan jalankan atau eksekusi kode apa pun. Hanya analisis teks kode di bawah ini.',
    '',
    'Kode:',
    String(code),
  ].join('\n')
}

const SPECS = {
  aiwrite: {
    label: 'AI WRITE',
    usage: [
      '✍️ *AI WRITE*',
      '',
      'Tulis ulang atau rapikan teks dalam bahasa Indonesia.',
      'Contoh: .aiwrite Halo semuanya, mohon perhatiannya.',
    ].join('\n'),
    build: (input) => ({
      prompt: [
        'Tulis ulang teks berikut dalam bahasa Indonesia yang jelas, rapi, dan natural.',
        'Pertahankan makna aslinya. Berikan hanya hasil tulisan ulangnya.',
        '',
        'Teks:',
        input,
      ].join('\n'),
    }),
  },
  rewrite: {
    label: 'AI REWRITER',
    usage: [
      '✍️ *AI REWRITER*',
      '',
      'Format: .rewrite <gaya> | <teks>',
      'Contoh: .rewrite formal | Halo semuanya, mohon perhatiannya.',
      `Gaya bawaan: ${DEFAULT_STYLE}.`,
    ].join('\n'),
    build: (input) => {
      const { style, text } = splitRewrite(input)
      return {
        style,
        text,
        prompt: [
          `Tulis ulang teks berikut dengan gaya "${style}" dalam bahasa Indonesia.`,
          'Pertahankan makna aslinya. Berikan hanya hasil tulisan ulangnya.',
          '',
          `Gaya: ${style}`,
          'Teks:',
          text,
        ].join('\n'),
      }
    },
  },
  ringkas: {
    label: 'RINGKASAN',
    usage: [
      '📝 *RINGKASAN AI*',
      '',
      'Ringkas teks menjadi poin-poin utama.',
      'Contoh: .ringkas <teks yang ingin diringkas>',
    ].join('\n'),
    build: (input) => ({
      prompt: [
        'Ringkas teks berikut dalam bahasa Indonesia menjadi poin-poin utama yang padat.',
        'Jangan menambahkan informasi yang tidak ada pada teks asli.',
        '',
        'Teks:',
        input,
      ].join('\n'),
    }),
  },
  fixcode: {
    label: 'FIX CODE',
    usage: [
      '🛠️ *FIX CODE*',
      '',
      'Perbaiki kode dan jelaskan masalahnya.',
      'Contoh: .fixcode const a = 1; a = 2;',
    ].join('\n'),
    build: (input) => ({
      prompt: codingPrompt('Perbaiki kode berikut.', input),
    }),
  },
  explaincode: {
    label: 'EXPLAIN CODE',
    usage: [
      '🔍 *EXPLAIN CODE*',
      '',
      'Jelaskan kode dalam bahasa Indonesia.',
      'Contoh: .explaincode const a = 1;',
    ].join('\n'),
    build: (input) => ({
      prompt: codingPrompt('Jelaskan cara kerja kode berikut.', input),
    }),
  },
  debug: {
    label: 'DEBUG CODE',
    usage: [
      '🐞 *DEBUG CODE*',
      '',
      'Temukan masalah kode, penyebab, dan solusinya.',
      'Contoh: .debug const a = 1; a = 2;',
    ].join('\n'),
    build: (input) => ({
      prompt: codingPrompt('Telusuri bug pada kode berikut dan berikan perbaikannya.', input),
    }),
  },
}

/**
 * Tangani perintah tulisan/kode AI.
 * Satu perintah = tepat satu panggilan askWithPrompt, sehingga kuota terpakai sekali.
 * Tidak menjalankan kode pengguna; kode hanya dikirim sebagai teks prompt.
 *
 * @returns {Promise<{ok:boolean, command:string, prompt?:string, text?:string,
 *   answer?:string, message?:string, silent?:boolean, ignored?:boolean, style?:string,
 *   source?:object}>}
 */
export async function handleWritingCommand(ctx, cmd, arg) {
  const name = normalizeCommand(cmd)
  const spec = SPECS[name]
  if (!spec) return { ok: false, ignored: true, command: name }

  const input = String(arg ?? '').trim()
  if (!input) {
    await reply(ctx, spec.usage)
    return { ok: false, command: `.${name}`, message: spec.usage, reason: 'empty_input' }
  }

  const built = spec.build(input)
  const command = `.${name}`
  let result
  try {
    // Satu-satunya jalur AI: delegasi penuh ke kuota/model gratis terpusat.
    result = await aiService.askWithPrompt(ctx, {
      prompt: built.prompt,
      label: spec.label,
      command,
    })
  } catch (err) {
    const message = `❌ Terjadi kesalahan: ${err?.message || String(err)}`
    await reply(ctx, message)
    return { ok: false, command, prompt: built.prompt, message, error: err?.message || String(err) }
  }

  if (!result || result.ok === false) {
    const message = result?.message || 'Layanan AI sedang tidak tersedia.'
    if (!result?.silent && message !== null && message !== undefined) await reply(ctx, message)
    return {
      ok: false, command, prompt: built.prompt, message,
      silent: Boolean(result?.silent),
      ...(built.style ? { style: built.style } : {}),
    }
  }

  const text = String(result.text ?? result.answer ?? '')
  await reply(ctx, text)
  return {
    ok: true, command, prompt: built.prompt, text,
    answer: result.answer, model: result.model,
    ...(built.style ? { style: built.style } : {}),
    source: SOURCE_ATTRIBUTION,
  }
}

export default handleWritingCommand
