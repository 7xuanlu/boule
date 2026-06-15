---
name: council
description: Multi-LLM council with debiased judging. Modes - default (poll), consensus, adversarial.
disable-model-invocation: true
argument-hint: "[default|consensus|adversarial|help] <proposal>"
---
<!--
PLATFORM SPIKE (Task 1 Step 3) — DEFERRED to a live Claude Code session (cannot run in a background/subagent context):
1. Install plugin locally; confirm /council appears and is user-only (no model auto-trigger).
2. /council help with a multi-line pasted proposal — confirm $ARGUMENTS captures full multi-line text.
   If yes -> --file is unnecessary (current assumption). If no -> add --file handling (Task 8).
3. Confirm modes/default.md is loaded only when dispatched (on-demand), not at session start.
Build proceeds on the assumption that $ARGUMENTS captures multi-line (so no --file). Re-verify live.
-->

Parse the FIRST whitespace-delimited token of "$ARGUMENTS" as the MODE; the remainder is the PROPOSAL.

- `help`  -> print the mode/cost/flags table below; stop.
- `consensus` -> read and follow `modes/consensus.md`.
- `adversarial` -> read and follow `modes/adversarial.md`.
- anything else (or empty) -> treat the whole of "$ARGUMENTS" as the proposal and follow `modes/default.md`.

## Help

Usage:
- `/council <proposal>` — default poll mode.
- `/council consensus <proposal>` — anonymized peer-ranked consensus.
- `/council adversarial <proposal>` — form → attack → defend → judge.
- `/council help` — print this table.

| Mode | ~Model calls | What it does |
|---|---|---|
| `default` | ~4 | Each of 3 models answers once (parallel), then a stake-free judge synthesizes. |
| `consensus` | ~7 | 3 models propose, then peer-rank the anonymized answers, then a stake-free judge synthesizes. |
| `adversarial` | ~13 | 3 models form verdicts → attack each other's (anonymized) → defend/concede → stake-free judge decides. |

Three judge-bias controls are applied at the judging step in every mode: **position-swap** (counterbalanced order), **verbosity-normalization** (ignore length/style), **stake-free judge** (synthesizer authored no candidate). See `reference/bias-controls.md`.

> `--file <path>` is not implemented; it is gated on a live check that `$ARGUMENTS` captures multi-line pasted proposals. If multi-line works (current assumption), `--file` is unnecessary.
