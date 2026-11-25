import { get, all, run, transaction, logActivity } from '../db/index.js'
import { sendText } from './delivery.js'
import { logger } from '../logger.js'
import { DAYS } from '../utils/format.js'

const DEFAULT_TEMPLATE = {
  name: 'Pengajian Muda-Mudi',
  hari: 'Sabtu',
  tanggal: 21,
  bulan: 'November',
  tahun: 2026,
  waktu: 'Bada 18.20 - selesai',
  lokasi: 'Torikunnajjah',
  peserta: 'Praremaja dan Remaja',
  materi: 'Makna Hadist',
}

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

export function jakartaDate(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

function utcDate(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''))
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return Number.isNaN(d.getTime()) ? null : d
}

function toDateStr(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function addDays(dateStr, days) {
  const d = utcDate(dateStr)
  if (!d) return null
  d.setUTCDate(d.getUTCDate() + Number(days || 0))
  return toDateStr(d)
}

export function weekdayOf(dateStr) { return utcDate(dateStr)?.getUTCDay() ?? null }

export function dateParts(dateStr) {
  const d = utcDate(dateStr)
  if (!d) return null
  return {
    hari: DAYS[d.getUTCDay()],
    tanggal: d.getUTCDate(),
    bulan: MONTHS[d.getUTCMonth()],
    tahun: d.getUTCFullYear(),
  }
}

export function parseDateInput(raw) {
  const v = String(raw ?? '').trim().replace(/[.\/]/g, '-')
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v)
  if (!m) return null
  const value = `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`
  return utcDate(value) ? value : null
}

export function getTemplate() {
  let row = get('SELECT * FROM ngaji_templates WHERE id = 1')
  if (!row) {
    const now = new Date().toISOString()
    run(`INSERT OR IGNORE INTO ngaji_templates
         (id, name, hari, tanggal, bulan, tahun, waktu, lokasi, peserta, materi, updated_at)
         VALUES (1,?,?,?,?,?,?,?,?,?,?)`,
    DEFAULT_TEMPLATE.name, DEFAULT_TEMPLATE.hari, DEFAULT_TEMPLATE.tanggal,
    DEFAULT_TEMPLATE.bulan, DEFAULT_TEMPLATE.tahun, DEFAULT_TEMPLATE.waktu,
    DEFAULT_TEMPLATE.lokasi, DEFAULT_TEMPLATE.peserta, DEFAULT_TEMPLATE.materi, now)
    row = get('SELECT * FROM ngaji_templates WHERE id = 1')
  }
  return row
}

export function saveTemplate(patch = {}, adminJid = null) {
  const current = getTemplate()
  const allowed = ['name', 'hari', 'tanggal', 'bulan', 'tahun', 'waktu', 'lokasi', 'peserta', 'materi']
  const values = { ...current }
  for (const key of allowed) {
    if (patch[key] !== undefined && patch[key] !== null && String(patch[key]).trim()) values[key] = patch[key]
  }
  if (values.tanggal !== undefined) values.tanggal = Number(values.tanggal)
  if (values.tahun !== undefined) values.tahun = Number(values.tahun)
  run(`UPDATE ngaji_templates SET name=?, hari=?, tanggal=?, bulan=?, tahun=?, waktu=?, lokasi=?, peserta=?, materi=?, updated_at=? WHERE id=1`,
    values.name, values.hari, values.tanggal, values.bulan, values.tahun,
    values.waktu, values.lokasi, values.peserta, values.materi, new Date().toISOString())
  logActivity(adminJid, 'ngaji_template_update', Object.keys(patch).join(','))
  return getTemplate()
}

export function resetTemplate(adminJid = null) {
  const result = saveTemplate({ ...DEFAULT_TEMPLATE }, adminJid)
  logActivity(adminJid, 'ngaji_template_reset', 'default')
  return result
}

export function getSchedule() {
  let row = get('SELECT * FROM ngaji_schedules WHERE id = 1')
  if (!row) {
    const anchor = parseDateInput(`${DEFAULT_TEMPLATE.tahun}-11-${DEFAULT_TEMPLATE.tanggal}`)
    const now = new Date().toISOString()
    run(`INSERT OR IGNORE INTO ngaji_schedules
         (id, mode, weekday, anchor_date, event_time, send_lead_days, send_time, is_active, updated_at)
         VALUES (1,'specific',?,?,?,?,?,0,?)`,
    weekdayOf(anchor), anchor, '18:20', 1, '19:00', now)
    row = get('SELECT * FROM ngaji_schedules WHERE id = 1')
  }
  return { ...row, targets: getTargets() }
}

export function getTargets() {
  return all(`SELECT t.group_jid, g.name FROM ngaji_targets t
              LEFT JOIN whatsapp_groups g ON g.jid = t.group_jid WHERE t.schedule_id = 1`)
}

