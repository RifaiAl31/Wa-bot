import { reply } from './context.js'
import { getFlow, handleFlow, setFlow, startEditDiffFallback, FIELD_LABELS, FIELD_ORDER } from './flows.js'
import { editService } from '../services/editService.js'
import {
  getAnnouncement, getSchedule, getTargets, listAnnouncements,
  setActive, updateAnnouncement, createQuickAnnouncement,
} from '../services/announcements.js'
import { deliverAnnouncement } from '../services/delivery.js'
import { withReaction } from './reactions.js'
import { buildMenuText, RESTRICTED_COMMANDS } from './registry.js'
import { aiService } from '../ai/service.js'
import { handleQuoteCommand } from '../images/generator.js'
import * as imageEngine from '../images/engine.js'
import { extractMediaTarget, downloadWaMedia } from '../services/waMedia.js'
import { extractPdfText } from '../ai/mediaService.js'
import { handleChoice } from './quickReplies.js'
import { runAsk, runImageAnalysis, runPdfAnalysis, handleQuickChoice, handlePdfQuestion } from './quickActionHandlers.js'
import { isRegisteredAdmin } from '../services/adminAuth.js'
import { verifyVipPassword, registerVip, listVips, isVip, removeVip } from '../services/vipService.js'
import * as vipSession from '../services/vipSession.js'
import { groupService } from '../services/groups.js'
import { logActivity } from '../db/index.js'
import { config, normalizeJid } from '../config.js'
import { logger } from '../logger.js'
import {
  dayName, weekName, timeName, groupLabel, shortJid, normalizeId,
  formatAnnouncementDetail, DAY_CHOICES,
} from '../utils/format.js'

export const FLOW_COMMANDS = new Set(['/batal', '/ya', '/iya', '/y', '/tidak', '/t', '/selesai', '/update'])

const HELP = `DAFTAR PERINTAH BOT PENGUMUMAN

Semua anggota grup bisa memakai perintah ini.

Pengumuman
/set  Membuat pengumuman baru (panduan bertahap)
/set <teks>  Langsung simpan teks yang ditempel (cepat)
/list  Daftar semua pengumuman + isi pesannya
/detail ID  Melihat detail pengumuman
/send A1  Kirim manual sekarang ke grup tujuan
/kirim ID  Alias /send
/edit ID  Memulai pengeditan pengumuman
/update  Menyimpan perubahan hasil edit
/batal  Membatalkan proses buat/edit/hapus
/hapus ID  Menghapus pengumuman (ada konfirmasi)
/preview ID  Melihat preview pesan
/search KATA  Mencari pengumuman

Jadwal
/jadwal  Melihat seluruh jadwal
/aturjadwal ID  Mengubah jadwal pengumuman
/aktifkan ID  Mengaktifkan pengumuman
/nonaktifkan ID  Menonaktifkan pengumuman

Grup
/grup  Daftar semua grup yang bisa diakses bot
/grupaktif  Daftar grup yang terdaftar
/daftargrup N  Mendaftarkan grup nomor N
/nondaftargrup N  Mencabut pendaftaran grup N

Lainnya
/id  Menampilkan nomor Anda dan ID grup ini
/status  Status koneksi bot
/help  Menampilkan daftar ini

ID boleh ditulis A1, A001, atau ANN-001 (format lama tetap diterima).
Status /send dan /kirim memakai reaction pada pesan perintah: ⏳ → ✅ / ❌.
/menu  Daftar perintah (versi ringkas).
/vip  Aktivasi VIP lewat private chat (password tidak diketik di grup).
/ask PERTANYAAN  Bertanya ke AI (model gratis).
/models, /free  Daftar model gratis.
/model, /model NOMOR  Lihat/ganti model (ganti: admin).
Daftar grup (/grup, /grupaktif) hanya untuk admin.
Contoh cepat: /set <tempel teks pengumuman> lalu /send A1`

function findId(arg) { return normalizeId(arg) }

