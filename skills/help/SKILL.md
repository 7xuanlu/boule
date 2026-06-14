---
name: help
description: Print the boule command and cost table. Run as /boule:help.
disable-model-invocation: true
---

## boule commands

| Command | ~Model calls | What it does |
|---|---|---|
| `/boule <proposal>` | ~5 | Default poll. 3 models answer once in parallel, stake-free judge synthesizes over both counterbalanced orderings. |
| `/boule:consensus <proposal>` | ~8 | 3 models propose, peer-rank the anonymized answers, stake-free judge decides. |
| `/boule:debate <proposal>` | ~14 | Form, attack (anonymized), defend or concede, stake-free judge decides. |
| `/boule:help` | 0 | Print this table. |

Three judge-bias controls apply at the judging step in every mode: position-swap (swap-and-average over both counterbalanced orderings), verbosity-normalization (ignore length and style), stake-free judge (the synthesizer authored no candidate). See `../boule/reference/bias-controls.md`.