export function saveSchedule(data = {}, adminJid = null) {
  const current = getSchedule()
  const mode = ['weekly', 'specific'].includes(data.mode) ? data.mode : current.mode
  const anchor = data.anchor_date || current.anchor_date
  const weekday = data.weekday !== undefined ? Number(data.weekday) : (weekdayOf(anchor) ?? current.weekday)
  const eventTime = data.event_time || current.event_time
  const lead = data.send_lead_days !== undefined ? Math.max(0, Math.min(30, Number(data.send_lead_days))) : current.send_lead_days
  const sendTime = data.send_time || current.send_time
  const isActive = data.is_active === undefined ? current.is_active : (data.is_active ? 1 : 0)

  transaction(() => {
    run(`INSERT INTO ngaji_schedules
         (id, mode, weekday, anchor_date, event_time, send_lead_days, send_time, is_active, updated_at)
         VALUES (1,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET mode=excluded.mode, weekday=excluded.weekday,
           anchor_date=excluded.anchor_date, event_time=excluded.event_time,
           send_lead_days=excluded.send_lead_days, send_time=excluded.send_time,
           is_active=excluded.is_active, updated_at=excluded.updated_at`,
    mode, weekday, anchor, eventTime, lead, sendTime, isActive, new Date().toISOString())
    if (Array.isArray(data.targets)) {
      run('DELETE FROM ngaji_targets WHERE schedule_id = 1')
      for (const jid of [...new Set(data.targets.map(String))]) {
        if (jid.includes('@g.us')) run('INSERT INTO ngaji_targets(schedule_id, group_jid) VALUES (1,?)', jid)
      }
    }
  })()
  logActivity(adminJid, 'ngaji_schedule_update', `${mode}:${anchor}`)
  return getSchedule()
}

export function setActive(active, adminJid = null) {
  const s = saveSchedule({ is_active: Boolean(active) }, adminJid)
  logActivity(adminJid, active ? 'ngaji_activate' : 'ngaji_deactivate', 'ngaji')
  return s
}

export function nextEventDate(schedule = getSchedule(), fromDate = jakartaDate()) {
  if (!schedule?.anchor_date) return null
  if (schedule.mode === 'weekly') {
    const weekday = Number(schedule.weekday)
    let cursor = schedule.anchor_date
    if (weekdayOf(cursor) !== weekday) {
      // Geser anchor ke hari kegiatan yang diminta.
      const diff = (weekday - weekdayOf(cursor) + 7) % 7
      cursor = addDays(cursor, diff)
    }
    let guard = 0
    while (cursor < fromDate && guard < 520) {
      cursor = addDays(cursor, 7)
      guard += 1
    }
    return cursor
  }
  return schedule.anchor_date >= fromDate ? schedule.anchor_date : null
}

export function renderNgaji(eventDate = null) {
  const template = getTemplate()
  const schedule = getSchedule()
  const target = eventDate || nextEventDate(schedule) || schedule.anchor_date
  const parts = dateParts(target) || {
    hari: template.hari, tanggal: template.tanggal, bulan: template.bulan, tahun: template.tahun,
  }
  return [
    '*PENGUMUMAN*',
    '',
    `📌 *${template.name}*`,
    `📅 : ${parts.hari} ${parts.tanggal} ${parts.bulan} ${parts.tahun}`,
    `🕰️ : ${template.waktu}`,
    `🕌 : ${template.lokasi}`,
    `👤 : ${template.peserta}`,
    `📗 : ${template.materi}`,
    '',
    'Kerjakan karena Alloh semoga Alloh paring aman, selamat, lancar, sehat, kuat dan barokah.',
    '',
    'اَلْحَمْدُلِلّهِ جَزَاكُمُ اللّهُ خَيْرَا',
  ].join('\n')
}

export function templateSummary(template = getTemplate(), schedule = getSchedule()) {
  const eventDate = nextEventDate(schedule)
  const parts = eventDate ? dateParts(eventDate) : null
  return [
    '📌 *TEMPLATE PENGUMUMAN NGAJI*', '',
    `Nama kegiatan: ${template.name}`,
    `Hari: ${parts?.hari || template.hari}`,
    `Tanggal kegiatan: ${parts ? `${parts.tanggal} ${parts.bulan} ${parts.tahun}` : `${template.tanggal} ${template.bulan} ${template.tahun}`}`,
    `Waktu kegiatan: ${template.waktu}`,
    `Lokasi: ${template.lokasi}`,
    `Peserta: ${template.peserta}`,
    `Materi: ${template.materi}`,
    '',
    `Mode jadwal: ${schedule.mode === 'weekly' ? 'mingguan' : 'tanggal khusus'}`,
    `Pengiriman otomatis: ${schedule.is_active ? 'AKTIF' : 'NONAKTIF'}`,
  ].join('\n')
}

