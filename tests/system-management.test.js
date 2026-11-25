import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { testEnv } from './helpers.js'

testEnv('system-management')
const { initDb, closeDb, get } = await import('../src/db/index.js')
const { createApp } = await import('../src/api/routes.js')
const auth = await import('../src/api/auth.js')
const backupService = await import('../src/system/backupService.js')
const deployService = await import('../src/system/deployService.js')
const pm = await import('../src/system/processManager.js')

initDb({ force: true })
const PASSWORD = 'AdminRahasia123'
const app = createApp({
  bot: { status: () => ({ connected:true, connection:'open', qrAvailable:false, reconnectAttempts:0, relinkState:{ status:'idle' } }), sock:null, qrDataUrl:null },
  scheduler: { task:null, ticks:0, lastTick:null, lastError:null, upcoming:()=>[] },
})
const server = app.listen(0)
await new Promise((r) => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`

function cookieValue(headers, name) {
  const list = headers.getSetCookie ? headers.getSetCookie() : [String(headers.get('set-cookie') || '')]
  const hit = list.find((c) => c.startsWith(`${name}=`))
  return hit ? decodeURIComponent(hit.split(';')[0].split('=').slice(1).join('=')) : null
}

test('management endpoint tertutup sebelum password di-set', async () => {
  const res = await fetch(base + '/api/system/status')
  assert.equal(res.status, 503)
  const body = await res.json()
  assert.match(body.error, /set-admin-password/)
})

test('password di-hash, tidak tersimpan plaintext', () => {
  auth.setAdminPassword(PASSWORD)
  const raw = get("SELECT value FROM bot_settings WHERE key='admin_password_hash'").value
  assert.match(raw, /^scrypt\$/)
  assert.doesNotMatch(raw, new RegExp(PASSWORD))
})

test('login salah ditolak, login benar membuat sesi dan CSRF', async () => {
  const bad = await fetch(base + '/api/login', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ password:'salah' }) })
  assert.equal(bad.status, 401)
  const ok = await fetch(base + '/api/login', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ password:PASSWORD }) })
  assert.equal(ok.status, 200)
  const body = await ok.json()
  const session = cookieValue(ok.headers, 'wa_admin')
  const csrf = cookieValue(ok.headers, 'wa_csrf')
  assert.ok(session)
  assert.equal(csrf, body.csrf)
  assert.doesNotMatch(JSON.stringify(body), new RegExp(PASSWORD))
})

test('akses management butuh sesi dan CSRF untuk POST', async () => {
  const unauth = await fetch(base + '/api/system/status')
  assert.equal(unauth.status, 401)
  const login = await fetch(base + '/api/login', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ password:PASSWORD }) })
  const cookie = [
    `wa_admin=${cookieValue(login.headers, 'wa_admin')}`,
    `wa_csrf=${cookieValue(login.headers, 'wa_csrf')}`,
  ].join('; ')
  const ok = await fetch(base + '/api/system/status', { headers:{ Cookie:cookie } })
  assert.equal(ok.status, 200)
  const body = await ok.json()
  assert.ok(body.git)
  assert.ok(body.node)

  const noCsrf = await fetch(base + '/api/system/check-update', { method:'POST', headers:{ Cookie:cookie, 'Content-Type':'application/json' }, body:'{}' })
  assert.equal(noCsrf.status, 403)
})

test('backup database dan konfigurasi tidak masuk repository', () => {
  const result = backupService.backupNow()
  assert.ok(result.dbPath)
  assert.ok(result.configPath)
  assert.equal(fs.existsSync(result.configPath), true)
  assert.match(result.configPath, /data\/backups/)
  assert.ok(backupService.listBackups().length >= 2)
  assert.throws(() => backupService.restoreBackup('../.env'), /tidak valid/)
})

test('deploy service menolak commit rollback tidak valid', () => {
  assert.throws(() => deployService.rollback({ commit:'bad;rm -rf /' }), /tidak valid/)
  const status = deployService.status()
  assert.ok(['main', 'master'].includes(status.branch))
  assert.equal(status.allowedBranch, 'main')
})

test('process manager melaporkan status tanpa menjalankan perintah berbahaya', () => {
  const s = pm.statusAll()
  assert.ok(s.dashboard.url.startsWith('http://127.0.0.1:'))
  assert.ok(s.node.startsWith('v'))
  assert.throws(() => pm.readLog('../../etc/passwd'), /tidak dikenal/)
})

test.after(() => { server.close(); closeDb() })
