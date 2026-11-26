import { flowKey, reply } from './context.js'
import { createAnnouncement, deleteAnnouncement, getAnnouncement, getSchedule, updateAnnouncement } from '../services/announcements.js'
import { editService } from '../services/editService.js'
import { groupService } from '../services/groups.js'
import { logActivity } from '../db/index.js'
import {
  DAY_CHOICES, WEEK_CHOICES, dayName, weekName, timeName,
  parseDay, parseWeek, parseTime, cleanInput, yes,
} from '../utils/format.js'

const flows = new Map()

export const FIELD_LABELS = {
  title: 'Judul', body: 'Isi pesan', weekday: 'Hari pengiriman',
  week: 'Minggu keberapa', time: 'Jam pengiriman', targets: 'Grup tujuan',
}
export const FIELD_ORDER = ['title', 'body', 'weekday', 'week', 'time', 'targets']

function fieldPrompt(field) {
  switch (field) {
    case 'title': return 'Ketik judul baru:'
    case 'body': return 'Ketik isi pesan baru.\nBaris baru dan format teks akan dipertahankan persis seperti yang Anda tulis:'
    case 'weekday': return `Pilih hari pengiriman:\n${DAY_CHOICES}`
    case 'week': return `Pilih minggu keberapa:\n${WEEK_CHOICES}`
    case 'time': return 'Ketik jam pengiriman (contoh: 19.00):'
    case 'targets': return `Pilih grup tujuan. Bisa beberapa, pisahkan dengan koma. Boleh juga "ini" atau "semua":\n${groupService.listForDisplay(true)}`
    default: return 'Ketik nilai baru:'
  }
}

function draftSummary(d) {
  const names = d.targets?.map((jid) => groupService.get(jid)?.name || jid) || []
  return [
    `Judul: ${d.title}`,
    `Isi pesan: ${String(d.body).slice(0, 60)}${String(d.body).length > 60 ? '…' : ''}`,
    `Jadwal: ${dayName(d.weekday)} / ${weekName(d.week)} / ${timeName(d.time)}`,
    `Grup tujuan (${names.length}): ${names.join(', ') || '-'}`,
  ].join('\n')
}

function parseField(field, raw, currentJid) {
  switch (field) {
    case 'title': {
      const v = cleanInput(raw)
      return v ? { ok: true, value: v } : { ok: false }
    }
    case 'body': {
      const v = String(raw ?? '').trim()
      return v ? { ok: true, value: v } : { ok: false }
    }
    case 'weekday': {
      const v = parseDay(raw)
      return v === null ? { ok: false } : { ok: true, value: v }
    }
    case 'week': {
      const v = parseWeek(raw)
      return v === null ? { ok: false } : { ok: true, value: v }
    }
    case 'time': {
      const v = parseTime(raw)
      return v === null ? { ok: false } : { ok: true, value: v }
    }
    case 'targets': {
      const value = groupService.resolveTargets(raw, currentJid)
      return value.length ? { ok: true, value } : { ok: false }
    }
    default: return { ok: false }
  }
}

function resolveFieldChoice(raw) {
  const v = cleanInput(raw).toLowerCase()
  const byNumber = { 1: 'title', 2: 'body', 3: 'weekday', 4: 'week', 5: 'time', 6: 'targets' }
  if (byNumber[v]) return byNumber[v]
  const byName = {
    judul: 'title', title: 'title', isi: 'body', pesan: 'body', body: 'body',
    hari: 'weekday', weekday: 'weekday', minggu: 'week', week: 'week', pekan: 'week',
    jam: 'time', time: 'time', grup: 'targets', target: 'targets', targets: 'targets', tujuan: 'targets',
  }
  return byName[v] || null
}

export function getFlow(ctx) { return flows.get(flowKey(ctx)) || null }
export function setFlow(ctx, flow) { flows.set(flowKey(ctx), flow) }
export function clearFlow(ctx) { flows.delete(flowKey(ctx)) }
export function clearAllFlows() { flows.clear() }

export async function handleFlow(ctx, cmd, arg) {
  const key = flowKey(ctx)
  const flow = flows.get(key)
  if (!flow) return false
  const text = ctx.text.trim()

  if (cmd === '.batal') {
    if (flow.type === 'edit') editService.cancel(ctx.adminJid)
    flows.delete(key)
    await reply(ctx, 'Proses dibatalkan. Tidak ada perubahan yang disimpan.')
    return true
  }

  if (flow.type === 'create') return handleCreate(ctx, flow, cmd, arg, key)
  if (flow.type === 'edit') return handleEdit(ctx, flow, cmd, arg, key)
  if (flow.type === 'reschedule') return handleReschedule(ctx, flow, cmd, arg, key)
  if (flow.type === 'delete') return handleDelete(ctx, flow, cmd, arg, key)
  return false
}