export function scheduleSummary(schedule = getSchedule()) {
  const eventDate = nextEventDate(schedule)
  const sendDate = eventDate ? addDays(eventDate, -Number(schedule.send_lead_days || 0)) : null
  const targets = getTargets()
  const last = get('SELECT * FROM ngaji_deliveries WHERE schedule_id = 1 ORDER BY id DESC LIMIT 1')
  return [
    '🗓️ *JADWAL PENGAJIAN*', '',
    `Mode: ${schedule.mode === 'weekly' ? 'Setiap minggu' : 'Tanggal khusus'}`,
    `Hari kegiatan: ${DAYS[Number(schedule.weekday)] || '-'}`,
    `Tanggal kegiatan berikutnya: ${eventDate || '-'}`,
    `Jam kegiatan: ${String(schedule.event_time || '').replace(':', '.')} WIB`,
    `Kirim pengumuman: ${sendDate || '-'} pukul ${String(schedule.send_time || '').replace(':', '.')} WIB`,
    `Grup tujuan (${targets.length}): ${targets.map((t) => t.name || t.group_jid).join(', ') || '-'}`,
    `Otomatis: ${schedule.is_active ? 'AKTIF' : 'NONAKTIF'}`,
    last ? `Pengiriman terakhir: ${last.event_date} — ${last.status}` : 'Pengiriman terakhir: -',
  ].join('\n')
}

export async function sendNgaji(sock, { eventDate = null, adminJid = null } = {}) {
  const schedule = getSchedule()
  const target = eventDate || nextEventDate(schedule)
  if (!target) return { ok: false, error: 'Belum ada tanggal kegiatan yang valid.' }
  if (!getTargets().length) return { ok: false, error: 'Belum ada grup tujuan pengajian.' }
  if (get('SELECT status FROM ngaji_deliveries WHERE schedule_id=1 AND event_date=?', target)?.status === 'sent') {
    return { ok: false, error: `Pengumuman untuk ${target} sudah dikirim.` }
  }

  const message = renderNgaji(target)
  const now = new Date().toISOString()
  const existing = get('SELECT * FROM ngaji_deliveries WHERE schedule_id=1 AND event_date=?', target)
  if (existing) run("UPDATE ngaji_deliveries SET status='claimed', error=NULL, created_at=? WHERE id=?", now, existing.id)
  else run(`INSERT INTO ngaji_deliveries(schedule_id, event_date, status, message, created_at) VALUES (1,?,'claimed',?,?)`, target, message, now)

  const results = []
  for (const group of getTargets()) {
    const outcome = await sendText(sock, group.group_jid, message)
    results.push({ jid: group.group_jid, ...outcome })
  }
  const sent = results.filter((r) => r.ok).length
  const allOk = results.length > 0 && sent === results.length
  run(`UPDATE ngaji_deliveries SET status=?, error=?, result=?, sent_at=? WHERE schedule_id=1 AND event_date=?`,
    allOk ? 'sent' : 'failed', allOk ? null : results.map((r) => r.reason).filter(Boolean).join('; '),
    JSON.stringify(results), allOk ? new Date().toISOString() : null, target)

  if (allOk && schedule.mode === 'specific') {
    run('UPDATE ngaji_schedules SET is_active=0, updated_at=? WHERE id=1', new Date().toISOString())
  }
  logActivity(adminJid, allOk ? 'ngaji_send_success' : 'ngaji_send_failed', target)
  logger.info(`Pengiriman ngaji ${target}: ${sent}/${results.length} berhasil`)
  return { ok: sent > 0, allOk, eventDate: target, sent, total: results.length, results, message }
}

export async function processNgaji(sock, now) {
  const schedule = getSchedule()
  if (!schedule.is_active) return { processed: 0, skipped: 0 }
  const eventDate = nextEventDate(schedule, now.date)
  if (!eventDate) return { processed: 0, skipped: 1 }
  const sendDate = addDays(eventDate, -Number(schedule.send_lead_days || 0))
  if (sendDate !== now.date || schedule.send_time !== now.time) return { processed: 0, skipped: 0 }
  const result = await sendNgaji(sock, { eventDate })
  return { processed: 1, ok: Boolean(result.ok), error: result.error || null }
}

export function deliveryHistory(limit = 10) {
  return all('SELECT id, event_date, status, error, sent_at FROM ngaji_deliveries WHERE schedule_id=1 ORDER BY id DESC LIMIT ?',
    Math.min(100, Math.max(1, Number(limit) || 10)))
}
