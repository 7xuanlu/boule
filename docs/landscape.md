# Landscape: the open-source LLM-council category

*Compiled 2026-06-13. Star counts / licenses fetched live from the GitHub REST API the
same day and tagged `[VERIFIED]`; they drift over time. Treat as a point-in-time snapshot.*

## Summary

"Multi-CLI / multi-model LLM council" is a **crowded** open-source category as of mid-2026,
not a greenfield. An earlier internal assumption that this orchestration pattern was unique
was **falsified** — at least 8 projects shell out to distinct vendor CLIs (`claude -p`,
`codex exec`, `gemini -p`) and run a council / consensus / adversarial flow, plus a large
MCP-based entrant. The differentiation opportunity is therefore **not** the orchestration
pattern; it is the **rigor of the judging step** (see [`findings.md`](findings.md)).

## Native multi-CLI councils (shell out to real vendor binaries)

| Repo | ★ `[VERIFIED]` | License | Council mechanism |
|---|---|---|---|
| [BeehiveInnovations/pal-mcp-server](https://github.com/BeehiveInnovations/pal-mcp-server) (ex-"Zen MCP") | 11,599 | Apache-2.0¹ | `consensus` + `codereview` + `challenge` tools; hybrid — API-gateway core, `clink` bridges native CLIs |
| [nyldn/claude-octopus](https://github.com/nyldn/claude-octopus) | 3,590 | MIT | `/octo:council` 3/5/7-persona + quorum + critical-veto; `/octo:debate` |
| [0xNyk/council-of-high-intelligence](https://github.com/0xNyk/council-of-high-intelligence) | 963 | — | 18 personas across `codex exec`/`gemini -p`/ollama; dissent quota, cross-exam |
| [hex/claude-council](https://github.com/hex/claude-council) | 323 | — (Shell) | Prefers `codex`/`gemini` CLIs *over* their APIs; `BLOCK:` verdict gate |
| [team-attention/agent-council](https://github.com/team-attention/agent-council) | 136 | MIT | Config lists `claude -p`/`codex exec`/`gemini`; chairman synthesis |
| [yogirk/agent-council](https://github.com/yogirk/agent-council) | 84 | MIT | 4-stage Karpathy-on-CLIs: parallel → anonymized peer review → chairman → adversarial |
| [heavy3-ai/code-audit](https://github.com/heavy3-ai/code-audit) | 44 | — | Multi-model consensus for plan/code/PR review |
| [alecnielsen/adversarial-review](https://github.com/alecnielsen/adversarial-review) | 11 | — | claude + codex 3-phase adversarial loop |
| [DantesPeak85/the-council](https://github.com/DantesPeak85/the-council) | 2 | MIT | codex + gemini second opinions, read-only sandboxes |

¹ GitHub API classifies pal-mcp-server as `NOASSERTION`; its README explicitly states Apache-2.0.

## Reference / academic-faithful implementations

| Repo | ★ `[VERIFIED]` | License | What it is |
|---|---|---|---|
| [karpathy/llm-council](https://github.com/karpathy/llm-council) | 20,726 | **None** | Canonical reference web app (propose → anon peer-rank → chairman). No license = legally unsafe to depend on. |
| [composable-models/llm_multiagent_debate](https://github.com/composable-models/llm_multiagent_debate) | 536 | **None** | Du et al. canonical multi-agent debate code (ICML 2024) |
| [thunlp/ChatEval](https://github.com/thunlp/ChatEval) | 335 | Apache-2.0 | Multi-agent-debate evaluator (ICLR 2024) |
| [theerud/gemini-llm-council](https://github.com/theerud/gemini-llm-council) | 14 | MIT | Faithful Gemini-CLI port of Karpathy's llm-council |
| [ngmeyer/council-review](https://github.com/ngmeyer/council-review) | 9 | MIT | Claude Code skill, 5 advisors, anonymous peer review |

## Excluded — single-API gateways (not multi-CLI; routes all models through one endpoint)

- [nesquikm/mcp-rubber-duck](https://github.com/nesquikm/mcp-rubber-duck) — 168★ — bridges OpenAI-compatible LLMs via one API.
- [antonbabenko/deliberation](https://github.com/antonbabenko/deliberation) — 72★ — "arbiter-mediated consensus" routed through 400+ OpenRouter models.

## The judge-bias matrix (the actual differentiator)

Source-audited and adversarially verified — see [`findings.md`](findings.md) for file:line receipts.

| Project (★) | position-swap | verbosity-norm | stake-free judge |
|---|---|---|---|
| pal-mcp-server (11.6k) | ❌ | ❌ | ❌ |
| claude-octopus (3.6k) | ❌ | ❌ | ❌ |
| council-of-high-intelligence (963) | ❌ | ❌ | ✅ |
| hex/claude-council (323) | ❌ | ❌ | ✅ |
| team-attention/agent-council (136) | ❌ | ❌ | ⚠️ default-only² |
| yogirk/agent-council (84) | ❌ | ❌ | ❌ |

² Stake-free only in the shipped default config (a name-string filter, `exclude_chairman_from_members: true`); defeated by `--include-chairman` or renaming a member off the chairman role.

**Reading of the matrix:** position-swap and verbosity-norm are absent field-wide (0/6);
stake-free judge is present in 3/6 but absent in both highest-starred tools. This is the
gap this project fills.

## Provenance

- Star counts, licenses, last-push dates: GitHub REST API (`/repos/...`, `/repos/.../license`), fetched 2026-06-13.
- Mechanism / bias-control claims: direct source inspection (README, SKILL.md, command scripts, config, prompt templates) — receipts in [`findings.md`](findings.md).
