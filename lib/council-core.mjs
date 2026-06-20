// Contamination is *topical* divergence: a member answering about a different proposal
// (context-bleed from a prior session), not a member with a particular writing style.
// So it must be measured on words, not on surface form. We split on non-letters, which
// means a coined hyphenated compound ("state-mediated", "insertion-ordered") contributes
// its component words instead of registering as one token that never matches the proposal.
// The old gate also counted such compounds directly (>=8 "foreign" hyphenated terms =>
// contaminated); that fired on dense compound prose regardless of topic, a systematic
// false-positive against that writing style rather than a context-bleed signal, so it is
// gone. Shared-vocabulary overlap alone tracks the actual thing we care about.
export function _words(s, min = 4) {
  return (String(s).toLowerCase().match(/[a-z]+/g) || []).filter(w => w.length >= min)
}
export function _coverage(txt, propVocab) {
  const sv = new Set(_words(txt))
  if (sv.size === 0) return 1
  let hit = 0
  for (const w of sv) if (propVocab.has(w)) hit++
  return hit / sv.size
}
export function isContaminated(verdict, proposal) {
  if (verdict == null) return false
  const propVocab = new Set(_words(proposal))
  const txt = [...(verdict.key_claims || []), ...(verdict.risks || []), ...(verdict.unknowns || [])].join(' ')
  return _coverage(txt, propVocab) < 0.20
}

export function runNonce(proposal) {
  const h = Array.from(String(proposal)).reduce((a, c) => ((a * 31 + c.charCodeAt(0)) >>> 0), 7)
  return 'council-' + h.toString(36)
}
// position-swap: return both orderings so the judge sees a counterbalanced pair
export function counterbalance(items) {
  return [items.slice(), items.slice().reverse()]
}
// Swap-and-average (MT-Bench): reconcile the judge's two decisions on the forward and
// reversed candidate orderings into one position-debiased decision. AGREE on recommendation
// -> stable, keep the forward decision verbatim. DISAGREE -> position-sensitive: take the more
// conservative verdict, force confidence to "low", flag position_stable=false. Conservatism
// ladder (low=permissive): a flip must never greenlight, so needs-more-info ("can't commit")
// tops it, then reject, then approve-with-changes, then approve. One ordering missing (judge
// died) -> return the present decision unverified (position_stable=false).
export function reconcileSwap(a, b) {
  const RANK = { approve: 0, 'approve-with-changes': 1, reject: 2, 'needs-more-info': 3 }
  if (!a && !b) return null
  if (!a || !b) return { ...(a || b), position_stable: false }
  if (a.recommendation === b.recommendation) return { ...a, position_stable: true }
  const winner = RANK[a.recommendation] >= RANK[b.recommendation] ? a : b
  return { ...winner, confidence: 'low', position_stable: false }
}

export function codexCmd(model, inFile, outFile) {
  return `CH="$(mktemp -d)"; cp "$HOME/.codex/auth.json" "$CH/" 2>/dev/null; ND="$(mktemp -d)"; ` +
    `( cd "$ND" && CODEX_HOME="$CH" codex exec -m ${model} -s read-only ` +
    `-c model_reasoning_effort=xhigh --skip-git-repo-check --ephemeral -o "${outFile}" - < "${inFile}" ); ` +
    `rc=$?; rm -rf "$CH" "$ND"; exit $rc`
}
// agy has no read-only flag (gemini's old `--approval-mode plan` is gone) and print mode
// auto-approves its own write tool. ponytail: a neutral throwaway cwd + --sandbox jails
// relative writes and shell exec; absolute-path writes stay possible. Upgrade path: an OS
// sandbox (e.g. sandbox-exec) if hard read-only parity with codex is needed.
export function geminiCmd(model, inFile) {
  return `ND="$(mktemp -d)"; ( cd "$ND" && agy --model "${model}" --sandbox -p "$(cat "${inFile}")" 2>/dev/null ); rc=$?; rm -rf "$ND"; exit $rc`
}

// Context-bleed is independent per member; if the gate flags half or more of the
// members at once, that is a systematic false-positive (e.g. a prose/meta review
// whose critique vocabulary legitimately diverges from the proposal), not real
// contamination. Trust the gate only when it flags a strict minority.
export function gateContamination(members, proposal) {
  const present = members.filter(m => m && m.verdict)
  const flagged = present.filter(m => isContaminated(m.verdict, proposal))
  if (flagged.length * 2 >= present.length)
    return { live: present, dropped: [], overridden: flagged.length > 0, flagged: flagged.length }
  const ids = new Set(flagged.map(m => m.id))
  return { live: present.filter(m => !ids.has(m.id)), dropped: flagged.map(m => m.id), overridden: false, flagged: flagged.length }
}
// Integration core: filter raw member verdicts through the contamination gate.
// rawVerdicts: array of { id, verdict }. Returns { live: [...kept], dropped: [...ids] }.
export function runCouncilCore(proposal, rawVerdicts) {
  const { live, dropped } = gateContamination(rawVerdicts, proposal)
  return { live, dropped }
}
