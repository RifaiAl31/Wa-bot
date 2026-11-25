import { get, run, transaction } from '../db/index.js'
import { getAnnouncement, getSchedule, getTargets, updateAnnouncement } from './announcements.js'

export const EDIT_FIELDS = ['title', 'body', 'weekday', 'week', 'time', 'targets']

function snapshot(id) {
  const row = getAnnouncement(id)
  if (!row) return null
  const s = getSchedule(id)
  return {
    title: row.title,
    body: row.body,
    category: row.category || '',
    weekday: s?.weekday ?? 0,
    week: s?.week_of_month ?? 0,
    time: s?.time ?? '08:00',
    targets: getTargets(id).map((g) => g.jid),
  }
}

export const editService = {
  start(adminJid, id) {
    const original = snapshot(id)
    if (!original) return null
    const now = new Date().toISOString()
    run(`INSERT INTO edit_sessions(admin_jid, announcement_id, draft_json, step, field, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(admin_jid) DO UPDATE SET announcement_id=excluded.announcement_id,
           draft_json=excluded.draft_json, step=excluded.step, field=NULL,
           created_at=excluded.created_at, updated_at=excluded.updated_at`,
      adminJid, id, JSON.stringify({ original, draft: { ...original } }), 'select_field', null, now, now)
    return { id, original }
  },

  get(adminJid) {
    const row = get('SELECT * FROM edit_sessions WHERE admin_jid = ?', adminJid)
    if (!row) return null
    return { ...row, payload: JSON.parse(row.draft_json) }
  },

  patch(adminJid, patch) {
    const session = this.get(adminJid)
    if (!session) return null
    const draft = { ...session.payload.draft, ...patch }
    run('UPDATE edit_sessions SET draft_json = ?, step = ?, field = NULL, updated_at = ? WHERE admin_jid = ?',
      JSON.stringify({ original: session.payload.original, draft }), 'select_field',
      new Date().toISOString(), adminJid)
    return draft
  },

  setField(adminJid, field) {
    const session = this.get(adminJid)
    if (!session) return null
    run('UPDATE edit_sessions SET field = ?, updated_at = ? WHERE admin_jid = ?',
      field, new Date().toISOString(), adminJid)
    return session
  },

  setStep(adminJid, step) {
    run('UPDATE edit_sessions SET step = ?, updated_at = ? WHERE admin_jid = ?',
      step, new Date().toISOString(), adminJid)
  },

  diff(adminJid) {
    const session = this.get(adminJid)
    if (!session) return null
    const { original, draft } = session.payload
    const changes = []
    for (const f of EDIT_FIELDS) {
      const a = JSON.stringify(original[f]); const b = JSON.stringify(draft[f])
      if (a !== b) changes.push({ field: f, from: original[f], to: draft[f] })
    }
    return { id: session.announcement_id, changes, draft }
  },

  commit(adminJid) {
    const session = this.get(adminJid)
    if (!session) return null
    const { draft, original } = session.payload
    const id = session.announcement_id
    transaction(() => {
      updateAnnouncement(id, {
        title: draft.title, body: draft.body, category: draft.category,
        weekday: draft.weekday, week: draft.week, time: draft.time, targets: draft.targets,
      }, adminJid)
      run('INSERT INTO activity_logs(admin_jid, action, detail, created_at) VALUES (?,?,?,?)',
        adminJid, 'edit_commit', `${id}: ${EDIT_FIELDS.filter((f) => JSON.stringify(original[f]) !== JSON.stringify(draft[f])).join(',') || 'tanpa perubahan'}`,
        new Date().toISOString())
      run('DELETE FROM edit_sessions WHERE admin_jid = ?', adminJid)
    })()
    return id
  },

  cancel(adminJid) {
    run('DELETE FROM edit_sessions WHERE admin_jid = ?', adminJid)
  },
}
