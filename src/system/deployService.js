import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync, spawn } from 'node:child_process'
import { config } from '../config.js'
import { get, run, all } from '../db/index.js'
import { logger } from '../logger.js'
import { scheduleBotRestart } from './processManager.js'

const ROOT = config.root
const DEPLOY_LOG = path.join(ROOT, 'data', 'logs', 'deploy.log')

function log(line) {
  const text = `[${new Date().toISOString()}] ${line}\n`
  fs.mkdirSync(path.dirname(DEPLOY_LOG), { recursive: true })
  fs.appendFileSync(DEPLOY_LOG, text)
  logger.info(line)
}

function exec(command, args, { timeout = 120_000 } = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT, encoding: 'utf8', timeout,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  return {
    ok: result.status === 0,
    status: result.status,
    out: String(result.stdout || '').trim(),
    err: String(result.stderr || '').trim(),
  }
}

function git(args) {
  const allowed = ['status', 'rev-parse', 'fetch', 'pull', 'reset', 'diff', 'remote', 'branch', 'log', 'rev-list']
  if (!allowed.includes(args[0])) throw new Error(`Git command tidak diizinkan: ${args[0]}`)
  if (args.some((a) => /[;&|`$<>]/.test(a))) throw new Error('Argumen git mengandung karakter tidak diizinkan.')
  return exec('git', args)
}

function hashFiles() {
  const out = {}
  for (const file of ['package.json', 'package-lock.json']) {
    const p = path.join(ROOT, file)
    out[file] = fs.existsSync(p) ? crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') : ''
  }
  return out
}

function readHead() { return git(['rev-parse', 'HEAD']).out }

function readRemoteHead() { return git(['rev-parse', `origin/${config.deployBranch}`]).out }

export function commitInfo() {
  const head = readHead()
  const subject = git(['log', '-1', '--format=%s']).out
  return { head, subject }
}

export function status() {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).out
  const current = commitInfo()
  const last = get('SELECT * FROM deployment_history ORDER BY id DESC LIMIT 1')
  return {
    allowedBranch: config.deployBranch,
    branch,
    allowed: branch === config.deployBranch,
    head: current.head,
    subject: current.subject,
    lastDeployment: last || null,
  }
}

export function checkUpdate() {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).out
  if (branch !== config.deployBranch) {
    return { ok: false, error: `Branch aktif ${branch}; deployment hanya dari ${config.deployBranch}.` }
  }
  const fetch = git(['fetch', 'origin', config.deployBranch, '--quiet'])
  if (!fetch.ok) return { ok: false, error: fetch.err || 'Gagal mengambil update dari GitHub.' }
  const local = readHead()
  const remote = readRemoteHead()
  const behind = Number(git(['rev-list', '--count', `${local}..${remote}`]).out || 0)
  return { ok: true, branch, local, remote, behind, upToDate: behind === 0 }
}

function backupDatabase() {
  const result = exec(process.execPath, ['scripts/backup.js'], { timeout: 60_000 })
  if (!result.ok) throw new Error(result.err || 'Backup database gagal.')
  const match = (result.out + result.err).match(/Backup dibuat:\s*(\S+)/)
  return match ? match[1] : null
}

function record({ previousCommit, newCommit, status: state, dependencyChanged, backupPath, health, detail }) {
  const now = new Date().toISOString()
  const info = run(`INSERT INTO deployment_history
    (previous_commit, new_commit, status, dependency_changed, backup_path, health, detail, created_at)
    VALUES (?,?,?,?,?,?,?,?)`,
  previousCommit || null, newCommit || null, state, dependencyChanged ? 1 : 0,
  backupPath || null, health || null, String(detail || '').slice(0, 500), now)
  return info.lastInsertRowid
}

export function history(limit = 30) {
  return all(`SELECT * FROM deployment_history ORDER BY id DESC LIMIT ?`, Math.min(200, Math.max(1, Number(limit) || 30)))
}

function verifySafety(allowDirty) {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).out
  if (branch !== config.deployBranch) throw new Error(`Deployment hanya dari branch ${config.deployBranch} (aktif: ${branch}).`)
  const dirty = git(['status', '--porcelain']).out
  if (dirty && !allowDirty) throw new Error('Working tree tidak bersih. Commit atau simpan perubahan dulu, atau gunakan allowDirty.')
  return dirty
}

export function deploy({ allowDirty = false } = {}) {
  log('Deployment dimulai')
  let previousCommit = readHead()
  let backupPath = null
  let dependencyChanged = false
  try {
    verifySafety(allowDirty)
    const remote = git(['remote', 'get-url', 'origin'])
    if (!remote.ok) throw new Error('Remote origin belum dikonfigurasi.')

    const update = checkUpdate()
    if (!update.ok) throw new Error(update.error)
    if (update.upToDate) {
      const id = record({ previousCommit, newCommit: previousCommit, status: 'noop', detail: 'Sudah sesuai commit terbaru.' })
      log('Tidak ada update')
      return { ok: true, status: 'noop', id, head: previousCommit }
    }

    backupPath = backupDatabase()
    log(`Backup database: ${backupPath || 'tidak ditemukan path'}`)
    const before = hashFiles()

    const pull = git(['pull', '--ff-only', 'origin', config.deployBranch])
    if (!pull.ok) throw new Error(`Git pull gagal: ${pull.err || pull.out}`)
    const newCommit = readHead()

    const after = hashFiles()
    dependencyChanged = before['package.json'] !== after['package.json']
      || before['package-lock.json'] !== after['package-lock.json']

    if (dependencyChanged) {
      log('Dependency berubah — menjalankan npm ci')
      const ci = exec('npm', ['ci', '--no-audit', '--no-fund'], { timeout: 600_000 })
      if (!ci.ok) {
        log(`npm ci gagal: ${ci.err.slice(0, 300)} — mencoba npm install`)
        const install = exec('npm', ['install', '--no-audit', '--no-fund'], { timeout: 600_000 })
        if (!install.ok) throw new Error(`Install dependency gagal: ${install.err.slice(0, 300)}`)
      }
    }

    const migration = exec('npm', ['run', 'migrate'], { timeout: 120_000 })
    if (!migration.ok) throw new Error(`Migrasi gagal: ${migration.err.slice(0, 300)}`)

    const id = record({
      previousCommit, newCommit, status: 'restarting', dependencyChanged,
      backupPath, health: null, detail: update.behind ? `${update.behind} commit diterapkan` : '',
    })
    log(`Source diperbarui ${previousCommit.slice(0, 7)} → ${newCommit.slice(0, 7)}; restart dijadwalkan`)

    scheduleBotRestart()
    const verifier = spawn(process.execPath, [
      'scripts/deploy-verify.js', String(id), String(config.port), String(config.deployHealthTimeoutMs),
    ], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env } })
    verifier.unref()

    return {
      ok: true, status: 'restarting', id, previousCommit, newCommit,
      dependencyChanged, backupPath, verifierStarted: true,
    }
  } catch (err) {
    log(`Deployment gagal: ${err.message}`)
    const id = record({
      previousCommit, newCommit: readHead(), status: 'failed', dependencyChanged,
      backupPath, health: null, detail: err.message,
    })
    return { ok: false, status: 'failed', id, error: err.message, previousCommit, backupPath }
  }
}

export function rollback({ commit = null, allowDirty = false } = {}) {
  let target = commit
  if (!target) {
    const row = get("SELECT previous_commit FROM deployment_history WHERE status IN ('success','restarting','failed') AND previous_commit IS NOT NULL ORDER BY id DESC LIMIT 1")
    target = row?.previous_commit
  }
  if (!target || !/^[0-9a-f]{7,40}$/i.test(target)) throw new Error('Commit rollback tidak valid.')
  if (!allowDirty && git(['status', '--porcelain']).out) throw new Error('Working tree tidak bersih.')
  const result = git(['reset', '--hard', target])
  if (!result.ok) throw new Error(result.err || 'Git reset gagal.')
  log(`Rollback source ke ${target}. Database sengaja tidak disentuh.`)
  return { ok: true, commit: target, databaseRestored: false }
}
