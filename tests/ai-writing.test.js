// Uji untuk src/features/ai/writing.js — askWithPrompt difake, tanpa server nyata.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

import { aiService } from '../src/ai/service.js'
import {
  handleWritingCommand, WRITING_COMMANDS, SOURCE_ATTRIBUTION,
} from '../src/features/ai/writing.js'

const originalAskWithPrompt = aiService.askWithPrompt

function makeCtx() {
  const sent = []
  const sock = {
    isConnected: () => true,
    async sendMessage(jid, content) {
      sent.push(content)
      return { key: { id: `fake-${sent.length}` } }
    },
  }
  return {
    ctx: {
      sock, jid: '628222222222@g.us', adminJid: '628111111111@s.whatsapp.net',
      isGroup: true, messageKey: { id: 'test-key' },
    },
    sent,
    texts: () => sent.map((s) => s.text).filter(Boolean),
  }
}

async function withFake(responder, fn) {
  const calls = []
  aiService.askWithPrompt = async (ctx, opts) => {
    calls.push({ ctx, opts })
    return typeof responder === 'function' ? responder(ctx, opts, calls.length) : responder
  }
  try {
    return await fn(calls)
  } finally {
    aiService.askWithPrompt = originalAskWithPrompt
  }
}

const okResult = (tag = 'uji') => ({
  ok: true,
  answer: `Jawaban ${tag}`,
  text: `✨ *HASIL ${tag}*\n\nJawaban ${tag}\n\nModel: free-test (Free)`,
  model: { id: 'free-test', name: 'free-test' },
})

test('atribusi sumber vanXone tercantum', () => {
  assert.equal(SOURCE_ATTRIBUTION.files.length, 6)
  for (const file of [
    'ai-rewriter.js', 'fixcode.js', 'chatgpt.js', 'deepseek.js', 'gemini.js', 'glm-ai.js',
  ]) {
    assert.ok(SOURCE_ATTRIBUTION.files.some((path) => path.endsWith(file)), file)
  }
})

test('setiap perintah memakai askWithPrompt tepat sekali (kuota sekali)', async () => {
  for (const cmd of WRITING_COMMANDS) {
    await withFake(() => okResult(cmd), async (calls) => {
      const { ctx, texts } = makeCtx()
      const arg = cmd === '.rewrite' ? 'formal | Halo semuanya' : 'Halo dunia, ini contoh teks.'
      const result = await handleWritingCommand(ctx, cmd, arg)

      assert.equal(calls.length, 1, `${cmd} harus memanggil askWithPrompt sekali`)
      assert.equal(calls[0].opts.command, cmd)
      assert.equal(calls[0].ctx, ctx)
      assert.ok(typeof calls[0].opts.prompt === 'string' && calls[0].opts.prompt.includes(arg === 'formal | Halo semuanya' ? 'Halo semuanya' : arg))
      assert.equal(result.ok, true)
      assert.equal(result.command, cmd)
      assert.equal(texts().length, 1)
      assert.match(texts()[0], /Jawaban/)
    })
  }
})

test('.rewrite memisahkan "gaya | teks" (termasuk tanda | di dalam teks)', async () => {
  await withFake(() => okResult('rewrite'), async (calls) => {
    const { ctx } = makeCtx()
    const result = await handleWritingCommand(ctx, '.rewrite', 'santai | baris satu | baris dua')

    assert.equal(calls.length, 1)
    assert.equal(result.style, 'santai')
    assert.match(calls[0].opts.prompt, /Gaya: santai/)
    assert.match(calls[0].opts.prompt, /Teks:\nbaris satu \| baris dua/)
    assert.doesNotMatch(calls[0].opts.prompt, /Gaya: santai \| baris satu/)
  })

  await withFake(() => okResult('rewrite'), async (calls) => {
    const { ctx } = makeCtx()
    const result = await handleWritingCommand(ctx, '.rewrite', 'Halo tanpa gaya')
    assert.equal(result.style, 'professional')
    assert.match(calls[0].opts.prompt, /Gaya: professional/)
    assert.match(calls[0].opts.prompt, /Halo tanpa gaya/)
  })
})

