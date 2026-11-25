import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { testEnv, ADMIN, GROUP } from './helpers.js'

testEnv('islam')
const { initDb } = await import('../src/db/index.js')
const { handleIslamCommand } = await import('../src/features/islam/index.js')
initDb({ force: true })

const DATA = path.join(process.cwd(), 'src', 'features', 'islam', 'data')
const AYAT = JSON.parse(fs.readFileSync(path.join(DATA, 'ayat.json'), 'utf8'))
const ZIKIR = JSON.parse(fs.readFileSync(path.join(DATA, 'zikir.json'), 'utf8'))
const QUOTES = JSON.parse(fs.readFileSync(path.join(DATA, 'quotes.json'), 'utf8'))
const ASMAUL = JSON.parse(fs.readFileSync(path.join(DATA, 'asmaul.json'), 'utf8'))

function makeSock() {
  const sent = []
  return {
    sent,
    isConnected: () => true,
    async sendMessage(jid, content) {
      sent.push({ jid, content })
      return { key: { id: `islam-${sent.length}` } }
    },
  }
}

function makeCtx(sock) {
  return { sock, jid: GROUP, adminJid: ADMIN, text: '', admin: true, isGroup: true }
}

const texts = (sock) => sock.sent.map((s) => s.content.text).filter(Boolean)
const audios = (sock) => sock.sent.filter((s) => s.content.audio)

// Fake fetch: tidak pernah menyentuh jaringan. URL yang tidak dikenal -> error.
function fakeFetch(handlers = {}) {
  const calls = []
  const fn = async (url) => {
    calls.push(url)
    const key = Object.keys(handlers).find((k) => url.startsWith(k))
    if (!key) throw new Error(`URL tidak diharapkan: ${url}`)
    const body = handlers[key]
    return typeof body === 'function' ? body(url) : body
  }
  fn.calls = calls
  return fn
}

function quranPayload(arabic, translation, n = 1) {
  return {
    data: {
      status: 'OK',
      data: [
        { number: 36, name: 'Ya Sin', numberOfAyahs: 83, ayahs: [{ numberInSurah: n, text: arabic }] },
        { number: 36, name: 'Ya Sin', numberOfAyahs: 83, ayahs: [{ numberInSurah: n, text: translation }] },
      ],
    },
  }
}

test('.ayat kursi memakai data asli vanXone, tanpa network', async () => {
  const sock = makeSock()
  const fetchFn = fakeFetch()
  await handleIslamCommand(makeCtx(sock), '.ayat', 'kursi', { fetchFn })
  const text = texts(sock)[0]
  assert.match(text, /Ayat Kursi/)
  assert.ok(text.includes(AYAT.kursi.arab))
  assert.ok(text.includes(AYAT.kursi.latin))
  assert.ok(text.includes(AYAT.kursi.arti))
  assert.equal(fetchFn.calls.length, 0)
})

test('.ayat 2:255 dipetakan ke data Ayat Kursi, bukan request API', async () => {
  const sock = makeSock()
  const fetchFn = fakeFetch()
  await handleIslamCommand(makeCtx(sock), 'ayat', '2:255', { fetchFn })
  const text = texts(sock)[0]
  assert.ok(text.includes(AYAT.kursi.arab))
  assert.ok(text.includes('Al-Baqarah: 255'))
  assert.equal(fetchFn.calls.length, 0)
})

test('.ayat 36:1 mengambil Arab + terjemahan dari api.alquran.cloud', async () => {
  const sock = makeSock()
  const fetchFn = fakeFetch({
    'https://api.alquran.cloud/v1/surah/36/editions/': quranPayload('AR-SIN-1', 'ID-SIN-1'),
  })
  await handleIslamCommand(makeCtx(sock), 'ayat', '36:1', { fetchFn })
  const text = texts(sock)[0]
  assert.match(text, /YA SIN/)
  assert.ok(text.includes('AR-SIN-1'))
  assert.ok(text.includes('ID-SIN-1'))
  assert.equal(fetchFn.calls[0], 'https://api.alquran.cloud/v1/surah/36/editions/quran-uthmani,id.indonesian')
})

test('.surah daftar menampilkan 114 surah tanpa network', async () => {
  const sock = makeSock()
  const fetchFn = fakeFetch()
  await handleIslamCommand(makeCtx(sock), 'surah', 'daftar', { fetchFn })
  const text = texts(sock)[0]
  assert.match(text, /DAFTAR SURAH/)
  assert.match(text, /1\. Al-Fatihah \(7\)/)
  assert.match(text, /114\. An-Nas \(6\)/)
  assert.equal(fetchFn.calls.length, 0)
})

