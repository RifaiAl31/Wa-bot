import cron from 'node-cron'
import { all, get, run, getSetting } from '../db/index.js'
import { config } from '../config.js'
import { logger } from '../logger.js'
import { deliverAnnouncement } from './delivery.js'
import { processNgaji } from './ngajiService.js'

const WEEKDAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function jakartaNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(date)
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]))
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour), minute: Number(p.minute),
    weekday: WEEKDAY_MAP[p.weekday] ?? 0,
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
  }
}

// Minggu ke-N = kemunculan ke-N hari tersebut dalam bulan (bukan rentang tanggal).
export function nthWeekday(year, month, weekday, nth) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const day = 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return day <= daysInMonth ? day : null
}

export class Scheduler {
  constructor(getSock) {
    this.getSock = getSock
    this.running = false
    this.task = null
    this.lastTick = null
    this.lastError = null
    this.ticks = 0
  }

  dueSchedules(now) {
    return all(`SELECT s.*, a.title, a.id AS aid FROM schedules s
                JOIN announcements a ON a.id = s.announcement_id
                WHERE a.is_active = 1 AND s.time = ? AND s.weekday = ?`,
      now.time, now.weekday).filter((s) => {
      if (Number(s.week_of_month) === 0) return true
      return nthWeekday(now.year, now.month, Number(s.weekday), Number(s.week_of_month)) === now.day
    })
  }

  claim(schedule, now) {
    const info = run(`INSERT OR IGNORE INTO schedule_runs(announcement_id, run_date, run_time, status, created_at)
                      VALUES (?,?,?,'claimed',?)`,
      schedule.announcement_id, now.date, now.time, new Date().toISOString())
    return info.changes === 1
  }

  async tick(force = false) {
    if (this.running) return { skipped: 'running' }
    this.running = true
    this.ticks += 1
    const now = jakartaNow()
    this.lastTick = { at: new Date().toISOString(), now, processed: 0, skipped: 0, failed: 0 }
    try {
      if (!force && getSetting('scheduler_enabled', '1') !== '1') return this.lastTick
      const sock = this.getSock()
      // Jangan klaim jadwal saat bot offline: run yang tidak terkirim hilang permanen.
      if (!sock || (typeof sock.isConnected === 'function' && !sock.isConnected())) {
        this.lastTick.offline = true
        return this.lastTick
      }
      try {
        const ngajiResult = await processNgaji(sock, now)
        this.lastTick.ngaji = ngajiResult
        if (!ngajiResult.ok && ngajiResult.processed) this.lastTick.failed += 1
      } catch (err) {
        this.lastTick.failed += 1
        this.lastError = `ngaji: ${err.message}`
        logger.error('Scheduler pengajian gagal:', err.message)
      }

      for (const s of this.dueSchedules(now)) {
        try {
          if (!this.claim(s, now)) { this.lastTick.skipped += 1; continue }
          this.lastTick.processed += 1
          const result = await deliverAnnouncement(sock, s.announcement_id, {
            runDate: now.date, runTime: now.time,
          })
          run(`UPDATE schedule_runs SET status = ?, sent_at = ? WHERE announcement_id = ? AND run_date = ? AND run_time = ?`,
            result.ok ? 'sent' : 'failed', new Date().toISOString(),
            s.announcement_id, now.date, now.time)
          if (!result.ok) this.lastTick.failed += 1
        } catch (err) {
          this.lastTick.failed += 1
          this.lastError = `${s.announcement_id}: ${err.message}`
          logger.error(`Scheduler item ${s.announcement_id} gagal:`, err.message)
        }
      }
    } catch (err) {
      this.lastError = err.message
      logger.error('Scheduler tick gagal:', err.message)
    } finally {
      this.running = false
    }
    return this.lastTick
  }

  start() {
    if (this.task) return
    // node-cron memakai TZ Asia/Jakarta; tick tiap menit memeriksa jadwal.
    this.task = cron.schedule('* * * * *', () => { this.tick().catch((e) => logger.error('tick error', e.message)) },
      { timezone: config.timezone })
    logger.info(`Scheduler aktif (${config.timezone})`)
  }

  stop() { if (this.task) { this.task.stop(); this.task = null } }

  upcoming(limit = 5) {
    const rows = all(`SELECT s.*, a.title FROM schedules s JOIN announcements a ON a.id=s.announcement_id
                      WHERE a.is_active=1 ORDER BY a.id LIMIT ?`, limit)
    const now = jakartaNow()
    return rows.map((s) => {
      const nth = Number(s.week_of_month) || null
      let nextDay = now.day
      if (nth) {
        const d = nthWeekday(now.year, now.month, s.weekday, nth)
        if (d !== null && d < now.day) nextDay = null
        else nextDay = d
      } else {
        let diff = (s.weekday - now.weekday + 7) % 7
        if (diff === 0 && s.time <= now.time) diff = 7
        nextDay = now.day + diff
      }
      return { id: s.announcement_id, title: s.title, weekday: s.weekday,
        week: s.week_of_month, time: s.time, nextDate: nextDay, note: nextDay === null ? 'Tidak ada dalam bulan ini' : undefined }
    })
  }
}
