import { config } from '../config.js'

const DEFAULT_LAT = -7.91
const DEFAULT_LON = 110.58
const DEFAULT_LOCATION = 'Gunungkidul, Yogyakarta'
const DEFAULT_BASE_URL = 'https://api.open-meteo.com/v1/forecast'
const DEFAULT_CACHE_MS = 10 * 60 * 1000
const DEFAULT_TIMEOUT_MS = 8000

const UNAVAILABLE = { available: false, reason: 'Weather unavailable' }

// WMO code -> [kondisi singkat, deskripsi singkat] dalam bahasa Indonesia.
const WMO_CONDITIONS = new Map([
  [0, ['Cerah', 'Langit cerah tanpa awan']],
  [1, ['Sebagian Cerah', 'Sebagiannya cerah dengan sedikit awan']],
  [2, ['Berawan', 'Awan tersebar di langit']],
  [3, ['Mendung', 'Langit tertutup awan']],
  [45, ['Berkabut', 'Kabut tipis']],
  [48, ['Berkabut', 'Kabut dengan embun beku']],
  [51, ['Gerimis', 'Gerimis ringan']],
  [53, ['Gerimis', 'Gerimis sedang']],
  [55, ['Gerimis', 'Gerimis lebat']],
  [56, ['Gerimis Beku', 'Gerimis beku ringan']],
  [57, ['Gerimis Beku', 'Gerimis beku lebat']],
  [61, ['Hujan', 'Hujan ringan']],
  [63, ['Hujan', 'Hujan sedang']],
  [65, ['Hujan', 'Hujan lebat']],
  [66, ['Hujan Beku', 'Hujan beku ringan']],
  [67, ['Hujan Beku', 'Hujan beku lebat']],
  [71, ['Salju', 'Salju ringan']],
  [73, ['Salju', 'Salju sedang']],
  [75, ['Salju', 'Salju lebat']],
  [77, ['Salju', 'Butiran salju']],
  [80, ['Hujan Deras', 'Hujan deras ringan']],
  [81, ['Hujan Deras', 'Hujan deras sedang']],
  [82, ['Hujan Deras', 'Hujan deras lebat']],
  [85, ['Hujan Salju', 'Hujan salju ringan']],
  [86, ['Hujan Salju', 'Hujan salju lebat']],
  [95, ['Badai Petir', 'Badai petir']],
  [96, ['Badai Petir', 'Badai petir dengan hujan es ringan']],
  [99, ['Badai Petir', 'Badai petir dengan hujan es lebat']],
])

function pick(envValue, configValue, fallback) {
  if (envValue !== undefined && envValue !== null && String(envValue).trim() !== '') return envValue
  if (configValue !== undefined && configValue !== null && configValue !== '') return configValue
  return fallback
}

function positiveMs(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

// Env dibaca saat pemanggilan supaya tes bisa mengaturnya sebelum import,
// sedangkan config dipakai sebagai fallback setelah parent menambah kunci weather.
function settings() {
  const lat = Number(pick(process.env.WEATHER_LAT, config.weatherLat, DEFAULT_LAT))
  const lon = Number(pick(process.env.WEATHER_LON, config.weatherLon, DEFAULT_LON))
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('invalid coordinates')
  return {
    lat,
    lon,
    location: String(pick(process.env.WEATHER_LOCATION, config.weatherLocation, DEFAULT_LOCATION)),
    baseUrl: String(pick(process.env.WEATHER_BASE_URL, config.weatherBaseUrl, DEFAULT_BASE_URL)),
    cacheMs: positiveMs(pick(process.env.WEATHER_CACHE_MS, config.weatherCacheMs, DEFAULT_CACHE_MS), DEFAULT_CACHE_MS),
    timeoutMs: positiveMs(process.env.WEATHER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  }
}

function forecastUrl({ baseUrl, lat, lon }) {
  const endpoint = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const url = new URL(/\/v1\/forecast$|\/forecast$/i.test(endpoint) ? endpoint : `${endpoint}/v1/forecast`)
  url.search = 'latitude=' + encodeURIComponent(lat)
    + '&longitude=' + encodeURIComponent(lon)
    + '&current=temperature_2m,relative_humidity_2m,weather_code'
    + '&timezone=Asia%2FJakarta'
  return url.toString()
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return NaN
  return Number(value)
}

function toWeather(payload, location) {
  const current = payload?.current
  const temperature = toNumber(current?.temperature_2m)
  const humidity = toNumber(current?.relative_humidity_2m)
  const code = toNumber(current?.weather_code)
  if (!Number.isFinite(temperature) || !Number.isFinite(humidity) || !Number.isFinite(code)) return null
  const [condition, description] = WMO_CONDITIONS.get(code)
    || ['Tidak Diketahui', 'Kondisi cuaca tidak dikenali']
  return { available: true, location, temperature, humidity, condition, description, cached: false }
}

let cache = null

/** Hapus cache cuaca in-memory (berguna untuk tes / pergantian lokasi). */
export function clearWeatherCache() {
  cache = null
}

/**
 * Ambil cuaca terkini dari Open-Meteo (tanpa API key).
 * Hasil sukses di-cache 10 menit; force=true memaksa request baru.
 * Kegagalan/timeout tidak pernah diubah menjadi data cuaca rekaan.
 */
export async function getCurrentWeather({ force = false } = {}) {
  let opts
  try {
    opts = settings()
  } catch {
    return { ...UNAVAILABLE }
  }

  const now = Date.now()
  if (!force && cache && cache.expiresAt > now) {
    return { ...cache.value, cached: true }
  }

  try {
    const response = await fetch(forecastUrl(opts), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(opts.timeoutMs),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const value = toWeather(await response.json(), opts.location)
    if (!value) throw new Error('invalid weather payload')
    cache = { value: { ...value, cached: false }, expiresAt: Date.now() + opts.cacheMs }
    return value
  } catch {
    return { ...UNAVAILABLE }
  }
}

export default { getCurrentWeather, clearWeatherCache }
