// Fitur Islami — Diadaptasi dari vanXone v7 — × - vanXone </>
// Sumber: plugins/islam/{ayat,zikir,sholawat,asmaulhusna,istighfar,tahlil,audiosurah}.js
//         lib/kernel/plugins/search/quran.js (api.alquran.cloud, tanpa API key)
// Data pilihan dibaca apa adanya dari src/features/islam/data/*.json (extract vanXone).
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { config } from '../../config.js'
import { reply } from '../../commands/context.js'
import { roleOf } from '../../services/roleService.js'
import { featureService } from '../../services/featureService.js'

const CREDIT = 'LUX BOT — Dev By Rifai'
const API_BASE = 'https://api.alquran.cloud/v1'
const QURAN_JSON_URL = 'https://raw.githubusercontent.com/penggguna/QuranJSON/master/quran.json'
const DOA_URL = 'https://doa-doa-api-ahmadramadhan.fly.dev/api'
const DATA_DIR = path.join(config.root, 'src', 'features', 'islam', 'data')

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'))
}

const AYAT = loadJson('ayat.json')
const ZIKIR = loadJson('zikir.json')
const SHOLAWAT = loadJson('sholawat.json')
const ASMAUL = loadJson('asmaul.json')
const QUOTES = loadJson('quotes.json')

// Daftar 114 surah + jumlah ayat, dari lib/kernel/plugins/search/quran.js (vanXone v7).
const SURAH = `Al-Fatihah:7|Al-Baqarah:286|Ali 'Imran:200|An-Nisa:176|Al-Ma'idah:120|Al-An'am:165|Al-A'raf:206|Al-Anfal:75|At-Taubah:129|Yunus:109|Hud:123|Yusuf:111|Ar-Ra'd:43|Ibrahim:52|Al-Hijr:99|An-Nahl:128|Al-Isra:111|Al-Kahf:110|Maryam:98|Ta Ha:135|Al-Anbiya:112|Al-Hajj:78|Al-Mu'minun:118|An-Nur:64|Al-Furqan:77|Asy-Syu'ara:227|An-Naml:93|Al-Qasas:88|Al-'Ankabut:69|Ar-Rum:60|Luqman:34|As-Sajdah:30|Al-Ahzab:73|Saba:54|Fatir:45|Ya Sin:83|As-Saffat:182|Sad:88|Az-Zumar:75|Ghafir:85|Fussilat:54|Asy-Syura:53|Az-Zukhruf:89|Ad-Dukhan:59|Al-Jasiyah:37|Al-Ahqaf:35|Muhammad:38|Al-Fath:29|Al-Hujurat:18|Qaf:45|Az-Zariyat:60|At-Tur:49|An-Najm:62|Al-Qamar:55|Ar-Rahman:78|Al-Waqi'ah:96|Al-Hadid:29|Al-Mujadilah:22|Al-Hasyr:24|Al-Mumtahanah:13|As-Saff:14|Al-Jumu'ah:11|Al-Munafiqun:11|At-Tagabun:18|At-Talaq:12|At-Tahrim:12|Al-Mulk:30|Al-Qalam:52|Al-Haqqah:52|Al-Ma'arij:44|Nuh:28|Al-Jinn:28|Al-Muzzammil:20|Al-Muddassir:56|Al-Qiyamah:40|Al-Insan:31|Al-Mursalat:50|An-Naba:40|An-Nazi'at:46|'Abasa:42|At-Takwir:29|Al-Infitar:19|Al-Mutaffifin:36|Al-Insyiqaq:25|Al-Buruj:22|At-Tariq:17|Al-A'la:19|Al-Gasyiyah:26|Al-Fajr:30|Al-Balad:20|Asy-Syams:15|Al-Lail:21|Ad-Duha:11|Asy-Syarh:8|At-Tin:8|Al-'Alaq:19|Al-Qadr:5|Al-Bayyinah:8|Az-Zalzalah:8|Al-'Adiyat:11|Al-Qari'ah:11|At-Takasur:8|Al-'Asr:3|Al-Humazah:9|Al-Fil:5|Quraisy:4|Al-Ma'un:7|Al-Kausar:3|Al-Kafirun:6|An-Nasr:3|Al-Masad:5|Al-Ikhlas:4|Al-Falaq:5|An-Nas:6`
  .split('|').map((x, i) => { const [n, a] = x.split(':'); return { no: i + 1, n, a: Number(a) } })

