# Findings: source-level bias-control audit + footprint analysis

*Method: each of the 6 competitor councils was audited at the source level (README,
SKILL.md, command scripts, config, prompt/judge logic). Every "absent" finding was then
re-checked by an independent adversarial verifier instructed to **refute** it by finding
the control in the source. Verdicts below reflect the verifier's confirmation. Compiled
2026-06-13.*

Audited projects: `nyldn/claude-octopus`, `0xNyk/council-of-high-intelligence`,
`hex/claude-council`, `BeehiveInnovations/pal-mcp-server`, `team-attention/agent-council`,
`yogirk/agent-council`.

## The three controls (definitions used)

1. **position-swap**, randomize or counterbalance the *order* in which candidate answers
   are shown to the judge/ranker, to neutralize position bias. **Author-anonymization is
   NOT position-swap**: hiding *who* wrote an answer ≠ shuffling *where* it appears.
2. **verbosity-norm**, control for answer *length* at judging time (penalize verbosity,
   normalize by length, or instruct the judge to ignore length/style). Generation-side
   length caps do **not** count, they are not a judging-time correction.
3. **stake-free judge**, the final synthesizer/chairman is a *structural non-participant*:
   a model that did not author one of the candidate answers it is judging.

## Result 1, position-swap: absent in 6 of 6 `[VERIFIED]`

Confirmed `confirmed_absent` on every adversarial re-audit. Several projects hard-code the
**opposite** of a swap (deterministic ordering):

| Project | Receipt |
|---|---|
| claude-octopus | Chair synthesis feeds members in fixed roster order (`scripts/lib/council.sh:1286-1289`); deterministic glob-sort roster. Only "semi-anonymize responses" (`skill-council/SKILL.md:104`), author anonymization, not order-swap. |
| council-of-high-intelligence | Stable label mapping "in the order they appear in the panel" (`SKILL.md:346`). |
| team-attention/agent-council | Fixed alphabetical `localeCompare` ordering (lines 196 / 301 / 689 / 698). |
| yogirk/agent-council | `anonymizeOpinions` uses array-index labels, fixed order. |
| pal-mcp-server | Blinded/masked "Member A/B" consensus, identity masking, no order randomization. |
| hex/claude-council | No order randomization in the synthesis path. |

Three projects (claude-octopus, council-of-high-intelligence, pal-mcp-server) ship
*author/identity anonymization* and conflate it with bias control, but order/position
bias is a separate, well-documented LLM-judge failure mode that **none** mitigate.

## Result 2, verbosity-norm: absent in 6 of 6 `[VERIFIED]`

Confirmed `confirmed_absent` everywhere. Two projects move in the **wrong** direction:

| Project | Receipt |
|---|---|
| claude-octopus | Debate mode **scores length into the rubric**: `+25 pts` for 50-1000 words (`skill-debate/SKILL.md:475`; rubric rows `221`, `638`). Length is rewarded, not neutralized. |
| council-of-high-intelligence | "Weigh arguments by validity, not by repetition or seniority" (`SKILL.md:460`), names repetition/seniority but pointedly **not length**. Closest near-miss; still not length-normalization. |
| hex / CoHI / others | Only uniform *generation* caps (e.g. 400/300/100 words, "3-5 sentences"), never a judging-time normalization. |

## Result 3, stake-free judge: present in 3 of 6 (both giants fail) `[VERIFIED]`

| Project | Verdict | Receipt |
|---|---|---|
| council-of-high-intelligence | ✅ present | Enforced as a hard constraint; prefers an off-panel provider for the synthesizer. |
| hex/claude-council | ✅ present | Structurally stake-free, there is no `claude` provider script, so the synthesizer never authors a candidate. |
| team-attention/agent-council | ⚠️ default-only | `exclude_chairman_from_members: true` is a defeasible name-string default; broken by `--include-chairman` or renaming a member. |
| claude-octopus | ❌ conflicted | Chair is a regular council member that both authors a candidate and renders the verdict (`scripts/lib/council.sh:860-867`). |
| pal-mcp-server | ❌ conflicted | Consensus synthesizer is itself one of the answering models. |
| yogirk/agent-council | ❌ conflicted | Chairman is whichever CLI you invoked from, also a panel member. |

**Takeaway:** stake-free is a real differentiator versus the two highest-starred tools
(pal-mcp-server 11.6k★, claude-octopus 3.6k★ both fail it) but is *table-stakes*, not a
greenfield gap, three smaller projects already implement it.

## Footprint analysis, testing the "too fat / token-heavy" thesis

The "competitors are bloated" claim holds **only against the headline offenders**. A lean
tier already exists, so leanness is something to *match*, not a standalone differentiator.

| Project | Approx footprint | Per-run cost signal |
|---|---|---|
| claude-octopus | ~190k LOC, **49 commands** | 3/5/7 personas; heaviest UX surface |
| council-of-high-intelligence | 18 personas marketed | up to **~73 model calls** on the maximal path |
| pal-mcp-server | full MCP server, many tools | high cognitive load (tool sprawl) |
| team-attention/agent-council | **~1,393 LOC** | already lean |
| hex/claude-council | small (Shell) | already lean |
| yogirk/agent-council | small (TS) | already lean |

## Conclusion → the wedge

`[VERIFIED]` position-swap (0/6) and verbosity-norm (0/6) are genuine field-wide openings,
adversarially confirmed; several competitors hard-code the opposite. `[VERIFIED]` stake-free
judge is missing in both giants. `[INFERRED]` A council that ships counterbalanced-order
judging + length-normalized judging on a stake-free non-participant judge would implement
bias controls **no existing OSS council has**.

The defensible position = **lean by default + the three verified bias controls as the
headline feature**. Lean alone is not defensible; the bias-control axis is.

> Caveat: the wedge is ~3 prompt/code features, copyable by a well-resourced incumbent in
> a weekend once published. First-mover + "the rigorous one" positioning + a published
> eval (see [`eval-plan.md`](eval-plan.md)) is the durable part, not the code itself.
