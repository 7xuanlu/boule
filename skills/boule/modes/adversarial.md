# Boule — adversarial mode

Invoke the `Workflow` tool with the script below, passing the user's PROPOSAL as `args` (a plain string, or `{ proposal, lenses?: string[] }`). The slash-command invocation is the opt-in for multi-agent orchestration — run it directly; do not ask again.

Three independent reasoners from three different labs (Claude main-loop, OpenAI Codex, Google Gemini) form parallel verdicts, then adversarially attack each other's reasoning (targets anonymized), then defend or concede, then a stake-free judge decides from the structured outcome.

```js
export const meta = {
  name: 'boule-adversarial',
  description: 'Adversarial multi-lab council: form → attack → defend → judge (cross-model, anonymized, stake-free judge)',
  phases: [
    { title: 'Form',   detail: 'parallel independent verdicts (3 heterogeneous models, no cross-talk)' },
    { title: 'Attack', detail: 'each member refutes the OTHER TWO, targets anonymized (never self-judge)' },
    { title: 'Defend', detail: 'authors rebut attacks on their verdict, or concede (holds=false)' },
    { title: 'Judge',  detail: 'deterministic tally + stake-free judge over BOTH anonymized orderings (swap-and-average)' },
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
  return `gemini -m ${model} --approval-mode plan -p "$(cat "${inFile}")" 2>/dev/null`
}

// ── Orchestration ──
// args may be a plain string (the proposal) OR { proposal, lenses?: string[] }.
// lenses are optional, model-AGNOSTIC focus hints (e.g. ['security','cost','UX']) — NOT stances.
// Assigned to members by index; absent → all members evaluate honestly.
const proposal = typeof args === 'string' ? args : (args && args.proposal) || ''
const lenses = (args && typeof args === 'object' && Array.isArray(args.lenses)) ? args.lenses : []
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
const ATTACK_SCHEMA = {
  type: 'object',
  required: ['refutations', 'concessions'],
  properties: {
    refutations: { type: 'array', items: {
      type: 'object',
      required: ['target_claim', 'attack', 'severity'],
      properties: {
        target_claim: { type: 'string' },
        attack:       { type: 'string' },
        severity:     { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
      },
    }, maxItems: 8 },
    concessions: { type: 'array', items: { type: 'string' }, maxItems: 4 },
  },
}
const DEFENSE_SCHEMA = {
  type: 'object',
  required: ['defenses', 'conceded', 'verdict_changed'],
  properties: {
    defenses: { type: 'array', items: {
      type: 'object',
      required: ['attack_ref', 'rebuttal', 'holds'],
      properties: {
        attack_ref: { type: 'string' },
        rebuttal:   { type: 'string' },
        holds:      { type: 'boolean' },
      },
    }, maxItems: 8 },
    conceded: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    // Did conceding a flaw change your OVERALL verdict? Surfaced to the judge (the tally
    // stays mechanical — no auto-downgrade, which would re-inject subjective severity).
    verdict_changed: { type: 'boolean' },
    revised_verdict: { type: 'string', enum: ['approve', 'approve-with-changes', 'reject', 'needs-more-info'] },
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

// ── Schema hints handed to the EXTERNAL models (codex/gemini reason + return JSON themselves;
//    the wrapping Claude conduit only forwards it). ──
const VERDICT_HINT = 'Return ONLY a JSON object (no prose, no markdown fence) with keys: verdict (one of "approve"|"approve-with-changes"|"reject"|"needs-more-info"), confidence ("low"|"medium"|"high"), model (string), key_claims (1-6 strings), risks (0-6 strings), unknowns (0-4 strings).'
const ATTACK_HINT  = 'Return ONLY a JSON object (no prose, no fence) with keys: refutations (array ≤8, each {target_claim, attack, severity:"critical"|"high"|"medium"|"low"}), concessions (array of strings, ≤4).'
const DEFENSE_HINT = 'Return ONLY a JSON object (no prose, no fence) with keys: defenses (array ≤8, each {attack_ref, rebuttal, holds:boolean}), conceded (array of strings, ≤4), verdict_changed (boolean — true ONLY if conceding a flaw changes your overall verdict), revised_verdict (your new verdict if verdict_changed, else omit).'
const JUDGE_HINT   = 'Return ONLY a JSON object (no prose, no fence) with keys: recommendation ("approve"|"approve-with-changes"|"reject"|"needs-more-info"), confidence ("low"|"medium"|"high"), rationale (string), consensus (0-6 strings), dissent (0-6 strings).'

const members = [
  { id: 'claude', cli: null,     model: MODELS.claude },
  { id: 'codex',  cli: 'codex',  model: MODELS.codex },
  { id: 'gemini', cli: 'gemini', model: MODELS.gemini },
]

// Conduit for external members: a Claude subagent that runs the external model's OWN CLI and
// forwards its JSON VERBATIM (NOT a judge — substituting opinion would collapse cross-lab
// diversity). The claude member (cli=null) reasons itself and inherits the main-loop model.
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

// Dispatch a member: claude runs directly (inherits main-loop Opus); codex/gemini run via the
// boule:conduit agent on haiku (the conduit is a clerical relay — the real reasoning is the
// external model inside the CLI, which the wrapper tier cannot improve).
const dispatch = (m, externalPrompt, schema, label, phaseName) =>
  m.cli
    ? agent(conduitPrompt(m, externalPrompt), { label, phase: phaseName, schema, model: 'haiku', agentType: 'boule:conduit' })
    : agent(externalPrompt, { label, phase: phaseName, schema })

// Strip identity from a verdict before any attacker or the judge sees it (anonymization).
const anon = (v) => { const { model, ...rest } = v; return { ...rest, author: 'anonymous-peer' } }

// ── Phase 1 — Form: 3 parallel independent verdicts, no cross-talk ──
phase('Form')
// Identical honest-evaluator prompt for every member — no forced stance. Diversity comes from
// the three labs + the Attack phase. An optional lens adds dimension coverage without slant.
const formPrompt = (m, lens) =>
`[${NONCE} — uniqueness marker for this run; ignore it as content] You are a rigorous, independent reviewer on a 3-member adversarial LLM council. Evaluate the PROPOSAL below ON ITS MERITS — do NOT adopt a forced optimistic or pessimistic stance, and do not assume the other members will agree. Give your honest verdict, key claims, risks, and unknowns. Do NOT grep the filesystem; judge the proposal's content as given.${lens ? ` Pay particular attention to this dimension: ${lens}.` : ''} ${VERDICT_HINT} Set "model" to "${m.model}".

