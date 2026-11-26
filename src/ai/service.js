import { get, run, transaction } from '../db/index.js'
import { config } from '../config.js'
import { logger } from '../logger.js'
import { fetchModels, toFreeModels, askModel, AIError } from './client.js'
import { checkLimits, recordUsage } from './limits.js'
import * as modelConfig from './modelConfig.js'
import { shouldNotifyCooldown } from '../commands/cooldownNotice.js'

let cache = { at: 0, models: null }
const contexts = new Map()

function setting(key) {
  return get('SELECT value FROM ai_settings WHERE key = ?', key)?.value || ''
}

function contextKey(ctx) {
  return `${ctx?.jid || ''}|${ctx?.adminJid || ''}`
}

export const aiService = {
  async freeModels({ force = false } = {}) {
    if (!force && cache.models && Date.now() - cache.at < config.aiModelsCacheMs) return cache.models
    const models = toFreeModels(await fetchModels())
    cache = { at: Date.now(), models }
    return models
  },

  async currentModel(kind = 'text', options = {}) { return modelConfig.currentModel(kind, options) },

  async applyModel(model, changedBy) { return modelConfig.applyModel('text', model, changedBy) },

  async changeModel(selection, adminJid, kind = 'text') {
    return modelConfig.changeModel(kind, selection, adminJid || 'admin')
  },

  formatModel(model, kind = 'text') { return modelConfig.describeModel(model, kind) },

  async ask(question, ctx) {
    const userJid = ctx?.adminJid || ''
    const groupJid = ctx?.jid || ''
    const limit = checkLimits(userJid, groupJid)
    if (!limit.ok) {
      recordUsage({ userJid, groupJid, command: '.ask', status: 'blocked', reason: limit.reason, windowStart: limit.windowStart })
      const silent = limit.kind === 'cooldown' && !shouldNotifyCooldown(userJid, 'ask')
      return { ok: false, message: silent ? null : limit.reason, reason: limit.reason, silent }
    }
    const q = String(question || '').trim()
    if (!q) return { ok: false, message: 'Pertanyaan kosong. Contoh: .ask Apa itu AI Agent?' }
    if (q.length > config.aiMaxQuestionChars) {
      return { ok: false, message: `Pertanyaan terlalu panjang. Maksimal ${config.aiMaxQuestionChars} karakter.` }
    }

    let model
    try { model = await this.currentModel() }
    catch (err) { return { ok: false, message: err.message || 'Layanan AI sedang tidak tersedia.' } }
    if (!model) return { ok: false, message: 'Layanan AI sedang tidak tersedia: tidak ada model gratis.' }

    const key = contextKey(ctx)
    const history = config.aiContextMessages > 0 ? (contexts.get(key) || []) : []
    let answer
    try {
      answer = await askModel({ modelId: model.id, question: q, context: history })
    } catch (err) {
      recordUsage({ userJid, groupJid, command: '.ask', modelId: model.id, status: 'failed',
        reason: err.message, promptChars: q.length, windowStart: limit.windowStart })
      return { ok: false, message: err.message || 'Layanan AI sedang tidak tersedia.', code: err.code }
    }

    recordUsage({ userJid, groupJid, command: '.ask', modelId: model.id, status: 'success',
      promptChars: q.length, responseChars: answer.length, windowStart: limit.windowStart })
    if (config.aiContextMessages > 0) {
      contexts.set(key, [...history, { role: 'user', content: q }, { role: 'assistant', content: answer }]
        .slice(-config.aiContextMessages * 2))
    }
    return {
      ok: true,
      model,
      text: `🤖 *JAWABAN AI*\n\n${answer}\n\nModel: ${model.name} (Free)`,
    }
  },

  // Fitur AI turunan (.aiwrite, .rewrite, .fixcode, ...) memakai kuota yang
  // SAMA dengan .ask dan provider/model yang sudah dikonfigurasi.
  async askWithPrompt(ctx, { prompt = '', label = 'AI', command = '.ai' } = {}) {
    const userJid = ctx?.adminJid || ''
    const groupJid = ctx?.jid || ''
    const limit = checkLimits(userJid, groupJid)
    if (!limit.ok) {
      recordUsage({ userJid, groupJid, command, status: 'blocked', reason: limit.reason, windowStart: limit.windowStart })
      const silent = limit.kind === 'cooldown' && !shouldNotifyCooldown(userJid, command)
      return { ok: false, message: silent ? null : limit.reason, silent }
    }
    const text = String(prompt || '').trim()
    if (!text) return { ok: false, message: 'Teks tidak boleh kosong.' }
    if (text.length > config.aiMaxQuestionChars) {
      return { ok: false, message: `Teks terlalu panjang. Maksimal ${config.aiMaxQuestionChars} karakter.` }
    }
    let model
    try { model = await this.currentModel('text', { vip: false }) }
    catch (err) { return { ok: false, message: err.message || 'Layanan AI tidak tersedia.' } }
    if (!model) return { ok: false, message: 'Layanan AI tidak tersedia: belum ada model gratis.' }

    let answer
    try { answer = await askModel({ modelId: model.id, question: text }) }
    catch (err) {
      recordUsage({ userJid, groupJid, command, modelId: model.id, status: 'failed',
        reason: err.message, promptChars: text.length, windowStart: limit.windowStart })
      return { ok: false, message: err.message || 'Layanan AI sedang tidak tersedia.' }
    }
    recordUsage({ userJid, groupJid, command, modelId: model.id, status: 'success',
      promptChars: text.length, responseChars: answer.length, windowStart: limit.windowStart })
    return {
      ok: true, model, answer,
      text: [`✨ *${label}*`, '', answer, '', `Model: ${model.name} (Free)`, 'LUX BOT — Dev By Rifai'].join('\n'),
    }
  },
}
