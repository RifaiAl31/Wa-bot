import { initDb, closeDb, run } from '../src/db/index.js'
import { config } from '../src/config.js'

const [idRaw, portRaw, timeoutRaw] = process.argv.slice(2)
const id = Number(idRaw)
const port = Number(portRaw) || config.port
const timeoutMs = Number(timeoutRaw) || config.deployHealthTimeoutMs

if (!id) { console.error('ID deployment tidak valid.'); process.exit(1) }

initDb()
const started = Date.now()
let ok = false
let detail = 'Health check tidak selesai.'

while (Date.now() - started < timeoutMs) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      const body = await res.json()
      if (body?.ok) { ok = true; detail = `Health OK (uptime ${Math.round(body.uptime || 0)}s)`; break }
    }
  } catch { /* proses baru belum siap */ }
  await new Promise((r) => setTimeout(r, 1500))
}

run('UPDATE deployment_history SET status=?, health=?, detail=? WHERE id=?',
  ok ? 'success' : 'failed', detail, detail, id)
if (!ok) console.error('Deployment health check gagal:', detail)
closeDb()
process.exit(ok ? 0 : 1)
