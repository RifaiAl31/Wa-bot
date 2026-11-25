import test from 'node:test'
import assert from 'node:assert/strict'
import { jakartaNow, smartDate } from '../src/utils/smartDate.js'

// 21 Nov 2026 16:00 UTC = Sabtu, 21 November 2026 23:00 WIB
const NOW = new Date('2026-11-21T16:00:00.000Z')
const NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

test('jakartaNow menghasilkan Date dengan jam dinding Asia/Jakarta', () => {
  const a = jakartaNow(new Date('2026-11-25T17:30:00.000Z'))
  assert.ok(a instanceof Date)
  assert.equal(a.toISOString(), '2026-11-26T00:30:00.000Z')

  const b = jakartaNow(new Date('2026-11-25T16:59:00.000Z'))
  assert.equal(b.toISOString(), '2026-11-25T23:59:00.000Z')

  assert.equal(jakartaNow().getUTCFullYear() >= 2026, true)
})

test("'hari ini', 'besok', 'lusa' memakai kalender Jakarta (source: relative)", () => {
  assert.deepEqual(smartDate('hari ini', NOW), {
    date: '2026-11-21', weekday: 'Sabtu', day: 21, month: 'November', year: 2026,
    text: 'Sabtu, 21 November 2026', source: 'relative',
  })
  assert.deepEqual(smartDate('besok', NOW), {
    date: '2026-11-22', weekday: 'Minggu', day: 22, month: 'November', year: 2026,
    text: 'Minggu, 22 November 2026', source: 'relative',
  })
  assert.deepEqual(smartDate('lusa', NOW), {
    date: '2026-11-23', weekday: 'Senin', day: 23, month: 'November', year: 2026,
    text: 'Senin, 23 November 2026', source: 'relative',
  })
})

test('nama hari diartikan kemunculan berikutnya, maksimal 7 hari ke depan', () => {
  const expected = {
    minggu: '2026-11-22', senin: '2026-11-23', selasa: '2026-11-24',
    rabu: '2026-11-25', kamis: '2026-11-26', jumat: '2026-11-27', sabtu: '2026-11-21',
  }
  for (const [name, date] of Object.entries(expected)) {
    const got = smartDate(name, NOW)
    assert.equal(got.date, date, name)
    assert.equal(got.weekday, NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()], name)
    assert.equal(got.source, 'weekday', name)
  }
  assert.equal(smartDate('HARI INI', NOW).source, 'relative')
  assert.equal(smartDate('  Senin  ', NOW).date, '2026-11-23')
  assert.equal(smartDate('ahad', NOW).date, '2026-11-22')
  assert.equal(smartDate("Jum'at", NOW).date, '2026-11-27')

  // Dari hari apa pun, jaraknya 0..6 hari (tidak pernah lebih dari 7).
  for (let i = 0; i < 7; i += 1) {
    const base = new Date(Date.UTC(2026, 10, 22 + i, 12))
    for (const name of NAMES) {
      const result = smartDate(name, base)
      const diff = Math.round((Date.parse(`${result.date}T00:00:00Z`) - Date.UTC(2026, 10, 22 + i)) / 86400000)
      assert.ok(diff >= 0 && diff <= 6, `${name} dari ${base.toISOString()} → +${diff}`)
    }
  }
})

test('tanggal eksplisit: tiga format yang didukung (source: explicit)', () => {
  const want = {
    date: '2026-11-21', weekday: 'Sabtu', day: 21, month: 'November', year: 2026,
    text: 'Sabtu, 21 November 2026', source: 'explicit',
  }
  for (const raw of ['21 November 2026', '21/11/2026', '2026-11-21']) {
    assert.deepEqual(smartDate(raw, NOW), want, raw)
  }
  assert.equal(smartDate('21 november 2026', NOW).date, '2026-11-21')
  assert.equal(smartDate('1 Januari 2026').text, 'Kamis, 1 Januari 2026')
  assert.equal(smartDate('31 Desember 2026').text, 'Kamis, 31 Desember 2026')
  assert.equal(smartDate('29/11/2026').date, '2026-11-29')
  assert.equal(smartDate('2026-02-28', NOW).source, 'explicit')
})

test('input ambigu/kosong/tidak valid menghasilkan null', () => {
  const ambiguous = [
    'nanti', 'besok lusa', 'lusa besok', 'minggu depan', 'senin depan',
    'hari ini besok', 'besok pagi', 'kemarin', 'nanti malam',
    '21/11', '21-11-2026', '21 November', 'November 2026',
    '31 Februari 2026', '2026-02-30', '32/11/2026', '2026-13-01', '0/11/2026',
    '', '   ', '  \n ', null, undefined, 123, {}, new Date(), [],
  ]
  for (const raw of ambiguous) {
    assert.equal(smartDate(raw, NOW), null, JSON.stringify(String(raw)))
  }
})

test('pindah hari Jakarta mengubah hasil relatif', () => {
  assert.deepEqual(
    smartDate('hari ini', new Date('2026-11-25T17:30:00.000Z')),
    {
      date: '2026-11-26', weekday: 'Kamis', day: 26, month: 'November', year: 2026,
      text: 'Kamis, 26 November 2026', source: 'relative',
    },
  )
  assert.equal(smartDate('besok', new Date('2026-11-25T17:30:00.000Z')).date, '2026-11-27')
  assert.equal(smartDate('hari ini', new Date('2026-11-25T16:59:00.000Z')).date, '2026-11-25')
})