function listLine(a) {
  return `${a.id} | ${a.title} | ${dayName(a.weekday)} ${weekName(a.week_of_month)} ${timeName(a.time)} | ${a.is_active ? 'AKTIF' : 'NONAKTIF'}`
}

function listBlock(a, i) {
  const body = String(a.body ?? '').split('\n').map((line) => `   ${line}`).join('\n')
  return [
    `${i + 1}. ${a.id} — ${a.title}`,
    `   Jadwal: ${dayName(a.weekday)} ${weekName(a.week_of_month)} ${timeName(a.time)} | ${a.is_active ? 'AKTIF' : 'NONAKTIF'}`,
    '   Isi pesan:',
    body,
  ].join('\n')
}

async function requireAnnouncement(ctx, arg) {
  const id = findId(arg)
  const row = id ? getAnnouncement(id) : null
  if (!row) {
    await reply(ctx, `Pengumuman dengan ID "${id || '-'}" tidak ditemukan. Ketik /list untuk melihat ID yang tersedia.`)
    return null
  }
  return row
}

async function identityAliases(ctx) {
  const keys = new Set([normalizeJid(ctx.adminJid)])
  try {
    const contact = await ctx.sock?.getContact?.(ctx.adminJid)
    for (const value of [contact?.jid, contact?.lid]) {
      const key = normalizeJid(value)
      if (key) keys.add(key)
    }
  } catch { /* kontak tidak ditemukan; pakai JID asal pesan */ }
  return [...keys].filter(Boolean)
}

async function deletePasswordMessage(ctx) {
  // Baileys/izin grup belum tentu mengizinkan; gagal diabaikan.
  try { await ctx.sock.sendMessage(ctx.jid, { delete: ctx.messageKey }) } catch { /* abaikan */ }
}

async function handlePrivateVipPassword(ctx, text) {
  const session = vipSession.getSession(ctx.adminJid)
  if (!session) {
    logger.info(`VIP session missing or expired: ${normalizeJid(ctx.adminJid)}`)
    await reply(ctx, 'Sesi aktivasi tidak ditemukan atau sudah berakhir. Ketik /vip di chat pribadi untuk memulai lagi.')
    return
  }
  logger.info(`VIP session validated: ${session.key}`)
  if (session.locked) {
    const minutes = Math.ceil((session.lockUntil - Date.now()) / 60000)
    await reply(ctx, `Terlalu banyak percobaan. Coba lagi dalam ${minutes} menit.`)
    return
  }

  const ok = verifyVipPassword(text)
  await deletePasswordMessage(ctx)
  if (ok) {
    // Identitas yang diverifikasi adalah pengirim pesan password di private chat.
    registerVip(ctx.adminJid, ctx.adminJid)
    logger.info(`VIP activation completed: ${normalizeJid(ctx.adminJid)}`)
    vipSession.clearSession(ctx.adminJid)
    await reply(ctx, [
      '✅ VIP ACTIVATED SUCCESSFULLY', '',
      'Akun WhatsApp Anda berhasil terdaftar sebagai VIP.', '',
      'Terima kasih telah menggunakan layanan kami!',
    ].join('\n'))
    return
  }

  const result = vipSession.failAttempt(ctx.adminJid)
  if (result.locked) {
    await reply(ctx, `❌ Password VIP salah.\n\nTerlalu banyak percobaan. Anda dapat mencoba lagi dalam ${Math.ceil(config.vipLockMs / 60000)} menit.`)
  } else {
    await reply(ctx, `❌ Password VIP salah.\nSilakan periksa kembali dan coba lagi. (${result.remaining} percobaan tersisa)`)
  }
}

