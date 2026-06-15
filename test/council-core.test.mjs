import { test } from 'node:test'
import assert from 'node:assert'
import { parseInvocation } from '../lib/council-core.mjs'
import { isContaminated, _coverage, _foreignCount } from '../lib/council-core.mjs'

test('parseInvocation splits mode from proposal', () => {
  assert.deepEqual(parseInvocation('consensus should we ship X'),
    { mode: 'consensus', proposal: 'should we ship X' })
  assert.deepEqual(parseInvocation('adversarial plan A'),
    { mode: 'adversarial', proposal: 'plan A' })
})
test('unknown leading token -> default mode, whole text is proposal', () => {
  assert.deepEqual(parseInvocation('is this design sound?'),
    { mode: 'default', proposal: 'is this design sound?' })
})
test('bare mode word -> help/empty proposal', () => {
  assert.deepEqual(parseInvocation('help'), { mode: 'help', proposal: '' })
})

const PROPOSAL = 'package a multi-llm council as a claude code plugin with bias controls position-swap consensus stake-free synthesis progressive disclosure'

test('gate flags an off-topic (context-bleed) verdict', () => {
  const bleed = { key_claims: ['lean packaging is fine'],
    risks: ['U-shape cost curves assume crossover', 'A-sonnet coordinator and B-parity unclear',
            'N-power insufficient for slope', 'Meter-B re-witness capture-head undefined',
            'B-full vs B-parity arm', 'prompt-caching cache-hit flattening'],
    unknowns: ['SP-coordinator vs UP-cost', 'task-order alias confound'] }
  assert.equal(isContaminated(bleed, PROPOSAL), true)
})
test('gate passes an on-topic verdict', () => {
  const clean = { key_claims: ['single council skill keeps standing context low'],
    risks: ['consensus and adversarial modes add complexity', 'stake-free synthesis is single point'],
    unknowns: ['which published eval proves the bias controls'] }
  assert.equal(isContaminated(clean, PROPOSAL), false)
})

import { runNonce, counterbalance } from '../lib/council-core.mjs'

test('runNonce is deterministic per proposal, differs across proposals', () => {
  assert.equal(runNonce('alpha'), runNonce('alpha'))
  assert.notEqual(runNonce('alpha'), runNonce('beta'))
  assert.match(runNonce('alpha'), /^council-[a-z0-9]+$/)
})
test('counterbalance yields both orderings for a 2-item pair', () => {
  const orders = counterbalance(['A', 'B'])
  assert.equal(orders.length, 2)
  assert.deepEqual(orders[0], ['A', 'B'])
  assert.deepEqual(orders[1], ['B', 'A'])
})

import { codexCmd, geminiCmd } from '../lib/council-core.mjs'

test('codexCmd isolates CODEX_HOME + cwd and preserves auth', () => {
  const c = codexCmd('gpt-5.5', '/t/in.txt', '/t/out.txt')
  assert.match(c, /CODEX_HOME="\$CH"/)
  assert.match(c, /cp "\$HOME\/\.codex\/auth\.json"/)
  assert.match(c, /mktemp -d/)
  assert.match(c, /-s read-only/)
  assert.match(c, /model_reasoning_effort=xhigh/)
  assert.match(c, /--ephemeral/)
})
test('geminiCmd runs read-only plan mode', () => {
  const g = geminiCmd('gemini-3.1-pro-preview', '/t/in.txt')
  assert.match(g, /--approval-mode plan/)
})
