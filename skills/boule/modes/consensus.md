# Boule — consensus mode

Invoke the `Workflow` tool with the script below, passing the user's PROPOSAL as `args` (a plain string). Run it directly; do not ask again.

```js
export const meta = {
  name: 'boule-consensus',
  description: 'Consensus council: 3 propose, peer-rank anonymized answers, stake-free judge synthesizes',
  phases: [
    { title: 'Propose', detail: '3 models give independent verdicts (parallel)' },
    { title: 'Rank',    detail: 'each member peer-ranks the anonymized answers (counterbalanced order)' },
    { title: 'Judge',   detail: 'Borda tally + stake-free judge over BOTH anonymized orderings (swap-and-average)' },
  ],
}

// Requested model IDs — stamped into the report (honest-by-request, NOT runtime-verified).
const MODELS = {
  claude: 'claude/main-loop',
  codex:  'gpt-5.5',
  gemini: 'gemini-3.1-pro-preview',
}

// ── Embedded canonical core (verbatim from lib/council-core.mjs, `export ` stripped). ──
// Guarded byte-for-byte by test/embed-drift.test.mjs — DO NOT edit here; edit the lib.
function runNonce(proposal) {
  const h = Array.from(String(proposal)).reduce((a, c) => ((a * 31 + c.charCodeAt(0)) >>> 0), 7)
  return 'council-' + h.toString(36)
}
function counterbalance(items) {
  return [items.slice(), items.slice().reverse()]
}
function reconcileSwap(a, b) {
  const RANK = { approve: 0, 'approve-with-changes': 1, reject: 2, 'needs-more-info': 3 }
  if (!a && !b) return null
  if (!a || !b) return { ...(a || b), position_stable: false }
  if (a.recommendation === b.recommendation) return { ...a, position_stable: true }
  const winner = RANK[a.recommendation] >= RANK[b.recommendation] ? a : b
  return { ...winner, confidence: 'low', position_stable: false }
}
function _foreignCount(txt, propLower) {
  let n = 0
  for (const x of new Set(txt.match(/\b[A-Za-z]+-[A-Za-z]+\b/g) || []))
    if (x.length > 3 && propLower.indexOf(x.toLowerCase()) === -1) n++
  return n
}
function _coverage(txt, propVocab) {
  const sv = new Set(txt.toLowerCase().match(/[a-z][a-z\-]{3,}/g) || [])
  if (sv.size === 0) return 1
  let hit = 0
  for (const w of sv) if (propVocab.has(w)) hit++
  return hit / sv.size
}
function isContaminated(verdict, proposal) {
  if (verdict == null) return false
  const propLower = String(proposal).toLowerCase()
  const propVocab = new Set(propLower.match(/[a-z][a-z\-]{3,}/g) || [])
  const txt = [...(verdict.key_claims || []), ...(verdict.risks || []), ...(verdict.unknowns || [])].join(' ')
  return _foreignCount(txt, propLower) >= 8 || _coverage(txt, propVocab) < 0.20
}
function codexCmd(model, inFile, outFile) {
  return `CH="$(mktemp -d)"; cp "$HOME/.codex/auth.json" "$CH/" 2>/dev/null; ND="$(mktemp -d)"; ` +
    `( cd "$ND" && CODEX_HOME="$CH" codex exec -m ${model} -s read-only ` +
    `-c model_reasoning_effort=xhigh --skip-git-repo-check --ephemeral -o "${outFile}" - < "${inFile}" ); ` +
    `rc=$?; rm -rf "$CH" "$ND"; exit $rc`
}
function geminiCmd(model, inFile) {
  return `gemini -m ${model} --approval-mode plan -p "$(cat "${inFile}")" 2>/dev/null`
}

// ── Orchestration ──
const proposal = typeof args === 'string' ? args : (args && args.proposal) || ''
const NONCE = runNonce(proposal)

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['verdict', 'confidence', 'model', 'key_claims', 'risks', 'unknowns'],
  properties: {
    verdict:    { type: 'string', enum: ['approve', 'approve-with-changes', 'reject', 'needs-more-info'] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    model:      { type: 'string' },
    key_claims: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 6 },
    risks:      { type: 'array', items: { type: 'string' }, maxItems: 6 },
    unknowns:   { type: 'array', items: { type: 'string' }, maxItems: 4 },
  },
}
const JUDGE_SCHEMA = {
  type: 'object',
  required: ['recommendation', 'confidence', 'rationale', 'consensus', 'dissent'],
  properties: {
    recommendation: { type: 'string', enum: ['approve', 'approve-with-changes', 'reject', 'needs-more-info'] },
    confidence:     { type: 'string', enum: ['low', 'medium', 'high'] },
    rationale:      { type: 'string' },
    consensus:      { type: 'array', items: { type: 'string' }, maxItems: 6 },
    dissent:        { type: 'array', items: { type: 'string' }, maxItems: 6 },
  },
}
const VERDICT_HINT = 'Return ONLY a JSON object (no prose, no markdown fence) with keys: verdict (one of "approve"|"approve-with-changes"|"reject"|"needs-more-info"), confidence ("low"|"medium"|"high"), model (string), key_claims (1-6 strings), risks (0-6 strings), unknowns (0-4 strings).'
const JUDGE_HINT = 'Return ONLY a JSON object (no prose, no fence) with keys: recommendation ("approve"|"approve-with-changes"|"reject"|"needs-more-info"), confidence ("low"|"medium"|"high"), rationale (string), consensus (0-6 strings), dissent (0-6 strings).'

const members = [
  { id: 'claude', cli: null,    model: MODELS.claude },
  { id: 'codex',  cli: 'codex', model: MODELS.codex },
  { id: 'gemini', cli: 'gemini', model: MODELS.gemini },
]

const formPrompt = (m) =>
`[${NONCE} — uniqueness marker for this run; ignore it as content] You are a rigorous, independent reviewer on a 3-member LLM council. Evaluate the PROPOSAL below ON ITS MERITS — give your honest verdict, key claims, risks, and unknowns. Do NOT grep the filesystem; judge the proposal's content as given. ${VERDICT_HINT} Set "model" to "${m.model}".

