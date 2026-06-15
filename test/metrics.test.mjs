import { test } from 'node:test'
import assert from 'node:assert'
import { positionConsistency, lengthControlledWinRate } from '../eval/metrics.mjs'

test('positionConsistency = fraction of pairs with order-stable verdict', () => {
  // each pair: verdict in order A-B vs B-A; consistent if same winner
  const pairs = [{ ab: 'A', ba: 'A' }, { ab: 'A', ba: 'B' }, { ab: 'B', ba: 'B' }]
  assert.equal(positionConsistency(pairs), 2 / 3)
})
test('lengthControlledWinRate returns a win-rate in [0,1]', () => {
  const obs = [{ win: 1, lenDiff: 100 }, { win: 0, lenDiff: -100 }, { win: 1, lenDiff: 0 }]
  const r = lengthControlledWinRate(obs)
  assert.ok(r >= 0 && r <= 1)
})
