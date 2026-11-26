import express from 'express'
import { spawn } from 'node:child_process'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { config } from '../config.js'
import { all, get, setSetting, getDb } from '../db/index.js'
import { groupService } from '../services/groups.js'
import {
  getAnnouncement, getTargets, listAnnouncements, stats,
  createAnnouncement, updateAnnouncement, deleteAnnouncement, setActive,
} from '../services/announcements.js'
import { deliverAnnouncement } from '../services/delivery.js'
import { addAdmin, listAdmins, deactivateAdmin } from '../services/adminAuth.js'
import { extractDocument, allowedExtensions } from '../services/documentService.js'
import {
  requireWrite, requireWeb, requireManage, loginHandler, logoutHandler, authInfo, audit,
} from './auth.js'
import { logger } from '../logger.js'
import { parseDay, parseWeek, parseTime } from '../utils/format.js'
import { aiService } from '../ai/service.js'
import * as modelConfig from '../ai/modelConfig.js'
import { verifyVipPassword, registerVip, listVips, removeVip, setVipExpiry } from '../services/vipService.js'
import * as processManager from '../system/processManager.js'
import * as deployService from '../system/deployService.js'
import * as backupService from '../system/backupService.js'
import { getCurrentWeather } from '../services/weatherService.js'
import { featureService } from '../services/featureService.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase()
    cb(null, ['.pdf', '.docx', '.doc', '.txt', '.md'].includes(ext))
  },
})

function uploadOne(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message })
    if (!req.file) return res.status(400).json({ error: 'Pilih file dulu (field: file).' })
    return next()
  })
}

function validateAnnouncement(body) {
  const title = String(body.title ?? '').trim()
  const text = String(body.body ?? '').trim()
  if (!title) throw new Error('Judul wajib diisi')
  if (!text) throw new Error('Isi pengumuman wajib diisi')
  const weekday = parseDay(body.weekday)
  const week = parseWeek(body.week)
  const time = parseTime(body.time)
  if (weekday === null) throw new Error('Hari tidak valid (0-6 atau nama hari)')
  if (week === null) throw new Error('Minggu tidak valid (0-5)')
  if (!time) throw new Error('Jam tidak valid, contoh 19.00')
  const targets = Array.isArray(body.targets) ? body.targets.filter((jid) => {
    const g = groupService.get(String(jid))
    return g && g.is_registered && g.is_active
  }) : []
  if (!targets.length) throw new Error('Pilih minimal satu grup tujuan yang terdaftar')
  return {
    title, body: text,
    category: String(body.category ?? '').trim() || null,
    weekday, week, time, targets: [...new Set(targets)],
    isActive: body.is_active === undefined ? true : Boolean(body.is_active),
  }
}

