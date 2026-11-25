import * as pm from '../src/system/processManager.js'

const action = process.argv[2] || 'status'
let result
switch (action) {
  case 'start-bot': result = pm.startBot(); break
  case 'stop-bot': result = pm.stopBot(); break
  case 'restart-bot': result = pm.scheduleBotRestart(); break
  case 'start-tunnel': result = pm.startTunnel(); break
  case 'stop-tunnel': result = pm.stopTunnel(); break
  case 'restart-tunnel': result = pm.restartTunnel(); break
  case 'status': result = pm.statusAll(); break
  case 'logs': result = { lines: pm.readLog(process.argv[3] || 'bot', Number(process.argv[4]) || 100) }; break
  default: result = { ok: false, error: `Aksi tidak dikenal: ${action}` }
}
console.log(JSON.stringify(result, null, 2))
process.exit(result.ok === false ? 1 : 0)
