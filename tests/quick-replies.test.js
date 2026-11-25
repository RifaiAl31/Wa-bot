import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  createContext, resolveContext, buildChoices, handleChoice, cleanup, _contexts,
} from '../src/commands/quickReplies.js'

const GROUP1 = '628222222222@g.us'
const GROUP2 = '628333333333@g.us'
const USER1 = '628111111111@s.whatsapp.net'
const USER2 = '628555555555@s.whatsapp.net'

const ctxFor = (jid = GROUP1, adminJid = USER1) => ({ jid, adminJid })
const stored = (id) => [..._contexts.values()].find((c) => c.id === id)

beforeEach(() => _contexts.clear())

test('buildChoices: teks didahulukan, diikuti baris 1./2./3.', () => {
  assert.equal(
    buildChoices('Pilih aksi:', ['Lihat', 'Ubah', 'Hapus']),
    'Pilih aksi:\n1. Lihat\n2. Ubah\n3. Hapus',
  )
})

test('createContext: isi context lengkap dengan TTL 10 menit', () => {
  const payload = { file: Buffer.from('pdf') }
  const id = createContext('confirm', payload, ctxFor())
  const context = _contexts.get(`${normalize(GROUP1)}|${normalize(USER1)}`)

  assert.equal(typeof id, 'string')
  assert.ok(id.length > 0)
  assert.deepEqual(Object.keys(context).sort(), ['expiresAt', 'id', 'kind', 'ownerGroup', 'ownerUser', 'payload'].sort())
  assert.equal(context.id, id)
  assert.equal(context.kind, 'confirm')
  assert.equal(context.payload, payload)
  assert.equal(context.ownerGroup, normalize(GROUP1))
  assert.equal(context.ownerUser, normalize(USER1))
  assert.ok(context.expiresAt - Date.now() > 9 * 60 * 1000)
  assert.ok(context.expiresAt - Date.now() <= 10 * 60 * 1000)
  assert.equal(resolveContext(id, ctxFor()), context)
})

test('context terpisah antar grup dan user', () => {
  const idA = createContext('confirm', 'A', ctxFor(GROUP1, USER1))
  const idB = createContext('confirm', 'B', ctxFor(GROUP2, USER1))
  const idC = createContext('ask', 'C', ctxFor(GROUP1, USER2))

  assert.equal(_contexts.size, 3)
  assert.equal(resolveContext(idA, ctxFor(GROUP1, USER1))?.payload, 'A')
  assert.equal(resolveContext(idB, ctxFor(GROUP2, USER1))?.payload, 'B')
  assert.equal(resolveContext(idC, ctxFor(GROUP1, USER2))?.payload, 'C')

  // id benar tapi pasangan grup/user salah -> null
  assert.equal(resolveContext(idA, ctxFor(GROUP2, USER1)), null)
  assert.equal(resolveContext(idA, ctxFor(GROUP1, USER2)), null)
  // id salah tapi pasangan benar -> null
  assert.equal(resolveContext(idB, ctxFor(GROUP1, USER1)), null)
  // JID dengan format beda tetap normalisasi ke pasangan yang sama
  assert.equal(resolveContext(idA, ctxFor('628222222222:29@g.us', '628111111111@s.whatsapp.net'))?.payload, 'A')
})

test('TTL: context expired dihapus oleh resolveContext, handleChoice, dan cleanup', () => {
  const idA = createContext('confirm', 'A', ctxFor(GROUP1, USER1))
  const idB = createContext('ask', 'B', ctxFor(GROUP2, USER1))
  const idC = createContext('ask', 'C', ctxFor(GROUP1, USER2))
  stored(idA).expiresAt = Date.now() - 1

  assert.equal(resolveContext(idA, ctxFor(GROUP1, USER1)), null)
  assert.equal(_contexts.has(`${normalize(GROUP1)}|${normalize(USER1)}`), false)
  assert.equal(handleChoice(ctxFor(GROUP1, USER1), '1'), null)

  stored(idB).expiresAt = Date.now() - 1
  assert.equal(handleChoice(ctxFor(GROUP2, USER1), '2'), null)
  assert.equal(_contexts.size, 1) // B ikut terhapus saat handleChoice menyentuhnya

  stored(idC).expiresAt = Date.now() - 1
  cleanup()
  assert.equal(_contexts.size, 0)
})

test('pilihan 1/2/3 dan /1../3 mengonsumsi context sekali pakai', () => {
  const payload = { text: 'dokumen' }
  const id = createContext('confirm', payload, ctxFor())
  const result = handleChoice(ctxFor(), '2')

  assert.deepEqual(Object.keys(result).sort(), ['actionIndex', 'context', 'id', 'kind', 'payload'])
  assert.equal(result.id, id)
  assert.equal(result.kind, 'confirm')
  assert.equal(result.actionIndex, 2)
  assert.equal(result.payload, payload)
  assert.equal(result.context.id, id)
  assert.equal(_contexts.size, 0, 'context harus dihapus setelah dipilih')
  assert.equal(handleChoice(ctxFor(), '2'), null, 'tidak bisa dipakai dua kali')

  for (const [text, expected] of [['1', 1], ['/1', 1], ['3', 3], ['/3', 3]]) {
    const nextId = createContext('ask', text, ctxFor())
    const picked = handleChoice(ctxFor(), text)
    assert.equal(picked.id, nextId)
    assert.equal(picked.actionIndex, expected)
    assert.equal(picked.kind, 'ask')
    assert.equal(picked.payload, text)
    assert.equal(_contexts.size, 0, "kind='ask' juga sekali pakai")
  }
})

test('/cancel dan teks lain diabaikan tanpa mengonsumsi context', () => {
  const id = createContext('confirm', 'payload', ctxFor())
  for (const text of ['/cancel', '/batal', 'batal', '0', '4', '/4', '1 ', ' 1', '/', '11', '']) {
    assert.equal(handleChoice(ctxFor(), text), null, `teks ${JSON.stringify(text)} tidak boleh merespons`)
  }
  assert.equal(resolveContext(id, ctxFor()), context(id))
  assert.equal(handleChoice(ctxFor(), '/1')?.id, id)
})

test('handleChoice tidak merespons bila tidak ada context aktif', () => {
  assert.equal(handleChoice(ctxFor(), '1'), null)
  assert.equal(handleChoice(ctxFor(), '/2'), null)
})

function normalize(jid) {
  return String(jid).split(':')[0].split('@')[0].replace(/\D/g, '')
}

function context(id) {
  return [..._contexts.values()].find((c) => c.id === id)
}
