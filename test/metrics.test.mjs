import { test } from 'node:test'
import assert from 'node:assert'
import { positionConsistency, lengthControlledWinRate } from '../eval/metrics.mjs'
import { panelVsSingleBiasDelta, selfPreferenceUplift, humanAgreement } from '../eval/metrics.mjs'

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

test('panelVsSingleBiasDelta = mean(single) - mean(panel)', () => {
  // single judge is more biased than the stake-free panel; delta = how much more
  assert.equal(panelVsSingleBiasDelta([1, 0.5], [0.25, 0.25]), 0.5) // 0.75 - 0.25
})
test('selfPreferenceUplift = winRate(own) - winRate(others)', () => {
  const obs = [{ own: true, win: 1 }, { own: true, win: 1 }, { own: false, win: 1 }, { own: false, win: 0 }]
  assert.equal(selfPreferenceUplift(obs), 0.5) // 1.0 - 0.5
})
test('humanAgreement = fraction judge===human (bar > 0.80 applied by caller)', () => {
  const obs = [{ judge: 'A', human: 'A' }, { judge: 'A', human: 'B' }, { judge: 'B', human: 'B' }, { judge: 'B', human: 'B' }, { judge: 'A', human: 'A' }]
  assert.equal(humanAgreement(obs), 0.8) // 4/5
})
