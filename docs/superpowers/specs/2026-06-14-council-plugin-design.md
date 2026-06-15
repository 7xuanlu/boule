# Design spec: the `/council` Claude Code plugin (v1)

*Status: design-approved (brainstorming → spec). Date: 2026-06-14.*
*Supersedes nothing; implements the wedge from [`../../findings.md`](../../findings.md) +
[`../../eval-plan.md`](../../eval-plan.md). Reviewed by an adversarial 3-lab council
(claude/codex/gemini), verdict **approve-with-changes** — all 5 conceded changes folded in
(see Decision Log §13).*

## 1. Summary

Package the existing multi-CLI council (`~/.claude/commands/council.md`) as a **lean,
research-backed Claude Code plugin** whose differentiator is **debiased judging**, not the
orchestration pattern (that pattern is now a crowded category — see `landscape.md`).

The plugin ships **one user-invoked skill** with **modes** (git-style), the three
LLM-as-judge bias controls applied at the judging step of every mode, and a **published
eval** that proves the controls change outcomes. v1 ships the two cheap modes; the
expensive adversarial flow and cross-host portability are explicit non-goals (§2).

## 2. Goals / non-goals

**Goals (v1)**
- One zero-standing-cost entry: `/council`, a user-only skill.
- Two modes: **default** (cheap parallel poll) and **consensus** (anonymized peer-rank).
- The three bias controls — **position-swap, verbosity-norm, stake-free judge** — applied
  to the judging/synthesis step of both modes, with **tested defaults** (not raw switches).
- A runnable **eval harness** (`eval/`) per `eval-plan.md`, proving controls #1 and #2 help.

**Non-goals (deferred, recorded so intent survives)**
- ❌ **Adversarial mode** (form→attack→defend→judge, ~13 calls) — v2; port the existing
  command in as a third mode, no new command.
- ❌ **Cross-host portability / codex or gemini as the *invoker*** — v2+. Requires extracting
  orchestration out of the Workflow tool into a standalone `council` runner (§12). v1 keeps
  the **WHAT** (controls, prompts, eval) host-agnostic so v2 is a *re-host, not a rewrite*.
- ❌ **Worktree-grounding (`--ground`)** — v2. v1 relies solely on **self-contained proposals
  + "do not grep"** (proven: 0 false-positives). Grounding (cwd-pinned member reads of
  uncommitted code) adds an egress dimension + per-CLI sandbox-scope unknowns (§7) — defer
  until the core ships.
- ❌ **MCP server** — v2+; `pal-mcp-server` already owns the portable-tool niche.
- ❌ **Model-triggered invocation** — the tool is explicitly user-initiated (it spends real
  tokens); `disable-model-invocation: true` is intentional, not an oversight.

## 3. Architecture — progressive disclosure

