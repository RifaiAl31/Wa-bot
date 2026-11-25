import { all, get, run, transaction, logActivity, getDb } from '../db/index.js'
import { logger } from '../logger.js'
import { normalizeJid } from '../config.js'

function nextAnnouncementId() {
  const row = get('SELECT next_value FROM id_counters WHERE category = ?', 'announcement')
  const value = row ? row.next_value : 1
  run('UPDATE id_counters SET next_value = ? WHERE category = ?', value + 1, 'announcement')
  return `A${value}`
}

function saveSchedule(id, weekday, week, time) {
  const now = new Date().toISOString()
  run(`INSERT INTO schedules(announcement_id, weekday, week_of_month, time, timezone, updated_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(announcement_id) DO UPDATE SET
         weekday=excluded.weekday, week_of_month=excluded.week_of_month,
         time=excluded.time, timezone=excluded.timezone, updated_at=excluded.updated_at`,
    id, weekday, week, time, 'Asia/Jakarta', now)
}

function saveTargets(id, jids) {
  run('DELETE FROM announcement_targets WHERE announcement_id = ?', id)
  const stmt = getDb().prepare('INSERT OR IGNORE INTO announcement_targets(announcement_id, group_jid) VALUES (?,?)')
  for (const jid of new Set(jids.filter(Boolean))) stmt.run(id, jid)
}

export function getAnnouncement(id) {
  return get('SELECT * FROM announcements WHERE UPPER(id) = UPPER(?)', String(id || '').trim())
}

export function getSchedule(id) {
  return get('SELECT * FROM schedules WHERE announcement_id = ?', id)
}

export function getTargets(id) {
  return all(`SELECT g.* FROM announcement_targets t
              JOIN whatsapp_groups g ON g.jid = t.group_jid
              WHERE t.announcement_id = ? ORDER BY t.id`, id)
}

export function listAnnouncements({ search = '', activeOnly = false, limit = 100 } = {}) {
  const q = `%${String(search).replace(/[%_]/g, '\\$&')}%`
  return all(`SELECT a.*, s.weekday, s.week_of_month, s.time
    FROM announcements a LEFT JOIN schedules s ON s.announcement_id = a.id
    WHERE (? = '' OR a.title LIKE ? ESCAPE '\\' OR a.body LIKE ? ESCAPE '\\' OR COALESCE(a.category,'') LIKE ? ESCAPE '\\')
      AND (? = 0 OR a.is_active = 1)
    ORDER BY a.id DESC LIMIT ?`, search, q, q, q, activeOnly ? 1 : 0, limit)
}

export function createAnnouncement(data, adminJid = null, groupJid = null) {
  const id = transaction(() => {
    const newId = nextAnnouncementId()
    const now = new Date().toISOString()
    const category = String(data.category || '').trim() || null
    const active = data.active === undefined ? 1 : (data.active ? 1 : 0)
    run(`INSERT INTO announcements(id, title, body, category, is_active, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      newId, data.title, data.body, category, active, normalizeJid(adminJid) || null, now, now)
    if (category) run('INSERT OR IGNORE INTO categories(name, created_at) VALUES (?,?)', category, now)
    saveSchedule(newId, data.weekday, data.week, data.time)
    saveTargets(newId, data.targets || [])
    logActivity(adminJid, 'create_announcement', newId, groupJid)
    return newId
  })()
  logger.info(`Pengumuman dibuat: ${id}`)
  return id
}

// Pembuatan instan: /set <teks> langsung menyimpan isi apa adanya.
// Default NONAKTIF agar tidak terkirim otomatis; kirim manual lewat /send ID.
export function createQuickAnnouncement(body, adminJid = null, groupJid = null, targets = []) {
  const text = String(body ?? '').trim()
  if (!text) throw new Error('Isi pengumuman tidak boleh kosong')
  const title = text.split('\n')
    .map((line) => line.replace(/[*_`~]/g, '').trim())
    .find(Boolean)?.slice(0, 120) || 'Pengumuman'
  return createAnnouncement({
    title, body: text, category: '', weekday: 0, week: 0, time: '08:00',
    targets, active: false,
  }, adminJid, groupJid)
}

export function updateAnnouncement(id, data, adminJid = null) {
  transaction(() => {
    const category = String(data.category || '').trim() || null
    run(`UPDATE announcements SET title=?, body=?, category=?, updated_at=? WHERE id=?`,
      data.title, data.body, category, new Date().toISOString(), id)
    if (category) run('INSERT OR IGNORE INTO categories(name, created_at) VALUES (?,?)', category, new Date().toISOString())
    if (data.weekday !== undefined && data.week !== undefined && data.time !== undefined) {
      saveSchedule(id, data.weekday, data.week, data.time)
    }
    if (Array.isArray(data.targets)) saveTargets(id, data.targets)
    run(`INSERT INTO activity_logs(admin_jid, action, detail, created_at) VALUES (?,?,?,?)`,
      adminJid, 'update_announcement', id, new Date().toISOString())
  })()
  logger.info(`Pengumuman diperbarui: ${id}`)
}

export function deleteAnnouncement(id, adminJid = null) {
  transaction(() => {
    run('DELETE FROM announcements WHERE id = ?', id)
    run('DELETE FROM schedule_runs WHERE announcement_id = ?', id)
    run('DELETE FROM edit_sessions WHERE announcement_id = ?', id)
    logActivity(adminJid, 'delete_announcement', id)
  })()
  logger.info(`Pengumuman dihapus: ${id}`)
}

export function setActive(id, active, adminJid = null) {
  run('UPDATE announcements SET is_active = ?, updated_at = ? WHERE id = ?',
    active ? 1 : 0, new Date().toISOString(), id)
  logActivity(adminJid, active ? 'activate' : 'deactivate', id)
}

export function stats() {
  return {
    announcements: get('SELECT COUNT(*) n FROM announcements').n,
    active: get('SELECT COUNT(*) n FROM announcements WHERE is_active = 1').n,
    groups: get('SELECT COUNT(*) n FROM whatsapp_groups WHERE is_registered = 1 AND is_active = 1').n,
    deliveries: get('SELECT COUNT(*) n FROM delivery_logs').n,
  }
}