export async function handleMessage(ctx) {
  const rawText = String(ctx.text || '')
  const text = rawText.trim()
  // Perintah admin diawali '/', perintah generator gambar diawali '.'.
  const first = text.split(/\s+/)[0]
  const isCmd = /^[/][a-z0-9]+/i.test(first) || /^[.][a-z0-9]+/i.test(first)
  const cmd = isCmd ? first.toLowerCase() : null
  const arg = cmd
    ? ['.iqc', '.tqc'].includes(cmd)
      ? rawText.slice(rawText.indexOf(first) + first.length).replace(/^\s+/, '')
      : text.slice(cmd.length).trim()
    : ''

  // Semua orang boleh memakai semua perintah, kecuali daftar grup.
  // Gunakan pengecekan admin terdaftar (bukan ctx.admin yang mengikuti OPEN_ACCESS).
  const registeredAdmin = ctx.isRegisteredAdmin !== undefined ? Boolean(ctx.isRegisteredAdmin) : isRegisteredAdmin(ctx.adminJid)
  if (!registeredAdmin && isCmd && RESTRICTED_COMMANDS.includes(cmd)) {
    logActivity(ctx.adminJid, 'unauthorized_command', text.slice(0, 120), ctx.jid)
    await reply(ctx, 'Daftar grup (/grup dan /grupaktif) hanya dapat dilihat admin terdaftar.')
    return
  }

  const isGroup = ctx.isGroup !== false

  // Chat pribadi hanya dipakai untuk aktivasi VIP; perintah lain tetap di grup.
  if (!isGroup && isCmd && !['/vip', '/cancel'].includes(cmd)) {
    await reply(ctx, 'Perintah ini tersedia di grup WhatsApp. Untuk VIP, ketik /vip di chat pribadi ini.')
    return
  }

  // Password masuk sebagai pesan biasa di chat pribadi saat sesi aktif.
  if (!isGroup && !isCmd && text) {
    await handlePrivateVipPassword(ctx, text)
    return
  }

  const choice = handleChoice(ctx, text)
  if (choice) { await handleQuickChoice(ctx, choice); return }
  if (await handlePdfQuestion(ctx, text)) return

  const flow = getFlow(ctx)
  if (flow && (FLOW_COMMANDS.has(cmd) || !isCmd)) {
    const handled = await handleFlow(ctx, cmd, arg)
    if (handled) return
  }

  if (isCmd) await routeCommand(ctx, cmd, arg)
  // Pesan biasa tanpa sesi aktif diabaikan (bot hanya merespons perintah / alur).
}