The skill body is **thin**; mode logic and control logic live in files loaded **on demand**,
so the cheap default never pays the context cost of logic it does not run (council change #1).

```
council/ (plugin)
  .claude-plugin/plugin.json
  skills/council/
    SKILL.md            THIN: frontmatter (disable-model-invocation: true)
                        + parse $1 = mode + dispatch ("if consensus → read modes/consensus.md")
    modes/
      default.md        poll flow         ┐ loaded ONLY when that mode runs
      consensus.md      peer-rank flow     ┘
      (adversarial.md = v2)
    reference/
      bias-controls.md  the 3 controls' mechanics + citations (loaded at the judging step)
      grounding.md      §7 worktree-scoping + egress policy
      prompts/          member/judge prompt templates (host-agnostic — see §12)
  agents/
    conduit.md          codex/gemini CLI relay; READ-ONLY; cwd-pinned (§7)
    judge.md            stake-free synthesizer/judge
  eval/                 load-bearing proof (NOT loaded at runtime)
    harness/ datasets/ results/
```

**Standing context cost** = 0 (user-only skill hidden until invoked). **Per-invoke cost** =
thin `SKILL.md` + the one `modes/*.md` + (at synthesis) `reference/bias-controls.md`. This is
a *footprint* claim, not a runtime-billing claim (council change #5): the dollar cost is
dominated by model-call **tokens**, reported to the user per §10.

## 4. Invocation surface (UX)

```
/council <proposal>                  default = parallel poll        (~4 calls)
/council consensus <proposal>        anonymized peer-rank synth     (~7 calls)
/council help                        list modes + cost + flags
/council consensus <proposal> --lenses a,b,c   per-member focus hints (not stances)
```

Single entry, modes as the first argument (`$1`); the rest is the proposal. **Tradeoff
recorded** (council change #3): one entry sacrifices per-command autocomplete vs discrete
slash commands — mitigated by `/council help` and `argument-hint` frontmatter. Both a single
entry and discrete user-only skills are ~zero standing cost, so this choice is justified on
**UX mental-model** grounds, not token grounds.

## 5. Modes

Each mode is: gather candidate answers → **debiased judging/synthesis** (§6). They differ
only in how candidates are gathered and whether candidates see each other.

### 5.1 default — parallel poll (~4 calls)

```
proposal → ask claude, codex, gemini ONCE in parallel (no cross-talk)   [3 calls]
         → STAKE-FREE SYNTH over the 3 answers                          [1 call]
              position-swap: answers shown in counterbalanced order
              verbosity-norm: synth told to ignore length/style
         → merged answer + explicit disagreements
```
Cheapest tier; the right least-powerful default. No peer ranking — the controls apply to the
single synthesis step.

### 5.2 consensus — anonymized peer-rank (~7 calls)

```
proposal → propose (3, parallel, no cross-talk)                         [3 calls]
         → ANONYMIZED peer-rank: each model ranks the 3 anon answers    [3 calls]
              position-swap is load-bearing here (each ranker sees a
              counterbalanced ordering — the showcase for control #1)
         → STAKE-FREE SYNTH (verbosity-norm + authored none)            [1 call]
         → ranked consensus + agreement/split map
```
This is the **showcase mode**: the ranking step is exactly where position + verbosity bias
do the most damage in the literature, so it is where the controls are most visible.

### 5.3 Member model routing (carried from the existing command)
- `claude` member = main-loop (reasons itself, inherits session model).
- `codex` / `gemini` members = their CLIs, relayed by a **read-only** conduit agent run on a
  cheap tier (the relay is clerical; the reasoning is the external model). `[VERIFIED:
  existing council.md runs `codex -s read-only`, `gemini --approval-mode plan`]`
- Degrades gracefully: a missing/erroring CLI drops that member; abort if < 2 live.

## 6. Bias controls (the differentiator)

All three live in `reference/bias-controls.md` and are applied at the **judging/synthesis
step of every mode**. Each maps to a primary source in [`../../bibliography.md`](../../bibliography.md).

| Control | Mechanic at judging time | Source |
|---|---|---|
| **position-swap** | candidate answers presented to the ranker/synth in **counterbalanced order** (and/or judged in both orders, win counted only if order-consistent) | Zheng 2023; Wang 2023; Shi 2024 |
| **verbosity-norm** | judge instructed to ignore length/style; length-difference de-biased at scoring (length-controlled per Dubois) | Dubois 2024; Feuer 2024 |
| **stake-free judge** | synthesizer authored **none** of the candidates it merges | Verga 2024; Wataoka 2024 |

**Anti-"fake rigor"** (council change #4): controls ship with **tested defaults** and are
validated by `eval/` (§9) — not exposed as untested switches. Positioning is *"well-executed,
measured, first-mover"*, **not** *"novel"* — these are commodity techniques whose moat is the
**published eval + the lean packaging**, consistent with the `findings.md` caveat.

**Cost note:** if position-swap is implemented as *two* re-judgings it doubles the judge
call; v1 default implementation = **one judge call seeing a counterbalanced ordering** (keeps
the §5 call counts honest). `[impl-verify: confirm single-call counterbalancing is sufficient
for the eval's position-consistency metric]`

## 7. Worktree handling (v1: self-contained only; `--ground` deferred to v2)

**v1 ships only the self-contained path** — the zero-egress fix that already works; grounding
is v2. The earlier "weird scope" failure: a member CLI ran with **cwd ≠ the active worktree**,
so its greps hit the committed/main tree and falsely rejected uncommitted worktree code as
"hallucinated." v1 sidesteps it by never letting members read files.

```
v1 DEFAULT (only path): members read NOTHING — proposal must be self-contained, members
                   told "do not grep; judge the logic." Zero egress. (Proven: 0 false-positives.)

v2 --ground (deferred):
  1. resolve   git -C <session-cwd> rev-parse --show-toplevel  → <WT>
               (inside a worktree this returns the WORKTREE root, not the main repo)
               hardened: symlinks / nested repos / detached / missing .git → fall back to
               session cwd + warn (council change #2)
  2. ⚠ EGRESS WARNING (council change #2): "uncommitted code under <WT> will be sent to
     OpenAI/Google CLIs. Continue? [y/N]"
  3. launch each member rooted at <WT>:  codex exec -s read-only (cwd=<WT>) ;
                                         gemini --approval-mode plan (cwd=<WT>)
```

**Scope guarantees (v2 `--ground` contract)**

| Requirement | Guarantee |
|---|---|
| Member CAN read worktree incl. uncommitted | ✅ by `cwd = <WT>` (greps/relative paths resolve there) |
| Member does NOT read outside the worktree | ✅ *soft* (cwd + read-only root them there); **hard** outside-read deny is per-CLI sandbox-dependent — `[impl-verify per CLI]`, not asserted |
| Member cannot write | ✅ read-only enforced (codex `-s read-only`, gemini plan mode) |
| Confidentiality | egress(read) is the residual risk and is **opt-in + warned**; write is impossible |

## 8. Agents

- **`conduit.md`** — pass-through relay to a member's own CLI; forwards JSON verbatim (light
  syntax repair only, never content substitution — substituting collapses cross-lab
  diversity). Read-only, cheap model tier. (cwd-pinning for grounding = v2, §7.)
- **`judge.md`** — stake-free synthesizer/judge: reads anonymized candidates, applies §6
  controls, authored no candidate. (Residual: still a Claude instance → shared-prior bias;
  v2 may rotate the judge seat to a non-participating model.)

## 9. Eval hook (load-bearing, not optional)

`eval/` implements [`../../eval-plan.md`](../../eval-plan.md) for **controls #1 and #2** in v1
(the field-wide 0/6 gaps). For each control: run a mode **with the control off vs on** over
the same inputs, report the delta on a literature-validated metric (position-consistency,
length-controlled win-rate, human-agreement %). This published eval — not the ~3 features of
code — is the durable moat.

## 10. Report / UI render

```
DEFAULT poll                          CONSENSUS
## TL;DR  <synthesized answer>         ## TL;DR  <ranked-consensus answer>
## Answers (per model)                 ## Answers (anonymized, ranked)
## Synthesis (stake-free,              ## Where models agreed / split
   length-normalized)                  ## Synthesis (stake-free)
## Disagreements                       ## Cost: ~7 calls / ~N k output tokens
## Cost: ~4 calls / ~N k output tokens
```
Rendered in the active output style (terse, table-first). Cost line reports **tokens**, not
just call count (council change #5). If a member degraded or a fallback model tier was
detected, lead with that (lower assurance).

## 11. Testing strategy

- **Mode dispatch**: `$1` parsed correctly; unknown mode → `/council help`.
- **Degradation**: 0/1 missing CLIs → correct abort / ≤2-member path.
- **Self-contained default**: members read nothing and are told not to grep (the v1
  worktree-safety path). (`--ground` grounding tests are v2.)
- **Controls**: position-swap counterbalancing present; verbosity-norm instruction present;
  synthesizer authored no candidate.
- **Eval smoke**: harness runs control-off vs control-on and emits the metrics table.

## 12. Forward-compatibility for v2 portability

Keep **WHAT** host-agnostic, **HOW** swappable, so "codex/gemini as invoker" is a re-host:

```
WHAT (build now, portable)            HOW (swap later)
  reference/bias-controls.md     ──►  v1: Claude Code Workflow tool
  reference/prompts/*.md              v2: standalone `council` runner
  eval/harness + datasets             (any shell — codex, gemini, CI — invokes it)
```
v1 must **not** bake Workflow-specific assumptions into the prompt/control/eval files.

## 13. Decision log

| ID | Decision | Status |
|---|---|---|
| D1 | Single user-only skill (`disable-model-invocation: true`) | ✅ accepted |
| D2 | Modes via `$1`, not separate commands/tools | ✅ accepted; UX tradeoff recorded (§4) |
| D3 | Cheap poll default; expensive flows opt-in | ✅ accepted (strongest decision) |
| D4 | Bias controls at every mode's judging step | ✅ accepted; eval-backed, tested defaults (§6, §9) |
| D5 | v1 = default + consensus; defer MCP/adversarial | ✅ accepted |
| D6 | Cheapest packaging = user-only skill | ✅ accepted; framed as standing-context footprint (§3) |
| D7 | Resolve member cwd to invoking worktree | ✅ accepted in principle; **deferred to v2** — v1 = self-contained proposals only (§7) |

**Council verdict:** approve-with-changes (medium), 3/3 unanimous, full panel. Changes #1–#5
folded into §3, §7, §4, §6/§9, §10/§3 respectively. Off-target attacks (empirical-benchmark
strawman, dollar-billing misread of D6) were discounted by the stake-free judge.

## 14. Open questions / impl-verification flags

- `[v2]` per-CLI sandbox **read-scope** (gates `--ground`) — does `codex -s read-only` / `gemini`
  hard-deny reads above cwd, or only soft-default to it? (§7)
- `[impl-verify]` single-call counterbalancing sufficient for the eval's position-consistency
  metric, or does it need two re-judgings? (§6)
- `[open]` exact `modes/*.md` ↔ `SKILL.md` dispatch mechanism in a plugin skill (read-on-demand
  pointer vs inline) — confirm against current plugin skill loading.
- `[open]` MT-Bench human-judgment file availability in 2026 as eval ground truth (carried from
  `eval-plan.md`).
