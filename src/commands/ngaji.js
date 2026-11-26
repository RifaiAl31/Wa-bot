import { flowKey, reply } from './context.js'
import { groupService } from '../services/groups.js'
import { logActivity } from '../db/index.js'
import { DAYS, cleanInput, parseDay, parseTime, yes, no } from '../utils/format.js'
import * as ngaji from '../services/ngajiService.js'

const flows = new Map()
export const NGAJI_FIELDS = {
  nama: 'name', judul: 'name', name: 'name',
  hari: 'hari', tanggal: 'tanggal', bulan: 'bulan', tahun: 'tahun',
  waktu: 'waktu', jam: 'waktu', lokasi: 'lokasi', tempat: 'lokasi',
  peserta: 'peserta', materi: 'materi',
}
const FIELD_LABELS = {
  name: 'Nama kegiatan', hari: 'Hari kegiatan', tanggal: 'Tanggal kegiatan',
  bulan: 'Bulan kegiatan', tahun: 'Tahun kegiatan', waktu: 'Waktu kegiatan',
  lokasi: 'Lokasi', peserta: 'Peserta', materi: 'Materi',
}
const EDIT_CHOICES = [
  ['1', 'name'], ['2', 'hari'], ['3', 'tanggal'], ['4', 'bulan'], ['5', 'tahun'],
  ['6', 'waktu'], ['7', 'lokasi'], ['8', 'peserta'], ['9', 'materi'],
]

function fieldPrompt(field) {
  switch (field) {
    case 'name': return 'Ketik nama kegiatan:'
    case 'hari': return `Ketik hari kegiatan (${DAYS.join(', ')}):`
    case 'tanggal': return 'Ketik tanggal kegiatan (contoh: 21, atau 21 November 2026):'
    case 'bulan': return 'Ketik bulan kegiatan (contoh: November):'
    case 'tahun': return 'Ketik tahun kegiatan (contoh: 2026):'
    case 'waktu': return 'Ketik waktu kegiatan (contoh: Bada 18.20 - selesai):'
    case 'lokasi': return 'Ketik lokasi kegiatan:'
    case 'peserta': return 'Ketik peserta kegiatan:'
    case 'materi': return 'Ketik materi kegiatan:'
    default: return 'Ketik nilai baru:'
  }
}

function editChoice(raw) {
  const v = cleanInput(raw).toLowerCase()
  const hit = EDIT_CHOICES.find(([num]) => num === v)
  if (hit) return hit[1]
  return NGAJI_FIELDS[v] || null
}

function monthNumber(raw) {
  const v = cleanInput(raw).toLowerCase().replace(/[.]/g, '')
  const names = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember']
  const english = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
  const index = names.indexOf(v) >= 0 ? names.indexOf(v) : english.indexOf(v)
  if (index >= 0) return index + 1
  if (/^\d{1,2}$/.test(v)) return Number(v)
  return null
}

export function parseEventDate(raw) {
  const text = cleanInput(raw)
  const iso = ngaji.parseDateInput(text)
  if (iso) return { date: iso }
  const m = /^(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})$/i.exec(text)
  if (m) {
    const month = monthNumber(m[2])
    if (month) return { date: `${m[3]}-${String(month).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}` }
  }
  const day = /^\d{1,2}$/.test(text) ? Number(text) : null
  if (day) {
    const template = ngaji.getTemplate()
    const schedule = ngaji.getSchedule()
    const base = ngaji.nextEventDate(schedule) || schedule.anchor_date
    const p = ngaji.dateParts(base) || { bulan: template.bulan, tahun: template.tahun }
    const month = monthNumber(p.bulan)
    if (month) return { date: `${p.tahun}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` }
  }
  return null
}

function editMenu() {
  const t = ngaji.getTemplate()
  const rows = [
    ['1', 'nama', t.name], ['2', 'hari', t.hari], ['3', 'tanggal', t.tanggal],
    ['4', 'bulan', t.bulan], ['5', 'tahun', t.tahun], ['6', 'waktu', t.waktu],
    ['7', 'lokasi', t.lokasi], ['8', 'peserta', t.peserta], ['9', 'materi', t.materi],
  ]
  return ['✏️ *EDIT TEMPLATE NGAJI*', '', ...rows.map(([n, label, value]) => `${n}. ${label}: ${value}`),
    '', 'Ketik nomor/bagian yang diubah, lalu isi nilainya.', 'Ketik .selesai bila cukup atau .batal untuk membatalkan.'].join('\n')
}

