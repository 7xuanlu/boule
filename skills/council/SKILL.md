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

Modes: `default` ~4 calls; `consensus` ~7 calls; `adversarial` ~13 calls.