async function handleCreate(ctx, flow, cmd, arg, key) {
  const d = flow.data
  if (flow.step === 'confirm') {
    if (yes(cmd)) {
      const id = createAnnouncement({
        title: d.title, body: d.body, category: d.category,
        weekday: d.weekday, week: d.week, time: d.time, targets: d.targets,
      }, ctx.adminJid, ctx.jid)
      flows.delete(key)
      await reply(ctx, `Pengumuman berhasil disimpan dengan ID ${id}.\n\n${draftSummary(d)}\n\nKetik .list untuk melihat semua pengumuman.`)
    } else {
      await reply(ctx, 'Penyimpanan dibatalkan. Gunakan .set untuk memulai lagi.')
      flows.delete(key)
    }
    return true
  }

  if (cmd && !['.selesai'].includes(cmd)) {
    await reply(ctx, `Masih dalam proses pembuatan (tahap ${flow.step}). Ketik .batal untuk membatalkan.`)
    return true
  }

  switch (flow.step) {
    case 'title': {
      const v = cleanInput(ctx.text)
      if (!v) { await reply(ctx, 'Judul tidak boleh kosong. Ketik judul pengumuman:'); return true }
      d.title = v
      flow.step = 'body'
      await reply(ctx, 'Judul tersimpan.\n\nKetik isi pengumuman. Baris baru dipertahankan persis seperti yang Anda tulis:')
      break
    }
    case 'body': {
      const v = String(ctx.text).trim()
      if (!v) { await reply(ctx, 'Isi pengumuman tidak boleh kosong.'); return true }
      d.body = v
      flow.step = 'day'
      await reply(ctx, `Isi pesan tersimpan.\n\nPilih hari pengiriman:\n${DAY_CHOICES}`)
      break
    }
    case 'day': {
      const v = parseDay(arg || ctx.text)
      if (v === null) { await reply(ctx, `Hari tidak valid. Pilih:\n${DAY_CHOICES}`); return true }
      d.weekday = v
      flow.step = 'week'
      await reply(ctx, `Hari: ${dayName(v)}.\n\nPilih minggu keberapa:\n${WEEK_CHOICES}`)
      break
    }
    case 'week': {
      const v = parseWeek(arg || ctx.text)
      if (v === null) { await reply(ctx, `Pilihan minggu tidak valid:\n${WEEK_CHOICES}`); return true }
      d.week = v
      flow.step = 'time'
      await reply(ctx, `Minggu: ${weekName(v)}.\n\nKetik jam pengiriman (contoh: 19.00):`)
      break
    }
    case 'time': {
      const v = parseTime(arg || ctx.text)
      if (v === null) { await reply(ctx, 'Jam tidak valid. Contoh: 07.00 atau 19:30.'); return true }
      d.time = v
      flow.step = 'groups'
      await reply(ctx, `Jam: ${timeName(v)}.\n\nPilih grup tujuan:\n${groupService.listForDisplay(true)}\n\nKetik nomor (bisa 1,2,3), "ini", atau "semua".`)
      break
    }
    case 'groups': {
      const targets = groupService.resolveTargets(ctx.text, ctx.jid)
      if (!targets.length) {
        await reply(ctx, 'Grup tidak ditemukan. Ketik nomor dari daftar, "ini", atau "semua".')
        return true
      }
      d.targets = targets
      flow.step = 'confirm'
      const names = targets.map((j) => groupService.get(j)?.name || j).join(', ')
      await reply(ctx, `PRIVIEW PENGUMUMAN\n\n${d.body}\n\n--- Informasi (tidak ikut dikirim) ---\nJudul: ${d.title}\nJadwal: ${dayName(d.weekday)} / ${weekName(d.week)} / ${timeName(d.time)}\nGrup: ${names}\n\nKetik .ya untuk menyimpan atau .batal untuk membatalkan.`)
      break
    }
  }
  return true
}

