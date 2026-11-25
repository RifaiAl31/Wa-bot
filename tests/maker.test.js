import test from 'node:test'
import assert from 'node:assert/strict'
import { testEnv } from './helpers.js'

testEnv('maker')
const { handleMakerCommand } = await import('../src/features/maker/index.js')

function makeSock() {
  const sent = []
  return { sent, isConnected: () => true,
    async sendMessage(jid, content) { sent.push({ jid, content }); return { key:{ id:'m' } } } }
}
const ctx = (sock, arg) => ({ sock, jid:'628222222222@g.us', adminJid:'628111111111@s.whatsapp.net',
  text:`.logo3d ${arg}`, arg, isGroup:true, bot:null })

test('.logo3d menghasilkan PNG nyata', async () => {
  const sock = makeSock()
  const result = await handleMakerCommand(ctx(sock, 'Rifai Tech blue'), '.logo3d', 'Rifai Tech blue')
  assert.equal(result.ok, true)
  assert.ok(sock.sent.some((s) => Buffer.isBuffer(s.content.image)))
  const image = sock.sent.find((s) => s.content.image).content.image
  assert.equal(image.slice(1, 4).toString(), 'PNG')
})

test('.logogold menghasilkan PNG nyata', async () => {
  const sock = makeSock()
  await handleMakerCommand(ctx(sock, 'Rifai Tech gold'), '.logogold', 'Rifai Tech gold')
  const image = sock.sent.find((s) => s.content.image).content.image
  assert.equal(image.slice(1, 4).toString(), 'PNG')
})

test('.sologo info API key tidak tersedia, tanpa mengarang gambar', async () => {
  const sock = makeSock()
  const sent = await import('../src/commands/context.js')
  const result = await handleMakerCommand(ctx(sock, 'logo kucing'), '.sologo', 'logo kucing')
  assert.equal(result.ok, true)
  assert.ok(sock.sent.some((s) => s.content.text && /API key|logo3d/.test(s.content.text)))
})