function scheduleMenu() {
  return ['🗓️ *ATUR JADWAL NGAJI*', '', '1. Mingguan — tiap hari yang sama', '2. Tanggal khusus — satu tanggal tertentu',
    '', 'Ketik 1 atau 2.'].join('\n')
}

export async function showTemplate(ctx) {
  const t = ngaji.getTemplate()
  const s = ngaji.getSchedule()
  return reply(ctx, `${ngaji.templateSummary(t, s)}\n\nKetik .previewngaji untuk melihat pesan lengkap.`)
}

export async function setNgaji(ctx, arg = '') {
  if (cleanInput(arg).toLowerCase() === 'baru') {
    ngaji.resetTemplate(ctx.adminJid)
    return reply(ctx, `Template pengajian dikembalikan ke nilai awal.\n\n${ngaji.templateSummary()}\n\nGunakan .editngaji untuk mengubah, .aturngaji untuk jadwal.`)
  }
  const t = ngaji.getTemplate()
  ngaji.getSchedule()
  return reply(ctx, `Template pengajian siap digunakan.\n\n${ngaji.templateSummary(t, ngaji.getSchedule())}\n\nKetik .editngaji untuk mengubah atau .aturngaji untuk mengatur jadwal.`)
}

export async function previewNgaji(ctx) {
  const s = ngaji.getSchedule()
  const date = ngaji.nextEventDate(s)
  if (!date) return reply(ctx, 'Jadwal kegiatan belum valid. Ketik .aturngaji dulu.')
  return reply(ctx, ['🔍 *PREVIEW — BELUM DIKIRIM*', '', ngaji.renderNgaji(date), '', `Rencana kirim: ${ngaji.addDays(date, -Number(s.send_lead_days || 0))} pukul ${String(s.send_time).replace(':', '.')} WIB`].join('\n'))
}

export async function sendNgajiCommand(ctx) {
  const s = ngaji.getSchedule()
  const date = ngaji.nextEventDate(s)
  if (!date) return reply(ctx, 'Belum ada tanggal kegiatan yang valid. Ketik .aturngaji dulu.')
  if (!ngaji.getTargets().length) return reply(ctx, 'Belum ada grup tujuan. Ketik .aturngaji untuk menentukan grup.')
  flows.set(flowKey(ctx), { type: 'ngaji_send', data: { eventDate: date } })
  return reply(ctx, ['🔍 *KONFIRMASI PENGIRIMAN NGAJI*', '', ngaji.renderNgaji(date), '', `Tanggal kegiatan: ${date}`, 'Ketik .ya untuk kirim sekarang atau .batal untuk membatalkan.'].join('\n'))
}

export async function jadwalNgaji(ctx) {
  return reply(ctx, ngaji.scheduleSummary())
}

export async function setActiveNgaji(ctx, active) {
  ngaji.setActive(active, ctx.adminJid)
  return reply(ctx, `Pengiriman otomatis pengajian ${active ? 'diaktifkan' : 'dinonaktifkan'}.\n\n${ngaji.scheduleSummary()}`)
}

export function startEditNgaji(ctx) {
  flows.set(flowKey(ctx), { type: 'ngaji_edit', step: 'field', data: {} })
  return reply(ctx, editMenu())
}

export function startScheduleNgaji(ctx) {
  flows.set(flowKey(ctx), { type: 'ngaji_schedule', step: 'mode', data: {} })
  return reply(ctx, scheduleMenu())
}

export async function handleNgajiFlow(ctx, cmd, arg) {
  const key = flowKey(ctx)
  const flow = flows.get(key)
  if (!flow) return false
  const text = cleanInput(ctx.text)

  // Perintah lain tidak boleh tersedot oleh sesi ngaji yang tertinggal.
  const FLOW_CMDS = ['.ya', '.iya', '.y', '.batal', '.selesai', '.tidak', '.t']
  if (cmd && !FLOW_CMDS.includes(cmd)) {
    flows.delete(key)
    return false
  }

  if (cmd === '.batal' || no(cmd)) {
    flows.delete(key)
    await reply(ctx, 'Proses pengajian dibatalkan. Tidak ada perubahan yang disimpan.')
    return true
  }

  if (flow.type === 'ngaji_send') return handleSendFlow(ctx, flow, cmd, key)
  if (flow.type === 'ngaji_edit') return handleEditFlow(ctx, flow, cmd, arg, key)
  if (flow.type === 'ngaji_schedule') return handleScheduleFlow(ctx, flow, cmd, arg, key)
  return false
}