const FULL = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const ALT = {
  yasin: 36, yaasiin: 36, kahfi: 18, kursi: 2, mulk: 67, waqiah: 56, rahman: 55,
  ikhlas: 112, falaq: 113, nas: 114, fatihah: 1, kautsar: 108, kausar: 108,
  tabarak: 67, taha: 20, sajdah: 32, insan: 76, dhuha: 93, duha: 93, tin: 95,
  nasr: 110, lahab: 111, masad: 111, asr: 103, ashr: 103, quraish: 106,
  kafirun: 109, maun: 107, fil: 105, humazah: 104, takatsur: 102, takasur: 102,
  qariah: 101, adiyat: 100, zalzalah: 99, bayyinah: 98, qadr: 97, alaq: 96,
  syarh: 94, insyirah: 94, lail: 92, syams: 91, balad: 90, fajr: 89,
  ghasyiyah: 88, gasyiyah: 88, ala: 87, tariq: 86, buruj: 85,
}

function findSurah(x) {
  const t = String(x || '').trim()
  if (/^\d{1,3}$/.test(t)) return SURAH[Number(t) - 1] || null
  const k = FULL(t)
  if (!k) return null
  if (ALT[k]) return SURAH[ALT[k] - 1]
  return SURAH.find((s) => FULL(s.n) === k)
    || SURAH.find((s) => FULL(s.n).includes(k) && k.length >= 3)
    || null
}

