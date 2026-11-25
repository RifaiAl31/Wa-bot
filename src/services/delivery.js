import { run } from '../db/index.js'
import { config } from '../config.js'
import { logger } from '../logger.js'
import { getAnnouncement, getTargets } from './announcements.js'
import { rememberMessageId } from '../whatsapp/sentCache.js'
import { shortJid } from '../utils/format.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function sendWithRetry(sock, jid, text) {
  let lastError = null
  const attempts = config.retryLimit + 1
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await sock.sendMessage(jid, { text })
      rememberMessageId(result?.key?.id)
      return { ok: true, messageId: result?.key?.id || null, attempts }
    } catch (err) {
      lastError = err
      logger.warn(`Gagal kirim ke ${shortJid(jid)} (percobaan ${attempt}/${attempts}): ${err.message}`)
      if (attempt < attempts) await sleep(config.retryDelayMs * attempt)
    }
  }
  return { ok: false, reason: lastError?.message || String(lastError), attempts }
}

export async function deliverAnnouncement(sock, announcementId, meta = {}) {
  const announcement = getAnnouncement(announcementId)
  if (!announcement) return { ok: false, error: 'Pengumuman tidak ditemukan', results: [] }
  const targets = getTargets(announcementId)
  if (!targets.length) return { ok: false, error: 'Pengumuman belum memiliki grup tujuan', results: [] }

  const offline = !sock || (typeof sock.isConnected === 'function' && !sock.isConnected())
  const results = []
  for (const group of targets) {
    let outcome
    if (offline) {
      outcome = { ok: false, reason: 'WhatsApp belum terhubung', attempts: 0 }
    } else {
      // Isi pesan dikirim apa adanya. Tidak ada judul/format tambahan.
      outcome = await sendWithRetry(sock, group.jid, announcement.body)
    }
    run(`INSERT INTO delivery_logs(announcement_id, group_jid, status, reason, run_date, run_time, message_id, sent_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      announcementId, group.jid, outcome.ok ? 'sent' : 'failed',
      outcome.ok ? null : outcome.reason, meta.runDate || null, meta.runTime || null,
      outcome.messageId || null, new Date().toISOString())
    results.push({ jid: group.jid, name: group.name, ...outcome })
  }
  const sent = results.filter((r) => r.ok).length
  logger.info(`Pengiriman ${announcementId}: ${sent}/${results.length} berhasil`)
  const allOk = results.length > 0 && sent === results.length
  return { ok: sent > 0, allOk, results, sent, total: results.length, failed: results.length - sent }
}

export async function sendText(sock, jid, text) {
  if (!sock || (typeof sock.isConnected === 'function' && !sock.isConnected())) {
    return { ok: false, reason: 'WhatsApp belum terhubung' }
  }
  try {
    const result = await sock.sendMessage(jid, { text })
    rememberMessageId(result?.key?.id)
    return { ok: true, messageId: result?.key?.id || null }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}
