import { deploy, rollback, status, checkUpdate } from '../src/system/deployService.js'

const args = process.argv.slice(2)
let result
if (args[0] === 'deploy') result = deploy({ allowDirty: args.includes('--allow-dirty') })
else if (args[0] === 'rollback') result = { ok: true, ...rollback({ commit: args[1] || null, allowDirty: args.includes('--allow-dirty') }) }
else if (args[0] === 'check') result = checkUpdate()
else result = status()

console.log(JSON.stringify(result, null, 2))
process.exit(result.ok === false ? 1 : 0)
