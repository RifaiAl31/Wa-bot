import { config } from './config.js'

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
const threshold = LEVELS[config.logLevel] ?? LEVELS.info

function emit(level, args) {
  if (LEVELS[level] < threshold) return
  const prefix = `${new Date().toISOString()} [${level.toUpperCase()}]`
  const line = args
    .map((a) => (a instanceof Error ? (a.stack || a.message) : typeof a === 'object' ? JSON.stringify(a) : String(a)))
    .join(' ')
  const out = `${prefix} ${line}`
  if (level === 'error') console.error(out)
  else if (level === 'warn') console.warn(out)
  else console.log(out)
}

export const logger = {
  debug: (...a) => emit('debug', a),
  info: (...a) => emit('info', a),
  warn: (...a) => emit('warn', a),
  error: (...a) => emit('error', a),
}
