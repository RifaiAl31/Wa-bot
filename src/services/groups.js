import { all, get, run, logActivity } from '../db/index.js'
import { logger } from '../logger.js'
import { groupLabel, shortJid } from '../utils/format.js'

export const groupService = {
  lastSyncError: null,

  upsert(jid, name = null, participants = 0, options = {}) {
    const count = Array.isArray(participants) ? participants.length : Number(participants) || 0
    const registered = options.registered === false ? 0 : 1
    const now = new Date().toISOString()
    run(`INSERT INTO whatsapp_groups(jid, name, participants, is_registered, is_active, last_seen, created_at, updated_at)
         VALUES (?,?,?,?,1,?,?,?)
         ON CONFLICT(jid) DO UPDATE SET
           name=COALESCE(excluded.name, whatsapp_groups.name),
           participants=excluded.participants,
           last_seen=excluded.last_seen,
           is_active=1,
           updated_at=excluded.updated_at`,
      jid, name || null, count, registered, now, now, now)
    this.lastSyncError = null
  },

  async sync(sock) {
    try {
      const groups = await sock.groupFetchAllParticipating()
      let n = 0
      for (const [jid, meta] of Object.entries(groups || {})) {
        this.upsert(jid, meta.subject || meta.name || shortJid(jid), meta.participants || [], { registered: false })
        n += 1
      }
      logger.info(`Sinkronisasi grup selesai: ${n} grup`)
      this.lastSyncError = null
      return n
    } catch (err) {
      this.lastSyncError = err.message
      logger.error('Gagal sinkronisasi grup:', err.message)
      return 0
    }
  },

  list({ registeredOnly = false } = {}) {
    return all(`SELECT * FROM whatsapp_groups WHERE is_active = 1 ${registeredOnly ? 'AND is_registered = 1' : ''}
                ORDER BY is_registered DESC, name COLLATE NOCASE ASC, jid ASC`)
  },

  get(jid) { return get('SELECT * FROM whatsapp_groups WHERE jid = ?', jid) },

  setRegistered(jid, value) {
    run('UPDATE whatsapp_groups SET is_registered = ?, updated_at = ? WHERE jid = ?',
      value ? 1 : 0, new Date().toISOString(), jid)
  },

  listForDisplay(registeredOnly = false) {
    return this.list({ registeredOnly }).map((g, i) => `${i + 1}. ${groupLabel(g)}  [${shortJid(g.jid)}]${g.is_registered ? '' : ' (belum terdaftar)'}`).join('\n')
  },

  // Menerima nomor urut, JID lengkap, kata "ini", "semua", atau kombinasi dipisah koma.
  resolveTargets(raw, currentGroupJid = null) {
    const text = String(raw ?? '').trim()
    const groups = this.list({ registeredOnly: true })
    if (!text) return []
    const lower = text.toLowerCase()
    if (lower === 'semua' || lower === 'all' || lower === '*') return groups.map((g) => g.jid)
    if ((lower === 'ini' || lower === 'current' || lower === 'di sini') && currentGroupJid) {
      const g = this.get(currentGroupJid)
      if (g && g.is_registered) return [currentGroupJid]
      if (currentGroupJid) {
        this.upsert(currentGroupJid, 'Grup saat ini', 0)
        return [currentGroupJid]
      }
      return []
    }

    const out = []
    for (const part of text.split(/[,; ]+/).map((s) => s.trim()).filter(Boolean)) {
      if (/^\d+$/.test(part)) {
        const idx = Number(part) - 1
        if (groups[idx]) out.push(groups[idx].jid)
      } else if (part.includes('@g.us')) {
        const g = this.get(part)
        if (g) out.push(part)
      }
    }
    return [...new Set(out)]
  },

  logGroupChange(adminJid, action, detail, groupJid = null) {
    logActivity(adminJid, action, detail, groupJid)
  },
}
