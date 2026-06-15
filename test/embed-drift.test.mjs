import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Each embedded core function must match the canonical lib byte-for-byte (no silent drift).
const lib = readFileSync('lib/council-core.mjs', 'utf8')
const FUNCS = ['isContaminated', 'runNonce', 'counterbalance', 'reconcileSwap', 'codexCmd', 'geminiCmd']
function bodyOf(src, name) {
  const m = src.match(new RegExp(`export function ${name}\\b[\\s\\S]*?\\n}`))
  return m ? m[0].replace(/^export /, '') : null
}
test('mode scripts embed canonical core functions unchanged', () => {
  for (const f of readdirSync('skills/boule/modes').filter(x => x.endsWith('.md'))) {
    const md = readFileSync(join('skills/boule/modes', f), 'utf8')
    for (const fn of FUNCS) {
      const canon = bodyOf(lib, fn)
      assert.ok(canon, `lib missing ${fn}`)
      assert.ok(md.includes(canon), `${f} drifted on ${fn}`)
    }
  }
})
