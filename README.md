# boule

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![status: v1, pre-release](https://img.shields.io/badge/status-v1%20pre--release-orange.svg)

*boule* (Greek βουλή, "council") was the citizens' council of ancient Athens. Here it is a council of LLMs.

A lean, research-backed LLM council (Claude + Codex + Gemini). Several models answer, then an impartial judge decides, with deliberate guards against the ways AI judges are known to slip: favoring whichever answer comes first, whichever is longest, or its own. Each guard traces to peer-reviewed work, and to a function in this repo.

**Status:** v1, pre-release. The core is node-tested; no benchmark numbers are reported yet because the eval needs MT-Bench labels (see [Eval](#eval)). Treat the controls as bias-aware procedures under measurement, not proven transfers.

## What it is

"LLM council" tools, where several models propose, peer-review, and a chairman synthesizes, are a crowded open-source category as of mid-2026. The canonical reference, `karpathy/llm-council`, has over 20k stars (see [`docs/landscape.md`](docs/landscape.md)). Most share the same recipe and the same blind spot: they inherit the documented biases of LLM-as-a-judge (position, verbosity, self-preference) without correcting for them at the judging step.

boule's premise is that the judging step should be a debiased procedure, not a single prompt. It applies three controls at the point the judge decides, each tied to a paper and to a function in `lib/` or `eval/`. It stays small while doing it: a few commands, no persona role-play.

## Quickstart

**Prerequisites.** boule's council members are Claude (the main loop) plus two external CLIs it shells out to: `codex` (OpenAI) and `agy` (Google Antigravity — the successor to the discontinued `gemini` individual CLI). Install and sign in to both first, following each tool's own install and auth docs. boule reuses their existing local authentication and never asks for keys itself.

```shell
/plugin marketplace add 7xuanlu/claude-plugins
/plugin install boule@7xuanlu
```

Then ask the council:

```shell
/boule Should we adopt event sourcing for the orders service?
```

boule's commands are user-invoked only. Claude never calls them automatically.

## Commands

```shell
/boule <proposal>             # poll (the default): 3 models answer once, judge synthesizes  (~5 model calls)
/boule:consensus <proposal>   # 3 propose, peer-rank anonymized answers, judge decides       (~8 model calls)
/boule:debate <proposal>      # form, attack, defend, judge                                  (~14 model calls)
/boule:help                   # print the command/cost table
```

| Command | ~Model calls | Flow |
|---|---|---|
| `/boule` (poll, the default) | ~5 | 3 models answer in parallel, then a stake-free judge synthesizes (both orderings) |
| `/boule:consensus` | ~8 | 3 models propose, peer-rank the anonymized answers, then a stake-free judge decides (both orderings) |
| `/boule:debate` | ~14 | form, then attack (anonymized), then defend or concede, then a stake-free judge decides (both orderings) |

`/boule <proposal>` runs the default poll; the heavier modes are their own commands. The three controls apply at the judging step in every command. The judge call runs twice, once per counterbalanced ordering, and the two verdicts are reconciled (swap-and-average). That second judge call is why each count rose by one.

## The three controls

Each control names the paper(s) behind it, what boule actually does, and the function that does it. This is the proof that the citations reflect real decisions rather than decoration.

| Control | Backing | What boule does | Where it lives |
|---|---|---|---|
| **Position-swap** | Wang 2023 (Balanced Position Calibration); Zheng 2023 (MT-Bench swap rule) | Judges both counterbalanced orderings, then reconciles the two verdicts: agree, keep it; disagree, flag `position_stable: false`, cap confidence at low, and take the conservative verdict. | `counterbalance` + `reconcileSwap` in [`lib/council-core.mjs`](lib/council-core.mjs) |
| **Verbosity-normalization** | Dubois 2024 (length-controlled regression); Feuer 2024 (style over substance) | Judge prompt weighs substance and ignores length, formatting, and style. The eval fits Dubois's length regression to measure any residual length bias. | judge prompt (prompt-level); metric `lengthControlledWinRate` in [`eval/metrics.mjs`](eval/metrics.mjs) |
| **Stake-free judge** | Verga 2024 (PoLL); Wataoka 2024 (self-preference is familiarity) | The synthesizer authored none of the candidates, and the three members are different model families, so no judge ever scores its own text. | stake-free by construction; bias measured by `panelVsSingleBiasDelta` + `selfPreferenceUplift` in [`eval/metrics.mjs`](eval/metrics.mjs) |

Two of the three are the published method itself. Position-swap is Wang's Balanced Position Calibration. A cross-family stake-free judge is the exact lever Wataoka and PoLL identify against self-preference bias. Verbosity-normalization is the honest exception: it is currently a prompt instruction, not Dubois's statistical regression. The regression lives in the eval to measure the gap, and a stronger in-loop version is on the roadmap.

Rationale and prompts: [`skills/boule/reference/bias-controls.md`](skills/boule/reference/bias-controls.md).

## Research grounding

Each control and each eval metric traces to a peer-reviewed result. Every citation below was checked against its arXiv primary source this pass; the full annotated list (17 papers, with quotes) is in [`docs/bibliography.md`](docs/bibliography.md).

- **Position / order bias:** Zheng 2023 ([2306.05685](https://arxiv.org/abs/2306.05685)), Wang 2023 ([2305.17926](https://arxiv.org/abs/2305.17926)), Shi 2024 ([2406.07791](https://arxiv.org/abs/2406.07791)).
- **Verbosity / length bias:** Dubois 2024 ([2404.04475](https://arxiv.org/abs/2404.04475)), Feuer 2024 ([2409.15268](https://arxiv.org/abs/2409.15268)).
- **Self-preference / single-judge bias:** Verga 2024 ([2404.18796](https://arxiv.org/abs/2404.18796)), Wataoka 2024 ([2410.21819](https://arxiv.org/abs/2410.21819)).

The field documents a wider set of judge biases, roughly 11 to 12 distinct types (Ye et al. 2024, the CALM taxonomy, [2410.02736](https://arxiv.org/abs/2410.02736); corroborated at 11 by Gao et al. 2025, [2510.12462](https://arxiv.org/abs/2510.12462)). boule ships the three with the most validated and directly implementable debiasing methods. The rest, plus two risks specific to a multi-model panel, are tracked in [Limitations & roadmap](#limitations--roadmap).

## How it compares

We audited the source of six relevant OSS councils (README, skill and command scripts, prompt logic), then had an independent pass try to refute each finding. Receipts with file and line numbers are in [`docs/findings.md`](docs/findings.md); the category survey is in [`docs/landscape.md`](docs/landscape.md).

| Control | Found in the 6 audited councils |
|---|---|
| Position-swap | 0 of 6. Several hard-code the opposite (fixed or alphabetical order). |
| Verbosity-normalization | 0 of 6. One even scores toward length. |
| Stake-free judge | 3 of 6, but one only in its default config, and absent in both highest-starred tools we audited (pal-mcp-server 11.6k stars, claude-octopus 3.6k stars). |

We did not find a council among the six that ships all three together. Scope: these six projects, not the entire ecosystem. Two distinctions the audit holds to. Author or identity anonymization (which three audited tools do) is not position-swap, because hiding who wrote an answer is not the same as shuffling where it appears. And generation-side length caps are not judging-time normalization. The combination is the contribution; each control on its own is small and copyable.

## Eval

Controls are only credible once measured. [`eval/run.mjs`](eval/run.mjs) runs an off-vs-on experiment over a reused MT-Bench label subset. Every metric implements one of the results above:

| Metric (`eval/metrics.mjs`) | Implements | What it measures |
|---|---|---|
| `positionConsistency` | Shi 2024 | Fraction of pairs whose verdict is stable across both orderings |
| `lengthControlledWinRate` | Dubois 2024 | Win-rate after a logistic length-difference regression (the win-rate at zero length gap) |
| `panelVsSingleBiasDelta` | Verga 2024 (PoLL) | Single-model-judge bias minus panel-judge bias |
| `selfPreferenceUplift` | Wataoka 2024 | Win-rate uplift when a judge rates its own output |
| `humanAgreement` | Zheng 2023 (MT-Bench) | Fraction matching published human labels (target above 0.80) |

```shell
node eval/run.mjs --smoke   # smoke run, writes eval/results/smoke.md
node --test                 # test suite
```

**Open dependency:** the harness needs MT-Bench label files locally ([`eval/datasets/README.md`](eval/datasets/README.md)). Until they are present it cannot run end-to-end, which is why no benchmark numbers are reported here yet. Plan: [`docs/eval-plan.md`](docs/eval-plan.md).

## Limitations & roadmap

The three controls are adapted from LLM-eval research, where they were validated as large-N statistical procedures over labelled benchmarks. A single-shot council is a different setting, so today's implementations are bias-aware procedures whose effect here is exactly what the eval measures. The transfer is not yet proven.

- **Position-swap.** Implemented (swap-and-average), at the cost of one extra judge call per mode. Whether order-instability is rare or common in this single-shot setting is open until the eval runs.
- **Verbosity-normalization.** Prompt-level only today. The statistical length regression from Dubois exists in the eval but is not yet applied inside the judging loop.
- **Stake-free judge.** Structural and holds by construction. The natural next step is a small cross-family judge panel (PoLL), not just a single non-participant judge.

**Beyond the three controls.** The literature names around a dozen judge biases (Ye et al. 2024). Candidates boule does not yet control, with sources:

- **Preference leakage** (Li et al. 2025, [2502.01534](https://arxiv.org/abs/2502.01534), ICLR 2026). A judge favors a model it is identical to, inherits from, or shares a family with. This is specific to multi-model panels like boule's and is distinct from self-preference. A family-disjointness check between the judge and the members would guard against it.
- **Bandwagon and sentiment bias** (Yang et al. 2025, [2505.17100](https://arxiv.org/abs/2505.17100), NeurIPS 2025). Both are measurable, and the paper ships a plug-in detector that boule could adapt.

**Caveat for the debate mode.** Multi-agent debate can amplify bias rather than reduce it, while meta-judge aggregation resists it (Ma et al. 2025, [2505.19477](https://arxiv.org/abs/2505.19477)). boule's `/boule:debate` command is a debate, so this is an open risk. The eval should test whether the debate amplifies or dampens the measured biases before that command is recommended over the simpler ones.

**Member set and execution.** Today the council is a fixed trio (Claude as the main loop, plus codex and gemini) run through the Workflow harness. Two roadmap directions:

- **Model-agnostic, pluggable members.** Put council members behind a uniform interface so the panel is configurable rather than the hard-wired three: more vendor CLIs, and local or routed models (for example via ollama or an OpenRouter bridge). PoLL finds that a larger, more diverse panel reduces single-judge bias, so adding families is a quality lever, not just flexibility.
- **Execution beyond Workflow.** Decouple the council logic from the Workflow tool so boule can run through other Claude Code execution paths, not only Workflow-orchestrated runs.

Next: obtain MT-Bench labels, run the full eval, publish the off-vs-on table for all three controls. Then test the debate mode for bias amplification.

## Contributing

Issues and PRs welcome. Before opening a PR:

```shell
node --test                 # all tests must pass
node eval/run.mjs --smoke   # eval smoke must stay green
```

Conventions: keep changes surgical and the footprint lean. The canonical bias-control functions live in [`lib/council-core.mjs`](lib/council-core.mjs) and are embedded byte-for-byte into each command's `SKILL.md` script. `test/embed-drift.test.mjs` enforces that the copies stay in sync, so edit the core and re-sync rather than editing a copy.

## Security & isolation

- **Member isolation.** External members run with reduced privileges: `codex` is hard read-only (`-s read-only`) in an isolated profile (auth-only `CODEX_HOME`, neutral cwd); `agy` runs from a neutral throwaway cwd under a terminal-restricted `--sandbox`. Caveat: agy's print mode still auto-approves its own file-write tool, so the agy member is best-effort-contained (shell exec and relative writes jailed) rather than hard read-only — a known gap tracked for hardening (e.g. an OS-level `sandbox-exec` jail).
- **Contamination gate.** `isContaminated` flags a verdict whose content does not track the proposal (too little shared vocabulary), the signature of context-bleed from a prior session. Overlap is measured on words, splitting hyphenated compounds into their parts, so a member's writing style (e.g. dense coined compounds like `state-mediated`) is never mistaken for an off-topic verdict. Because real bleed is independent per member, `gateContamination` drops flagged members only when they are a strict minority; if it flags half or more at once (a systematic false-positive, for example a prose or meta review whose critique vocabulary legitimately diverges) it keeps all members and warns instead of disabling the council. A content-derived nonce (`runNonce`) tags each run. Both functions live in [`lib/council-core.mjs`](lib/council-core.mjs); dropped verdicts are reported and only clean verdicts reach the judge.
- Found a vulnerability? Please open a GitHub issue tagged `security`, or contact the maintainer before public disclosure.

## License

MIT, see [`LICENSE`](LICENSE). Permissive on purpose: the canonical reference, `karpathy/llm-council`, ships with no license, which makes it legally unsafe to depend on.

## Acknowledgements

Built on the LLM-as-judge and multi-agent-evaluation literature cited above, especially MT-Bench (Zheng et al.), Balanced Position Calibration (Wang et al.), and PoLL (Verga et al.), and informed by the open-source council projects surveyed in [`docs/landscape.md`](docs/landscape.md), with `karpathy/llm-council` chief among them.
