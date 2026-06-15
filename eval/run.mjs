// eval/run.mjs — three-control experiment orchestrator
// Usage:
//   node eval/run.mjs --smoke   → deterministic synthetic run, writes eval/results/smoke.md
//   node eval/run.mjs           → prints dataset-needed message and exits 0
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runAblation } from './harness.mjs'
import {
  positionConsistency,
  lengthControlledWinRate,
  panelVsSingleBiasDelta,
  selfPreferenceUplift,
  humanAgreement,
} from './metrics.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RESULTS_DIR = path.join(__dirname, 'results')

// ---------------------------------------------------------------------------
// Smoke mode — fully deterministic synthetic fixtures
// ---------------------------------------------------------------------------
async function runSmoke() {
  // --- Control #1: position-swap (Shi 2024) ---
  // OFF: judgeFn ignores the `on` flag → always picks A regardless of order
  // ON:  judgeFn respects swap → consistent (same winner regardless of position)
  const items1 = [
    { id: 1, winner: 'A' },
    { id: 2, winner: 'B' },
    { id: 3, winner: 'A' },
    { id: 4, winner: 'B' },
  ]
  // Returns a pair { ab, ba } representing the verdict in each ordering.
  // OFF: position-biased; first-position always wins (ab='A', ba='B' regardless of true winner)
  // ON:  stable; returns the true winner for both orderings
  const judgeFn1 = (item, { on }) => ({
    ab: on ? item.winner : 'A',   // first-position bias: A is always first, so A always wins OFF
    ba: on ? item.winner : 'B',   // when swapped, B is first, so B always wins OFF
  })
  const abl1 = await runAblation(items1, judgeFn1, 'position-swap')
  const pc_off = positionConsistency(abl1.off)
  const pc_on  = positionConsistency(abl1.on)

  // --- Control #2: verbosity-norm (Dubois 2024) ---
  // OFF: longer response wins more (length-biased); lenDiff correlates strongly with win
  // ON:  win is independent of lenDiff (length-controlled)
  const items2 = [
    { id: 1 },
    { id: 2 },
    { id: 3 },
    { id: 4 },
  ]
  // Hardcoded lenDiff values per item
  const lenDiffs = [200, -150, 300, -100]
  let idx2 = 0
  const judgeFn2 = (_item, { on }) => {
    const lenDiff = lenDiffs[idx2 % lenDiffs.length]
    idx2++
    if (!on) {
      // OFF: win strongly correlated with positive lenDiff (biased)
      return { win: lenDiff > 0 ? 1 : 0, lenDiff }
    } else {
      // ON: win is independent of lenDiff (controlled)
      return { win: 0.5 > 0.3 ? 1 : 0, lenDiff: 0 }
    }
  }
  // Reset index for the two passes inside runAblation
  idx2 = 0
  const abl2 = await runAblation(items2, judgeFn2, 'verbosity-norm')
  const lcwr_off = lengthControlledWinRate(abl2.off)
  const lcwr_on  = lengthControlledWinRate(abl2.on)

  // --- Control #3: stake-free panel (Verga 2024 + Wataoka 2024) ---
  // Synthetic bias scores: single judge is more biased than the panel
  const singleBiasScores = [0.9, 0.8, 0.7, 0.85] // high self-preference
  const panelBiasScores  = [0.2, 0.3, 0.25, 0.15] // low bias (stake-free)
  const biasDelta = panelVsSingleBiasDelta(singleBiasScores, panelBiasScores)

  // Self-preference uplift: single judge rates own outputs higher
  const selfPrefObs = [
    { own: true,  win: 1 },
    { own: true,  win: 1 },
    { own: true,  win: 1 },
    { own: false, win: 1 },
    { own: false, win: 0 },
    { own: false, win: 0 },
  ]
  const uplift = selfPreferenceUplift(selfPrefObs)

  // --- Validity: humanAgreement (Zheng 2023) ---
  const humanAgreementObs = [
    { judge: 'A', human: 'A' },
    { judge: 'A', human: 'A' },
    { judge: 'B', human: 'B' },
    { judge: 'B', human: 'B' },
    { judge: 'A', human: 'A' },
    { judge: 'B', human: 'A' }, // mismatch
  ]
  const ha = humanAgreement(humanAgreementObs)
  const haNote = ha >= 0.80 ? 'PASS' : 'FAIL'

  // --- Build markdown table ---
  const fmt = n => n.toFixed(3)
  const rows = [
    `| C1 position-swap    | positionConsistency | ${fmt(pc_off)} | ${fmt(pc_on)} | +${fmt(pc_on - pc_off)} | Shi 2024 (2406.07791) |`,
    `| C2 verbosity-norm   | lengthControlledWinRate | ${fmt(lcwr_off)} | ${fmt(lcwr_on)} | ${fmt(lcwr_on - lcwr_off)} | Dubois 2024 (2404.04475) |`,
    `| C3 stake-free panel | panelVsSingleBiasDelta | ${fmt(singleBiasScores.reduce((s,x)=>s+x,0)/singleBiasScores.length)} | ${fmt(panelBiasScores.reduce((s,x)=>s+x,0)/panelBiasScores.length)} | -${fmt(biasDelta)} | Verga 2024 (2404.18796); Wataoka 2024 (2410.21819) |`,
    `| C3 self-pref uplift | selfPreferenceUplift   | —    | ${fmt(uplift)} | — | Wataoka 2024 (2410.21819) |`,
    `| Validity            | humanAgreement         | —    | ${fmt(ha)} | — (${haNote} vs 0.80) | Zheng 2023 (2306.05685) |`,
  ]

  const table = [
    '# Council Eval — Smoke Run (synthetic fixtures)',
    '',
    '> Values are indicative on the tiny synthetic slice; directional signal only.',
    '',
    '| control | metric | off | on | delta | source |',
    '|---------|--------|-----|----|-------|--------|',
    ...rows,
    '',
    `_Generated: ${new Date().toISOString()}_`,
  ].join('\n')

  // Write results
  fs.mkdirSync(RESULTS_DIR, { recursive: true })
  const outPath = path.join(RESULTS_DIR, 'smoke.md')
  fs.writeFileSync(outPath, table, 'utf8')
  console.log(table)
  console.log(`\nWrote ${outPath}`)
}

// ---------------------------------------------------------------------------
// Non-smoke mode
// ---------------------------------------------------------------------------
function printDatasetNeeded() {
  console.log(
    'Full eval run requires the MT-Bench dataset (open dependency).\n' +
    'Download it and re-run with --full (not yet implemented).\n' +
    'For a deterministic smoke test, run: node eval/run.mjs --smoke'
  )
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
const smoke = process.argv.includes('--smoke')
if (smoke) {
  runSmoke().catch(err => { console.error(err); process.exit(1) })
} else {
  printDatasetNeeded()
}