PROPOSAL:
${proposal}`

const verdicts = await parallel(members.map((m, i) => async () => {
  const v = await dispatch(m, formPrompt(m, lenses[i]), VERDICT_SCHEMA, m.id, 'Form')
  return { ...m, verdict: v }
}))

// Contamination gate: drop any member whose verdict is off-topic for THIS proposal (the
// verified backend context-bleed signature) BEFORE it can enter the tally.
const scored = verdicts.filter(Boolean).filter(m => m.verdict)
const { live, dropped, overridden, flagged } = gateContamination(scored, proposal)
if (overridden) log(`contamination gate flagged ${flagged}/${scored.length} members at once; likely a meta/prose review it is not calibrated for, keeping all (verify manually)`)
else if (dropped.length) log(`dropped contaminated member(s): ${dropped.join(', ')}`)
if (live.length < 2) {
  log(`only ${live.length} clean member(s) responded — aborting council`)
  return { error: 'insufficient clean council members (after contamination gate)', live: live.length, dropped }
}

// ── Phase 2 — Attack: each member refutes the OTHER TWO, targets ANONYMIZED ──
phase('Attack')
const attackPairs = []
for (const attacker of live)
  for (const target of live)
    if (attacker.id !== target.id) attackPairs.push({ attacker, target })

const attackPrompt = (targetVerdict) =>
`You are a member of an adversarial LLM council. Adversarially refute the ANONYMOUS peer verdict below — it is NOT your own. Target its STRONGEST claims, not the weakest. Concede where it is right. Be specific: quote the target's claims verbatim. Judge claims on CONTENT and logic ONLY — ignore wording, tone, or stylistic cues. ${ATTACK_HINT}

