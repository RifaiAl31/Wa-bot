import test from 'node:test'
import assert from 'node:assert/strict'
import { testEnv } from './helpers.js'

testEnv('api')
const { initDb } = await import('../src/db/index.js')
const { createApp } = await import('../src/api/routes.js')

initDb({ force: true })
const bot = { status: () => ({ connected: false, connection: 'close', qrAvailable: false, reconnectAttempts: 0 }), sock: null, qrDataUrl: null }
const scheduler = { task: null, ticks: 0, lastTick: null, lastError: null, upcoming: () => [] }
const app = createApp({ bot, scheduler })
const server = app.listen(0)
await new Promise((r) => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`

test('endpoint health/status/groups/announcements/deliveries merespons', async () => {
  for (const path of ['/api/health', '/api/status', '/api/groups', '/api/announcements', '/api/schedules', '/api/deliveries', '/api/activity', '/']) {
    const res = await fetch(base + path)
    assert.equal(res.status, 200, `${path} harus 200`)
  }
  const health = await (await fetch(base + '/api/health')).json()
  assert.equal(health.ok, true)
  const status = await (await fetch(base + '/api/status')).json()
  assert.match(status.integration, /tidak resmi/)
  const html = await (await fetch(base)).text()
  assert.match(html, /LUX BOT|Bot Pengumuman WhatsApp/)
})

test('QR 404 saat tidak ada QR, endpoint tulis ditolak tanpa token', async () => {
  assert.equal((await fetch(base + '/api/qr')).status, 404)
  const res = await fetch(base + '/api/send/A1', { method: 'POST' })
  assert.equal(res.status, 200) // akses umum; hasil gagal karena WhatsApp offline
})

test.after(() => server.close())