async function routeCommand(ctx, cmd, arg) {
  const registeredAdmin = ctx.isRegisteredAdmin !== undefined ? Boolean(ctx.isRegisteredAdmin) : isRegisteredAdmin(ctx.adminJid)
  if (!['/help', '/menu', '/vip'].includes(cmd)) logActivity(ctx.adminJid, `command${cmd}`, arg.slice(0, 120), ctx.jid)

  switch (cmd) {
    case '/vip': {
      const isGroup = ctx.isGroup !== false
      if (isVip(ctx.adminJid)) {
        return reply(ctx, 'Akun Anda sudah terdaftar sebagai VIP.')
      }
      if (isGroup) {
        // Sesi dibuat di grup agar bisa dilanjutkan di private chat. Idempoten:
        // dua pesan /vip bersamaan tidak membuat dua sesi atau mereset attempts.
        vipSession.startSession(ctx.adminJid, await identityAliases(ctx), ctx.jid)
        const botNumber = normalizeJid(ctx.bot?.status?.().botNumber || '')
        const link = botNumber
          ? `https://wa.me/${botNumber}?text=${encodeURIComponent('/vip')}`
          : ''
        return reply(ctx, [
          '🔐 VIP ACTIVATION',
          'Untuk keamanan akun, silakan lanjutkan aktivasi VIP melalui private chat bot.',
          '',
          'Silakan chat bot secara pribadi dan ketik "/vip".',
          link ? `\nTautan: ${link}` : '',
        ].filter(Boolean).join('\n'))
      }
      const session = vipSession.getSession(ctx.adminJid)
      if (session?.locked) {
        const minutes = Math.ceil((session.lockUntil - Date.now()) / 60000)
        return reply(ctx, `Sesi masih terkunci. Coba lagi dalam ${minutes} menit.`)
      }
      if (session) {
        return reply(ctx, 'Sesi aktivasi masih aktif. Masukkan password VIP Anda atau ketik /cancel.')
      }
      vipSession.startSession(ctx.adminJid, await identityAliases(ctx), ctx.jid)
      return reply(ctx, [
        '🔐 VIP ACTIVATION', '',
        'Silakan masukkan password VIP Anda.', '',
        '⏳ Sesi aktivasi berlaku selama 2 menit.',
        '🔒 Password Anda tidak akan ditampilkan kembali.',
      ].join('\n'))
    }

    case '/no': {
      if (!registeredAdmin) {
        return reply(ctx, 'Perintah pencabutan VIP hanya untuk admin terdaftar.')
      }
      const raw = arg.trim()
      if (!/^vip\b/i.test(raw)) return reply(ctx, 'Contoh: /no vip @628123456789')
      const mention = ctx.message?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
      const target = mention || raw.replace(/^vip\s*/i, '').trim()
      if (!target) return reply(ctx, 'Contoh: /no vip @628123456789')
      const number = normalizeJid(target)
      if (!number) return reply(ctx, 'Nomor pengguna tidak valid. Contoh: /no vip @628123456789')
      try {
        if (!isVip(`${number}@s.whatsapp.net`)) {
          return reply(ctx, `Pengguna ${number} tidak memiliki status VIP.`)
        }
        removeVip(`${number}@s.whatsapp.net`)
        return reply(ctx, [
          '✅ *STATUS VIP BERHASIL DICABUT*', '',
          `Pengguna: ${number}`,
          'Status sebelumnya: VIP',
          'Status sekarang: NON-VIP',
        ].join('\n'))
      } catch (err) { return reply(ctx, err.message) }
    }

    case '/cancel': {
      if (ctx.isGroup !== false) return reply(ctx, 'Perintah /cancel hanya untuk sesi di chat pribadi.')
      vipSession.clearSession(ctx.adminJid)
      return reply(ctx, 'Sesi aktivasi VIP dibatalkan.')
    }

    case '.pdf': {
      const target = extractMediaTarget(ctx)
      if (!target || target.type !== 'document') {
        return reply(ctx, 'Kirim file PDF dengan caption `.pdf`, atau reply pesan PDF dengan `.pdf`.')
      }
      const tmp = imageEngine.makeTempDir()
      let media
      let extracted
      try { media = await downloadWaMedia(target, tmp) }
      catch (err) { return reply(ctx, `Gagal mengunduh PDF: ${err.message}`) }
      try {
        extracted = await extractPdfText(media.buffer, {
          maxPages: config.aiPdfMaxPages, maxChars: config.aiPdfMaxChars,
        })
      } catch (err) {
        imageEngine.cleanupTemp(tmp)
        return reply(ctx, `Gagal membaca PDF: ${err.message}`)
      }
      if (!extracted.text.trim()) {
        imageEngine.cleanupTemp(tmp)
        // PDF hasil scan: coba jalur vision model gratis.
        return runImageAnalysis(ctx, {
          buffer: media.buffer,
          mimetype: 'application/pdf',
          question: arg || 'Baca dokumen PDF ini, sebutkan judul/topik dan poin pentingnya.',
        })
      }
      const result = await runPdfAnalysis(ctx, {
        buffer: media.buffer,
        text: extracted.text,
        filename: media.filename,
        question: arg || 'Ringkas dokumen ini dan sebutkan poin pentingnya.',
      })
      imageEngine.cleanupTemp(tmp)
      return result
    }

    case '.img': {
      const target = extractMediaTarget(ctx)
      if (!target || target.type !== 'image') {
        return reply(ctx, 'Kirim gambar dengan caption `.img`, atau reply gambar dengan `.img`.')
      }
      const tmp = imageEngine.makeTempDir()
      try {
        const media = await downloadWaMedia(target, tmp)
        return runImageAnalysis(ctx, {
          buffer: media.buffer,
          mimetype: media.mimetype,
          question: arg || 'Jelaskan isi gambar ini secara ringkas.',
        })
      } catch (err) {
        return reply(ctx, `Gagal memproses gambar: ${err.message}`)
      } finally {
        imageEngine.cleanupTemp(tmp)
      }
    }

    case '.iqc':
    case '.tqc':
    case '.wq':
      return handleQuoteCommand({ ...ctx, cmd, arg })

    case '/menu': {
      const { createContext, buildChoices } = await import('./quickReplies.js')
      createContext('menu', {}, ctx)
      return reply(ctx, buildChoices(buildMenuText({ admin: registeredAdmin }),
        ['📢 Pengumuman', '🤖 AI Assistant', '📄 Dokumen & Gambar']))
    }

    case '/help': return reply(ctx, HELP)

    case '/id':
      return reply(ctx, `Nomor Anda: ${normalizeJid(ctx.adminJid)}\nID grup ini: ${ctx.jid}\nNama grup: ${groupService.get(ctx.jid)?.name || '-'}\n\nKirim nomor Anda ke pemilik bot untuk didaftarkan sebagai admin.`)

    case '/set': {
      if (arg) {
        // Mode cepat: teks yang ditempel langsung disimpan apa adanya.
        const targets = groupService.resolveTargets('ini', ctx.jid)
        const id = createQuickAnnouncement(arg, ctx.adminJid, ctx.jid, targets)
        const preview = arg.length > 160 ? `${arg.slice(0, 160)}…` : arg
        const targetNames = targets.map((jid) => groupService.get(jid)?.name || shortJid(jid)).join(', ') || '-'
        return reply(ctx, `PENGUMUMAN TERSIMPAN (mode cepat)\n\nID: ${id}\nJudul: ${getAnnouncement(id)?.title || '-'}\nIsi: ${preview}\n\nStatus: NONAKTIF (tidak dikirim otomatis)\nGrup tujuan: ${targetNames}\n\nKirim manual: /send ${id}\nJadwalkan: /aturjadwal ${id} lalu /aktifkan ${id}\nLihat semua: /list`)
      }
      setFlow(ctx, { type: 'create', step: 'title', data: { title: '', body: '', category: '', weekday: 0, week: 0, time: '08:00', targets: [], sourceGroup: ctx.jid } })
      return reply(ctx, 'BUAT PENGUMUMAN BARU\n\nKetik judul pengumuman.\n\nContoh: "Pengumuman Kerja Bakti" atau judul lain sesuai kebutuhan.\nKetik /batal kapan saja untuk membatalkan.')
    }

    case '/list': {
      const rows = listAnnouncements({ activeOnly: /aktif/i.test(arg) })
      if (!rows.length) return reply(ctx, 'Belum ada pengumuman. Ketik /set untuk membuat yang pertama.')
      return reply(ctx, `DAFTAR PENGUMUMAN (${rows.length})\n\n${rows.map(listBlock).join('\n\n')}\n\nKetik /detail ID untuk detail lengkap atau /send ID untuk mengirim manual.`)
    }

    case '/detail': {
      const row = await requireAnnouncement(ctx, arg)
      if (!row) return
      return reply(ctx, formatAnnouncementDetail(row, getTargets(row.id), true))
    }

    case '/preview': {
      const row = await requireAnnouncement(ctx, arg)
      if (!row) return
      return reply(ctx, `PREVIEW ${row.id}\n\n${row.body}\n\n--- Informasi (tidak ikut dikirim) ---\nJadwal: ${dayName(getSchedule(row.id)?.weekday)} / ${weekName(getSchedule(row.id)?.week_of_month)} / ${timeName(getSchedule(row.id)?.time)}\nPesan dikirim persis seperti teks di atas.`)
    }

    case '/edit': {
      const row = await requireAnnouncement(ctx, arg)
      if (!row) return
      const started = editService.start(ctx.adminJid, row.id)
      if (!started) return reply(ctx, 'Gagal memulai sesi edit.')
      setFlow(ctx, { type: 'edit', id: row.id, field: null, step: 'select_field' })
      const s = getSchedule(row.id)
      return reply(ctx, `EDIT ${row.id}\n\nJudul: ${row.title}\nIsi: ${String(row.body).slice(0, 80)}${row.body.length > 80 ? '…' : ''}\nJadwal: ${dayName(s?.weekday)} / ${weekName(s?.week_of_month)} / ${timeName(s?.time)}\nGrup tujuan: ${getTargets(row.id).length}\n\nPilih bagian yang ingin diubah:\n${FIELD_ORDER.map((f, i) => `${i + 1}. ${FIELD_LABELS[f]}`).join('\n')}\n\nSetelah selesai ketik /update, lalu /ya untuk menyimpan. /batal membuang perubahan.`)
    }

    case '/update': {
      // Jika sesi edit ada di DB tapi flow hilang (mis. setelah restart).
      if (!getFlow(ctx)) startEditDiffFallback(ctx)
      const handled = await handleFlow(ctx, '/update', '')
      if (!handled) return reply(ctx, '/update ditolak: tidak ada sesi pengeditan aktif. Mulai dengan /edit ID.')
      return
    }

    case '/hapus': {
      const row = await requireAnnouncement(ctx, arg)
      if (!row) return
      setFlow(ctx, { type: 'delete', id: row.id, step: 'confirm' })
      return reply(ctx, `YAKIN MENGHAPUS ${row.id} — ${row.title}?\n\nJadwal dan grup tujuan ikut terhapus. Ketik /ya untuk konfirmasi atau /batal.`)
    }

    case '/kirim':
    case '/send': {
      const row = await requireAnnouncement(ctx, arg)
      if (!row) return
      // Status hanya lewat reaction pada pesan perintah. Detail kegagalan
      // tetap tercatat di delivery_logs, tanpa mengirim pesan status ke grup.
      await withReaction(ctx, () => deliverAnnouncement(ctx.sock, row.id, {
        runDate: null, runTime: null,
      }))
      return
    }

    case '/ask': {
      if (!arg) return reply(ctx, 'Contoh: /ask Apa itu AI Agent?')
      return runAsk(ctx, arg)
    }

    case '/models':
    case '/free': {
      let models
      try { models = await aiService.freeModels({ force: true }) }
      catch (err) { return reply(ctx, err.message || 'Layanan AI sedang tidak tersedia.') }
      if (!models.length) return reply(ctx, 'Layanan AI sedang tidak tersedia: tidak ada model gratis.')
      let current = null
      try { current = await aiService.currentModel() } catch { /* abaikan */ }
      const lines = ['🤖 *DAFTAR MODEL AI GRATIS*', '']
      models.slice(0, 20).forEach((m, i) => lines.push(`${i + 1}. ${m.name} — ${m.id}`))
      lines.push('', `Model aktif: ${current?.name || current?.id || '-'}`)
      return reply(ctx, lines.join('\n'))
    }

    case '/model': {
      let current
      try { current = await aiService.currentModel() }
      catch (err) { return reply(ctx, err.message || 'Layanan AI sedang tidak tersedia.') }
      if (!current) return reply(ctx, 'Layanan AI sedang tidak tersedia: belum ada model gratis.')
      if (!arg) return reply(ctx, aiService.formatModel(current))
      if (!registeredAdmin) return reply(ctx, 'Hanya admin terdaftar yang boleh mengganti model AI.')
      try {
        const model = await aiService.changeModel(arg, ctx.adminJid)
        return reply(ctx, `Model AI berhasil diganti ke ${model.name} (${model.id}). Berlaku untuk pertanyaan berikutnya.`)
      } catch (err) {
        return reply(ctx, err.message || 'Gagal mengganti model AI.')
      }
    }

    case '/search': {
      if (!arg) return reply(ctx, 'Contoh: /search rapat')
      const rows = listAnnouncements({ search: arg })
      if (!rows.length) return reply(ctx, `Tidak ada pengumuman yang cocok dengan "${arg}".`)
      return reply(ctx, `HASIL PENCARIAN "${arg}" (${rows.length})\n\n${rows.map(listLine).join('\n')}`)
    }

    case '/jadwal': {
      const rows = listAnnouncements().filter((a) => a.weekday !== undefined)
      if (!rows.length) return reply(ctx, 'Belum ada jadwal.')
      return reply(ctx, `JADWAL PENGUMUMAN\n\n${rows.map((a) => `${a.id} | ${a.title}\n   ${dayName(a.weekday)} | ${weekName(a.week_of_month)} | ${timeName(a.time)} | ${a.is_active ? 'AKTIF' : 'NONAKTIF'}`).join('\n')}\n\nCatatan: minggu ke-5 dilewati jika hari tersebut tidak ada dalam bulan.`)
    }

    case '/aturjadwal': {
      const row = await requireAnnouncement(ctx, arg)
      if (!row) return
      const s = getSchedule(row.id)
      setFlow(ctx, { type: 'reschedule', id: row.id, step: 'day', data: { weekday: s?.weekday ?? 0, week: s?.week_of_month ?? 0, time: s?.time ?? '08:00' } })
      return reply(ctx, `ATUR JADWAL ${row.id}\nJadwal saat ini: ${dayName(s?.weekday)} / ${weekName(s?.week_of_month)} / ${timeName(s?.time)}\n\nPilih hari baru:\n${DAY_CHOICES}`)
    }

    case '/aktifkan':
    case '/nonaktifkan': {
      const row = await requireAnnouncement(ctx, arg)
      if (!row) return
      const active = cmd === '/aktifkan'
      setActive(row.id, active, ctx.adminJid)
      return reply(ctx, `${row.id} (${row.title}) sekarang ${active ? 'AKTIF' : 'NONAKTIF'}.\n${active ? 'Jadwal akan berjalan kembali.' : 'Jadwal tidak akan mengirim sampai diaktifkan lagi.'}`)
    }

    case '/grup': {
      const groups = groupService.list(false)
      if (!groups.length) return reply(ctx, 'Belum ada grup terdeteksi. Bot perlu masuk ke grup dan terhubung ke WhatsApp.')
      return reply(ctx, `GRUP YANG DAPAT DIAKSES BOT\n\n${groupService.listForDisplay(false)}\n\nGrup tanpa tanda "(belum terdaftar)" bisa dipilih sebagai tujuan pengumuman.`)
    }

    case '/grupaktif': {
      const groups = groupService.list({ registeredOnly: true })
      if (!groups.length) return reply(ctx, 'Belum ada grup terdaftar. Ketik /grup untuk melihat daftar lalu /daftargrup N.')
      return reply(ctx, `GRUP TERDAFTAR (${groups.length})\n\n${groupService.listForDisplay(true)}`)
    }

    case '/daftargrup':
    case '/nondaftargrup': {
      const groups = groupService.list(false)
      const idx = Number(String(arg).trim()) - 1
      const g = groups[idx]
      if (!g) return reply(ctx, `Nomor grup tidak valid. Ketik /grup untuk melihat daftar, lalu ${cmd} N.`)
      const register = cmd === '/daftargrup'
      groupService.setRegistered(g.jid, register)
      return reply(ctx, `${groupLabel(g)} sekarang ${register ? 'TERDAFTAR' : 'TIDAK terdaftar'} sebagai tujuan pengumuman.`)
    }

    case '/status': {
      const s = ctx.bot?.status?.() || { connected: false }
      return reply(ctx, `STATUS BOT\nKoneksi WhatsApp: ${s.connected ? 'TERHUBUNG' : 'TERPUTUS'}\nQR tersedia: ${s.qrAvailable ? 'ya' : 'tidak'}\nPer-coba reconnect: ${s.reconnectAttempts || 0}\nMulai: ${s.startedAt || '-'}`)
    }

    default:
      return reply(ctx, `Perintah "${cmd}" tidak dikenal. Ketik /help untuk daftar perintah.`)
  }
}
