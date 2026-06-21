# Design spec: portable orchestration core (v2)

*Status: design draft (discussion). Date: 2026-06-21.*
*Builds on [`2026-06-14-council-plugin-design.md`](./2026-06-14-council-plugin-design.md)
§2 (non-goal: cross-host portability) and §12 (forward-compat). This is the v2 that
turns that deferred non-goal into the work: **"codex/gemini as invoker" becomes a
re-host, not a rewrite.***

## 1. Summary

Today Boule's orchestration (poll/consensus/debate) is **JavaScript embedded in each
`skills/*/SKILL.md`**, executed by Claude Code's **Workflow tool**, which injects four
globals — `phase()`, `agent()`, `parallel()`, `log()`. Non-Claude members (codex,
gemini) are reached only as **CLI subprocesses**, and only indirectly: the Workflow
sandbox can't `spawn`, so a Claude **haiku conduit subagent** (`agents/conduit.md`)
shells out and relays JSON back. Net: **the runtime is CC-only; the other agents are
members-via-relay, never hosts.**

This spec generalizes Boule along three axes the user asked for, under one architecture:

1. **Pluggable members** — any agent (codex, gemini, OpenAI/Anthropic API, local/ollama)
   behind one `Member` interface; the fixed trio becomes config.
2. **Host portability** — the same orchestration runs under CC's Workflow tool *or* a
   standalone Node runner, so any harness (codex, gemini, CI) can invoke it.
3. **Generic engine** — the flow logic is a reusable orchestration primitive, not welded
   to council semantics.

**The dual-host requirement (from the user):** keep CC's *native* Workflow UI when running
inside CC, AND support a platform-agnostic path everywhere else. **Auto-detect** the host
and pick the binding; allow an explicit user override.

## 2. Goals / non-goals

**Goals (v2)**
- One **engine module**, byte-identical across hosts — no per-host forks of the flow logic.
- A **`HostContext` interface** (`{ phase, parallel, log }`) + a **`Member` interface**
  (`invoke(prompt, { schema }) → verdict`) that the engine consumes; everything host- or
  vendor-specific lives behind these two seams.
- **Two host bindings**: `cc` (maps the context to the native Workflow tool → native UI)
  and `generic` (plain Node: `Promise.all`, direct `spawn`/`fetch`, structured logging).
- **Auto-detection** of the host with a `--runtime=native|generic|auto` override.
- **Member registry/config** so the panel is declared, not hard-wired.
- Kill the **embed-drift duplication**: the generic path *imports* the engine; the CC path
  imports it too if the Workflow tool allows module imports (see §7 open question O2).

**Non-goals (v2)**
- ❌ Re-deriving the bias controls — they already live in pure JS (`lib/council-core.mjs`)
  and stay verbatim; this is plumbing around them.
- ❌ A general DAG/YAML workflow language. The flow stays **code-as-orchestration**
  (imperative JS with real control flow). "Generic engine" = host/vendor-neutral, not a
  new declarative format.
- ❌ Dropping the CC native UI. Both paths ship; CC users keep phase cards / live agents.

## 2.5 Research findings (2026-06-21) — the engine is NOT extractable

Verified against official Claude Code / Agent SDK docs:

- **CC's Workflow *runtime* is proprietary and internal to Claude Code — it cannot be
  lifted out as our core.** The `Workflow` *tool* exists in the TS Agent SDK (v0.3.149+),
  but it is only a **bridge** to CC's internal JS sandbox; the runtime that injects
  `phase/agent/parallel/log` and drives the native UI is not a distributable library.
  → **"Copy the CC workflow engine over as our core" is off the table.** Our core must be
  *our own* engine; the generic host must **reimplement** the four primitives. This
  vindicates the Seam 1 / Seam 2 design below — there is no shortcut around it.
- The Agent SDK *does* give the substrate for the generic runner: **subagents, parallel
  subagent execution, sessions — but "the execution loop is left to you."** That loop is
  exactly our engine (§3).
- **Schema (O4) is solvable with a public mechanism**: Workflow `agent({schema})` is
  consistent with the API's **Structured Outputs** (`output_config.format`) and **strict
  tool use** (`strict: true`, grammar-constrained). Both are available via the API/SDK, so
  the generic path can enforce `VERDICT_SCHEMA`/`JUDGE_SCHEMA` identically.