test('perintah coding meminta penjelasan, penyebab, solusi, bahasa Indonesia, tanpa eksekusi', async () => {
  for (const cmd of ['.fixcode', '.explaincode', '.debug']) {
    await withFake(() => okResult(cmd), async (calls) => {
      const { ctx } = makeCtx()
      const code = 'const a = 1; a = 2;'
      await handleWritingCommand(ctx, cmd, code)
      const prompt = calls[0].opts.prompt
      assert.equal(calls.length, 1)
      assert.match(prompt, /bahasa Indonesia/i)
      assert.match(prompt, /Penjelasan/)
      assert.match(prompt, /Penyebab/)
      assert.match(prompt, /Solusi/)
      assert.match(prompt, /Jangan jalankan atau eksekusi kode/i)
      assert.ok(prompt.includes(code))
    })
  }
})

test('.debug tidak mengeksekusi kode pengguna', async () => {
  const flag = '__WRITING_TEST_CODE_EXECUTED__'
  globalThis[flag] = false
  const payload = `globalThis.${flag} = true; console.log('dijalankan');`

  await withFake(() => okResult('debug'), async (calls) => {
    const { ctx, texts } = makeCtx()
    const result = await handleWritingCommand(ctx, '.debug', payload)

    assert.equal(globalThis[flag], false, 'kode pengguna tidak boleh berjalan di server')
    assert.equal(result.ok, true)
    assert.equal(texts().length, 1)
    assert.equal(calls.length, 1)
    assert.match(calls[0].opts.prompt, /Jangan jalankan atau eksekusi kode apa pun/i)
    assert.ok(calls[0].opts.prompt.includes(payload), 'kode dikirim hanya sebagai teks prompt')
  })

  const source = await fs.readFile(new URL('../src/features/ai/writing.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\beval\s*\(|\bnew\s+Function\s*\(|\bexec\s*\(|\bspawn\s*\(/)
  assert.doesNotMatch(source, /modelConfig|askModel|isVip|vipService|OPENROUTER|openrouter/i)
  delete globalThis[flag]
})

test('kegagalan askWithPrompt ditangani: pesan dikirim, tidak melempar', async () => {
  await withFake(() => ({ ok: false, message: 'Kuota harian terlampaui.' }), async (calls) => {
    const { ctx, texts } = makeCtx()
    const result = await handleWritingCommand(ctx, '.ringkas', 'teks panjang')
    assert.equal(result.ok, false)
    assert.equal(calls.length, 1)
    assert.match(texts()[0], /Kuota harian terlampaui/)
  })

  await withFake(() => ({ ok: false, message: null, silent: true }), async (calls) => {
    const { ctx, texts } = makeCtx()
    const result = await handleWritingCommand(ctx, '.aiwrite', 'teks')
    assert.equal(result.ok, false)
    assert.equal(result.silent, true)
    assert.equal(texts().length, 0)
    assert.equal(calls.length, 1)
  })

  await withFake(() => { throw new Error('layanan mati') }, async (calls) => {
    const { ctx, texts } = makeCtx()
    const result = await handleWritingCommand(ctx, '.fixcode', 'const a = 1;')
    assert.equal(result.ok, false)
    assert.equal(result.error, 'layanan mati')
    assert.match(texts()[0], /Terjadi kesalahan: layanan mati/)
    assert.equal(calls.length, 1)
  })
})

test('argumen kosong tidak menghabiskan kuota dan menampilkan contoh', async () => {
  for (const cmd of WRITING_COMMANDS) {
    await withFake(() => okResult(), async (calls) => {
      const { ctx, texts } = makeCtx()
      const result = await handleWritingCommand(ctx, cmd, '   ')
      assert.equal(calls.length, 0, `${cmd} tidak boleh memanggil AI tanpa teks`)
      assert.equal(result.ok, false)
      assert.match(texts()[0], /Contoh:/)
    })
  }
})

test('perintah di luar daftar diabaikan tanpa AI dan tanpa balasan', async () => {
  await withFake(() => okResult(), async (calls) => {
    const { ctx, texts } = makeCtx()
    const result = await handleWritingCommand(ctx, '.tidakada', 'halo')
    assert.equal(result.ignored, true)
    assert.equal(calls.length, 0)
    assert.equal(texts().length, 0)
  })
})
