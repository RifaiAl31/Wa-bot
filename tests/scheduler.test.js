import test from 'node:test'
import assert from 'node:assert/strict'
import { testEnv, fakeSock, GROUP } from './helpers.js'

testEnv('scheduler')
const { initDb, getDb } = await import('../src/db/index.js')
const { groupService } = await import('../src/services/groups.js')
const { createAnnouncement, setActive } = await import('../src/services/announcements.js')
const { Scheduler, jakartaNow } = await import('../src/services/scheduler.js')

initDb({ force: true })
groupService.upsert(GROUP, 'Grup Uji', 3)
const now = jakartaNow()
const id = createAnnouncement({ title: 'Tes Jadwal', body: 'Pesan otomatis', weekday: now.weekday, week: 0, time: now.time, targets: [GROUP] })

test('scheduler mengirim tepat sekali dan mencatat pengiriman', async () => {
  const sock = fakeSock()
  const scheduler = new Scheduler(() => sock)
  const first = await scheduler.tick()
  assert.equal(first.processed, 1)
  assert.equal(sock.sent.length, 1)
  assert.equal(sock.sent[0].text, 'Pesan otomatis')
  assert.equal(getDb().prepare('SELECT status FROM schedule_runs').get().status, 'sent')
  assert.equal(getDb().prepare('SELECT COUNT(*) n FROM delivery_logs').get().n, 1)

  await scheduler.tick()
  assert.equal(sock.sent.length, 1, 'tidak boleh mengirim dua kali')
  assert.equal(getDb().prepare('SELECT COUNT(*) n FROM delivery_logs').get().n, 1)
})

test('offline: tidak klaim jadwal agar tidak hilang', async () => {
  const id2 = createAnnouncement({ title: 'Tes Offline', body: 'Offline', weekday: now.weekday, week: 0, time: now.time, targets: [GROUP] })
  const offlineSock = { isConnected: () => false }
  const scheduler = new Scheduler(() => offlineSock)
  const result = await scheduler.tick()
  assert.equal(result.offline, true)
  assert.equal(getDb().prepare('SELECT COUNT(*) n FROM schedule_runs WHERE announcement_id=?').get(id2).n, 0)
  setActive(id2, false)
})

test('minggu ke-5 tidak ada → tidak due', () => {
  const scheduler = new Scheduler(() => null)
  // 24 November 2026 = Selasa (weekday 2), jam 07:30 WIB
  const fakeNow = { year: 2026, month: 2, day: 24, weekday: 2, time: '07:30' }
  assert.equal(scheduler.dueSchedules(fakeNow).filter((s) => s.announcement_id === id).length, 0)
})

test('nthWeekday dihitung dari kemunculan hari', async () => {
  const { nthWeekday } = await import('../src/services/scheduler.js')
  assert.equal(nthWeekday(2026, 11, 2, 4), 24) // Selasa ke-4 November 2026 = 24
})