- **O1 (detection) and O2 (imports / indirect-call native UI) are NOT publicly
  documented.** They are not answerable from docs — they require an **empirical test inside
  a real CC Workflow run** (see §7). This converts O2 from a research question into a
  one-off experiment.

Consequence for "native" members: under the **generic** host there is no "claude
main-loop." The `claude` member becomes an ordinary **`api` member** (Anthropic) or an
Agent-SDK subagent. `kind: native` is meaningful **only** under the `cc` host.

## 3. Architecture — three layers, two seams

```
┌─ Entry / host detection ───────────────────────────────────────────┐
│  detect: Workflow globals present? → cc   else → generic            │
│  override: --runtime / config                                       │
├─ Host binding (per host, thin) ────────────────────────────────────┤
│  cc:      ctx.phase=phase; ctx.parallel=parallel; ctx.log=log       │
│           members: claude→agent(); cli→agent(conduit,{agentType})   │  ← native UI lights up
│  generic: ctx.parallel=Promise.all(cap); ctx.log=structured         │
│           members: cli→spawn() direct; api→fetch(); local→ollama    │  ← no conduit needed
├─ Engine (verbatim, host-agnostic) ─────────────────────────────────┤
│  runPoll/runConsensus/runDebate(ctx, members, judge, proposal)      │
│  + lib/council-core.mjs (gate, counterbalance, reconcileSwap, …)    │
├─ Member adapters (reusable building blocks) ───────────────────────┤
│  ClaudeSubagentMember · CliMember(codex,gemini) · ApiMember · Local │
└────────────────────────────────────────────────────────────────────┘
```

**Seam 1 — `HostContext`.** What the Workflow tool injects today, made injectable:
```js
// ctx.agent is intentionally NOT here: invocation is the Member's job (see Seam 2),
// so the engine never knows about conduits, spawns, or agentType.
interface HostContext {
  phase(name): void
  parallel(fns: Array<() => Promise<T>>): Promise<T[]>
  log(msg): void
}
```

**Seam 2 — `Member`.** The engine treats every participant uniformly:
```js
interface Member {
  id: string
  model: string
  invoke(prompt: string, opts: { schema }): Promise<object>  // structured verdict
}
```
The **host binding constructs the Member list**, wiring each `.invoke` correctly for that
host. This is the key move: the conduit-vs-direct-spawn difference is a *property of the
binding*, not of the engine. Under `cc`, a `CliMember.invoke` issues
`agent(conduitPrompt(...), { agentType: 'boule:conduit' })`; under `generic`, the same
logical member `spawn()`s `codex exec` directly using `codexCmd()` from `council-core.mjs`.

**The engine** becomes the current SKILL.md orchestration body with globals replaced by
`ctx.*` and members by `members[].invoke(...)`. Diff against today's `skills/boule/SKILL.md:140-183`:
- `phase('Poll')` → `ctx.phase('Poll')`
- `parallel(...)` → `ctx.parallel(...)`
- the `m.cli ? agent(conduit…) : agent(direct…)` ternary → `m.invoke(formPrompt(m), { schema })`
- `log(...)` → `ctx.log(...)`

That ternary deletion is the whole point: ~40 lines of host-specific dispatch collapse into
one polymorphic call.

## 4. Host detection & override

```
runtime = flag(--runtime) ?? config.runtime ?? 'auto'
if runtime == 'auto':
  runtime = (typeof agent === 'function' && typeof phase === 'function') ? 'cc' : 'generic'
```
- **Inside CC's Workflow tool**: the injected globals exist → `cc` binding → native UI.
- **Anywhere else** (Node CLI, CI, codex/gemini shelling out): no globals → `generic`.
- **Override** for the case a CC user wants the generic path (e.g. to debug parity), or a
  forced-native check. Surfaced as `/boule --runtime=generic <proposal>` and a config key.

> Detection mechanism is **O1** in §7 — must confirm exactly what CC exposes in the Workflow
> scope and whether an env marker is more robust than global-sniffing.

## 5. Members as config