// parse "36:1-5" | "yasin 1-5" | "2 255" | "112"
function parseRef(text) {
  const t = String(text || '').trim()
  if (!t) return null
  let m = t.match(/^(\d{1,3}):(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/)
  let sur, a, b
  if (m) {
    sur = SURAH[Number(m[1]) - 1]
    a = Number(m[2])
    b = m[3] ? Number(m[3]) : a
  } else {
    m = t.match(/^(.*?)[\s:]+(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/)
    if (m && findSurah(m[1])) {
      sur = findSurah(m[1]); a = Number(m[2]); b = m[3] ? Number(m[3]) : a
    } else {
      sur = findSurah(t); a = null
    }
  }
  if (!sur) return null
  if (a !== null && (a < 1 || b < a || b > sur.a)) {
    return { sur, err: `Surah ${sur.n} hanya punya ${sur.a} ayat.` }
  }
  return { sur, a, b }
}

async function getJson(fetchFn, url) {
  const res = await fetchFn(url, { signal: AbortSignal.timeout(config.imageTimeoutMs) })
  if (!res) throw new Error('Respons kosong')
  if (res.ok === false) throw new Error(`Server merespons HTTP ${res.status || 'tidak diketahui'}.`)
  const payload = typeof res.json === 'function' ? await res.json() : (res.data !== undefined ? res.data : res)
  if (payload && payload.status && payload.status !== 'OK') {
    throw new Error(String(payload.message || `status ${payload.status}`))
  }
  return payload
}

async function fetchAyahs(fetchFn, sur, a, b) {
  const payload = await getJson(fetchFn, `${API_BASE}/surah/${sur.no}/editions/quran-uthmani,en.transliteration,id.indonesian`)
  const editions = payload?.data
  if (!Array.isArray(editions) || editions.length < 3 || !Array.isArray(editions[0]?.ayahs)) {
    throw new Error('Data ayat tidak valid')
  }
  const [ar, latin, id] = editions
  return ar.ayahs
    .filter((x) => x.numberInSurah >= a && x.numberInSurah <= b)
    .map((x) => ({
      n: x.numberInSurah,
      ar: String(x.text || '').replace(/^بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ\s*/, sur.no === 1 ? '$&' : ''),
      latin: (latin.ayahs.find((y) => y.numberInSurah === x.numberInSurah) || {}).text || '',
      id: (id.ayahs.find((y) => y.numberInSurah === x.numberInSurah) || {}).text || '',
    }))
}

function findByKey(table, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return null
  const keys = Object.keys(table)
  if (Object.hasOwn(table, q)) return { key: q, item: table[q] }
  const key = keys.find((k) => k.toLowerCase().includes(q) || q.includes(k.toLowerCase()))
  return key ? { key, item: table[key] } : null
}

function ayatCaption(key, a) {
  return [
    `🕌 *${a.nama}*`,
    `📖 ${a.surah}`,
    '',
    '📜 Arab:', a.arab || '',
    '',
    '🔤 Latin:', a.latin || '',
    '',
    '💡 Artinya:', a.arti || '',
    '',
    '✨ Keutamaan:', a.keutamaan || '',
    '',
    `💗 ${CREDIT}`,
  ].join('\n')
}

async function cmdAyat(ctx, arg, fetchFn) {
  const q = String(arg || '').trim()
  if (!q) {
    const keys = Object.keys(AYAT)
    return reply(ctx, [
      '🕌 *AYAT PILIHAN AL-QURAN*', '',
      'Cara pakai: .ayat <nama ayat> atau .ayat <surah>:<ayat>',
      'Contoh: .ayat kursi • .ayat 2:255 • .ayat 36:1', '',
      '📋 Daftar Ayat:',
      ...keys.map((k, i) => `${i + 1}. ${k.charAt(0).toUpperCase() + k.slice(1)}`),
      '', `💗 ${CREDIT}`,
    ].join('\n'))
  }
  // Ayat Kursi adalah data asli vanXone (ayat.json), tidak perlu request API.
  const ref = parseRef(q)
  if (ref && !ref.err && ref.sur.no === 2 && ref.a === 255 && ref.b === 255) {
    return reply(ctx, ayatCaption('kursi', AYAT.kursi))
  }
  const hit = findByKey(AYAT, q)
  if (hit) return reply(ctx, ayatCaption(hit.key, hit.item))
  if (!ref) {
    return reply(ctx, `❌ Ayat "${q}" tidak ditemukan.\n\n📋 Ketik .ayat untuk melihat daftar.\n\n💗 ${CREDIT}`)
  }
  if (ref.err) return reply(ctx, `❌ ${ref.err}`)
  if (ref.a === null) return reply(ctx, [
    `🕌 *${ref.sur.n.toUpperCase()}*`,
    `Surah ke-${ref.sur.no} • ${ref.sur.a} ayat`,
    '', `Baca: .ayat ${ref.sur.no} 1-${Math.min(5, ref.sur.a)}`,
    '', `💗 ${CREDIT}`,
  ].join('\n'))
  if (ref.b - ref.a + 1 > 10) ref.b = ref.a + 9
  try {
    const xs = await fetchAyahs(fetchFn, ref.sur, ref.a, ref.b)
    if (!xs.length) throw new Error('ayat tidak ditemukan')
    return reply(ctx, [
      `🕌 *QS ${ref.sur.n.toUpperCase()} (${ref.sur.no}) : ${ref.a}${ref.b > ref.a ? '–' + ref.b : ''}*`,
      '━━━━━━━━━━━━━━━━━━━━',
      ...xs.map((x) => `${x.ar} ﴾${x.n}﴿\n_${x.latin}_\n_${x.id}_`),
      ref.b < ref.sur.a ? `\n_Lanjut: .ayat ${ref.sur.no} ${ref.b + 1}-${Math.min(ref.b + 10, ref.sur.a)}_` : '',
      '', `💗 ${CREDIT}`,
    ].join('\n'))
  } catch (err) {
    return reply(ctx, `❌ Gagal mengambil ayat: ${err.message}`)
  }
}

async function cmdSurah(ctx, arg, fetchFn) {
  const q = String(arg || '').trim()
  if (!q || ['daftar', 'list', 'semua', 'all'].includes(q.toLowerCase())) {
    return reply(ctx, [
      '📜 *DAFTAR SURAH*', '━━━━━━━━━━━━━━━━━━━━',
      ...SURAH.map((s) => `${s.no}. ${s.n} (${s.a})`),
      '', '_Contoh: .surah 36 atau .surah Yasin_', '', `💗 ${CREDIT}`,
    ].join('\n'))
  }
  const sur = findSurah(q)
  if (!sur) return reply(ctx, `❌ Surah "${q}" tidak ditemukan.\nKetik .surah daftar untuk melihat 114 surah.\n\n💗 ${CREDIT}`)
  try {
    const xs = await fetchAyahs(fetchFn, sur, 1, Math.min(5, sur.a))
    return reply(ctx, [
      `📜 *${sur.n.toUpperCase()}*`,
      `Surah ke-${sur.no} • ${sur.a} ayat`, '━━━━━━━━━━━━━━━━━━━━',
      ...xs.map((x) => `${x.ar} ﴾${x.n}﴿\n_${x.latin}_\n_${x.id}_`),
      '', `_Gunakan .ayat ${sur.no}:1 untuk ayat tertentu_`, '', `💗 ${CREDIT}`,
    ].join('\n'))
  } catch (err) {
    return reply(ctx, `❌ Gagal mengambil surah: ${err.message}`)
  }
}

function validAudioUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.hostname !== 'download.quranicaudio.com' ||
        url.username || url.password || url.port) return null
    if (!/\.mp3$/i.test(url.pathname)) return null
    return url.toString()
  } catch {
    return null
  }
}

function isMpegAudio(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1024) return false
  const end = Math.min(buffer.length - 1, 4096)
  for (let i = 0; i < end; i += 1) {
    if (buffer[i] === 0xff && (buffer[i + 1] & 0xe0) === 0xe0 &&
        (buffer[i + 1] & 0x06) !== 0) return true
  }
  return false
}

