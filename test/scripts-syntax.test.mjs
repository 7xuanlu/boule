import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Every modes/*.md embeds one ```js Workflow script. Extract + node --check it
// (wrapped in an async fn so top-level await/return/export are legal, mirroring the runtime).
function extractScript(md) {
  const m = md.match(/```js\n([\s\S]*?)\n```/)
  return m ? m[1] : null
}
test('every mode script is valid JS', () => {
  const dir = 'skills/council/modes'
  for (const f of readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const js = extractScript(readFileSync(join(dir, f), 'utf8'))
    if (js === null) continue
    const wrapped = 'async function __wf(){\n' + js.replace('export const meta', 'const meta') + '\n}\n'
    const tmp = join(mkdtempSync(join(tmpdir(), 'wf-')), 'c.mjs')
    writeFileSync(tmp, wrapped)
    execFileSync(process.execPath, ['--check', tmp]) // throws on syntax error
  }
})
