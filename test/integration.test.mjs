import { test } from 'node:test'
import assert from 'node:assert'
import { runCouncilCore } from '../lib/council-core.mjs'

test('contaminated member is dropped; clean members synthesized', () => {
  const proposal = 'should the council ship as a single skill with modes'
  const raw = [
    { id: 'claude', verdict: { key_claims: ['single skill keeps context low'], risks: ['mode sprawl'], unknowns: [] } },
    { id: 'gemini', verdict: { key_claims: ['modes are a clean interface'], risks: ['discoverability'], unknowns: [] } },
    { id: 'codex',  verdict: { key_claims: ['x'], risks: ['U-shape crossover', 'A-sonnet B-parity', 'N-power slope', 'Meter-B re-witness', 'capture-head undefined', 'B-full arm'], unknowns: ['SP-coordinator'] } },
  ]
  const { live, dropped } = runCouncilCore(proposal, raw)
  assert.deepEqual(dropped, ['codex'])
  assert.equal(live.length, 2)
})