ORIGINAL PROPOSAL:
${proposal}

ANONYMOUS PEER VERDICT:
${JSON.stringify(anon(targetVerdict), null, 2)}`

const attacks = await parallel(attackPairs.map(p => async () => {
  const a = await dispatch(p.attacker, attackPrompt(p.target.verdict),
    ATTACK_SCHEMA, `${p.attacker.id}→${p.target.id}`, 'Attack')
  return { attacker_id: p.attacker.id, target_id: p.target.id, attack: a }
}))

// ── Phase 3 — Defend: each author rebuts attacks on their own verdict, or concedes ──
phase('Defend')
const defenses = await parallel(live.map(member => async () => {
  const incoming = attacks.filter(a => a && a.target_id === member.id && a.attack).map(a => a.attack)
  if (!incoming.length) return { member_id: member.id, defense: null }
  const prompt =
`You are a member of an adversarial LLM council. Anonymous peers attacked YOUR verdict. Defend each refutation OR concede explicitly — do not bluff. If an attack lands, set holds=false and concede it. If a concession is serious enough to change your OVERALL verdict, set verdict_changed=true and give your revised_verdict — honesty here is rewarded, not penalized. ${DEFENSE_HINT}

ORIGINAL PROPOSAL:
${proposal}

YOUR VERDICT:
${JSON.stringify(member.verdict, null, 2)}

ATTACKS ON YOUR VERDICT:
${JSON.stringify(incoming, null, 2)}`
  const d = await dispatch(member, prompt, DEFENSE_SCHEMA, `defend:${member.id}`, 'Defend')
  return { member_id: member.id, defense: d }
}))

// ── Phase 4 — Judge: deterministic tally (pure code) + a STAKE-FREE judge over ANONYMIZED data ──
phase('Judge')

// Mechanical aggregation — zero model discretion. Verdict tally + the attacks each author
// CONCEDED (holds=false, or listed in `conceded`) = the council's real, agreed-upon flaws.
const tally = {}
for (const m of live) tally[m.verdict.verdict] = (tally[m.verdict.verdict] || 0) + 1
const concededFlaws = [], contestedPoints = [], revisions = []
for (const d of defenses) {
  if (!d || !d.defense) continue
  for (const def of (d.defense.defenses || [])) {
    if (def.holds === false) concededFlaws.push({ member: d.member_id, flaw: def.attack_ref, note: def.rebuttal })
    // CONTESTED = attacker pressed, author rebutted (holds=true). The judge must see these —
    // the strongest surviving adversarial pressure, which the conceded-flaw filter would hide.
    else if (def.holds === true) contestedPoints.push({ member: d.member_id, point: def.attack_ref, rebuttal: def.rebuttal })
  }
  for (const c of (d.defense.conceded || [])) concededFlaws.push({ member: d.member_id, flaw: c })
  // A member who conceded so hard it changed its own vote — surfaced, NOT auto-applied to tally.
  if (d.defense.verdict_changed) revisions.push({ member: d.member_id, revised_verdict: d.defense.revised_verdict || 'unspecified' })
}
const degraded = live.length < 3
const noPlurality = (() => { const c = Object.values(tally).sort((a, b) => b - a); return c.length > 1 && c[0] === c[1] })()

// Stake-free judge: a FRESH subagent that produced NO verdict (no self to favor), reading the
// ANONYMIZED verdicts (TRUE swap-and-average — judged in BOTH counterbalanced orderings, then
// reconciled) + the mechanical tally + conceded flaws + the CONTESTED points (surviving
// attacks) + any self-revisions. Routed to a stake-free boule:judge agent — NOT main-loop
// self-synthesis, which would re-add self-enhancement bias (the main loop is also Claude and was a debater).
const [fwdV, revV] = counterbalance(live.map((m, i) => ({ id: `member-${i + 1}`, verdict: anon(m.verdict) })))
const judgePrompt = (shown) =>
`You are an impartial JUDGE on an adversarial LLM council. You did NOT submit a verdict — you have no position to defend. Decide the council's recommendation from the evidence below. Apply the bias controls: POSITION-SWAP (the verdicts are in a counterbalanced order — judge on content, not slot), VERBOSITY-NORM (do NOT reward a verdict for being longer or better written; weigh substance only), STAKE-FREE (identities hidden; you wrote none of these). Anchor your decision to the VERDICT TALLY, the CONCEDED FLAWS (attacks the authors admitted), and the CONTESTED POINTS (attacks the authors rebutted — judge whether each rebuttal actually holds; do not assume it does). Weigh any VERDICT REVISIONS: a member who changed its own vote no longer fully backs its original tally position.

