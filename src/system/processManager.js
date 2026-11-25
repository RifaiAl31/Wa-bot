import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { config } from '../config.js'
import { logger } from '../logger.js'

const runDir = path.join(config.root, 'data', 'run')
const logDir = path.join(config.root, 'data', 'logs')
const BOT_PID = path.join(runDir, 'bot.pid')
const TUNNEL_PID = path.join(runDir, 'tunnel.pid')

function ensureDirs() {
  fs.mkdirSync(runDir, { recursive: true })
  fs.mkdirSync(logDir, { recursive: true })
}

function alive(pid) {
  if (!pid || !Number.isInteger(pid) || pid <= 1) return false
  try { process.kill(pid, 0); return true } catch (err) { return err.code === 'EPERM' }
}

function readPid(file) {
  try { return Number(fs.readFileSync(file, 'utf8').trim()) || null } catch { return null }
}

function writePid(file, pid) { ensureDirs(); fs.writeFileSync(file, String(pid)) }
function clearPid(file) { try { fs.unlinkSync(file) } catch { /* sudah hilang */ } }

function stopPid(pid, file) {
  if (!pid || !alive(pid)) { clearPid(file); return false }
  try { process.kill(pid, 'SIGTERM') } catch { /* sudah mati */ }
  let stopped = false
  for (let i = 0; i < 20; i += 1) {
    if (!alive(pid)) { stopped = true; break }
    const sleep = new Int32Array(new SharedArrayBuffer(4))
    Atomics.wait(sleep, 0, 0, 100)
  }
  if (!stopped) { try { process.kill(pid, 'SIGKILL') } catch { /* sudah mati */ } }
  clearPid(file)
  return true
}

export function botPids() {
  const pids = new Set()
  const fromRun = readPid(BOT_PID)
  if (fromRun) pids.add(fromRun)
  try {
    for (const file of fs.readdirSync(config.root + '/data')) {
      if (!/^bot-[a-f0-9]+\.pid$/.test(file)) continue
      const pid = readPid(path.join(config.root, 'data', file))
      if (pid) pids.add(pid)
    }
  } catch { /* tidak ada lock */ }
  return [...pids].filter(alive)
}

function launch(name, file, command, args) {
  ensureDirs()
  const existing = readPid(file)
  if (existing && alive(existing)) return { ok: false, error: `${name} sudah berjalan (PID ${existing}).`, pid: existing }
  const probe = spawnSync(command, ['--version'], { cwd: config.root, timeout: 8000, encoding: 'utf8' })
  if (probe.error?.code === 'ENOENT') {
    return { ok: false, error: `${command} tidak ditemukan. Install cloudflared atau sesuaikan TUNNEL_COMMAND.` }
  }
  const out = fs.openSync(path.join(logDir, `${name}.log`), 'a')
  const err = fs.openSync(path.join(logDir, `${name}.error.log`), 'a')
  const child = spawn(command, args, {
    cwd: config.root,
    env: { ...process.env },
    detached: true,
    stdio: ['ignore', out, err],
  })
  child.on('error', (e) => logger.error(`Gagal menjalankan ${name}:`, e.message))
  child.unref()
  fs.closeSync(out); fs.closeSync(err)
  if (!child.pid) return { ok: false, error: `Gagal menjalankan ${name}.` }
  writePid(file, child.pid)
  logger.info(`${name} dimulai (PID ${child.pid})`)
  return { ok: true, pid: child.pid }
}

export function startBot() {
  return launch('bot', BOT_PID, process.execPath, [path.join(config.root, 'src', 'index.js')])
}

export function stopBot() {
  const pids = botPids()
  for (const pid of pids) stopPid(pid, BOT_PID)
  for (const file of fs.existsSync(path.join(config.root, 'data')) ? fs.readdirSync(path.join(config.root, 'data')) : []) {
    if (/^bot-[a-f0-9]+\.pid$/.test(file)) {
      const pid = readPid(path.join(config.root, 'data', file))
      if (pid && !alive(pid)) clearPid(path.join(config.root, 'data', file))
    }
  }
  return { ok: true, stopped: pids.length }
}

function tunnelArgs() {
  if (config.tunnelCommand) {
    const parts = config.tunnelCommand.split(/\s+/).filter(Boolean)
    if (parts.some((p) => /[;&|`$<>]/.test(p))) throw new Error('TUNNEL_COMMAND mengandung karakter shell yang tidak diizinkan.')
    return parts
  }
  if (config.tunnelName) return ['tunnel', 'run', config.tunnelName]
  return ['tunnel', '--url', `http://127.0.0.1:${config.tunnelPort}`]
}

export function startTunnel() {
  if (readPid(TUNNEL_PID) && alive(readPid(TUNNEL_PID))) {
    return { ok: false, error: 'Tunnel sudah berjalan.', pid: readPid(TUNNEL_PID) }
  }
  return launch('tunnel', TUNNEL_PID, 'cloudflared', tunnelArgs())
}

export function stopTunnel() {
  const pid = readPid(TUNNEL_PID)
  const stopped = stopPid(pid, TUNNEL_PID)
  return { ok: true, stopped }
}

export function restartTunnel() {
  stopTunnel()
  return startTunnel()
}

// Dipanggil dari dalam proses bot: spawned child menunggu proses lama keluar,
// sehingga single-instance lock dilepas dulu sebelum proses baru dimulai.
export function scheduleBotRestart(delayMs = 2000) {
  const script = `sleep ${Math.max(1, Math.round(delayMs / 1000))}; cd "${config.root}"; exec "${process.execPath}" src/index.js`
  const out = fs.openSync(path.join(logDir, 'bot.log'), 'a')
  const child = spawn('/bin/sh', ['-c', script], { detached: true, stdio: ['ignore', out, out] })
  child.unref()
  fs.closeSync(out)
  logger.info(`Restart bot dijadwalkan (PID ${child.pid})`)
  return { ok: true, scheduled: true }
}

export function tunnelUrl() {
  const file = path.join(logDir, 'tunnel.log')
  try {
    const text = fs.readFileSync(file, 'utf8')
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)
      || (config.tunnelName ? text.match(/https:\/\/[^\s]+\.trycloudflare\.com/i) : null)
    return match ? match[0] : null
  } catch { return null }
}

export function statusAll() {
  const botRunning = botPids().length > 0 || (process.env.SKIP_WHATSAPP !== '1' && Boolean(process.pid))
  const tunnelPid = readPid(TUNNEL_PID)
  return {
    bot: { running: botPids().length > 0, pids: botPids() },
    dashboard: { running: botRunning, port: config.port, url: `http://127.0.0.1:${config.port}` },
    tunnel: { running: Boolean(tunnelPid && alive(tunnelPid)), pid: tunnelPid || null, url: tunnelUrl() },
    uptimeSeconds: Math.round(process.uptime()),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  }
}

export function readLog(name, lines = 200) {
  const allowed = ['bot', 'tunnel', 'deploy', 'bot.error', 'tunnel.error']
  if (!allowed.includes(name)) throw new Error('Nama log tidak dikenal.')
  const file = path.join(logDir, `${name}.log`)
  try {
    const text = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
    return text.slice(-Math.min(500, Math.max(1, Number(lines) || 200)))
  } catch { return [] }
}

export function logFilePath(name) {
  const allowed = ['bot', 'tunnel', 'deploy', 'bot.error', 'tunnel.error']
  if (!allowed.includes(name)) throw new Error('Nama log tidak dikenal.')
  return path.join(logDir, `${name}.log`)
}
