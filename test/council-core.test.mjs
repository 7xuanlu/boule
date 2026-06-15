import { test } from 'node:test'
import assert from 'node:assert'
import { parseInvocation } from '../lib/council-core.mjs'

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
