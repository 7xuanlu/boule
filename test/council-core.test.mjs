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

import { reconcileSwap } from '../lib/council-core.mjs'

const DEC = (recommendation, confidence = 'high') =>
  ({ recommendation, confidence, rationale: 'r', consensus: ['c'], dissent: [] })

test('reconcileSwap: both orderings agree -> stable, recommendation + confidence kept', () => {
  const r = reconcileSwap(DEC('approve', 'high'), DEC('approve', 'medium'))
  assert.equal(r.position_stable, true)
  assert.equal(r.recommendation, 'approve')
  assert.equal(r.confidence, 'high') // forward decision preserved verbatim
})
test('reconcileSwap: disagree -> unstable, confidence downgraded to low', () => {
  const r = reconcileSwap(DEC('approve', 'high'), DEC('reject', 'high'))
  assert.equal(r.position_stable, false)
  assert.equal(r.confidence, 'low')
})
test('reconcileSwap: mild disagree picks the more conservative verdict', () => {
  const r = reconcileSwap(DEC('approve'), DEC('approve-with-changes'))
  assert.equal(r.recommendation, 'approve-with-changes')
  assert.equal(r.position_stable, false)
})
test('reconcileSwap: approve vs reject -> reject (fail-closed, never greenlights)', () => {
  assert.equal(reconcileSwap(DEC('approve'), DEC('reject')).recommendation, 'reject')
  assert.equal(reconcileSwap(DEC('reject'), DEC('approve')).recommendation, 'reject')
})
test('reconcileSwap: any flip involving needs-more-info -> needs-more-info (top of ladder)', () => {
  assert.equal(reconcileSwap(DEC('reject'), DEC('needs-more-info')).recommendation, 'needs-more-info')
  assert.equal(reconcileSwap(DEC('approve'), DEC('needs-more-info')).recommendation, 'needs-more-info')
})
test('reconcileSwap: disagree keeps the WINNING decision intact (rationale/dissent match the chosen recommendation)', () => {
  const approve = { recommendation: 'approve', confidence: 'high', rationale: 'looks good', consensus: ['ship'], dissent: [] }
  const reject  = { recommendation: 'reject',  confidence: 'high', rationale: 'fatal flaw', consensus: [], dissent: ['blocker'] }
  const rb = reconcileSwap(approve, reject) // b (reversed) is more conservative -> b wins
  assert.equal(rb.recommendation, 'reject')
  assert.equal(rb.rationale, 'fatal flaw')      // must NOT be 'looks good'
  assert.deepEqual(rb.dissent, ['blocker'])
  const ra = reconcileSwap(reject, approve) // a (forward) is more conservative -> a wins
  assert.equal(ra.recommendation, 'reject')
  assert.equal(ra.rationale, 'fatal flaw')
})
test('reconcileSwap: one ordering missing -> present decision, position_stable false (unverified)', () => {
  const r = reconcileSwap(DEC('approve', 'high'), null)
  assert.equal(r.recommendation, 'approve')
  assert.equal(r.position_stable, false)
  const r2 = reconcileSwap(null, DEC('reject', 'medium')) // null-first path
  assert.equal(r2.recommendation, 'reject')
  assert.equal(r2.position_stable, false)
  assert.equal(reconcileSwap(null, null), null)
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

import { gateContamination } from '../lib/council-core.mjs'

const ON = (id, claim) => ({ id, verdict: { key_claims: [claim], risks: [], unknowns: [] } })
const BLEED = id => ({ id, verdict: { key_claims: ['x'],
  risks: ['U-shape crossover', 'A-sonnet B-parity', 'N-power slope', 'Meter-B re-witness',
          'capture-head undefined', 'B-full arm', 'SP-coordinator drift', 'cache-hit flattening'],
  unknowns: [] } })

test('gateContamination: a single flagged member (strict minority) is dropped', () => {
  const members = [ON('claude', 'package the council plugin with bias controls'),
                   ON('gemini', 'the council plugin keeps standing context low'),
                   BLEED('codex')]
  const { live, dropped, overridden } = gateContamination(members, PROPOSAL)
  assert.deepEqual(dropped, ['codex'])
  assert.equal(live.length, 2)
  assert.equal(overridden, false)
})
test('gateContamination: majority flagged -> overridden, all kept (systematic FP)', () => {
  const members = [ON('claude', 'the council plugin packages bias controls'), BLEED('gemini'), BLEED('codex')]
  const { live, dropped, overridden, flagged } = gateContamination(members, PROPOSAL)
  assert.equal(live.length, 3)
  assert.deepEqual(dropped, [])
  assert.equal(overridden, true)
  assert.equal(flagged, 2)
})
test('gateContamination: prose/meta review (all low-overlap) is NOT dropped wholesale', () => {
  const proposal = 'audit the boule readme; flag misleading claims and check clarity for a newcomer'
  const meta = c => ({ key_claims: [c], risks: [], unknowns: [] })
  const members = [
    { id: 'claude', verdict: meta('the subtitle overstates novelty by implying universal absence') },
    { id: 'gemini', verdict: meta('each citation maps onto a function in the codebase') },
    { id: 'codex',  verdict: meta('the etymology sentence inverts the historical metaphor') },
  ]
  const { live, dropped, overridden } = gateContamination(members, proposal)
  assert.equal(live.length, 3)
  assert.deepEqual(dropped, [])
  assert.equal(overridden, true)
})
