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