PROPOSAL:
${proposal}`

const conduitPrompt = (m, externalPrompt) => {
  const inFile = `$TMPDIR/council_${m.id}_${NONCE}_in.txt`
  const outFile = `$TMPDIR/council_${m.id}_${NONCE}_out.txt`
  const cmd = m.cli === 'codex' ? codexCmd(m.model, inFile, outFile) : geminiCmd(m.model, inFile)
  return `Write the EXTERNAL PROMPT (everything below the marker, verbatim) to "${inFile}", then run this command WITH THE BASH SANDBOX DISABLED (it needs network + IPC):

${cmd}

${m.cli === 'codex' ? `Then read the model's final JSON from "${outFile}".` : `Take the JSON object printed to stdout.`} Emit that JSON VERBATIM as your structured output (repair only malformed syntax; never change content). Ensure "model" is "${m.model}".

EXTERNAL PROMPT:
${externalPrompt}`
}

const RANK_SCHEMA = {
  type: 'object',
  required: ['ranking', 'rationale'],
  properties: {
    ranking:   { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
    rationale: { type: 'string' },
  },
}
const RANK_HINT = 'Return ONLY a JSON object (no prose, no fence) with keys: ranking (array of candidate id strings, best-first, e.g. ["cand-2","cand-1","cand-3"]), rationale (string).'

// ── Phase: Propose (same independent verdicts as poll) ──
phase('Propose')
const proposed = await parallel(members.map(m => async () => {
  const v = m.cli
    ? await agent(conduitPrompt(m, formPrompt(m)), { label: m.id, phase: 'Propose', schema: VERDICT_SCHEMA, model: 'haiku', agentType: 'boule-conduit' })
    : await agent(formPrompt(m), { label: m.id, phase: 'Propose', schema: VERDICT_SCHEMA })
  return { ...m, verdict: v }
}))
const scored = proposed.filter(Boolean).filter(m => m.verdict)
const live = scored.filter(m => !isContaminated(m.verdict, proposal))
const dropped = scored.filter(m => isContaminated(m.verdict, proposal)).map(m => m.id)
if (dropped.length) log(`dropped contaminated member(s): ${dropped.join(', ')}`)
if (live.length < 2) {
  log(`only ${live.length} clean member(s) responded — aborting council`)
  return { error: 'insufficient clean council members', live: live.length, dropped }
}

// ── Phase: Rank (anonymized peer-rank; each ranker sees a counterbalanced order) ──
phase('Rank')
const anonCand = (v, i) => { const { model, ...rest } = v; return { id: `cand-${i + 1}`, ...rest } }
const candidates = live.map((m, i) => anonCand(m.verdict, i))
const orderings = counterbalance(candidates)
const rankPrompt = (shown) =>
`You are a member of an LLM council. Peer-rank the ANONYMIZED candidate verdicts below, best-first, by quality of reasoning and evidence. POSITION-SWAP: the candidates are shown in a counterbalanced order — rank on CONTENT, not slot. Ignore length and style; weigh substance only. Reference candidates by their "id". ${RANK_HINT}

