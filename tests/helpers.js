import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

export function testEnv(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `wabot-${tag}-`))
  process.env.DB_PATH = path.join(dir, 'test.db')
  process.env.AUTH_DIR = path.join(dir, 'auth')
  process.env.QR_PATH = path.join(dir, 'qr.png')
  process.env.ADMIN_NUMBERS = '628111111111'
  // default production = akses terbuka; uji gate admin dengan mematikan ini
  process.env.OPEN_ACCESS = 'false'
  process.env.NODE_ENV = 'test'
  return dir
}

export function fakeSock() {
  const sent = []
  return {
    sent,
    isConnected: () => true,
    async sendMessage(jid, content) {
      sent.push({ jid, text: content.text })
      return { key: { id: `fake-${sent.length}` } }
    },
    async groupFetchAllParticipating() { return {} },
  }
}

export const ADMIN = '628111111111@s.whatsapp.net'
export const GROUP = '628222222222@g.us'
export const ctxFor = (sock, text, adminJid = ADMIN, admin = true, jid = GROUP) =>
  ({ sock, bot: null, jid, adminJid, text, admin, isGroup: true })
