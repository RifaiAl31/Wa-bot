// Parser tanggal mandiri. Semua hitungan memakai kalender Asia/Jakarta,
// tidak bergantung pada TZ lokal proses maupun helper di berkas lain.

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

const WEEKDAY_ALIASES = {
  minggu: 0, ahad: 0,
  senin: 1,
  selasa: 2,
  rabu: 3,
  kamis: 4,
  jumat: 5, "jum'at": 5, 'jum’at': 5,
  sabtu: 6,
}

const MONTH_ALIASES = {}
MONTHS.forEach((name, i) => { MONTH_ALIASES[name.toLowerCase()] = i })
const ENGLISH_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december']
ENGLISH_MONTHS.forEach((name, i) => {
  if (!Object.hasOwn(MONTH_ALIASES, name)) MONTH_ALIASES[name] = i
})

const JAKARTA_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

/**
 * Date dengan komponen UTC yang sama dengan jam dinding Asia/Jakarta.
 * Dipakai sebagai "hari ini" sebelum menghitung relatif agar tidak
 * terpengaruh timezone mesin.
 */
export function jakartaNow(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) date = new Date()
  const p = Object.fromEntries(JAKARTA_PARTS.formatToParts(date).map((x) => [x.type, x.value]))
  return new Date(Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour), Number(p.minute), Number(p.second),
  ))
}

function buildResult(date, source) {
  const year = date.getUTCFullYear()
  const monthIndex = date.getUTCMonth()
  const day = date.getUTCDate()
  const weekday = DAYS[date.getUTCDay()]
  const month = MONTHS[monthIndex]
  return {
    date: `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    weekday,
    day,
    month,
    year,
    text: `${weekday}, ${day} ${month} ${year}`,
    source,
  }
}

function parseExplicit(v) {
  let m, year, month, day
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v))) {
    year = Number(m[1]); month = Number(m[2]); day = Number(m[3])
  } else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v))) {
    day = Number(m[1]); month = Number(m[2]); year = Number(m[3])
  } else if ((m = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/.exec(v)) && Object.hasOwn(MONTH_ALIASES, m[2])) {
    day = Number(m[1]); month = MONTH_ALIASES[m[2]] + 1; year = Number(m[3])
  } else {
    return null
  }
  if (!(year >= 1000 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null
  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null
  return candidate
}

/**
 * Ubah ungkapan tanggal menjadi objek tanggal Asia/Jakarta.
 * Mengembalikan null untuk input kosong/ambigu, bukan menebak-nebak.
 */
export function smartDate(raw, now = new Date()) {
  if (typeof raw !== 'string') return null
  const v = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!v) return null

  const base = jakartaNow(now)
  let delta = null
  let source = null

  if (v === 'hari ini') { delta = 0; source = 'relative' } else if (v === 'besok') { delta = 1; source = 'relative' } else if (v === 'lusa') { delta = 2; source = 'relative' } else if (Object.hasOwn(WEEKDAY_ALIASES, v)) {
    // Nama hari = kemunculan berikutnya (hari ini bila sama), maksimal 6 hari ke depan.
    delta = (WEEKDAY_ALIASES[v] - base.getUTCDay() + 7) % 7
    source = 'weekday'
  } else {
    const explicit = parseExplicit(v)
    if (explicit) return buildResult(explicit, 'explicit')
    return null
  }

  return buildResult(new Date(Date.UTC(
    base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + delta,
  )), source)
}