async function handleEdit(ctx, flow, cmd, arg, key) {
  const session = editService.get(ctx.adminJid)
  if (!session) { flows.delete(key); return false }

  if (cmd === '.update' || cmd === '.selesai') {
    const diff = editService.diff(ctx.adminJid)
    if (!diff || !diff.changes.length) {
      await reply(ctx, 'Tidak ada perubahan pada draf. Sesi edit tetap aktif; ubah salah satu bagian lalu ketik .update.')
      return true
    }
    const lines = diff.changes.map((c) => {
      const from = Array.isArray(c.from) ? c.from.map((j) => groupService.get(j)?.name || j).join(', ') : c.from
      const to = Array.isArray(c.to) ? c.to.map((j) => groupService.get(j)?.name || j).join(', ') : c.to
      return `- ${FIELD_LABELS[c.field] || c.field}:\n  lama: ${from}\n  baru : ${to}`
    })
    editService.setStep(ctx.adminJid, 'confirm_update')
    flow.step = 'confirm_update'
    await reply(ctx, `RINGKASAN PERUBAHAN ${diff.id}\n\n${lines.join('\n')}\n\nKetik .ya untuk menyimpan perubahan, atau .batal untuk membuang draf.`)
    return true
  }

  if (flow.step === 'confirm_update') {
    if (yes(cmd)) {
      const id = editService.commit(ctx.adminJid)
      flows.delete(key)
      await reply(ctx, `Perubahan ${id} berhasil disimpan. Jadwal dan grup tujuan telah diperbarui. Riwayat perubahan dicatat.`)
    } else {
      await reply(ctx, 'Perubahan tidak disimpan. Ketik .update untuk melihat ringkasan lagi, atau .batal untuk membuang draf.')
    }
    return true
  }

  if (flow.field) {
    const parsed = parseField(flow.field, ctx.text, ctx.jid)
    if (!parsed.ok) {
      await reply(ctx, `Nilai tidak valid untuk ${FIELD_LABELS[flow.field]}.\n${fieldPrompt(flow.field)}`)
      return true
    }
    const patch = { [flow.field]: parsed.value }
    if (flow.field === 'targets') patch.targets = parsed.value
    editService.patch(ctx.adminJid, patch)
    const draft = editService.get(ctx.adminJid).payload.draft
    flow.field = null
    flow.step = 'select_field'
    await reply(ctx, `${FIELD_LABELS[Object.keys(patch)[0]]} diperbarui pada draf (belum disimpan).\n\n${draftSummary(draft)}\n\nKetik nomor/ nama bagian lain untuk mengubah, .update untuk melihat perubahan, atau .batal.`)
    return true
  }

  const selected = resolveFieldChoice(ctx.text)
  if (!selected) {
    await reply(ctx, `Pilih bagian yang ingin diubah (1-6):\n${FIELD_ORDER.map((f, i) => `${i + 1}. ${FIELD_LABELS[f]}`).join('\n')}\n\nKetik .update setelah selesai.`)
    return true
  }
  flow.field = selected
  editService.setField(ctx.adminJid, selected)
  await reply(ctx, fieldPrompt(selected))
  return true
}

async function handleReschedule(ctx, flow, cmd, arg, key) {
  if (flow.step === 'confirm') {
    if (yes(cmd)) {
      const row = getAnnouncement(flow.id)
      updateAnnouncement(flow.id, {
        title: row.title, body: row.body, category: row.category || '',
        weekday: flow.data.weekday, week: flow.data.week, time: flow.data.time,
        targets: [],
      }, ctx.adminJid)
      logActivity(ctx.adminJid, 'reschedule', flow.id, ctx.jid)
      flows.delete(key)
      await reply(ctx, `Jadwal ${flow.id} diperbarui menjadi ${dayName(flow.data.weekday)} / ${weekName(flow.data.week)} / ${timeName(flow.data.time)}.`)
    } else {
      await reply(ctx, 'Perubahan jadwal dibatalkan.')
      flows.delete(key)
    }
    return true
  }
  if (cmd) { await reply(ctx, 'Sedang mengatur jadwal. Ketik .batal untuk membatalkan.'); return true }

  if (flow.step === 'day') {
    const v = parseDay(ctx.text)
    if (v === null) { await reply(ctx, `Hari tidak valid:\n${DAY_CHOICES}`); return true }
    flow.data.weekday = v; flow.step = 'week'
    await reply(ctx, `Hari: ${dayName(v)}.\n\nPilih minggu:\n${WEEK_CHOICES}`)
  } else if (flow.step === 'week') {
    const v = parseWeek(ctx.text)
    if (v === null) { await reply(ctx, `Minggu tidak valid:\n${WEEK_CHOICES}`); return true }
    flow.data.week = v; flow.step = 'time'
    await reply(ctx, `Minggu: ${weekName(v)}.\n\nKetik jam (contoh: 19.00):`)
  } else if (flow.step === 'time') {
    const v = parseTime(ctx.text)
    if (v === null) { await reply(ctx, 'Jam tidak valid. Contoh: 19.00.'); return true }
    flow.data.time = v; flow.step = 'confirm'
    await reply(ctx, `Jadwal baru ${flow.id}: ${dayName(flow.data.weekday)} / ${weekName(flow.data.week)} / ${timeName(flow.data.time)}.\n\nKetik .ya untuk menyimpan atau .batal.`)
  }
  return true
}

async function handleDelete(ctx, flow, cmd, arg, key) {
  if (yes(cmd)) {
    deleteAnnouncement(flow.id, ctx.adminJid)
    flows.delete(key)
    await reply(ctx, `Pengumuman ${flow.id} beserta jadwal dan riwayat penjadwalannya dihapus.`)
  } else {
    flows.delete(key)
    await reply(ctx, `Penghapusan ${flow.id} dibatalkan.`)
  }
  return true
}

export function startEditDiffFallback(ctx) {
  const session = editService.get(ctx.adminJid)
  if (!session) return null
  setFlow(ctx, { type: 'edit', id: session.announcement_id, field: null, step: session.step })
  return session
}