async function pruneAudioCache(cacheDir, keepFile) {
  const now = Date.now()
  const cached = []
  for (const entry of await fsp.readdir(cacheDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const file = path.join(cacheDir, entry.name)
    const stat = await fsp.stat(file)
    if (entry.name.endsWith('.tmp')) {
      if (now - stat.mtimeMs > 60 * 60 * 1000) await fsp.unlink(file)
      continue
    }
    if (!/^[a-f0-9]{64}\.mp3$/i.test(entry.name)) continue
    if (now - stat.mtimeMs > config.quranAudioCacheTtlMs) {
      await fsp.unlink(file)
      continue
    }
    cached.push({ file, size: stat.size, mtimeMs: stat.mtimeMs })
  }

  let total = cached.reduce((sum, item) => sum + item.size, 0)
  for (const item of cached.sort((a, b) => a.mtimeMs - b.mtimeMs)) {
    if (total <= config.quranAudioCacheMaxBytes) break
    if (item.file === keepFile) continue
    await fsp.unlink(item.file)
    total -= item.size
  }
}

async function readAudioResponse(response, maxBytes) {
  const declared = Number(response.headers?.get?.('content-length') || 0)
  if (declared > maxBytes) throw new Error('Ukuran audio melebihi batas cache.')

  const chunks = []
  let size = 0
  const addChunk = (chunk) => {
    const buffer = Buffer.from(chunk)
    size += buffer.length
    if (size > maxBytes) throw new Error('Ukuran audio melebihi batas cache.')
    chunks.push(buffer)
  }

  if (response.body && typeof response.body[Symbol.asyncIterator] === 'function') {
    for await (const chunk of response.body) addChunk(chunk)
  } else if (response.body?.getReader) {
    const reader = response.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        addChunk(value)
      }
    } finally {
      reader.releaseLock()
    }
  } else if (typeof response.arrayBuffer === 'function') {
    addChunk(await response.arrayBuffer())
  } else if (Buffer.isBuffer(response.data)) {
    addChunk(response.data)
  } else {
    throw new Error('Respons audio tidak memiliki data yang dapat dibaca.')
  }
  const buffer = Buffer.concat(chunks, size)
  if (!isMpegAudio(buffer)) throw new Error('Audio yang diunduh kosong atau bukan MP3 yang valid.')
  return buffer
}

async function getCachedAudio(url, fetchFn, cacheDir = config.quranAudioCacheDir) {
  const maxBytes = config.quranAudioMaxBytes
  const cacheFile = path.join(cacheDir, `${createHash('sha256').update(url).digest('hex')}.mp3`)
  await fsp.mkdir(cacheDir, { recursive: true, mode: 0o700 })
  try {
    const stat = await fsp.stat(cacheFile)
    if (stat.size > 0 && stat.size <= maxBytes &&
        Date.now() - stat.mtimeMs <= config.quranAudioCacheTtlMs) {
      const cached = await fsp.readFile(cacheFile)
      if (isMpegAudio(cached)) {
        const now = new Date()
        await fsp.utimes(cacheFile, now, now)
        await pruneAudioCache(cacheDir, cacheFile)
        return cached
      }
    }
    await fsp.unlink(cacheFile)
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }

  const response = await fetchFn(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(config.quranAudioTimeoutMs),
  })
  if (!response?.ok) throw new Error(`Server audio merespons HTTP ${response?.status || 'tidak diketahui'}.`)
  if (response.url && !validAudioUrl(response.url)) {
    throw new Error('Audio diarahkan ke host yang tidak diizinkan.')
  }
  const contentType = response.headers?.get?.('content-type')?.split(';')[0].trim().toLowerCase()
  if (contentType && !['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(contentType)) {
    throw new Error('Server audio mengirim format yang tidak didukung.')
  }
  const buffer = await readAudioResponse(response, maxBytes)
  const tempFile = `${cacheFile}.${process.pid}.${randomUUID()}.tmp`
  try {
    await fsp.writeFile(tempFile, buffer, { flag: 'wx', mode: 0o600 })
    await fsp.rename(tempFile, cacheFile)
    await pruneAudioCache(cacheDir, cacheFile)
  } finally {
    await fsp.unlink(tempFile).catch((err) => {
      if (err.code !== 'ENOENT') throw err
    })
  }
  return buffer
}

