import test from 'node:test'
import assert from 'node:assert/strict'
import { testEnv, GROUP } from './helpers.js'

testEnv('web')
const { initDb, get } = await import('../src/db/index.js')
const { groupService } = await import('../src/services/groups.js')
const { getAnnouncement, getTargets } = await import('../src/services/announcements.js')
const { createApp } = await import('../src/api/routes.js')

initDb({ force: true })
groupService.upsert(GROUP, 'Grup Web', 5)
const bot = { status: () => ({ connected:false, connection:'close', qrAvailable:false, reconnectAttempts:0 }), sock: { isConnected:()=>false }, qrDataUrl:null }
const scheduler = { task:null, ticks:0, lastTick:null, lastError:null, upcoming:()=>[] }
const app = createApp({ bot, scheduler })
const server = app.listen(0)
await new Promise(r => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`

async function req(path, options = {}) {
  const res = await fetch(base + path, {
    ...options,
    headers: { 'Content-Type':'application/json', ...(options.headers||{}) },
  })
  let body = {}
  try { body = await res.json() } catch {}
  return { status:res.status, body }
}

const payload = {
  title: 'Pengumuman Web', body: 'Baris satu\nBaris dua', category:'Kegiatan',
  weekday: 5, week: 2, time: '19.00', targets: [GROUP], is_active: true,
}

test('panel akses umum: status dan halaman langsung bisa diakses', async () => {
  const status = await req('/api/status')
  assert.equal(status.status, 200)
  const auth = await req('/api/auth')
  assert.equal(auth.body.public, true)
  const page = await fetch(base + '/')
  assert.equal(page.status, 200)
})

test('CRUD pengumuman lewat web tanpa login dan tanpa mengubah isi pesan', async () => {
  const created = await req('/api/announcements', { method:'POST', body:JSON.stringify(payload) })
  assert.equal(created.status, 201)
  const id = created.body.id
  assert.equal(getAnnouncement(id).body, payload.body)
  assert.deepEqual(getTargets(id).map(t => t.jid), [GROUP])

  const edited = await req(`/api/announcements/${id}`, {
    method:'PUT', body:JSON.stringify({ ...payload, title:'Judul Web Diubah', body:'Isi baru\nbaris 2', targets:[GROUP], is_active:false }),
  })
  assert.equal(edited.status, 200)
  assert.equal(getAnnouncement(id).title, 'Judul Web Diubah')
  assert.equal(getAnnouncement(id).is_active, 0)

  const active = await req(`/api/announcements/${id}/active`, { method:'POST', body:JSON.stringify({ active:true }) })
  assert.equal(active.status, 200)
  assert.equal(getAnnouncement(id).is_active, 1)

  const list = await req('/api/announcements?search=web')
  assert.equal(list.body.announcements.length, 1)

  const deleted = await req(`/api/announcements/${id}`, { method:'DELETE' })
  assert.equal(deleted.status, 200)
  assert.equal(getAnnouncement(id), undefined)
})

test('import dokumen teks melalui multipart tanpa token', async () => {
  const form = new FormData()
  form.append('file', new Blob(['Assalamu alaikum\n\nIsi dokumen'], { type:'text/plain' }), 'dokumen.txt')
  const res = await fetch(base + '/api/import', { method:'POST', body:form })
  const data = await res.json()
  assert.equal(res.status, 200)
  assert.equal(data.text, 'Assalamu alaikum\n\nIsi dokumen')
  assert.equal(data.meta.extension, '.txt')
})

test('pengiriman manual bisa dipanggil langsung dan tetap mencatat hasil', async () => {
  const created = await req('/api/announcements', { method:'POST', body:JSON.stringify(payload) })
  const res = await req(`/api/send/${created.body.id}`, { method:'POST' })
  assert.equal(res.status, 200)
  assert.equal(res.body.sent, 0) // sengaja offline
  assert.ok(get("SELECT * FROM activity_logs WHERE action='create_announcement'"))
})

test.after(() => server.close())
