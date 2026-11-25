import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

const state = { mode: 'ok', calls: [] }

const server = http.createServer((req, res) => {
  state.calls.push({ url: req.url })
  if (state.mode === 'fail') {
    res.writeHead(503, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ error: 'service unavailable' }))
  }
  if (state.mode === 'hang') return // biarkan timeout yang menangani
  if (state.mode === 'broken') {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ current: { temperature_2m: null } }))
  }
  const json = {
    latitude: -7.91,
    longitude: 110.58,
    current: {
      time: '2026-11-25T12:00',
      interval: 900,
      temperature_2m: 29.4,
      relative_humidity_2m: 72,
      weather_code: 61,
    },
    current_units: { temperature_2m: '°C', relative_humidity_2m: '%' },
    timezone: 'Asia/Jakarta',
  }
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(json))
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

// Env diset SEBELUM import modul, sesuai kontrak.
process.env.WEATHER_BASE_URL = `http://127.0.0.1:${server.address().port}/v1/forecast`
process.env.WEATHER_LOCATION = 'Gunungkidul, Yogyakarta'
process.env.WEATHER_LAT = '-7.91'
process.env.WEATHER_LON = '110.58'
process.env.WEATHER_CACHE_MS = '600000'
process.env.WEATHER_TIMEOUT_MS = '300'

const { getCurrentWeather, clearWeatherCache } = await import('../src/services/weatherService.js')

test.after(() => server.close())

test('berhasil: data asli dari API dipetakan ke cuaca bahasa Indonesia', async () => {
  clearWeatherCache()
  state.mode = 'ok'
  const before = state.calls.length
  const result = await getCurrentWeather({ force: true })

  assert.equal(result.available, true)
  assert.equal(result.location, 'Gunungkidul, Yogyakarta')
  assert.equal(result.temperature, 29.4)
  assert.equal(result.humidity, 72)
  assert.equal(result.condition, 'Hujan')
  assert.equal(result.description, 'Hujan ringan')
  assert.equal(result.cached, false)
  assert.equal(state.calls.length, before + 1)

  const url = state.calls.at(-1).url
  assert.match(url, /latitude=-7\.91/)
  assert.match(url, /longitude=110\.58/)
  assert.match(url, /current=temperature_2m,relative_humidity_2m,weather_code/)
  assert.match(url, /timezone=Asia%2FJakarta/)
})

test('cache: panggilan kedua memakai hasil cache tanpa request baru', async () => {
  const before = state.calls.length
  const result = await getCurrentWeather()

  assert.equal(result.available, true)
  assert.equal(result.cached, true)
  assert.equal(result.temperature, 29.4)
  assert.equal(result.condition, 'Hujan')
  assert.equal(state.calls.length, before)
})

test('force=true mengabaikan cache dan mengambil data baru', async () => {
  const before = state.calls.length
  const result = await getCurrentWeather({ force: true })

  assert.equal(result.available, true)
  assert.equal(result.cached, false)
  assert.equal(state.calls.length, before + 1)
})

test('fallback gagal: HTTP error menghasilkan unavailable, bukan cuaca rekaan', async () => {
  state.mode = 'fail'
  const result = await getCurrentWeather({ force: true })

  assert.deepEqual(result, { available: false, reason: 'Weather unavailable' })
  state.mode = 'ok'
})

test('fallback timeout: server tidak merespons tetap unavailable', async () => {
  state.mode = 'hang'
  const started = Date.now()
  const result = await getCurrentWeather({ force: true })

  assert.deepEqual(result, { available: false, reason: 'Weather unavailable' })
  assert.ok(Date.now() - started < 3000)
  state.mode = 'ok'
})

test('fallback payload rusak tidak menghasilkan angka nol rekaan', async () => {
  state.mode = 'broken'
  const result = await getCurrentWeather({ force: true })

  assert.deepEqual(result, { available: false, reason: 'Weather unavailable' })
  state.mode = 'ok'
})