async function handleSendFlow(ctx, flow, cmd, key) {
  if (!yes(cmd)) {
    await reply(ctx, 'Pengiriman dibatalkan. Ketik .sendngaji untuk mencoba lagi.')
    flows.delete(key)
    return true
  }
  flows.delete(key)
  const result = await ngaji.sendNgaji(ctx.sock, { eventDate: flow.data.eventDate, adminJid: ctx.adminJid })
  if (!result.ok) return reply(ctx, `Gagal mengirim pengumuman pengajian: ${result.error || 'lihat log bot'}`)
  return reply(ctx, `✅ Pengumuman pengajian ${result.eventDate} terkirim ke ${result.sent}/${result.total} grup.`)
}

function applyEditValue(ctx, field, raw) {
  let patch = null
  if (field === 'tanggal') {
    const parsed = parseEventDate(raw)
    if (!parsed) return { error: 'Tanggal tidak valid. Contoh: 21 November 2026 atau 2026-11-21.' }
    const date = parsed.date
    const parts = ngaji.dateParts(date)
    ngaji.saveSchedule({ mode: 'specific', anchor_date: date, weekday: ngaji.weekdayOf(date) }, ctx.adminJid)
    patch = { tanggal: parts.tanggal, bulan: parts.bulan, tahun: parts.tahun, hari: DAYS[ngaji.weekdayOf(date)] }
  } else if (field === 'hari') {
    const weekday = parseDay(raw)
    if (weekday === null) return { error: `Hari tidak valid. Pilih: ${DAYS.join(', ')}` }
    const anchor = ngaji.getSchedule().anchor_date
    const date = ngaji.addDays(anchor, (weekday - ngaji.weekdayOf(anchor) + 7) % 7)
    ngaji.saveSchedule({ weekday, anchor_date: date }, ctx.adminJid)
    patch = { hari: DAYS[weekday] }
  } else if (field === 'waktu') {
    const parsed = parseTime(raw)
    if (parsed) ngaji.saveSchedule({ event_time: parsed }, ctx.adminJid)
    patch = { waktu: cleanInput(raw) }
  } else {
    patch = { [field]: cleanInput(raw) }
  }
  if (!patch || Object.values(patch).some((v) => v === '' || v === null || Number.isNaN(v))) {
    return { error: 'Nilai tidak boleh kosong.' }
  }
  ngaji.saveTemplate(patch, ctx.adminJid)
  return { patch }
}

async function handleEditFlow(ctx, flow, cmd, arg, key) {
  const text = cleanInput(ctx.text)
  if (flow.awaitingValue) {
    const result = applyEditValue(ctx, flow.data.field, arg || ctx.text)
    if (result.error) return reply(ctx, result.error)
    flows.delete(key)
    return reply(ctx, `Template diperbarui: ${Object.keys(result.patch).join(', ')}\n\n${ngaji.templateSummary()}\n\nKetik .editngaji untuk ubah lagi.`)
  }
  if (cmd === '.selesai') {
    flows.delete(key)
    return reply(ctx, `Edit template selesai.\n\n${ngaji.templateSummary()}`)
  }
  const field = editChoice(arg || text)
  if (!field) {
    await reply(ctx, `Bagian tidak dikenal. Ketik .batal untuk keluar.\n\n${editMenu()}`)
    return true
  }
  flow.data.field = field
  flow.awaitingValue = true
  await reply(ctx, fieldPrompt(field))
  return true
}

