const MODES = new Set(['default', 'consensus', 'adversarial', 'help'])
export function parseInvocation(args) {
  const s = String(args ?? '').trim()
  const sp = s.indexOf(' ')
  const first = (sp === -1 ? s : s.slice(0, sp)).toLowerCase()
  if (MODES.has(first)) return { mode: first, proposal: sp === -1 ? '' : s.slice(sp + 1).trim() }
  return { mode: 'default', proposal: s }
}

export function _foreignCount(txt, propLower) {
  let n = 0
  for (const x of new Set(txt.match(/\b[A-Za-z]+-[A-Za-z]+\b/g) || []))
    if (x.length > 3 && propLower.indexOf(x.toLowerCase()) === -1) n++
  return n
}
export function _coverage(txt, propVocab) {
  const sv = new Set(txt.toLowerCase().match(/[a-z][a-z\-]{3,}/g) || [])
  if (sv.size === 0) return 1
  let hit = 0
  for (const w of sv) if (propVocab.has(w)) hit++
  return hit / sv.size
}
export function isContaminated(verdict, proposal) {
  if (verdict == null) return false
  const propLower = String(proposal).toLowerCase()
  const propVocab = new Set(propLower.match(/[a-z][a-z\-]{3,}/g) || [])
  const txt = [...(verdict.key_claims || []), ...(verdict.risks || []), ...(verdict.unknowns || [])].join(' ')
  return _foreignCount(txt, propLower) >= 8 || _coverage(txt, propVocab) < 0.20
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
export function geminiCmd(model, inFile) {
  return `gemini -m ${model} --approval-mode plan -p "$(cat "${inFile}")" 2>/dev/null`
}

// Integration core: filter raw member verdicts through the contamination gate.
// rawVerdicts: array of { id, verdict }. Returns { live: [...kept], dropped: [...ids] }.
export function runCouncilCore(proposal, rawVerdicts) {
  const live = [], dropped = []
  for (const m of rawVerdicts) {
    if (!m || !m.verdict) continue
    if (isContaminated(m.verdict, proposal)) dropped.push(m.id)
    else live.push(m)
  }
  return { live, dropped }
}
