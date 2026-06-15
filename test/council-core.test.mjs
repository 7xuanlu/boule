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