async function handleScheduleFlow(ctx, flow, cmd, arg, key) {
  const d = flow.data
  if (flow.step === 'confirm') {
    if (yes(cmd)) {
      const saved = ngaji.saveSchedule({
        mode: d.mode, weekday: d.weekday, anchor_date: d.date,
        event_time: d.event_time, send_time: d.send_time,
        send_lead_days: 1, targets: d.targets, is_active: true,
      }, ctx.adminJid)
      flows.delete(key)
      return reply(ctx, `Jadwal pengajian tersimpan dan otomatis AKTIF.\n\n${ngaji.scheduleSummary(saved)}`)
    }
    flows.delete(key)
    return reply(ctx, 'Pengaturan jadwal dibatalkan.')
  }

  if (flow.step === 'mode') {
    const v = cleanInput(arg || text).toLowerCase()
    if (['1', 'mingguan', 'weekly', 'setiap'].includes(v)) {
      d.mode = 'weekly'
      flow.step = 'weekday'
      return reply(ctx, `Pilih hari kegiatan:\n${DAYS.map((day, i) => `${i}. ${day}`).join('\n')}`)
    }
    if (['2', 'khusus', 'specific', 'tanggal'].includes(v)) {
      d.mode = 'specific'
      flow.step = 'date'
      return reply(ctx, 'Ketik tanggal kegiatan, contoh: 21 November 2026 atau 2026-11-21.')
    }
    return reply(ctx, scheduleMenu())
  }

  if (flow.step === 'weekday') {
    const weekday = parseDay(arg || text)
    if (weekday === null) return reply(ctx, `Hari tidak valid. Ketik 0–6 atau nama hari.`)
    d.weekday = weekday
    flow.step = 'date'
    return reply(ctx, `Hari: ${DAYS[weekday]}.\nKetik tanggal kegiatan pertama, contoh: 21 November 2026.`)
  }

  if (flow.step === 'date') {
    const parsed = parseEventDate(arg || text)
    if (!parsed) return reply(ctx, 'Tanggal tidak valid. Contoh: 21 November 2026 atau 2026-11-21.')
    d.date = parsed.date
    if (d.mode === 'weekly' && ngaji.weekdayOf(d.date) !== Number(d.weekday)) {
      return reply(ctx, `Tanggal ${d.date} bukan ${DAYS[Number(d.weekday)]}. Ketik tanggal yang sesuai.`)
    }
    if (d.mode === 'specific') d.weekday = ngaji.weekdayOf(d.date)
    flow.step = 'event_time'
    return reply(ctx, `Tanggal kegiatan: ${d.date}.\nKetik jam kegiatan (contoh: 18.20):`)
  }

  if (flow.step === 'event_time') {
    const t = parseTime(arg || text)
    if (!t) return reply(ctx, 'Jam tidak valid. Contoh: 18.20')
    d.event_time = t
    flow.step = 'send_time'
    return reply(ctx, `Jam kegiatan: ${t.replace(':', '.')} WIB.\nKetik jam pengumuman dikirim (contoh: 19.00):`)
  }

  if (flow.step === 'send_time') {
    const t = parseTime(arg || text)
    if (!t) return reply(ctx, 'Jam tidak valid. Contoh: 19.00')
    d.send_time = t
    flow.step = 'targets'
    return reply(ctx, `Pengumuman dikirim pukul ${t.replace(':', '.')} WIB.\nKetik grup tujuan (nomor dari daftar, "ini", atau "semua"):\n${groupService.listForDisplay(true)}`)
  }

  if (flow.step === 'targets') {
    const targets = groupService.resolveTargets(arg || text, ctx.jid)
    if (!targets.length) return reply(ctx, 'Grup tujuan tidak valid. Gunakan nomor daftar, "ini", atau "semua".')
    d.targets = targets
    flow.step = 'confirm'
    const sendDate = ngaji.addDays(d.date, -1)
    return reply(ctx, [
      '🔍 *KONFIRMASI JADWAL NGAJI*', '',
      `Hari kegiatan: ${DAYS[Number(d.weekday)]}`,
      `Tanggal kegiatan: ${d.date}`,
      `Jam kegiatan: ${d.event_time.replace(':', '.')} WIB`,
      `Kirim: ${sendDate} pukul ${d.send_time.replace(':', '.')} WIB`,
      `Grup tujuan (${targets.length}): ${targets.map((j) => groupService.get(j)?.name || j).join(', ')}`,
      '', 'Ketik .ya untuk simpan atau .batal.',
    ].join('\n'))
  }
  return false
}

export function clearNgajiFlow(ctx) { flows.delete(flowKey(ctx)) }
