// Baileys menandai pesan dari akun tertaut sebagai fromMe. Simpan ID pesan yang
// dikirim bot sendiri agar tidak memicu command handler, sementara perintah dari
// nomor admin yang diketik di ponsel tetap diterima.
const sentIds = new Set()
const MAX = 500

export function rememberMessageId(id) {
  if (!id) return
  sentIds.add(id)
  if (sentIds.size > MAX) {
    const oldest = sentIds.values().next().value
    sentIds.delete(oldest)
  }
}

export function isOwnMessage(id) { return Boolean(id) && sentIds.has(id) }