Replace the hard-wired trio with a declared panel (defaults preserve today's behavior):
```jsonc
{
  "judge": "claude",            // stake-free judge = the host's native model by default
  "members": [
    { "id": "claude", "kind": "native" },
    { "id": "codex",  "kind": "cli", "cmd": "codex",  "model": "gpt-5.5" },
    { "id": "gemini", "kind": "cli", "cmd": "agy",    "model": "Gemini 3.1 Pro (High)" },
    // v2 opens these up:
    // { "id": "gpt",  "kind": "api",   "provider": "openai",    "model": "..." },
    // { "id": "local","kind": "local", "provider": "ollama",    "model": "..." }
  ]
}
```
- `kind: native` is only valid under a host that *has* a native model (CC → claude
  main-loop). Under `generic` with no native model, the judge must be an explicit `api`/`cli`
  member (see §7 O3).
- The contamination gate / abort-if-<2-clean logic is unchanged; it already operates on a
  dynamic member list.

## 6. What each host keeps / loses

| | `cc` binding | `generic` binding |
|---|---|---|
| Flow UI | **native phase cards + live agent display** | structured stdout/JSON log |
| Member invocation | conduit subagent relays CLI; claude direct | direct `spawn()` / `fetch()` — **no conduit** |
| Schema enforcement | native `agent({schema})` validate+repair | engine-side validate+repair util (conduit logic, extracted) |
| Auth / secrets | inherited from CC session | runner manages keys + temp `CODEX_HOME` isolation |
| Subprocess sandbox | CC bash sandbox + per-CLI flags | runner replicates `codexCmd`/`geminiCmd` isolation directly |
| Runs in CI / headless | no | **yes** |
| Embed-drift test needed | maybe (O2) | no — single imported module |

The isolation knowledge already exists (`council-core.mjs:46-57`, `agents/conduit.md`); the
generic path *reuses* it rather than inventing it. The conduit is revealed as a
CC-sandbox workaround, not a fundamental component.

## 7. Open questions / decisions to make

- **O1 — detection.** *(not in docs — empirical)* What does CC's Workflow tool expose in
  scope (globals? env var? host object)? Global-sniffing (`typeof agent`) is the obvious
  probe but an explicit marker would be sturdier. *Blocks auto-detect.*
- **O2 — "verbatim" under CC.** *(not in docs — empirical, run a probe Workflow)* The CC
  Workflow runtime is **not** extractable (§2.5), so the engine is ours and the only question
  is how it reaches the CC path. Can Workflow-executed JS `import` the engine module **and**
  drive native UI from **indirect** `agent()`/`phase()` calls (inside an imported function)?
  - **yes** → true single-source engine; embed-drift test retired.
  - **no** (sandbox/top-level only) → "verbatim" = *build-time codegen* of SKILL.md from the
    engine; embed-drift stays but becomes lib→generated (automated), not hand-copied.
  Either way the **generic runner is unaffected** — it imports the engine directly. So we can
  build the generic side first and settle O2 with a throwaway probe Workflow in parallel.
- **O3 — judge under `generic`.** CC gives a native judge (claude main-loop) for free. The
  generic runner has no implicit model. Require an explicitly configured judge member +
  its API key? Default judge = first `api` member? *Affects zero-config UX off-CC.*
- **O4 — schema parity.** *(resolved in principle, §2.5)* Generic path enforces
  `VERDICT_SCHEMA`/`JUDGE_SCHEMA` via the API's **Structured Outputs / strict tool use** for
  API members, plus conduit's JSON parse+repair (extracted to a shared util) for CLI members.
- **O5 — distribution shape.** Is the generic runner an npm-published `boule`/`council` CLI?
  A library? How do codex/gemini invoke it — plain shell command, or an MCP tool? (Ties to
  the v1 non-goal "MCP server — v2+".)
- **O6 — result rendering.** CC renders the returned object natively (design v1 §10). The
  generic path needs its own formatter (markdown + JSON modes).
- **O7 — secrets/egress posture.** A headless runner managing provider keys + spawning
  network CLIs is a different security surface than CC's sandbox. Document the threat model
  before shipping `generic` as a recommended path.

## 8. Suggested build order (TDD, mirrors v1's C1)

1. Extract engine: parametrize the three SKILL.md bodies on `(ctx, members, judge)`; land
   `lib/engine/{poll,consensus,debate}.mjs` importing `council-core.mjs`. Prove byte-equal
   behavior against current scripts (extend `embed-drift` / `scripts-syntax` tests).
2. `generic` binding + `CliMember`/`ApiMember` adapters + schema util (O4). Make the eval
   harness (`eval/`) run the engine through the generic binding headlessly — instant CI proof.
3. `cc` binding: re-express SKILL.md as a thin shim that builds a CC `ctx` + member list and
   calls the engine (pending O2's verdict on import-vs-generate).
4. Detection + override (§4). Member config (§5). Then open API/local members.
