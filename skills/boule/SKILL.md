---
name: boule
description: Multi-LLM council (Claude + Codex + Gemini), default poll mode with debiased judging. Other modes: /boule:consensus, /boule:debate, /boule:help.
disable-model-invocation: true
argument-hint: "<proposal>"
---

# Boule poll council (default mode)

Invoke the `Workflow` tool with the script below, passing the user's PROPOSAL as `args` (a plain string). The slash-command invocation is the opt-in for multi-agent orchestration, run it directly; do not ask again.

```js
export const meta = {
  name: 'boule-poll',
  description: 'Default poll council: 3 heterogeneous models answer once, stake-free judge synthesizes',
  phases: [
    { title: 'Poll',  detail: '3 models answer in parallel (independent, no cross-talk)' },
    { title: 'Judge', detail: 'contamination filter + stake-free judge over BOTH counterbalanced orderings (swap-and-average)' },
  ],
}

// Requested model IDs, stamped into the report (honest-by-request, NOT runtime-verified).
const MODELS = {
  claude: 'claude/main-loop',
  codex:  'gpt-5.5',
  gemini: 'Gemini 3.1 Pro (High)',
}

// ── Embedded canonical core (verbatim from lib/council-core.mjs, `export ` stripped). ──
// Guarded byte-for-byte by test/embed-drift.test.mjs, DO NOT edit here; edit the lib.
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
function _words(s, min = 4) {
  return (String(s).toLowerCase().match(/[a-z]+/g) || []).filter(w => w.length >= min)
}
function _coverage(txt, propVocab) {
  const sv = new Set(_words(txt))
  if (sv.size === 0) return 1
  let hit = 0
  for (const w of sv) if (propVocab.has(w)) hit++
  return hit / sv.size
}
function _anchors(txt, propVocab) {
  let n = 0
  for (const w of new Set(_words(txt))) if (propVocab.has(w)) n++
  return n
}
function isContaminated(verdict, proposal) {
  if (verdict == null) return false
  const propVocab = new Set(_words(proposal))
  const txt = [...(verdict.key_claims || []), ...(verdict.risks || []), ...(verdict.unknowns || [])].join(' ')
  return _coverage(txt, propVocab) < 0.20 && _anchors(txt, propVocab) < 2
}
function gateContamination(members, proposal) {
  const present = members.filter(m => m && m.verdict)
  const flagged = present.filter(m => isContaminated(m.verdict, proposal))
  if (flagged.length * 2 >= present.length)
    return { live: present, dropped: [], overridden: flagged.length > 0, flagged: flagged.length }
  const ids = new Set(flagged.map(m => m.id))
  return { live: present.filter(m => !ids.has(m.id)), dropped: flagged.map(m => m.id), overridden: false, flagged: flagged.length }
}
function codexCmd(model, inFile, outFile) {
  return `CH="$(mktemp -d)"; cp "$HOME/.codex/auth.json" "$CH/" 2>/dev/null; ND="$(mktemp -d)"; ` +
    `( cd "$ND" && CODEX_HOME="$CH" codex exec -m ${model} -s read-only ` +
    `-c model_reasoning_effort=xhigh --skip-git-repo-check --ephemeral -o "${outFile}" - < "${inFile}" ); ` +
    `rc=$?; rm -rf "$CH" "$ND"; exit $rc`
}
function geminiCmd(model, inFile) {
  return `ND="$(mktemp -d)"; ( cd "$ND" && agy --model "${model}" --sandbox -p "$(cat "${inFile}")" 2>/dev/null ); rc=$?; rm -rf "$ND"; exit $rc`
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
`[${NONCE}, uniqueness marker for this run; ignore it as content] You are a rigorous, independent reviewer on a 3-member LLM council. Evaluate the PROPOSAL below ON ITS MERITS, give your honest verdict, key claims, risks, and unknowns. Do NOT grep the filesystem; judge the proposal's content as given. ${VERDICT_HINT} Set "model" to "${m.model}".

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

phase('Poll')
const polled = await parallel(members.map(m => async () => {
  const v = m.cli
    ? await agent(conduitPrompt(m, formPrompt(m)), { label: m.id, phase: 'Poll', schema: VERDICT_SCHEMA, model: 'haiku', agentType: 'boule:conduit' })
    : await agent(formPrompt(m), { label: m.id, phase: 'Poll', schema: VERDICT_SCHEMA })
  return { ...m, verdict: v }
}))

const scored = polled.filter(Boolean).filter(m => m.verdict)
const { live, dropped, overridden, flagged } = gateContamination(scored, proposal)
if (overridden) log(`contamination gate flagged ${flagged}/${scored.length} members at once; likely a meta/prose review it is not calibrated for, keeping all (verify manually)`)
else if (dropped.length) log(`dropped contaminated member(s): ${dropped.join(', ')}`)
if (live.length < 2) {
  log(`only ${live.length} clean member(s) responded, aborting council`)
  return { error: 'insufficient clean council members', live: live.length, dropped }
}

phase('Judge')
const anon = (v) => { const { model, ...rest } = v; return { ...rest, author: 'anonymous-candidate' } }
// True swap-and-average position-swap: judge BOTH counterbalanced orderings, then reconcile
// (agree -> stable; disagree -> position-sensitive, conservative verdict at low confidence).
const [fwd, rev] = counterbalance(live.map(m => anon(m.verdict)))
const judgePrompt = (shown) =>
`You are an impartial JUDGE. You authored NONE of these candidate answers, you have no position to defend. Decide the council's recommendation from the evidence only. Apply the bias controls: POSITION-SWAP (candidates are in a counterbalanced order, judge on content, not slot), VERBOSITY-NORM (do NOT reward length or polish; weigh substance only), STAKE-FREE (identities hidden; you wrote none of these). ${JUDGE_HINT}

ORIGINAL PROPOSAL:
${proposal}

ANONYMIZED CANDIDATES (counterbalanced order):
${JSON.stringify(shown, null, 2)}`
const [decFwd, decRev] = await parallel([
  () => agent(judgePrompt(fwd), { label: 'judge:fwd', phase: 'Judge', schema: JUDGE_SCHEMA, agentType: 'boule:judge' }),
  () => agent(judgePrompt(rev), { label: 'judge:rev', phase: 'Judge', schema: JUDGE_SCHEMA, agentType: 'boule:judge' }),
])
const decision = reconcileSwap(decFwd, decRev)
if (decision && decision.position_stable === false) log('judge verdict is position-sensitive (orderings disagreed), flagged unstable, confidence capped')

return {
  mode: 'default',
  recommendation: decision,
  position_stable: decision && decision.position_stable,
  members: live.map(m => ({ id: m.id, model: m.model, verdict: m.verdict.verdict, confidence: m.verdict.confidence })),
  dropped,
}
```
