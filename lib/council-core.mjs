const MODES = new Set(['default', 'consensus', 'adversarial', 'help'])
export function parseInvocation(args) {
  const s = String(args ?? '').trim()
  const sp = s.indexOf(' ')
  const first = (sp === -1 ? s : s.slice(0, sp)).toLowerCase()
  if (MODES.has(first)) return { mode: first, proposal: sp === -1 ? '' : s.slice(sp + 1).trim() }
  return { mode: 'default', proposal: s }
}