ORIGINAL PROPOSAL:
${proposal}

ANONYMIZED CANDIDATES (counterbalanced order):
${JSON.stringify(shown, null, 2)}`
const rankings = await parallel(live.map((m, i) => async () => {
  const shown = orderings[i % 2]
  return m.cli
    ? await agent(conduitPrompt(m, rankPrompt(shown)), { label: `rank:${m.id}`, phase: 'Rank', schema: RANK_SCHEMA, model: 'haiku', agentType: 'boule-conduit' })
    : await agent(rankPrompt(shown), { label: `rank:${m.id}`, phase: 'Rank', schema: RANK_SCHEMA })
}))

// Mechanical Borda tally over the anonymized rankings (order-independent; labels are stable).
const borda = {}
for (const c of candidates) borda[c.id] = 0
for (const r of rankings.filter(Boolean)) {
  const order = (r.ranking || []).filter(id => id in borda)
  order.forEach((id, idx) => { borda[id] += (order.length - idx) })
}

// ── Phase: Judge (stake-free synth over the ranked, anonymized set) ──
phase('Judge')
// True swap-and-average: judge BOTH counterbalanced candidate orderings, then reconcile. The
// Borda tally is order-independent (stable labels), so it is identical for both orderings.
const [fwdC, revC] = counterbalance(candidates)
const judgePrompt = (shown) =>
`You are an impartial JUDGE. You authored NONE of these candidates — no position to defend. Synthesize the council's recommendation from the anonymized candidate verdicts and the peer-rank tally. Apply the bias controls: POSITION-SWAP (peer rankings were collected under counterbalanced ordering and the Borda tally is order-independent — judge on content, not slot), VERBOSITY-NORM (do NOT reward length or polish; substance only), STAKE-FREE (identities hidden; you wrote none). ${JUDGE_HINT}

ORIGINAL PROPOSAL:
${proposal}

ANONYMIZED CANDIDATES:
${JSON.stringify(shown, null, 2)}

PEER-RANK TALLY (Borda points, higher = ranked better by peers):
${JSON.stringify(borda, null, 2)}`
const [decFwd, decRev] = await parallel([
  () => agent(judgePrompt(fwdC), { label: 'judge:fwd', phase: 'Judge', schema: JUDGE_SCHEMA, agentType: 'boule-judge' }),
  () => agent(judgePrompt(revC), { label: 'judge:rev', phase: 'Judge', schema: JUDGE_SCHEMA, agentType: 'boule-judge' }),
])
const decision = reconcileSwap(decFwd, decRev)
if (decision && decision.position_stable === false) log('judge verdict is position-sensitive (orderings disagreed) — flagged unstable, confidence capped')

return {
  mode: 'consensus',
  recommendation: decision,
  position_stable: decision && decision.position_stable,
  borda,
  members: live.map(m => ({ id: m.id, model: m.model, verdict: m.verdict.verdict, confidence: m.verdict.confidence })),
  dropped,
}
```
