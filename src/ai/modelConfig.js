import { get, run, transaction } from '../db/index.js'
import { config } from '../config.js'
import { logger } from '../logger.js'
import { fetchModels, toFreeModels, AIError } from './client.js'
import { freeVisionModels } from './mediaService.js'

const KINDS = {
  text: {
    label: 'Text', idKey: 'active_model_id', nameKey: 'active_model_name', providerKey: 'active_provider',
    env: () => (config.aiProvider === 'gemini' ? config.geminiModel : config.openRouterModel),
  },
  pdf: {
    label: 'PDF', idKey: 'active_pdf_model_id', nameKey: 'active_pdf_model_name', providerKey: 'active_pdf_provider',
    env: () => (config.aiProvider === 'gemini' ? config.geminiModel : config.openRouterModel),
  },
  vision: {
    label: 'Vision', idKey: 'active_vision_model_id', nameKey: 'active_vision_model_name', providerKey: 'active_vision_provider',
    env: () => (config.geminiVisionModel || ''),
  },
}

const cache = new Map()

function setting(key) { return get('SELECT value FROM ai_settings WHERE key = ?', key)?.value || '' }

async function candidates(kind) {
  if (kind === 'vision') {
    const openrouter = config.openRouterApiKey ? await freeVisionModels() : []
    const gemini = config.geminiApiKey
      ? config.geminiVisionModels.map((id) => ({ id, name: id, provider: 'Gemini', vision: true }))
      : []
    return [...openrouter.map((m) => ({ ...m, vision: true })), ...gemini]
  }
  return toFreeModels(await fetchModels())
}

export async function listModels(kind = 'text', { force = false } = {}) {
  const cfg = KINDS[kind]
  if (!cfg) throw new AIError('Jenis model tidak dikenal.', 'not_found')
  const cached = cache.get(kind)
  if (!force && cached && Date.now() - cached.at < config.aiModelsCacheMs) return cached.models
  const models = await candidates(kind)
  cache.set(kind, { at: Date.now(), models })
  return models
}

export async function currentModel(kind = 'text', { vip = false } = {}) {
  const cfg = KINDS[kind]
  if (!cfg) throw new AIError('Jenis model tidak dikenal.', 'not_found')

  if (kind === 'pdf' && !setting(cfg.idKey)) {
    const text = await currentModel('text', { vip })
    if (text) await applyModel('pdf', text, 'system:default')
    return text
  }

  const models = await listModels(kind)
  const visible = kind === 'vision' && !vip ? models.filter((m) => m.provider !== 'Gemini') : models
  const id = setting(cfg.idKey)
  if (id) {
    const active = visible.find((m) => m.id === id)
    if (!active) {
      if (models.some((m) => m.id === id)) {
        throw new AIError('Model vision Gemini hanya tersedia untuk user VIP.', 'vip_only')
      }
      throw new AIError(`${cfg.label} model tidak tersedia dalam daftar model gratis. Pilih model gratis yang kompatibel.`, 'not_found')
    }
    return active
  }
  if (!visible.length) return null
  const preferred = cfg.env() ? visible.find((m) => m.id === cfg.env()) : null
  const chosen = preferred || visible[0]
  await applyModel(kind, chosen, 'system:default')
  return chosen
}

export async function applyModel(kind, model, changedBy) {
  const cfg = KINDS[kind]
  if (!cfg) throw new AIError('Jenis model tidak dikenal.', 'not_found')
  const now = new Date().toISOString()
  transaction(() => {
    for (const [key, value] of [[cfg.idKey, model.id], [cfg.nameKey, model.name], [cfg.providerKey, model.provider]]) {
      run(`INSERT INTO ai_settings(key, value, updated_at) VALUES (?,?,?)
           ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`, key, value, now)
    }
    run(`INSERT INTO ai_model_history(model_id, model_name, provider, changed_by, changed_at)
         VALUES (?,?,?,?,?)`, model.id, model.name, model.provider || '-', `${kind}:${changedBy || 'admin'}`, now)
  })()
  const cached = cache.get(kind)
  if (cached) cached.models = cached.models.map((m) => (m.id === model.id ? { ...m, active: true } : m))
  return model
}

export async function changeModel(kind, selection, changedBy) {
  const cfg = KINDS[kind]
  if (!cfg) throw new AIError('Jenis model tidak dikenal.', 'not_found')
  const models = await listModels(kind, { force: true })
  const raw = String(selection || '').trim()
  const model = /^\d+$/.test(raw) ? models[Number(raw) - 1] : models.find((m) => m.id === raw || m.name === raw)
  if (!model) throw new AIError(`Pilihan tidak valid. Gunakan nomor dari daftar ${cfg.label} atau ID model gratis.`, 'not_found')
  await applyModel(kind, model, changedBy || 'admin')
  logger.info(`${cfg.label} model diubah ke ${model.id} oleh ${changedBy || 'admin'}`)
  return model
}

export function describeModel(model, kind = 'text') {
  const cfg = KINDS[kind] || KINDS.text
  return [
    kind === 'text' ? 'MODEL AI AKTIF' : `MODEL AI ${cfg.label.toUpperCase()} AKTIF`, '',
    `Nama: ${model.name}`, `ID: ${model.id}`,
    `Provider: ${model.provider || (config.aiProvider === 'gemini' ? 'Gemini' : 'OpenRouter')}`,
    'Status: Aktif', 'Kategori: Free',
  ].join('\n')
}

export function activeModelIds() {
  return Object.fromEntries(Object.entries(KINDS).map(([kind, cfg]) => [kind, setting(cfg.idKey) || null]))
}
