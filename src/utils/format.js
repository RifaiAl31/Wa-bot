export const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
export const WEEK_LABELS = ['Setiap minggu', 'Minggu ke-1', 'Minggu ke-2', 'Minggu ke-3', 'Minggu ke-4', 'Minggu ke-5']

const DAY_ALIASES = {
  minggu: 0, ahad: 0, '0': 0,
  senin: 1, '1': 1,
  selasa: 2, '2': 2,
  rabu: 3, '3': 3,
  kamis: 4, '4': 4,
  jumat: 5, "jum'at": 5, '5': 5,
  sabtu: 6, '6': 6,
}

const WEEK_ALIASES = {
  setiap: 0, mingguan: 0, '0': 0, 'setiap minggu': 0,
  '1': 1, 'ke-1': 1, 'pertama': 1, 'kesatu': 1, 'satuan': 1,
  '2': 2, 'ke-2': 2, 'kedua': 2,
  '3': 3, 'ke-3': 3, 'ketiga': 3,
  '4': 4, 'ke-4': 4, 'keempat': 4,
  '5': 5, 'ke-5': 5, 'kelima': 5,
}

export function cleanInput(value) {
  return String(value ?? '').trim()
}

export function parseDay(raw) {
  const v = cleanInput(raw).toLowerCase().replace(/\s+/g, ' ')
  return Object.hasOwn(DAY_ALIASES, v) ? DAY_ALIASES[v] : null
}

export function parseWeek(raw) {
  const v = cleanInput(raw).toLowerCase().replace(/\s+/g, ' ')
  return Object.hasOwn(WEEK_ALIASES, v) ? WEEK_ALIASES[v] : null
}

export function parseTime(raw) {
  const v = cleanInput(raw).replace(/\./g, ':')
  const m = /^(\d{1,2}):(\d{2})$/.exec(v)
  if (!m) return null
  const h = Number(m[1]); const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export function dayName(n) { return DAYS[Number(n)] ?? String(n) }
export function weekName(n) { return WEEK_LABELS[Number(n)] ?? String(n) }
export function timeName(t) { return String(t || '').replace(':', '.') + ' WIB' }

export function groupLabel(g) { return g?.name || g?.jid || 'Grup tanpa nama' }
export function shortJid(jid) { return String(jid || '').split('@')[0] }

// Format baru A1, A2, ... ID lama ANN-001/AN001 tetap diterima dan
// diterjemahkan ke A1 agar perintah lama tidak rusak setelah migrasi.
export function normalizeId(raw) {
  const compact = String(raw ?? '').trim().toUpperCase().replace(/[\s_]/g, '')
  const m = /^A-?0*(\d+)$/.exec(compact) || /^AN{1,2}-?0*(\d+)$/.exec(compact)
  if (m) return `A${Number(m[1])}`
  return String(raw ?? '').trim().toUpperCase()
}

export function buildBodyPreview(body) {
  // Isi pesan tidak diubah sama sekali, termasuk baris baru.
  return String(body ?? '')
}

export function formatAnnouncementDetail(row, targets = [], includeBody = true) {
  const lines = [
    `Detail ${row.id}`,
    `Judul: ${row.title}`,
    `Kategori: ${row.category || '-'}`,
    `Status: ${row.is_active ? 'AKTIF' : 'NONAKTIF'}`,
    `Hari: ${dayName(row.weekday)}`,
    `Minggu: ${weekName(row.week_of_month)}`,
    `Jam: ${timeName(row.time)}`,
    `Grup tujuan (${targets.length}):`,
    ...(targets.length ? targets.map((g, i) => `  ${i + 1}. ${groupLabel(g)}`) : ['  - belum ada']),
    `Dibuat: ${row.created_at}`,
    `Diupdate: ${row.updated_at}`,
  ]
  if (includeBody) lines.push('', 'Isi pesan:', buildBodyPreview(row.body))
  return lines.join('\n')
}

export const DAY_CHOICES = DAYS.map((d, i) => `${i}. ${d}`).join('\n')
export const WEEK_CHOICES = WEEK_LABELS.map((l, i) => `${i}. ${l}`).join('\n')

export function yes(raw) {
  const v = cleanInput(raw).toLowerCase()
  return ['.ya', '.iya', '.y', '/ya', 'ya', '/iya', 'iya', 'y', '/y', '1'].includes(v)
}

export function no(raw) {
  const v = cleanInput(raw).toLowerCase()
  return ['.tidak', '.t', '.batal', '/tidak', 'tidak', 't', '/t', '2', '/batal', 'batal'].includes(v)
}
