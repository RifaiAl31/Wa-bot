import { randomUUID } from 'node:crypto'
import { normalizeJid } from '../config.js'

// Fallback tombol interaktif: Baileys 6.7.24 tidak mendukung pengiriman tombol native,
// jadi pilihan diketik sebagai angka (1/2/3 atau /1 dst).
const TTL_MS = 10 * 60 * 1000

// Diekspor untuk keperluan test; jangan dipakai sebagai API publik.
// Satu pasangan grup+user hanya punya satu context aktif (dipakai sekali).
export const _contexts = new Map()

const keyOf = (ctx) => `${normalizeJid(ctx?.jid)}|${normalizeJid(ctx?.adminJid)}`

/**
 * Simpan payload (teks/buffer gambar/PDF boleh) untuk dipilih lewat angka.
 * Tidak menyimpan kredensial: hanya payload yang diberikan pemanggil.
 */
export function createContext(kind, payload, ctx) {
  const id = `qr-${randomUUID()}`
  _contexts.set(keyOf(ctx), {
    id,
    kind,
    payload,
    ownerGroup: normalizeJid(ctx?.jid),
    ownerUser: normalizeJid(ctx?.adminJid),
    expiresAt: Date.now() + TTL_MS,
  })
  return id
}

/** Ambil context hanya jika id cocok, grup+user sama, dan belum kedaluwarsa. */
export function resolveContext(id, ctx) {
  const key = keyOf(ctx)
  const context = _contexts.get(key)
  if (!context) return null
  if (context.expiresAt <= Date.now()) {
    _contexts.delete(key)
    return null
  }
  if (context.id !== id) return null
  return context
}

/** Susun teks pertanyaan diikuti baris pilihan bernomor. */
export function buildChoices(text, labels) {
  const list = Array.isArray(labels) ? labels : []
  const lines = list.map((label, i) => `${i + 1}. ${label}`)
  return `${text ?? ''}\n${lines.join('\n')}`
}

/** Konsumsi pilihan 1/2/3 atau /1../3 untuk context grup+user yang aktif. */
export function handleChoice(ctx, text) {
  const match = /^\/?([123])$/.exec(String(text ?? ''))
  if (!match) return null

  const key = keyOf(ctx)
  const context = _contexts.get(key)
  if (!context) return null
  if (context.expiresAt <= Date.now()) {
    _contexts.delete(key)
    return null
  }

  // Sekali pakai, termasuk kind='ask'.
  _contexts.delete(key)
  return {
    id: context.id,
    kind: context.kind,
    actionIndex: Number(match[1]),
    payload: context.payload,
    context,
  }
}

/** Buang semua context yang sudah kedaluwarsa. */
export function getActiveContext(ctx) {
  const context = _contexts.get(keyOf(ctx))
  if (!context) return null
  if (context.expiresAt <= Date.now()) { _contexts.delete(keyOf(ctx)); return null }
  return context
}

export function clearContext(ctx) { _contexts.delete(keyOf(ctx)) }

export function cleanup() {
  const now = Date.now()
  for (const [key, context] of _contexts) {
    if (!context || context.expiresAt <= now) _contexts.delete(key)
  }
}