async function cmdMurottal(ctx, arg, fetchFn, audioCacheDir) {
  const q = String(arg || '').trim()
  if (!q) {
    return reply(ctx, [
      '🎧 *AUDIO MUROTTAL SURAH AL-QURAN*', '',
      'Gunakan nomor surah (1–114) atau nama surah.', '',
      '• Contoh: .murottal 1',
      '• Contoh: .murottal Al-Fatihah',
      '• Contoh: .murottal Yasin', '',
      '*Daftar Surah Populer:*',
      '• 1 : Al-Fatihah • 2 : Al-Baqarah • 18 : Al-Kahf • 36 : Yasin',
      '• 55 : Ar-Rahman • 56 : Al-Waqiah • 67 : Al-Mulk • 112 : Al-Ikhlas',
      '', `💗 ${CREDIT}`,
    ].join('\n'))
  }
  try {
    // QuranJSON (vanXone audiosurah.js): tiap entri memuat URL recitation.
    const list = await getJson(fetchFn, QURAN_JSON_URL)
    if (!Array.isArray(list)) throw new Error('Data Al-Quran tidak valid.')
    const clean = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const key = clean(q)
    const selected = /^\d+$/.test(q.trim())
      ? list.find((s) => Number(s.number_of_surah) === Number(q))
      : list.find((s) => clean(s.name) === key
        || clean(s.name_translations?.id) === key
        || clean(s.name_translations?.en) === key)
    if (!selected) {
      return reply(ctx, `❌ Surah "${q}" tidak ditemukan!\nPastikan nomor 1–114 atau nama surah tepat.\n\n💗 ${CREDIT}`)
    }
    const url = validAudioUrl(selected.recitation)
    if (!url) {
      // Jangan pernah mengirim URL kosong/invalid ke WhatsApp.
      return reply(ctx, `❌ Audio murottal untuk surah "${selected.name || q}" tidak tersedia atau URL tidak valid.\n\n💗 ${CREDIT}`)
    }
    const audio = await getCachedAudio(url, fetchFn, audioCacheDir)
    const no = selected.number_of_surah
    const name = selected.name || ''
    const reciter = /\/mishaari_raashid_al_3afaasee\//i.test(new URL(url).pathname)
      ? 'Mishari Rashid Al-Afasy'
      : 'Tidak tercantum di dataset'
    await reply(ctx, [
      '🎧 *AUDIO MUROTTAL AL-QURAN* 📖', '',
      `• 🔢 *Surah Ke:* ${no} dari 114`,
      `• 📜 *Nama Surah:* ${name} (${selected.name_translations?.ar || ''})`,
      `• 💡 *Arti Surah:* ${selected.name_translations?.id || selected.name_translations?.en || ''}`,
      `• 🔢 *Jumlah Ayat:* ${selected.number_of_ayah || ''} Ayat`,
      `• 📍 *Tempat Turun:* ${selected.place === 'Mecca' ? 'Makkiyah' : 'Madaniyah'}`,
      `• 🎙️ *Qari:* ${reciter}`,
      '', '_Mengirimkan audio murottal lengkap..._ 🎙️', '', `💗 ${CREDIT}`,
    ].join('\n'))
    if (!ctx.sock || typeof ctx.sock.sendMessage !== 'function') {
      return reply(ctx, '❌ Soket WhatsApp tidak tersedia untuk mengirim audio.')
    }
    return await ctx.sock.sendMessage(ctx.jid, {
      audio,
      mimetype: 'audio/mpeg',
      ptt: false,
      fileName: `Surah_${no}_${name.replace(/\s+/g, '_')}.mp3`,
    })
  } catch (err) {
    return reply(ctx, `❌ Gagal mengambil audio surah: ${err.message}`)
  }
}

function cmdAsmaul(ctx, arg) {
  const q = String(arg || '').trim()
  const all = () => ASMAUL.map((n) => `${n.index}. ${n.latin} — ${n.translation_id}`).join('\n')
  if (!q) {
    return reply(ctx, [
      '☪️ *ASMAUL HUSNA*', '> 99 Nama Allah SWT', '',
      '```', ...ASMAUL.slice(0, 33).map((n) => `${n.index}. ${n.latin}`), '```',
      '> Halaman 1/3', '',
      '_Gunakan .asmaul <nomor|nama> untuk detail, atau .asmaul all untuk semua_',
      '', `💗 ${CREDIT}`,
    ].join('\n'))
  }
  if (['all', 'semua'].includes(q.toLowerCase())) {
    return reply(ctx, ['☪️ *ASMAUL HUSNA*', '', '```', all(), '```', '', `💗 ${CREDIT}`].join('\n'))
  }
  let item = null
  if (/^\d+$/.test(q)) {
    const index = Number(q)
    item = ASMAUL.find((n) => n.index === index)
    if (!index || index < 1 || index > 99) {
      return reply(ctx, `❌ Nomor harus antara 1–99.\n\n💗 ${CREDIT}`)
    }
  } else {
    const key = FULL(q)
    item = ASMAUL.find((n) => FULL(n.latin) === key)
      || ASMAUL.find((n) => FULL(n.latin).includes(key))
  }
  if (!item) return reply(ctx, `❌ Nama "${q}" tidak ditemukan!\nCoba nomor 1–99 atau nama latin.\n\n💗 ${CREDIT}`)
  return reply(ctx, [
    '☪️ *ASMAUL HUSNA*', '', '```',
    `📍 Nomor : ${item.index}`,
    `🔤 Latin : ${item.latin}`,
    `📜 Arab  : ${item.arabic}`,
    '```', '',
    `> 🇮🇩 Arti (ID): ${item.translation_id}`,
    `> 🇬🇧 Arti (EN): ${item.translation_en}`,
    '', `💗 ${CREDIT}`,
  ].join('\n'))
}

