import fs from 'node:fs'
import path from 'node:path'
import {
  makeWASocket, useMultiFileAuthState, DisconnectReason,
  Browsers, fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import QRCode from 'qrcode'
import { config, normalizeJid } from '../config.js'
import { logger } from '../logger.js'
import { isAdmin, isRegisteredAdmin } from '../services/adminAuth.js'
import { groupService } from '../services/groups.js'
import { isOwnMessage } from './sentCache.js'
import { shouldProcessMessage } from './messageDedupe.js'

function messageAgeMs(msg) {
  const raw = Number(msg?.messageTimestamp || 0)
  if (!raw || Number.isNaN(raw)) return Infinity
  const sent = raw > 1e12 ? raw : raw * 1000
  return Date.now() - sent
}

export class WhatsAppBot {
  constructor({ onMessage } = {}) {
    this.onMessage = onMessage || (() => {})
    this.sock = null
    this.connection = 'close'
    this.qrDataUrl = null
    this.qrText = null
    this.reconnectAttempts = 0
    this.reconnecting = false
    this.lastDisconnect = null
    this.startedAt = null
    this.botNumber = null
    this.relinking = false
    this.connecting = false
    this.connectPromise = null
    this._eventHandlers = null
    this.reconnectBlocked = false
    this.messageStats = { received: 0, processed: 0, skipped: 0 }
    this.relinkState = { status: 'idle', message: '', startedAt: null, archivedPath: null, error: null }
  }

  _setRelinkState(patch) {
    this.relinkState = { ...this.relinkState, ...patch }
    return this.relinkState
  }

  // Arsipkan sesi lama ke folder berbeda. Database pengumuman tidak disentuh.
  archiveAuth() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const archiveDir = path.join(config.root, 'data', 'auth-archive', stamp)
    if (fs.existsSync(config.authDir)) {
      fs.mkdirSync(path.dirname(archiveDir), { recursive: true })
      fs.cpSync(config.authDir, archiveDir, { recursive: true, force: true })
    }
    return archiveDir
  }

  clearAuth() {
    fs.mkdirSync(config.authDir, { recursive: true })
    for (const file of fs.readdirSync(config.authDir)) {
      const target = path.join(config.authDir, file)
      if (fs.statSync(target).isDirectory()) fs.rmSync(target, { recursive: true, force: true })
      else fs.unlinkSync(target)
    }
  }

  // Kompatibilitas: arsip + hapus dalam satu langkah (dipakai caller lama).
  archiveAndClearAuth() {
    const archiveDir = this.archiveAuth()
    this.clearAuth()
    return archiveDir
  }

  detachListeners(socket = this.sock) {
    const current = socket
    if (!current?.ev?.removeListener || !this._eventHandlers) return
    for (const [event, handler] of Object.entries(this._eventHandlers)) {
      try { current.ev.removeListener(event, handler) } catch { /* socket sudah mati */ }
    }
    this._eventHandlers = null
  }

  // Tutup socket lama tanpa logout. Dipakai sebelum reconnect agar tidak ada
  // dua socket yang membaca/menulis credentials yang sama (penyebab Bad MAC).
  retireCurrentSocket(reason = 'BOT_RECONNECT') {
    const current = this.sock
    this.sock = null
    this.detachListeners(current)
    if (!current) return null
    try { current.end?.(new Error(reason)) } catch { /* sudah mati */ }
    return current
  }

  async endCurrentSocket() {
    const current = this.retireCurrentSocket('BOT_ACCOUNT_SWITCH')
    if (!current) return
    try { await current.logout?.() } catch { /* sudah terputus */ }
  }

  // Putuskan akun lama tanpa langsung membuat QR baru.
  async disconnect() {
    if (this.relinking) throw new Error('Proses penggantian nomor sedang berjalan.')
    this.relinking = true
    const archivedPath = this.archiveAuth()
    await this.endCurrentSocket()
    this.clearAuth()
    this.connection = 'close'
    this.qrDataUrl = null
    this.qrText = null
    this.botNumber = null
    this.reconnectAttempts = 0
    return this._setRelinkState({
      status: 'disconnected', message: 'Koneksi diputuskan. Sesi lama diarsipkan.',
      archivedPath, error: null, startedAt: new Date().toISOString(),
    })
  }

  // Ganti nomor: arsipkan sesi lama, mulai sesi baru dengan QR kosong.
  async relink() {
    if (this.relinking) throw new Error('Proses penggantian nomor sedang berjalan.')
    this.relinking = true
    const startedAt = new Date().toISOString()
    try {
      const archivedPath = this.archiveAuth()
      await this.endCurrentSocket()
      this.clearAuth()
      this.connection = 'close'
      this.qrDataUrl = null
      this.qrText = null
      this.botNumber = null
      this.reconnectAttempts = 0
      this._setRelinkState({
        status: 'waiting_qr', message: 'Memulai sesi baru. Pindai QR dengan nomor WhatsApp baru.',
        archivedPath, error: null, startedAt,
      })
      await this.connect()
      return this.relinkState
    } catch (err) {
      return this._setRelinkState({ status: 'failed', message: 'Gagal memulai sesi baru.', error: err.message })
    }
  }

  isConnected() { return this.connection === 'open' && Boolean(this.sock) }

  async sendMessage(jid, text) {
    if (!this.isConnected()) throw new Error('WhatsApp belum terhubung')
    return this.sock.sendMessage(jid, { text })
  }

  async start() {
    this.startedAt = new Date().toISOString()
    await this.connect()
  }

  safeHandler(handler) {
    return (...args) => Promise.resolve(handler(...args)).catch((err) => {
      logger.error('Event handler WhatsApp gagal:', err?.message || err)
    })
  }

  async connect() {
    if (this.connectPromise) return this.connectPromise
    if (this.connecting) return
    this.connecting = true
    this.connectPromise = this._connect().finally(() => {
      this.connecting = false
      this.connectPromise = null
    })
    return this.connectPromise
  }

  async _connect() {
    try {
      fs.mkdirSync(config.authDir, { recursive: true })
      const { state, saveCreds } = await useMultiFileAuthState(config.authDir)
      let version
      try {
        version = (await Promise.race([
          fetchLatestBaileysVersion(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
        ])).version
      } catch { /* pakai default bawaan Baileys */ }

      const sock = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: false,
        browser: Browsers.macOS('Chrome'),
        logger: pino({ level: 'silent' }),
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 60_000,
        keepAliveIntervalMs: 30_000,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
      })
      // Pastikan socket lama benar-benar ditutup sebelum socket baru dibuat.
      // Dua socket aktif pada satu akun = konflik session/libsignal (Bad MAC).
      this.retireCurrentSocket('BOT_RECONNECT')
      this.sock = sock
      const handlers = {
        // Hanya socket aktif yang boleh menulis credentials ke disk.
        'creds.update': () => { if (this.sock === sock) return saveCreds() },
        'connection.update': this.safeHandler((update) => this.onConnectionUpdate(update)),
        'messages.upsert': this.safeHandler((update) => this.onMessagesUpsert(update)),
        'groups.upsert': (groups) => {
          for (const g of groups || []) {
            groupService.upsert(g.id, g.subject || g.name || null, g.participants || [])
          }
        },
        'group-participants.update': this.safeHandler(async (update) => {
          if (!update?.id) return
          try {
            const metadata = await sock.groupMetadata(update.id)
            groupService.upsert(update.id, metadata.subject || null, metadata.participants || [])
          } catch { /* diabaikan, sink penuh saat open */ }
        }),
      }
      this._eventHandlers = handlers
      for (const [event, handler] of Object.entries(handlers)) sock.ev.on(event, handler)
    } catch (err) {
      logger.error('Gagal membuat koneksi WhatsApp:', err.message)
      this.scheduleReconnect()
    }
  }

  async onConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update
    if (qr) {
      try {
        this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 })
        this.qrText = qr
        fs.mkdirSync(path.dirname(config.qrPath), { recursive: true })
        await QRCode.toFile(config.qrPath, qr, { margin: 1, width: 420 })
        const ascii = await QRCode.toString(qr, { type: 'terminal', small: true })
        logger.info('QR CODE BARU — pindai dengan WhatsApp > Perangkat Tertaut')
        console.log(ascii)
        console.log(`QR juga tersedia di ${config.qrPath} dan GET /api/qr`)
      } catch (err) {
        logger.warn('Gagal membuat QR:', err.message)
      }
      if (this.relinking) {
        this._setRelinkState({ status: 'waiting_qr', message: 'QR siap. Pindai dengan WhatsApp akun baru.', error: null })
      }
    }

    if (connection === 'open') {
      this.connection = 'open'
      this.botNumber = normalizeJid(this.sock?.user?.id || '') || this.botNumber
      if (this.relinking) {
        this.relinking = false
        this._setRelinkState({
          status: 'connected',
          message: `Nomor bot ${this.botNumber || '-'} berhasil terhubung.`,
          error: null,
        })
        logger.info('Penggantian nomor bot berhasil')
      }
      this.reconnectAttempts = 0
      this.reconnectBlocked = false
      this.qrDataUrl = null
      this.qrText = null
      this.lastDisconnect = null
      logger.info('WhatsApp TERHUBUNG')
      try { await groupService.sync(this.sock) } catch (e) { logger.warn('Sync grup gagal:', e.message) }
      return
    }

    if (connection === 'close') {
      this.connection = 'close'
      // Lepas listener socket yang baru saja tutup agar tidak ikut menulis creds.
      this.detachListeners()
      if (this.relinking) {
        logger.warn('Koneksi lama ditutup untuk penggantian nomor; reconnect otomatis dilewati.')
        return
      }
      const statusCode = lastDisconnect?.error?.output?.statusCode
        ?? lastDisconnect?.error?.statusCode
      this.lastDisconnect = { statusCode: statusCode ?? null, message: lastDisconnect?.error?.message || null }
      logger.warn(`WhatsApp terputus (kode: ${statusCode ?? 'unknown'})`)
      if (statusCode === DisconnectReason.loggedOut) {
        logger.warn('Sesi logout. Menghapus kredensial dan membuat QR baru...')
        try {
          for (const f of fs.readdirSync(config.authDir)) {
            const p = path.join(config.authDir, f)
            if (fs.statSync(p).isDirectory()) fs.rmSync(p, { recursive: true, force: true })
            else fs.unlinkSync(p)
          }
        } catch (err) { logger.warn('Gagal membersihkan auth:', err.message) }
        this.reconnectAttempts = 0
        await this.connect()
      } else {
        this.scheduleReconnect()
      }
    }
  }

  scheduleReconnect() {
    if (this.reconnecting || this.reconnectBlocked) return
    const max = Number(config.botMaxReconnectAttempts) || 0
    if (max > 0 && this.reconnectAttempts >= max) {
      this.reconnectBlocked = true
      logger.error(`Auto-reconnect dihentikan setelah ${this.reconnectAttempts} kegagalan. Jalankan bot manual setelah jaringan pulih.`)
      return
    }
    this.reconnecting = true
    this.reconnectAttempts += 1
    const delay = Math.min(30_000, 1000 * (2 ** Math.min(this.reconnectAttempts - 1, 5)))
    logger.info(`WhatsApp reconnect: mencoba ulang dalam ${delay / 1000} detik (percobaan ${this.reconnectAttempts})`)
    setTimeout(async () => {
      this.reconnecting = false
      await this.connect()
    }, delay)
  }

  async onMessagesUpsert(update) {
    // Baileys memakai 'notify' untuk pesan baru. Beberapa versi/keadaan
    // mengirim pesan baru sebagai 'append' (history sync), jadi ikut diproses
    // hanya jika masih segar agar pesan lama tidak diulang setelah restart.
    if (update.type !== 'notify' && update.type !== 'append') return
    const isAppend = update.type === 'append'
    for (const msg of update.messages || []) {
      this.messageStats.received += 1
      try {
        // Pesan yang gagal didekripsi libsignal datang tanpa field `message`.
        // Phase/error decrypt juga tidak boleh menghentikan handler pesan lain.
        if (!msg.message || msg.message.protocolMessage) { this.messageStats.skipped += 1; continue }
        if (isAppend && messageAgeMs(msg) > Number(config.messageAppendMaxAgeMs || 120_000)) {
          this.messageStats.skipped += 1
          continue
        }
        // Pesan yang dikirim akun bot sendiri tidak pernah boleh memicu command.
        if (msg.key?.fromMe) { this.messageStats.skipped += 1; continue }
        if (!shouldProcessMessage(msg)) { this.messageStats.skipped += 1; continue }
        const jid = msg.key?.remoteJid
        if (!jid || jid === 'status@broadcast' || jid.endsWith('@broadcast')) { this.messageStats.skipped += 1; continue }
        const isGroup = jid.endsWith('@g.us')
        if (isOwnMessage(msg.key?.id)) { this.messageStats.skipped += 1; continue }
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption
        if (!text) { this.messageStats.skipped += 1; continue }
        const sender = msg.key?.participant || msg.key?.remoteJid
        if (!sender) { this.messageStats.skipped += 1; continue }
        // Pastikan grup dikenal (misal bot baru masuk).
        if (isGroup && !groupService.get(jid)) groupService.upsert(jid, 'Grup WhatsApp', 0)

        this.messageStats.processed += 1
        await this.onMessage({ sock: this.sock, bot: this, jid, adminJid: sender, text, isGroup, admin: isAdmin(sender), message: msg, messageKey: msg.key, isRegisteredAdmin: isRegisteredAdmin(sender) })
      } catch (err) {
        logger.error('Gagal memproses pesan masuk:', err.message)
      }
    }
  }

  status() {
    return {
      connection: this.connection,
      connected: this.isConnected(),
      qrAvailable: Boolean(this.qrDataUrl),
      startedAt: this.startedAt,
      reconnectAttempts: this.reconnectAttempts,
      lastDisconnect: this.lastDisconnect,
      reconnectBlocked: this.reconnectBlocked,
      messageStats: { ...this.messageStats },
      offline: !this.isConnected(),
      botNumber: this.botNumber,
      relinkState: this.relinkState,
    }
  }
}