test('.murottal nomor mengirim audio https dari QuranJSON', async () => {
  const sock = makeSock()
  const fetchFn = fakeFetch({
    'https://raw.githubusercontent.com/penggguna/QuranJSON/master/quran.json': {
      data: [{
        number_of_surah: 1, name: 'Al-Fatihah',
        name_translations: { ar: 'الفاتحة', id: 'Pembuka', en: 'The Opening' },
        number_of_ayah: 7, place: 'Mecca',
        recitation: 'https://cdn.example.com/quran/001.mp3',
      }],
    },
  })
  await handleIslamCommand(makeCtx(sock), 'murottal', '1', { fetchFn })
  assert.equal(audios(sock).length, 1)
  const audio = audios(sock)[0]
  assert.equal(audio.jid, GROUP)
  assert.equal(audio.content.audio.url, 'https://cdn.example.com/quran/001.mp3')
  assert.equal(audio.content.mimetype, 'audio/mpeg')
  assert.match(audio.content.fileName, /Surah_1_Al-Fatihah\.mp3/)
})

test('.murottal menolak URL audio kosong/invalid tanpa mengirim audio', async () => {
  const sock = makeSock()
  const fetchFn = fakeFetch({
    'https://raw.githubusercontent.com/penggguna/QuranJSON/master/quran.json': {
      data: [{ number_of_surah: 2, name: 'Al-Baqarah', recitation: 'http://cdn.example.com/bad.mp3' }],
    },
  })
  await handleIslamCommand(makeCtx(sock), 'murottal', '2', { fetchFn })
  assert.equal(audios(sock).length, 0)
  assert.match(texts(sock).at(-1), /tidak valid|tidak tersedia/i)
})

test('.murottal menolak URL bukan ekstensi audio', async () => {
  const sock = makeSock()
  const fetchFn = fakeFetch({
    'https://raw.githubusercontent.com/penggguna/QuranJSON/master/quran.json': {
      data: [{ number_of_surah: 36, name: 'Yasin', recitation: 'https://cdn.example.com/yasin.html' }],
    },
  })
  await handleIslamCommand(makeCtx(sock), 'murottal', 'Yasin', { fetchFn })
  assert.equal(audios(sock).length, 0)
  assert.match(texts(sock).at(-1), /tidak valid|tidak tersedia/i)
})

test('.asmaul nomor menampilkan data asli', async () => {
  const sock = makeSock()
  await handleIslamCommand(makeCtx(sock), 'asmaul', '1')
  const text = texts(sock)[0]
  assert.match(text, /ASMAUL HUSNA/)
  assert.ok(text.includes(ASMAUL[0].latin))
  assert.ok(text.includes(ASMAUL[0].arabic))
  assert.ok(text.includes(ASMAUL[0].translation_id))
})

test('.zikir pagi menampilkan seluruh bacaan dari data', async () => {
  const sock = makeSock()
  await handleIslamCommand(makeCtx(sock), 'zikir', 'pagi')
  const text = texts(sock)[0]
  assert.match(text, /ZIKIR PAGI/)
  for (const item of ZIKIR.pagi.daftar) {
    assert.ok(text.includes(item.arab))
    assert.ok(text.includes(item.latin))
  }
})

test('.quotesislam topik menyaring kata mutiara dari data', async () => {
  const sock = makeSock()
  await handleIslamCommand(makeCtx(sock), 'quotesislam', 'sabar')
  const text = texts(sock)[0]
  const expected = QUOTES.find((q) => q.arti.includes('bersabar'))
  assert.ok(text.includes(expected.arabic))
  assert.ok(text.includes(expected.arti))
})

test('.istighfar, .tahlil, .sholawat memakai sumber teks vanXone', async () => {
  const istighfar = makeSock()
  await handleIslamCommand(makeCtx(istighfar), 'istighfar', '')
  assert.ok(texts(istighfar)[0].includes(AYAT.istighfar.arab))

  const tahlil = makeSock()
  await handleIslamCommand(makeCtx(tahlil), 'tahlil', '')
  assert.match(texts(tahlil)[0], /PANDUAN TAHLIL/)

  const sholawat = makeSock()
  await handleIslamCommand(makeCtx(sholawat), 'sholawat', 'nariyah')
  const sholawatText = texts(sholawat)[0]
  const source = JSON.parse(fs.readFileSync(path.join(DATA, 'sholawat.json'), 'utf8'))
  assert.ok(sholawatText.includes(source.nariyah.arab))
  assert.ok(sholawatText.includes(source.nariyah.arti))
})
