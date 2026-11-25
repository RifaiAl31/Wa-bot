import test from 'node:test'
import assert from 'node:assert/strict'
import { testEnv, GROUP } from './helpers.js'

testEnv('migration')
const { initDb, getDb, get } = await import('../src/db/index.js')
const { migrateAnnouncementIds } = await import('../src/db/migrateIds.js')
import { createAnnouncement, getAnnouncement } from '../src/services/announcements.js'
import { groupService } from '../src/services/groups.js'

initDb({ force: true })
groupService.upsert(GROUP, 'Grup Migrasi', 3)

test('migrasi ANN-001 → A1 memperbarui semua referensi tanpa menghapus data', () => {
  const db = getDb()
  db.prepare(`INSERT INTO announcements(id,title,body,category,is_active,created_at,updated_at)
              VALUES ('ANN-001','Judul Lama','Isi lama','Kas',1,datetime('now'),datetime('now'))`).run()
  db.prepare("INSERT INTO schedules(announcement_id,weekday,week_of_month,time,updated_at) VALUES ('ANN-001',5,2,'19:00',datetime('now'))").run()
  db.prepare("INSERT INTO announcement_targets(announcement_id,group_jid) VALUES ('ANN-001',?)").run(GROUP)
  db.prepare("INSERT INTO delivery_logs(announcement_id,group_jid,status,sent_at) VALUES ('ANN-001',?,'sent',datetime('now'))").run(GROUP)
  db.prepare("INSERT INTO edit_sessions(admin_jid,announcement_id,draft_json,created_at,updated_at) VALUES ('6281@s.whatsapp.net','ANN-001','{}',datetime('now'),datetime('now'))").run()
  db.prepare("INSERT INTO activity_logs(admin_jid,action,detail,created_at) VALUES ('6281','create_announcement','ANN-001',datetime('now'))").run()
  db.prepare("UPDATE id_counters SET next_value=2 WHERE category='announcement'").run()

  const result = migrateAnnouncementIds({ makeBackup: false })
  assert.equal(result.migrated, 1)
  assert.ok(getAnnouncement('A1'))
  assert.equal(getAnnouncement('ANN-001'), undefined)
  assert.equal(get("SELECT * FROM schedules WHERE announcement_id='A1'") !== undefined, true)
  assert.equal(get("SELECT * FROM announcement_targets WHERE announcement_id='A1'") !== undefined, true)
  assert.equal(get("SELECT * FROM delivery_logs WHERE announcement_id='A1'") !== undefined, true)
  assert.equal(get("SELECT * FROM edit_sessions WHERE announcement_id='A1'") !== undefined, true)
  assert.equal(get("SELECT detail FROM activity_logs WHERE detail='A1'") !== undefined, true)
  assert.deepEqual(db.pragma('foreign_key_check'), [])

  const next = createAnnouncement({ title:'Baru', body:'Isi', weekday:0, week:0, time:'08:00', targets:[GROUP] })
  assert.equal(next, 'A2')
  assert.equal(migrateAnnouncementIds({ makeBackup: false }).migrated, 0, 'idempoten')
})

test('konflik ID: ANN-005 tidak menimpa A1 yang sudah ada', () => {
  const db = getDb()
  db.prepare(`INSERT INTO announcements(id,title,body,is_active,created_at,updated_at)
              VALUES ('ANN-005','Lima','Isi',1,datetime('now'),datetime('now'))`).run()
  const result = migrateAnnouncementIds({ makeBackup: false })
  assert.equal(result.migrated, 1)
  assert.ok(getAnnouncement('A1'))
  assert.ok(getAnnouncement('A5'))
})