export function createApp({ bot, scheduler }) {
  const app = express()
  app.use(express.json({ limit: '2mb' }))

  app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime(), time: new Date().toISOString() }))
  app.get('/api/auth', (req, res) => res.json(authInfo(req)))
  app.post('/api/login', loginHandler)
  app.post('/api/logout', logoutHandler)
  app.use(requireWeb)

  app.get('/api/status', (_req, res) => {
    res.json({
      ...bot.status(),
      scheduler: {
        running: Boolean(scheduler.task), ticks: scheduler.ticks,
        lastTick: scheduler.lastTick, lastError: scheduler.lastError,
      },
      stats: stats(),
      groupSyncError: groupService.lastSyncError,
      integration: 'Baileys (WhatsApp Web tidak resmi, bukan WhatsApp Business API resmi)',
      timezone: config.timezone,
    })
  })

  app.get('/api/whatsapp/status', (_req, res) => res.json(bot.status()))

  app.post('/api/whatsapp/disconnect', async (_req, res) => {
    try { res.json(await bot.disconnect()) }
    catch (err) { res.status(500).json({ error: err.message }) }
  })

  app.post('/api/whatsapp/relink', async (_req, res) => {
    try { res.json(await bot.relink()) }
    catch (err) { res.status(500).json({ error: err.message }) }
  })

  app.get('/api/vip', (_req, res) => res.json({ vips: listVips() }))
  app.get('/api/vip/admin', requireManage, (_req, res) => res.json({ vips: listVips() }))
  app.post('/api/vip/admin', requireManage, (req, res) => {
    try {
      const number = String(req.body?.number || '')
      if (!number) return res.status(400).json({ error: 'Nomor wajib diisi.' })
      registerVip(number, 'web-admin', req.body?.expiresAt || null)
      audit(req, 'vip_admin_add', number)
      return res.status(201).json({ ok: true, number })
    } catch (err) { return res.status(400).json({ error: err.message }) }
  })
  app.put('/api/vip/admin/:number/expiry', requireManage, (req, res) => {
    try {
      const number = decodeURIComponent(req.params.number)
      const expiry = setVipExpiry(number, req.body?.expiresAt || null)
      audit(req, 'vip_admin_expiry', number)
      return res.json({ ok: true, expiresAt: expiry })
    } catch (err) { return res.status(400).json({ error: err.message }) }
  })
  app.delete('/api/vip/admin/:number', requireManage, (req, res) => {
    const number = decodeURIComponent(req.params.number)
    const ok = removeVip(number)
    audit(req, 'vip_admin_remove', number)
    return res.json({ ok, number })
  })

  app.post('/api/vip', (req, res) => {
    if (!verifyVipPassword(req.body?.password)) {
      return res.status(401).json({ error: 'Kata sandi VIP salah atau belum dikonfigurasi.' })
    }
    try {
      const number = registerVip(req.body?.number, 'web')
      return res.status(201).json({ ok: true, number })
    } catch (err) { return res.status(400).json({ error: err.message }) }
  })

  app.get('/api/ai/status', async (_req, res) => {
    try {
      const current = await aiService.currentModel().catch(() => null)
      const stats = get(`SELECT
        (SELECT COUNT(*) FROM ai_usage_logs) AS total,
        (SELECT COUNT(*) FROM ai_usage_logs WHERE status='success') AS success,
        (SELECT COUNT(*) FROM ai_usage_logs WHERE status='failed') AS failed,
        (SELECT COUNT(*) FROM ai_usage_logs WHERE status='blocked') AS blocked`)
      res.json({
        configured: config.aiProvider === 'gemini' ? Boolean(config.geminiApiKey) : Boolean(config.openRouterApiKey),
        activeModelIds: modelConfig.activeModelIds(),
        visionConfigured: Boolean(config.openRouterApiKey || config.geminiApiKey),
        provider: config.aiProvider,
        keyVariable: config.aiProvider === 'gemini' ? 'GEMINI_API_KEY' : '***',
        activeModel: current,
        limits: {
          cooldownSeconds: config.aiCooldownMs / 1000,
          maxPerUser: config.aiMaxPerUser,
          globalMax: config.aiGlobalMax,
          windowMinutes: config.aiWindowMs / 60000,
          maxQuestionChars: config.aiMaxQuestionChars,
          contextMessages: config.aiContextMessages,
        },
        usage: stats,
      })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  app.get('/api/ai/models', async (_req, res) => {
    try { res.json({ models: await aiService.freeModels({ force: true }) }) }
    catch (err) { res.status(400).json({ error: err.message }) }
  })

  app.post('/api/ai/model', async (req, res) => {
    try {
      const kind = ['text', 'vision', 'pdf'].includes(req.body?.kind) ? req.body.kind : 'text'
      const model = await modelConfig.changeModel(kind, req.body.model || req.body.modelId, 'web')
      res.json({ ok: true, kind, model })
    } catch (err) { res.status(400).json({ error: err.message }) }
  })

  app.get('/api/ai/vision/models', async (_req, res) => {
    try {
      res.json({ models: await modelConfig.listModels('vision', { force: true }), active: modelConfig.activeModelIds().vision })
    } catch (err) { res.status(400).json({ error: err.message }) }
  })

  app.post('/api/ai/vision/model', async (req, res) => {
    try {
      const model = await modelConfig.changeModel('vision', req.body.model || req.body.modelId, 'web')
      res.json({ ok: true, model })
    } catch (err) { res.status(400).json({ error: err.message }) }
  })

  app.get('/api/ai/usage', (_req, res) => res.json({
    logs: all('SELECT * FROM ai_usage_logs ORDER BY id DESC LIMIT 100'),
    history: all('SELECT * FROM ai_model_history ORDER BY id DESC LIMIT 30'),
  }))

  app.get('/api/qr', (_req, res) => {
    if (!bot.qrDataUrl) return res.status(404).json({ error: 'QR tidak tersedia. Bot mungkin sudah terhubung.' })
    res.json({ qr: bot.qrDataUrl, pngPath: config.qrPath })
  })

  app.get('/api/groups', (_req, res) => res.json({ groups: groupService.list(false), lastSyncError: groupService.lastSyncError }))
  app.get('/api/announcements', (req, res) => res.json({ announcements: listAnnouncements({ search: req.query.search || '' }) }))
  app.get('/api/announcements/:id', (req, res) => {
    const row = getAnnouncement(req.params.id)
    if (!row) return res.status(404).json({ error: 'Tidak ditemukan' })
    return res.json({
      announcement: row,
      schedule: get('SELECT * FROM schedules WHERE announcement_id=?', row.id) || null,
      targets: getTargets(row.id).map((g) => ({ jid: g.jid, name: g.name })),
    })
  })
  app.get('/api/schedules', (_req, res) => res.json({
    schedules: all(`SELECT s.*, a.title, a.is_active FROM schedules s JOIN announcements a ON a.id=s.announcement_id ORDER BY s.time`),
    upcoming: scheduler.upcoming(10),
  }))
  app.get('/api/deliveries', (req, res) => res.json({
    deliveries: all('SELECT * FROM delivery_logs ORDER BY id DESC LIMIT ?', Number(req.query.limit) || 50),
    runs: all('SELECT * FROM schedule_runs ORDER BY id DESC LIMIT 20'),
  }))
  app.get('/api/activity', (_req, res) => res.json({ activity: all('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 100') }))
  app.get('/api/settings', (_req, res) => res.json({
    settings: all('SELECT * FROM bot_settings'),
    timezone: config.timezone,
    admins: listAdmins(),
    webAccess: 'public',
    allowedUploads: allowedExtensions(),
    maxUploadMb: config.maxUploadMb,
  }))

  // ---- Operasi tulis (panel akses umum) ----
  app.post('/api/announcements', requireWrite, (req, res) => {
    try {
      const v = validateAnnouncement(req.body)
      const id = createAnnouncement({ ...v, targets: v.targets }, 'web', null)
      if (!v.isActive) setActive(id, false, 'web')
      res.status(201).json({ id, announcement: getAnnouncement(id) })
    } catch (err) { res.status(400).json({ error: err.message }) }
  })

  app.put('/api/announcements/:id', requireWrite, (req, res) => {
    try {
      const row = getAnnouncement(req.params.id)
      if (!row) return res.status(404).json({ error: 'Pengumuman tidak ditemukan' })
      const v = validateAnnouncement(req.body)
      updateAnnouncement(row.id, { ...v, targets: v.targets }, 'web')
      setActive(row.id, v.isActive, 'web')
      return res.json({ ok: true, announcement: getAnnouncement(row.id), targets: getTargets(row.id) })
    } catch (err) { return res.status(400).json({ error: err.message }) }
  })

  app.post('/api/announcements/:id/active', requireWrite, (req, res) => {
    const row = getAnnouncement(req.params.id)
    if (!row) return res.status(404).json({ error: 'Pengumuman tidak ditemukan' })
    setActive(row.id, Boolean(req.body.active), 'web')
    return res.json({ ok: true, is_active: Boolean(req.body.active) })
  })

  app.delete('/api/announcements/:id', requireWrite, (req, res) => {
    const row = getAnnouncement(req.params.id)
    if (!row) return res.status(404).json({ error: 'Pengumuman tidak ditemukan' })
    deleteAnnouncement(row.id, 'web')
    res.json({ ok: true })
  })

  app.post('/api/import', requireWrite, uploadOne, async (req, res) => {
    try {
      const result = await extractDocument({
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
      })
      logger.info(`Dokumen diimpor: ${result.meta.filename} (${result.meta.chars} karakter)`)
      res.json({ ok: true, ...result })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  })

  app.put('/api/groups/:jid', requireWrite, (req, res) => {
    const jid = decodeURIComponent(req.params.jid)
    const g = groupService.get(jid)
    if (!g) return res.status(404).json({ error: 'Grup tidak ditemukan' })
    groupService.setRegistered(jid, Boolean(req.body.registered))
    return res.json({ ok: true, group: groupService.get(jid) })
  })

  app.post('/api/admins', requireWrite, (req, res) => {
    try {
      const number = addAdmin(req.body.number, req.body.name || null)
      return res.status(201).json({ ok: true, number })
    } catch (err) { return res.status(400).json({ error: err.message }) }
  })

  app.delete('/api/admins/:number', requireWrite, (req, res) => {
    deactivateAdmin(String(req.params.number).replace(/\D/g, ''))
    return res.json({ ok: true })
  })

  app.post('/api/settings/scheduler', requireWrite, (req, res) => {
    setSetting('scheduler_enabled', req.body.enabled ? '1' : '0')
    return res.json({ ok: true, enabled: Boolean(req.body.enabled) })
  })

  app.post('/api/backup', requireWrite, (_req, res) => {
    try {
      fs.mkdirSync(config.backupDir, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const target = path.join(config.backupDir, `bot-${stamp}.db`)
      getDb().exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
      return res.json({ ok: true, path: target })
    } catch (err) { return res.status(500).json({ error: err.message }) }
  })

  app.post('/api/send/:id', requireWrite, async (req, res) => {
    try {
      const result = await deliverAnnouncement(bot.sock, req.params.id, { runDate: null, runTime: null })
      res.json(result)
    } catch (err) {
      logger.error('API send error:', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  app.get('/api/app/info', (_req, res) => res.json({
    name: 'LUX BOT', author: 'Dev By Rifai', version: config.appVersion,
    timezone: config.timezone, downloader: config.downloaderEnabled,
  }))
  app.get('/api/weather', async (_req, res) => res.json(await getCurrentWeather()))
  app.get('/api/features', requireManage, (_req, res) => res.json({ features: featureService.listFeatures() }))
  app.post('/api/features/:name', requireManage, (req, res) => {
    const name = String(req.params.name || '')
    if (!Object.hasOwn(featureService.FEATURES, name)) return res.status(400).json({ error: 'Fitur tidak dikenal.' })
    try {
      res.json({ ok: true, feature: featureService.setFeature(name, req.body.enabled, req.body.roles) })
    } catch (err) { res.status(400).json({ error: err.message }) }
  })

  // --- SYSTEM / DEPLOYMENT (selalu butuh login admin) ---
  app.get('/api/system/status', requireManage, (_req, res) => {
    res.json({ ...processManager.statusAll(), git: deployService.status() })
  })
  app.post('/api/system/check-update', requireManage, (_req, res) => {
    res.json(deployService.checkUpdate())
  })
  app.post('/api/system/deploy', requireManage, (req, res) => {
    const allowDirty = req.body?.allowDirty === true
    audit(req, 'deploy_requested', allowDirty ? 'allowDirty' : '')
    const result = deployService.deploy({ allowDirty })
    res.json(result)
    if (result.ok && result.status === 'restarting' && process.env.NODE_ENV !== 'test') {
      setTimeout(() => process.exit(0), 500)
    }
  })
  app.post('/api/system/restart-bot', requireManage, (req, res) => {
    audit(req, 'bot_restart', '')
    const result = processManager.scheduleBotRestart()
    res.json(result)
    if (process.env.NODE_ENV !== 'test') setTimeout(() => process.exit(0), 500)
  })
  app.post('/api/system/restart-tunnel', requireManage, (req, res) => {
    audit(req, 'tunnel_restart', '')
    res.json(processManager.restartTunnel())
  })
  app.post('/api/system/rollback', requireManage, (req, res) => {
    const commit = String(req.body?.commit || '').trim() || null
    if (commit && !/^[0-9a-f]{7,40}$/i.test(commit)) return res.status(400).json({ error: 'Commit tidak valid.' })
    audit(req, 'rollback_requested', commit || 'auto')
    try { res.json(deployService.rollback({ commit, allowDirty: req.body?.allowDirty === true })) }
    catch (err) { res.status(400).json({ error: err.message }) }
  })
  app.get('/api/system/history', requireManage, (req, res) => {
    res.json({ history: deployService.history(req.query.limit) })
  })
  app.get('/api/system/backup', requireManage, (req, res) => {
    audit(req, 'backup_created', '')
    try { res.json(backupService.backupNow()) }
    catch (err) { res.status(500).json({ error: err.message }) }
  })
  app.get('/api/system/backups', requireManage, (_req, res) => res.json({ backups: backupService.listBackups() }))
  app.post('/api/system/restore', requireManage, (req, res) => {
    const name = String(req.body?.name || '')
    if (req.body?.confirm !== true) return res.status(400).json({ error: 'Konfirmasi restore diperlukan.' })
    try {
      const source = backupService.restoreBackup(name)
      audit(req, 'restore_requested', name)
      const child = spawn(process.execPath, ['scripts/restore.js', name], {
        cwd: config.root, detached: true, stdio: 'ignore', env: { ...process.env },
      })
      child.unref()
      res.json({ ok: true, source, scheduled: true })
      if (process.env.NODE_ENV !== 'test') setTimeout(() => process.exit(0), 500)
    } catch (err) { res.status(400).json({ error: err.message }) }
  })
  app.get('/api/system/logs', requireManage, (req, res) => {
    try { res.json({ lines: processManager.readLog(req.query.name || 'bot', req.query.lines) }) }
    catch (err) { res.status(400).json({ error: err.message }) }
  })

  const dashDir = path.resolve(config.root, 'dashboard')
  app.use('/assets', express.static(path.join(config.root, 'assets')))
  app.use(express.static(dashDir))
  app.get('/', (_req, res) => res.sendFile(path.join(dashDir, 'index.html')))
  return app
}