function cmdZikir(ctx, arg) {
  const q = String(arg || '').trim().toLowerCase()
  if (!q) {
    return reply(ctx, [
      '🤲 *ZIKIR HARIAN LENGKAP*', '',
      'Cara pakai: .zikir <pagi/petang/sholat/tidur>', '',
      '📋 Daftar Zikir:',
      ...Object.keys(ZIKIR).map((k, i) => `${i + 1}. ${k.charAt(0).toUpperCase() + k.slice(1)}`),
      '', `💗 ${CREDIT}`,
    ].join('\n'))
  }
  const hit = findByKey(ZIKIR, q)
  if (!hit) return reply(ctx, `❌ Zikir "${arg}" tidak ditemukan.\nKetik .zikir untuk melihat daftar.\n\n💗 ${CREDIT}`)
  const z = hit.item
  return reply(ctx, [
    `🤲 *${z.nama.toUpperCase()}*`,
    `⏰ ${z.waktu}`, '',
    ...z.daftar.flatMap((d, i) => [
      `${i + 1}. ${d.arab}`,
      `   ${d.latin}`,
      `   💡 ${d.arti}`,
      `   🔁 ${d.jumlah || ''}`,
      '',
    ]),
    `💗 ${CREDIT}`,
  ].join('\n'))
}

function cmdSholawat(ctx, arg) {
  const q = String(arg || '').trim()
  if (!q) {
    return reply(ctx, [
      '🤲 *SHOLAWAT NABI*', '',
      'Cara pakai: .sholawat <nama sholawat>',
      'Contoh: .sholawat nariyah', '',
      '📋 Daftar Sholawat:',
      ...Object.keys(SHOLAWAT).map((k, i) => `${i + 1}. ${k.charAt(0).toUpperCase() + k.slice(1)}`),
      '', `💗 ${CREDIT}`,
    ].join('\n'))
  }
  const hit = findByKey(SHOLAWAT, q.toLowerCase())
  if (!hit) return reply(ctx, `❌ Sholawat "${q}" tidak ditemukan.\nKetik .sholawat untuk melihat daftar.\n\n💗 ${CREDIT}`)
  const s = hit.item
  const display = hit.key.charAt(0).toUpperCase() + hit.key.slice(1)
  return reply(ctx, [
    `🤲 *SHOLAWAT ${display.toUpperCase()}*`, '',
    '📜 Arab:', s.arab, '',
    '🔤 Latin:', s.latin, '',
    '💡 Artinya:', s.arti, '',
    '✨ Keutamaan:', s.keutamaan, '',
    `📚 Sumber: ${s.sumber}`, '',
    `💗 ${CREDIT}`,
  ].join('\n'))
}

// Kata mutiara vanXone tidak punya kolom topik; topik dicocokkan dengan isi terjemahan.
const TOPIC_ALIASES = {
  sabar: ['sabar', 'kesabaran'],
  ilmu: ['ilmu', 'belajar', 'alim', 'penuntut'],
  teman: ['teman', 'sahabat', 'bergaul'],
  waktu: ['waktu', 'hari', 'esok'],
  amal: ['amal', 'berbuat', 'tindak', 'tanam', 'panen', 'berjalan'],
  akhlak: ['akhlak', 'adab', 'jujur', 'benar', 'malu', 'lisan', 'perkataan'],
}

function cmdQuotes(ctx, arg) {
  const q = String(arg || '').trim().toLowerCase()
  let pool = QUOTES
  if (q) {
    const synonyms = new Set([q, ...(TOPIC_ALIASES[q] || [])])
    pool = QUOTES.filter((item) => {
      const text = String(item.arti || '').toLowerCase()
      return [...synonyms].some((word) => text.includes(word))
    })
    if (!pool.length) {
      return reply(ctx, `❌ Kata mutiara dengan topik "${arg}" tidak ditemukan.\n\n💗 ${CREDIT}`)
    }
  }
  const item = q ? pool[0] : pool[Math.floor(Math.random() * pool.length)]
  return reply(ctx, [
    '✨ *KATA MUTIARA ISLAM*', '',
    item.arabic, '',
    `_${item.arti}_`, '',
    `💗 ${CREDIT}`,
  ].join('\n'))
}

