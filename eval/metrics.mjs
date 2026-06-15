export function positionConsistency(pairs) {
  if (pairs.length === 0) return 1
  return pairs.filter(p => p.ab === p.ba).length / pairs.length
}
// logistic regression win ~ 1 + lenDiff; return sigmoid(intercept) = win-rate at lenDiff=0
export function lengthControlledWinRate(obs, iters = 500, lr = 0.01) {
  let b0 = 0, b1 = 0
  for (let i = 0; i < iters; i++) {
    let g0 = 0, g1 = 0
    for (const o of obs) {
      const p = 1 / (1 + Math.exp(-(b0 + b1 * o.lenDiff)))
      g0 += (p - o.win); g1 += (p - o.win) * o.lenDiff
    }
    b0 -= lr * g0 / obs.length; b1 -= lr * g1 / obs.length
  }
  return 1 / (1 + Math.exp(-b0))
}

// Control #3: how much MORE biased a single judge is than the stake-free panel.
// Inputs are arrays of per-item bias scores (e.g. self-preference indicators in [0,1]).
export function panelVsSingleBiasDelta(single, panel) {
  const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0
  return mean(single) - mean(panel)
}
// Self-preference uplift (Wataoka 2024): win-rate when a judge rates its OWN output minus OTHERS'.
// obs: array of { own: boolean, win: 0|1 }
export function selfPreferenceUplift(obs) {
  const rate = a => a.length ? a.reduce((s, o) => s + o.win, 0) / a.length : 0
  return rate(obs.filter(o => o.own)) - rate(obs.filter(o => !o.own))
}
// Validity: fraction of items where the judge's verdict matches the reused human label.
// obs: array of { judge, human }. The >0.80 bar is applied by the caller/report.
export function humanAgreement(obs) {
  if (obs.length === 0) return 1
  return obs.filter(o => o.judge === o.human).length / obs.length
}
