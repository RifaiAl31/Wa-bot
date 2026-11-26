import test from 'node:test'
import assert from 'node:assert/strict'
import { testEnv, ADMIN, GROUP, fakeSock } from './helpers.js'

testEnv('games')
const { initDb } = await import('../src/db/index.js')
const { groupService } = await import('../src/services/groups.js')
const { handleMessage } = await import('../src/commands/router.js')
const {
  activeGameCount, clearGameSessions, GAME_SESSION_TTL_MS, handleGameCommand,
} = await import('../src/features/games/index.js')

initDb({ force: true })
groupService.upsert(GROUP, 'Grup Uji', 3)

const makeCtx = (sock, text, { jid = GROUP, user = ADMIN, isGroup = true } = {}) => ({
  sock,
  bot: null,
  jid,
  adminJid: user,
  text,
  isGroup,
  admin: false,
})

const sentTexts = (sock) => sock.sent.map((item) => item.text).filter(Boolean)

test('quiz dimulai, input salah format tidak menghabiskan kesempatan, jawaban benar menang', async () => {
  clearGameSessions()
  const sock = fakeSock()
  const ctx = makeCtx(sock, '.quiz geografi')

  await handleGameCommand(ctx, '.quiz', 'geografi', { now: () => 1_000, random: () => 0 })
  assert.match(sentTexts(sock)[0], /LUX BOT — KUIS GEOGRAFI/)
  assert.match(sentTexts(sock)[0], /A\. Kyoto[\s\S]*B\. Tokyo/)
  assert.equal(activeGameCount(), 1)

  await handleGameCommand(ctx, '.qa', 'X', { now: () => 1_001 })
  assert.match(sentTexts(sock).at(-1), /harus berupa A, B, C, atau D/)
  assert.equal(activeGameCount(), 1)

  await handleGameCommand(ctx, '.qa', 'B', { now: () => 1_002 })
  assert.match(sentTexts(sock).at(-1), /Benar! Jawabannya B\. Tokyo/)
  assert.equal(activeGameCount(), 0)
})

test('jawaban salah mengakhiri sesi dan mengungkap jawaban', async () => {
  clearGameSessions()
  const sock = fakeSock()
  const ctx = makeCtx(sock, '.quiz geografi')
  await handleGameCommand(ctx, '.quiz', 'geografi', { now: () => 2_000, random: () => 0 })
  await handleGameCommand(ctx, '.qa', 'A', { now: () => 2_001 })
  assert.match(sentTexts(sock).at(-1), /Belum tepat\. Jawaban yang benar: B\. Tokyo/)
  assert.equal(activeGameCount(), 0)
})

test('sesi dipisah menurut grup dan pemain serta mencegah mulai ganda', async () => {
  clearGameSessions()
  const first = fakeSock()
  const second = fakeSock()
  const otherGroup = fakeSock()
  const ctx1 = makeCtx(first, '.quiz geografi', { user: ADMIN })
  const ctx2 = makeCtx(second, '.quiz geografi', { user: '628333333333@s.whatsapp.net' })
  const ctx3 = makeCtx(otherGroup, '.quiz geografi', { jid: '628444444444@g.us', user: ADMIN })

  await handleGameCommand(ctx1, '.quiz', 'geografi', { now: () => 3_000, random: () => 0 })
  await handleGameCommand(ctx2, '.quiz', 'geografi', { now: () => 3_000, random: () => 0 })
  await handleGameCommand(ctx3, '.quiz', 'geografi', { now: () => 3_000, random: () => 0 })
  await handleGameCommand(ctx1, '.quiz', 'geografi', { now: () => 3_001, random: () => 0 })
  assert.equal(activeGameCount(), 3)
  assert.match(sentTexts(first).at(-1), /masih berjalan/)

  await handleGameCommand(ctx1, '.qa', 'B', { now: () => 3_002 })
  assert.equal(activeGameCount(), 2)
  await handleGameCommand(ctx2, '.qa', 'B', { now: () => 3_003 })
  assert.equal(activeGameCount(), 1)
  await handleGameCommand(ctx3, '.qa', 'B', { now: () => 3_004 })
  assert.equal(activeGameCount(), 0)
})

test('sesi kedaluwarsa dihapus dan jawaban ditampilkan', async () => {
  clearGameSessions()
  const sock = fakeSock()
  const ctx = makeCtx(sock, '.quiz geografi')
  const startedAt = 4_000
  await handleGameCommand(ctx, '.quiz', 'geografi', { now: () => startedAt, random: () => 0 })
  await handleGameCommand(ctx, '.qa', 'B', { now: () => startedAt + GAME_SESSION_TTL_MS + 1 })
  assert.match(sentTexts(sock).at(-1), /Waktu kuis habis[\s\S]*B\. Tokyo/)
  assert.equal(activeGameCount(), 0)
})

test('alias terdaftar merutekan command game lewat handler utama', async () => {
  clearGameSessions()
  const sock = fakeSock()
  await handleMessage(makeCtx(sock, '.kuis geografi'))
  assert.match(sentTexts(sock)[0], /KUIS GEOGRAFI/)
  await handleMessage(makeCtx(sock, '.jwbquiz B'))
  assert.match(sentTexts(sock).at(-1), /Benar! Jawabannya B\. Tokyo/)
  assert.equal(activeGameCount(), 0)
})

test('private chat hanya menjalankan command game eksplisit, bukan pesan biasa', async () => {
  clearGameSessions()
  const sock = fakeSock()
  const privateCtx = makeCtx(sock, 'pesan biasa', {
    jid: '628555555555@s.whatsapp.net',
    user: '628555555555@s.whatsapp.net',
    isGroup: false,
  })
  await handleMessage(privateCtx)
  assert.equal(sentTexts(sock).length, 0)

  await handleMessage({ ...privateCtx, text: '.kuis geografi' })
  assert.match(sentTexts(sock).at(-1), /KUIS GEOGRAFI/)
  await handleMessage({ ...privateCtx, text: '.jawabquiz B' })
  assert.match(sentTexts(sock).at(-1), /Benar! Jawabannya B\. Tokyo/)
  assert.equal(activeGameCount(), 0)
})