// Teks tahlil diambil apa adanya dari plugins/islam/tahlil.js vanXone v7.
function cmdTahlil(ctx) {
  return reply(ctx, [
    '🤲 *PANDUAN TAHLIL LENGKAP*',
    'Bacaan Tahlil untuk mendoakan orang yang telah meninggal', '',
    '📋 *SUSUNAN TAHLIL:*', '',
    '1️⃣ *Bacaan Surat Al-Fatihah*',
    'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
    'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ',
    'الرَّحْمَٰنِ الرَّحِيمِ',
    'مَالِكِ يَوْمِ الدِّينِ',
    'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ',
    'اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ',
    'صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ',
    'غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ', '',
    '📌 Dilanjutkan dengan:',
    'لِإِلٰـهِ حَاضِرِيْ هٰذَا الْمَجْلِسِ وَاِلٰى جَمِيْعِ الْمُسْلِمِيْنَ وَالْمُسْلِمَاتِ وَالْمُؤْمِنِيْنَ وَالْمُؤْمِنَاتِ الْأَحْيَاءِ مِنْهُمْ وَالْأَمْوَاتِ',
    '(Lafalkan dengan niat menghadiahkan kepada yang hadir dan semua muslim)', '',
    '2️⃣ *Surat Al-Ikhlas 3x*',
    'قُلْ هُوَ اللَّهُ أَحَدٌ',
    'اللَّهُ الصَّمَدُ',
    'لَمْ يَلِدْ وَلَمْ يُولَدْ',
    'وَلَمْ يَكُنْ لَهُ كُفُوًا أَحَدٌ', '',
    '3️⃣ *Surat Al-Falaq 1x*',
    'قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ',
    'مِنْ شَرِّ مَا خَلَقَ',
    'وَمِنْ شَرِّ غَاسِقٍ إِذَا وَقَبَ',
    'وَمِنْ شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ',
    'وَمِنْ شَرِّ حَاسِدٍ إِذَا حَسَدَ', '',
    '4️⃣ *Surat An-Nas 1x*',
    'قُلْ أَعُوذُ بِرَبِّ النَّاسِ',
    'مَلِكِ النَّاسِ',
    'إِلَٰهِ النَّاسِ',
    'مِنْ شَرِّ الْوَسْوَاسِ الْخَنَّاسِ',
    'الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ',
    'مِنَ الْجِنَّةِ وَالنَّاسِ', '',
    '5️⃣ *Bacaan Tahlil & Istighfar*',
    'لَا إِلَٰهَ إِلَّا اللَّهُ (3x)',
    'أَسْتَغْفِرُ اللَّهَ الْعَظِيمَ (3x)', '',
    '6️⃣ *Bacaan Tahlil Inti*',
    'لَا إِلَٰهَ إِلَّا اللَّهُ (100x atau 33x)', '',
    '7️⃣ *Doa Tahlil*',
    'اَللَّهُمَّ اغْفِرْ لِلْمُسْلِمِيْنَ وَالْمُسْلِمَاتِ',
    'وَالْمُؤْمِنِيْنَ وَالْمُؤْمِنَاتِ',
    'الْأَحْيَاءِ مِنْهُمْ وَالْأَمْوَاتِ',
    'إِنَّكَ سَمِيعٌ قَرِيبٌ مُجِيبُ الدَّعَوَاتِ', '',
    '8️⃣ *Penutup*',
    'سُبْحَانَ رَبِّكَ رَبِّ الْعِزَّةِ عَمَّا يَصِفُونَ',
    'وَسَلَامٌ عَلَى الْمُرْسَلِينَ',
    'وَالْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ', '',
    '📖 *Keutamaan Tahlil:*',
    '• Mendoakan orang yang telah meninggal',
    '• Mendapat pahala dari Allah',
    '• Menghidupkan sunnah',
    '• Mendekatkan diri kepada Allah', '',
    '📚 *Sumber:* Kitab-kitab Fiqih & Ulama Nusantara', '',
    `💗 ${CREDIT}`,
  ].join('\n'))
}

function cmdIstighfar(ctx) {
  return reply(ctx, ayatCaption('istighfar', AYAT.istighfar))
}

