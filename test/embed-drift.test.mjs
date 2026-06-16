import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Each embedded core function must match the canonical lib byte-for-byte (no silent drift).
const lib = readFileSync('lib/council-core.mjs', 'utf8')
const FUNCS = ['isContaminated', 'gateContamination', 'runNonce', 'counterbalance', 'reconcileSwap', 'codexCmd', 'geminiCmd']
function bodyOf(src, name) {
  const m = src.match(new RegExp(`export function ${name}\\b[\\s\\S]*?\\n}`))
  return m ? m[0].replace(/^export /, '') : null
}
test('mode scripts embed canonical core functions unchanged', () => {
  const skillFiles = readdirSync('skills', { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => join('skills', d.name, 'SKILL.md'))
    .filter(p => { try { return readFileSync(p, 'utf8').includes('export const meta') } catch { return false } })
  assert.ok(skillFiles.length >= 3, `expected >=3 script-bearing skills, found ${skillFiles.length}`)
  for (const p of skillFiles) {
    const md = readFileSync(p, 'utf8')
    for (const fn of FUNCS) {
      const canon = bodyOf(lib, fn)
      assert.ok(canon, `lib missing ${fn}`)
      assert.ok(md.includes(canon), `${p} drifted on ${fn}`)
    }
  }
})
