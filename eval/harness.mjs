// Run one bias-control OFF vs ON over a dataset, collecting observations for the metrics.
// judgeFn(item, { control, on }) -> an observation object whose shape suits the metric being measured.
// This is intentionally generic: eval/run.mjs supplies the dataset + judgeFn per control.
export async function runAblation(items, judgeFn, control) {
  const off = [], on = []
  for (const item of items) {
    off.push(await judgeFn(item, { control, on: false }))
    on.push(await judgeFn(item, { control, on: true }))
  }
  return { off, on }
}
