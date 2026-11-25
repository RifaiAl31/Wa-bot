// Validasi URL ketat untuk mencegah SSRF dan penyalahgunaan command downloader.
import { lookup } from 'node:dns/promises'

const ALLOWED_HOSTS = ['tiktok.com', 'instagram.com']
let dnsResolver = lookup

export function setDnsResolver(fn) { dnsResolver = fn || lookup }

function isPrivateHost(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const parts = h.split('.').map(Number)
    if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || parts[0] >= 224) return true
    if (parts[0] === 169 && parts[1] === 254) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true
    return true
  }
  return false
}

function isPrivateAddress(address) {
  const a = String(address || '').toLowerCase()
  if (a === '::1' || a.startsWith('fc') || a.startsWith('fd') || a.includes(':')) return true
  const parts = a.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [x, y] = parts
  return x === 0 || x === 10 || x === 127 || x >= 224
    || (x === 169 && y === 254) || (x === 172 && y >= 16 && y <= 31)
    || (x === 192 && y === 168) || (x === 100 && y >= 64 && y <= 127)
}

export function validatePublicUrl(raw, platform) {
  let url
  try { url = new URL(String(raw || '').trim()) } catch { throw new Error('Link tidak valid.') }
  if (url.protocol !== 'https:') throw new Error('Hanya link https yang diterima.')
  if (url.username || url.password) throw new Error('Link tidak boleh memuat kredensial.')
  if (url.port && url.port !== '443') throw new Error('Port tidak diizinkan.')
  if (isPrivateHost(url.hostname)) throw new Error('Alamat privat/local tidak diizinkan.')
  const host = url.hostname.toLowerCase()
  const expected = platform === 'tiktok' ? ALLOWED_HOSTS[0] : ALLOWED_HOSTS[1]
  if (!(host === expected || host.endsWith(`.${expected}`))) {
    throw new Error(`Link bukan domain ${expected} yang diizinkan.`)
  }
  if (/[\x00-\x1f]/.test(url.href)) throw new Error('Link mengandung karakter tidak valid.')
  return url
}

// Validasi hostname + resolusi DNS. DNS check mengurangi risiko SSRF lewat
// domain publik yang mengarah ke IP privat. Redirect tetap dibatasi oleh
// flag yt-dlp dan tidak menerima argumen dari teks pengguna.
export async function resolvePublicUrl(raw, platform, resolver = dnsResolver) {
  const url = validatePublicUrl(raw, platform)
  let addresses
  try { addresses = await resolver(url.hostname, { all: true }) }
  catch { throw new Error('Gagal memvalidasi alamat tujuan.') }
  if (!addresses?.length) throw new Error('Alamat tujuan tidak ditemukan.')
  if (addresses.some((entry) => isPrivateAddress(entry?.address))) {
    throw new Error('Alamat privat/local tidak diizinkan.')
  }
  return url
}
