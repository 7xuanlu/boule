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
