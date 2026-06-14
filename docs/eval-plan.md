# Evaluation plan: proving the three bias controls help

*The wedge is only credible if measured. A bias control that is asserted but not benchmarked
is a marketing claim. This plan specifies a runnable evaluation — every metric borrowed from
a verified paper in [`bibliography.md`](bibliography.md) — to demonstrate each control moves
the judge toward less-biased, more human-aligned verdicts.*

## Design principle

For each control, run the council **with the control off (baseline)** vs **with it on**, on
the same questions and candidate answers, and report the delta on a metric the literature
already validates. No new metrics invented; reproducibility over novelty.

## Control #1 — position-swap

**Hypothesis:** counterbalancing answer order reduces order-driven verdict flips.

| Metric | Source | Protocol |
|---|---|---|
| **Position Consistency** | [shi2024position] | For each answer pair, judge in order A-B and B-A; consistency = fraction with identical verdict. Report baseline vs swap-on. |
| **Repetition Stability** | [shi2024position] | Same order, repeated runs — isolates order effect from sampling noise. |
| **Preference Fairness** | [shi2024position] | Net directional skew toward position 1 vs 2; should approach 0 with the control. |
| **Order-flip rate** | [wang2023fair] | Count verdicts that flip purely on reorder (replicates their adversarial probe). |
| **Position-diversity entropy** | [wang2023fair] | Auto-flag ambiguous pairs for human review. |

**Baselines to implement for comparison:** MT-Bench swap-or-tie rule [zheng2023mtbench];
Balanced Position Calibration [wang2023fair].

## Control #2 — verbosity-norm

**Hypothesis:** length-normalized judging removes the longer-answer-wins confound.

| Metric | Source | Protocol |
|---|---|---|
| **Length-controlled win-rate** | [dubois2024lc] | Fit a GLM: preference ~ candidate identity + length-difference (mediator) + features. Report counterfactual win-rate at length-diff = 0. Show the shrinkage of the length coefficient with the control on. |
| **Length-confound probe** | [feuer2024style] | Construct pairs where the *longer* answer is the *worse* answer; measure how often the judge still prefers longer. The control should reduce this rate. |

## Control #3 — stake-free / panel judge

**Hypothesis:** a diverse, non-participant panel dilutes self-preference and single-judge bias.

| Metric | Source | Protocol |
|---|---|---|
| **Panel-vs-single bias delta** | [verga2024poll] | Measure self-preference + position skew for a single large judge vs the diverse panel; replicate PoLL's bias/cost trade-off (panel predicted lower bias, ~7× cheaper). |
| **Self-preference uplift** | [wataoka2024selfpref] | Each model judges a set containing its own outputs; measure win-rate uplift for self-authored answers. Panel should compress toward 0. (Optional: correlate uplift with perplexity.) |

## Cross-cutting — is the judge valid at all?

| Metric | Source | Target |
|---|---|---|
| **Human-agreement %** | [zheng2023mtbench] | Bar to clear: **>80%** (= human–human agreement). |
| **Spearman/Kendall vs human scores** | [liu2023geval] | Comparable target: **0.514 Spearman** (G-Eval on summarization). |

## Datasets (candidates)

- **MT-Bench** questions + the public GPT-4 / human preference judgments [zheng2023mtbench] —
  reuse as the human-agreement ground truth.
- **DevBench / MT-Bench** task mix [shi2024position] for position-bias measurement.
- A small **length-confound set** authored for Control #2 (longer = worse pairs).

## Reporting

A single results table per control: `metric | baseline (control off) | control on | Δ | source`.
Publish the harness + seeds so the numbers are reproducible — the published eval, not the
~3 features of code, is the durable moat (see [`findings.md`](findings.md) caveat).

## Status / open questions

- `[UNKNOWN]` exact human-judgment files still distributed for MT-Bench in 2026 — confirm availability before committing to it as ground truth.
- `[INFERRED]` length-confound probe set must be authored; no off-the-shelf version verified.
- Scope v1 to Controls #1 and #2 (the field-wide 0/6 gaps) — they carry the differentiation; #3 is table-stakes and can follow.
