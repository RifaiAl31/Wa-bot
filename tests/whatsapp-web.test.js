import test from 'node:test'
import assert from 'node:assert/strict'
import { testEnv, GROUP } from './helpers.js'

testEnv('whatsapp-web')
const { initDb, all } = await import('../src/db/index.js')
const { groupService } = await import('../src/services/groups.js')
const { createAnnouncement } = await import('../src/services/announcements.js')
const { createApp } = await import('../src/api/routes.js')

initDb({ force: true })
groupService.upsert(GROUP, 'Grup Uji', 3)
createAnnouncement({ title: 'Aman', body: 'Data tetap', weekday: 0, week: 0, time: '08:00', targets: [GROUP] })

const bot = {
  sock: null,
  qrDataUrl: null,
  calls: [],
  status() {
    return {
      connection: 'open', connected: true, botNumber: '6281234567890',
      relinkState: { status: 'idle', message: '' }, offline: false,
    }
  },
  async relink() {
    this.calls.push('relink')
    return { status: 'waiting_qr', message: 'Pindai QR', archivedPath: 'data/auth-archive/2026' }
  },
  async disconnect() {
    this.calls.push('disconnect')
    return { status: 'disconnected', archivedPath: 'data/auth-archive/2026' }
  },
}
const scheduler = { task:null, ticks:0, lastTick:null, lastError:null, upcoming:()=>[] }
const app = createApp({ bot, scheduler })
const server = app.listen(0)
await new Promise(r => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`

async function post(path) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type':'application/json' } })
  return { status: res.status, body: await res.json() }
}

test('status menampilkan nomor bot dan status koneksi', async () => {
  const res = await fetch(base + '/api/whatsapp/status')
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.equal(body.botNumber, '6281234567890')
  assert.equal(body.connected, true)
})

test('ganti nomor dan putuskan koneksi tidak menyentuh database', async () => {
  const before = {
    announcements: all('SELECT COUNT(*) n FROM announcements').n,
    schedules: all('SELECT COUNT(*) n FROM schedules').n,
    deliveries: all('SELECT COUNT(*) n FROM delivery_logs').n,
    admins: all('SELECT COUNT(*) n FROM admins').n,
  }
  const relink = await post('/api/whatsapp/relink')
  assert.equal(relink.status, 200)
  assert.equal(relink.body.status, 'waiting_qr')
  const disconnect = await post('/api/whatsapp/disconnect')
  assert.equal(disconnect.status, 200)
  assert.equal(disconnect.body.status, 'disconnected')
  assert.deepEqual(bot.calls, ['relink', 'disconnect'])
  assert.equal(all('SELECT COUNT(*) n FROM announcements').n, before.announcements)
  assert.equal(all('SELECT COUNT(*) n FROM schedules').n, before.schedules)
  assert.equal(all('SELECT COUNT(*) n FROM delivery_logs').n, before.deliveries)
  assert.equal(all('SELECT COUNT(*) n FROM admins').n, before.admins)
})

test('halaman dashboard/menu tetap bisa diakses', async () => {
  assert.equal((await fetch(base + '/')).status, 200)
  assert.equal((await fetch(base + '/app.js')).status, 200)
  assert.equal((await fetch(base + '/style.css')).status, 200)
})

test.after(() => server.close())