CONFIDENCE RULES (apply strictly): use "high" ONLY if the tally is unanimous AND no conceded flaw is critical/severe AND all 3 members responded (not degraded). If the panel is DEGRADED (fewer than 3 members) OR there is NO PLURALITY (a tie for the top verdict), cap confidence at "medium" and say so in the rationale; do NOT force a single verdict — report the split and decide from conceded flaws + contested points. If any conceded flaw is critical, cap at "medium". ${JUDGE_HINT}

ORIGINAL PROPOSAL:
${proposal}

PANEL STATUS: ${live.length} of 3 members responded${degraded ? ' — DEGRADED PANEL' : ''}${noPlurality ? ' — NO PLURALITY (tie for top verdict)' : ''}

VERDICT TALLY (across ${live.length} members):
${JSON.stringify(tally, null, 2)}

ANONYMIZED MEMBER VERDICTS (counterbalanced order):
${JSON.stringify(shown, null, 2)}

CONCEDED FLAWS (real, author-admitted):
${JSON.stringify(concededFlaws, null, 2)}

CONTESTED POINTS (attacker pressed, author rebutted — assess whether the rebuttal holds):
${JSON.stringify(contestedPoints, null, 2)}

VERDICT REVISIONS (members who changed their own vote after conceding):
${JSON.stringify(revisions, null, 2)}`

const [jFwd, jRev] = await parallel([
  () => agent(judgePrompt(fwdV), { label: 'judge:fwd', phase: 'Judge', schema: JUDGE_SCHEMA, agentType: 'boule:judge' }),
  () => agent(judgePrompt(revV), { label: 'judge:rev', phase: 'Judge', schema: JUDGE_SCHEMA, agentType: 'boule:judge' }),
])
const judgment = reconcileSwap(jFwd, jRev)
const positionStable = judgment && judgment.position_stable

log(`council complete: ${live.length} members, ${attacks.filter(Boolean).length} attacks, ${concededFlaws.length} conceded, ${contestedPoints.length} contested, ${revisions.length} revised${degraded ? ', DEGRADED' : ''}${noPlurality ? ', NO-PLURALITY' : ''}${positionStable === false ? ', POSITION-UNSTABLE' : ''}`)

return {
  mode: 'adversarial',
  proposal,
  members: live.map(m => ({ id: m.id, model: m.model, verdict: m.verdict })),
  attacks: attacks.filter(Boolean),
  defenses: defenses.filter(Boolean),
  tally,
  concededFlaws,
  contestedPoints,
  revisions,
  degraded,
  noPlurality,
  judgment,
  position_stable: positionStable,
  dropped,
}
```