async function cmdDoa(ctx, arg, fetchFn) {
  const query = String(arg || '').trim().toLowerCase()
  if (query.length > 100) return reply(ctx, 'Kata pencarian doa maksimal 100 karakter.')
  try {
    const items = await getJson(fetchFn, DOA_URL)
    if (!Array.isArray(items) || !items.length) throw new Error('Daftar doa tidak valid atau kosong.')
    const validItems = items.filter((item) =>
      item && typeof item.doa === 'string' &&
      typeof item.ayat === 'string' &&
      typeof item.latin === 'string' &&
      typeof item.artinya === 'string'
    )
    if (!validItems.length) throw new Error('Data doa tidak memiliki format Arab, Latin, dan terjemahan.')
    if (!query) {
      return reply(ctx, [
        '🤲 *DAFTAR DOA HARIAN*',
        '',
        ...validItems.map((item, index) => `${index + 1}. ${item.doa.slice(0, 100)}`),
        '',
        'Cari detail: .doa <nama doa>',
        'Contoh: .doa doa sebelum tidur',
        '',
        'Catatan: API sumber tidak menyediakan referensi sanad untuk tiap doa.',
        `💗 ${CREDIT}`,
      ].join('\n'))
    }
    const item = validItems.find((entry) => entry.doa.toLowerCase().includes(query))
    if (!item) return reply(ctx, `❌ Doa "${arg}" tidak ditemukan.\nKetik .doa untuk melihat daftar.\n\n💗 ${CREDIT}`)
    return reply(ctx, [
      `🤲 *${item.doa.slice(0, 120).toUpperCase()}*`,
      '',
      '📜 Arab:',
      item.ayat.slice(0, 3000),
      '',
      '🔤 Latin:',
      item.latin.slice(0, 1500),
      '',
      '💡 Artinya:',
      item.artinya.slice(0, 2000),
      '',
      'Catatan: API sumber tidak menyediakan referensi sanad untuk doa ini.',
      `💗 ${CREDIT}`,
    ].join('\n'))
  } catch (err) {
    return reply(ctx, `❌ Daftar doa belum dapat diakses: ${err.message}`)
  }
}

const HELP = [
  '🕌 *MENU ISLAMI*', '',
  '• .ayat [kursi|2:255|36:1]',
  '• .surah [nama|nomor|daftar]',
  '• .murottal [nama|nomor]',
  '• .asmaul [nomor/nama]',
  '• .zikir [pagi|petang|sholat]',
  '• .doa [kata kunci]',
  '• .istighfar',
  '• .tahlil',
  '• .sholawat [nama]',
  '• .quotesislam [topik]',
  '', `💗 ${CREDIT}`,
].join('\n')

/**
 * Router memanggil handleIslamCommand(ctx, cmd, arg).
 * fetchFn opsional (default: global fetch) untuk injeksi tes tanpa network.
 * @param {{ fetchFn?: (url: string) => Promise<any>, audioCacheDir?: string }} [options]
 */
export async function handleIslamCommand(ctx, cmd, arg = '', options = {}) {
  const fetchFn = typeof options.fetchFn === 'function' ? options.fetchFn : (...args) => fetch(...args)
  if (Object.hasOwn(featureService.FEATURES, 'islam')) {
    const role = ctx?.role || roleOf(ctx?.adminJid)
    if (!featureService.isFeatureEnabled('islam', role)) {
      return reply(ctx, 'Fitur Islami tidak tersedia untuk role Anda.')
    }
  }
  const name = String(cmd || '').replace(/^\./, '').toLowerCase()
  switch (name) {
    case 'ayat':
    case 'ayatpilihan':
      return cmdAyat(ctx, arg, fetchFn)
    case 'surah':
    case 'alquran':
    case 'quran':
      return cmdSurah(ctx, arg, fetchFn)
    case 'murottal':
    case 'murrotal':
    case 'murotal':
    case 'audiosurah':
      return cmdMurottal(ctx, arg, fetchFn, options.audioCacheDir)
    case 'asmaul':
    case 'asmaulhusna':
      return cmdAsmaul(ctx, arg)
    case 'zikir':
    case 'dzikir':
      return cmdZikir(ctx, arg)
    case 'sholawat':
    case 'shalawat':
      return cmdSholawat(ctx, arg)
    case 'quotesislam':
    case 'katamutiara':
      return cmdQuotes(ctx, arg)
    case 'istighfar':
      return cmdIstighfar(ctx)
    case 'tahlil':
      return cmdTahlil(ctx)
    case 'doa':
    case 'berdoa':
      return cmdDoa(ctx, arg, fetchFn)
    default:
      return reply(ctx, HELP)
  }
}

export const _internal = { SURAH, parseRef, findSurah, validAudioUrl }
