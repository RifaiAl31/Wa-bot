import { reply } from '../../commands/context.js'
import { normalizeJid } from '../../config.js'

export const GAME_COMMANDS = new Set(['.quiz', '.qa'])
export const GAME_SESSION_TTL_MS = 3 * 60_000

const QUESTION_BANK = [
  {
    category: 'umum',
    question: 'Berapa hari dalam satu minggu?',
    choices: ['5', '6', '7', '8'],
    answer: 'C',
  },
  {
    category: 'geografi',
    question: 'Apa ibu kota Jepang?',
    choices: ['Kyoto', 'Tokyo', 'Osaka', 'Sapporo'],
    answer: 'B',
  },
  {
    category: 'sains',
    question: 'Pada suhu berapa Celsius air murni membeku?',
    choices: ['0°C', '10°C', '32°C', '100°C'],
    answer: 'A',
  },
  {
    category: 'sejarah',
    question: 'Indonesia memproklamasikan kemerdekaan pada tahun berapa?',
    choices: ['1908', '1928', '1945', '1950'],
    answer: 'C',
  },
  {
    category: 'teknologi',
    question: 'Protokol apa yang mengenkripsi koneksi situs web?',
    choices: ['FTP', 'HTTP', 'SMTP', 'HTTPS'],
    answer: 'D',
  },
]

const sessions = new Map()
const categories = [...new Set(QUESTION_BANK.map((item) => item.category))]
const keyOf = (ctx) => `${String(ctx?.jid || '').trim()}|${normalizeJid(ctx?.adminJid || '')}`

function answerLabel(question) {
  const index = question.answer.charCodeAt(0) - 65
  return `${question.answer}. ${question.choices[index]}`
}

export function cleanupExpiredGames(now = Date.now()) {
  let removed = 0
  for (const [key, session] of sessions) {
    if (session.expiresAt <= now) {
      sessions.delete(key)
      removed += 1
    }
  }
  return removed
}

export function clearGameSessions() {
  sessions.clear()
}

export function activeGameCount() {
  return sessions.size
}

export async function handleGameCommand(ctx, cmd, arg = '', deps = {}) {
  const command = String(cmd || '').trim().toLowerCase()
  if (!GAME_COMMANDS.has(command)) return false

  const now = deps.now?.() ?? Date.now()
  const key = keyOf(ctx)
  const current = sessions.get(key)
  if (current && current.expiresAt <= now) {
    sessions.delete(key)
    await reply(ctx, `⌛ Waktu kuis habis. Jawaban yang benar: ${answerLabel(current.question)}.\nKetik .quiz untuk bermain lagi.\n\nLUX BOT — Dev By Rifai`)
    cleanupExpiredGames(now)
    return true
  }
  cleanupExpiredGames(now)

  if (command === '.quiz') {
    if (current) {
      return reply(ctx, 'Kuis Anda masih berjalan. Jawab dengan .qa A-D sebelum waktunya habis.\n\nLUX BOT — Dev By Rifai')
    }

    const category = String(arg || '').trim().toLowerCase()
    if (category && !categories.includes(category)) {
      return reply(ctx, `Kategori tidak dikenal. Pilih: ${categories.join(', ')}.\nContoh: .quiz geografi\n\nLUX BOT — Dev By Rifai`)
    }
    const pool = QUESTION_BANK.filter((item) => !category || item.category === category)
    const random = deps.random || Math.random
    const question = pool[Math.floor(random() * pool.length)]
    const session = { question, expiresAt: now + GAME_SESSION_TTL_MS }
    sessions.set(key, session)
    const choices = question.choices.map((choice, index) => `${String.fromCharCode(65 + index)}. ${choice}`)
    return reply(ctx, [
      `🎮 *LUX BOT — KUIS ${question.category.toUpperCase()}*`,
      '',
      question.question,
      ...choices,
      '',
      'Jawab dengan .qa <A-D> (contoh: .qa B). Hanya pengirim kuis yang dapat menjawab.',
      'Batas waktu: 3 menit.',
      '',
      'Dev By Rifai',
    ].join('\n'))
  }

  if (command === '.qa') {
    if (!current) return reply(ctx, 'Tidak ada kuis aktif milik Anda di chat ini. Ketik .quiz untuk memulai.\n\nLUX BOT — Dev By Rifai')
    const answer = String(arg || '').trim().toUpperCase()
    if (!/^[A-D]$/.test(answer)) {
      return reply(ctx, 'Jawaban harus berupa A, B, C, atau D. Contoh: .qa B\n\nLUX BOT — Dev By Rifai')
    }
    sessions.delete(key)
    if (answer === current.question.answer) {
      return reply(ctx, `🎉 Benar! Jawabannya ${answerLabel(current.question)}. Kuis selesai.\n\nLUX BOT — Dev By Rifai`)
    }
    return reply(ctx, `Belum tepat. Jawaban yang benar: ${answerLabel(current.question)}. Kuis selesai.\n\nLUX BOT — Dev By Rifai`)
  }

  return false
}
