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
   to council semantics. **The engine is application-neutral: boule (council) and
   `ultrapowers` (the sibling build-harness repo at `/Users/lucian/Repos/ultrapowers`) are
   both *consumers* of one engine core.** Bias controls live in boule's layer, never in the
   core. (✅ **verified 2026-06-21** against `ultrapowers/workflow/ultrapowers-development.js`
   (851 lines): its plan→implement→review→fix loop, dynamic critic-added tasks, crash-resume,
   and two-stage reviews are all **plain JS control flow over `member.invoke`/`phase`/`log`** —
   no extra orchestration primitive needed. Two refinements it surfaced: (1) it's **fully
   serial — uses `parallel` zero times** (that primitive is boule-only); (2) it reads an
   optional **`budget`** global for a token ceiling — see the engine-scope note in §2 and O8.)

**Terminology (resolves an earlier ambiguity):** two different things were both called
"engine". They are distinct:
- **CC's Workflow *runtime*** = the executor that injects `phase/agent/parallel/log`.
  Anthropic-internal, **not extractable** as a library. We *use* it by running inside CC; we
  never vendor it. (Analogy: CPython — you run on it, you don't copy its source.)
- **Our orchestration *code*** = the flow logic we author (poll/consensus/debate). **Ours to
  copy anywhere.** Codegen inlines *this* into SKILL.md (O2: can't `import`, so paste). The
  CC runtime then *executes* our inlined code. No contradiction with "can't extract CC's
  runtime" — we copy our code, not theirs.
- **What we actually implement:** only the **generic runtime** (the 4 primitives) + member
  adapters + the codegen step. We never build a CC-style runtime.

**The dual-host requirement (from the user):** keep CC's *native* Workflow UI when running
inside CC, AND support a platform-agnostic path everywhere else. **Auto-detect** the host
and pick the binding; allow an explicit user override.

## 2. Goals / non-goals

**Goals (v2)**
- One **engine module**, byte-identical across hosts — no per-host forks of the flow logic.
- A **`HostContext` interface** (`{ phase, parallel, log }`) + a **`Member` interface**
  (`invoke(prompt, { schema, model, label, phase }) → verdict` — verified: both boule and
  ultrapowers pass model/label/phase *inline* per call, not just schema) that the engine
  consumes; everything host- or
  vendor-specific lives behind these two seams.
- **Two host bindings**: `cc` (maps the context to the native Workflow tool → native UI)
  and `generic` (plain Node: `Promise.all`, direct `spawn`/`fetch`, structured logging).
- **Auto-detection** of the host with a `--runtime=native|generic|auto` override.
- **Member registry/config** so the panel is declared, not hard-wired.
- Tame the **embed-drift duplication**: the generic path *imports* the engine; the CC path
  **cannot** import (O2 probe, §2.5) so it gets the engine **inlined by a build step** —
  one source, mechanical copy, no hand-editing.

**Non-goals (v2)**
- ❌ Re-deriving the bias controls — they already live in pure JS (`lib/council-core.mjs`)
  and stay verbatim; this is plumbing around them.
- ❌ A general DAG/YAML workflow language. The flow stays **code-as-orchestration**
  (imperative JS with real control flow). "Generic engine" = host/vendor-neutral, not a
  new declarative format.
- ❌ Re-implementing all of CC's Workflow model. **Engine scope (decided):** the engine
  exposes a **minimal primitive set** — `parallel(thunks)`,
  `member.invoke(prompt,{schema,model,label,phase})`, `phase(name)`, `log(msg)`, and an
  **optional `budget`** global (`budget.remaining()`; ultrapowers uses it for a token ceiling,
  degrades to a max-task cap when absent — O8) — and flows are plain JS functions over them.
  Verified: `parallel` is boule-only (ultrapowers is fully serial). Rationale:
  Boule's flows need **dynamic control flow** (poll's contamination-gate drop/abort;
  consensus/debate's dependent stages), so a flat "agent team" (fan-out → judge, no stages)
  is **insufficient**; but a full workflow framework is overkill. `phase()` is a **UI label
  only** — load-bearing for CC's native display, a no-op log line under `generic` — so
  "phases vs non-phases" is a non-issue: keep it, the same source runs both places.
- ❌ Dropping the CC native UI. Both paths ship; CC users keep phase cards / live agents.

## 2.5 Findings (2026-06-21) — engine not extractable; CC path is codegen

Verified against official Claude Code / Agent SDK docs **and a live Workflow probe**:

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
- **O2 RESOLVED by probe (2026-06-21) → CODEGEN, not import.** A throwaway Workflow tested
  every import form; all returned the same error: `"import() is not available in workflow
  scripts."` (`require` is `undefined`; builtin / absolute / relative / `file://` all fail
  identically). The CC path **cannot load the engine module at runtime** — the engine must be
  **inlined into SKILL.md by a build step** (automating today's hand-copy that
  `embed-drift.test.mjs` guards). The same probe confirmed **indirect calls work**: `log()`
  called from inside a helper function ran fine, so wrapping the flow in functions is safe;
  the only constraint is "no module system." The generic runner is unaffected — it imports
  the engine normally.
- **O1 (detection)** is now partly answered by the same probe: a Workflow script runs with
  `phase/agent/parallel/log/args` as globals and **no** `require`/`import`. Auto-detect can
  key on `typeof agent === 'function'` (present in CC, absent in plain Node); a sturdier
  explicit marker is still TBD but not blocking.

Consequence for "native" members: under the **generic** host there is no "claude
main-loop." The `claude` member becomes an ordinary **`api` member** (Anthropic) or an
Agent-SDK subagent. `kind: native` is meaningful **only** under the `cc` host.

## 3. Architecture — three layers, two seams

```
┌─ Apps (flows — application-specific) ──────────────────────────────┐
│  boule: poll/consensus/debate + bias controls (council-core)        │
│  ultrapowers: plan→implement→review→fix loop  ← second consumer     │  ← apps live HERE
├─ Entry / host detection ───────────────────────────────────────────┤
│  detect: Workflow globals present? → cc   else → generic            │
│  override: --runtime / config                                       │
├─ Host binding (per host, thin) ────────────────────────────────────┤
│  cc:      ctx.phase=phase; ctx.parallel=parallel; ctx.log=log       │
│           members: claude→agent(); cli→agent(conduit,{agentType})   │  ← native UI lights up
│  generic: ctx.parallel=Promise.all(cap); ctx.log=structured         │
│           members: cli→spawn() direct; api→fetch(); local→ollama    │  ← no conduit needed
├─ ENGINE CORE (application-neutral, host-agnostic) ─────────────────┤
│  4 primitives: parallel · member.invoke · phase · log               │
│  no council/bias logic here — that lives in the boule app layer     │
├─ Member adapters (reusable building blocks) ───────────────────────┤
│  ClaudeSubagentMember · CliMember(codex,gemini) · ApiMember · Local │
└────────────────────────────────────────────────────────────────────┘
        boule flows + bias controls (council-core.mjs) sit in the APP layer,
        NOT the core — so ultrapowers reuses the core without inheriting them.
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
  invoke(prompt: string, opts: { schema, model?, label?, phase? }): Promise<object>  // structured verdict
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

> Detection mechanism (**O1**) is probe-confirmed (§2.5): a Workflow script has
> `agent/phase/parallel/log/args` as globals and no `require`/`import`. `typeof agent ===
> 'function'` is a working signal; a sturdier explicit marker is a nice-to-have, not blocking.

## 5. Members as config

Replace the hard-wired trio with a declared panel (defaults preserve today's behavior):
```jsonc
{
  "judge": "host",              // O3: stake-free judge = the INVOKING host's model by default
                                // (CC → claude main-loop); override with any member id
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
- **Judge (O3, decided):** defaults to the **invoking host's own model** — CC forms the
  council → CC's model judges (free, no extra config). Overridable to any member id. Off-CC
  with no native model, `"judge": "host"` is invalid → the user must name a configured
  `api`/`cli` member. `kind: native` is only meaningful under a host that *has* a native model.
- The contamination gate / abort-if-<2-clean logic is unchanged; it already operates on a
  dynamic member list.
- **Same-model teams allowed; heterogeneous is the default.** The default panel stays the
  diverse trio (`claude` + `codex` + `gemini`) — boule's diversity premise. But the config
  permits a **homogeneous** team (e.g. `[claude, claude, claude]`, or `3× gpt`) for
  ensemble/variance runs, optionally spread by temperature or prompt seed. The engine treats
  members uniformly, so identical models are just members with the same `model` value.

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

- **O1 — detection. ✅ RESOLVED (probe).** A Workflow script has `agent/phase/parallel/log/
  args` as globals and no `require`/`import`. Auto-detect keys on `typeof agent === 'function'`
  (CC) vs plain Node (generic). An explicit marker is a sturdiness nice-to-have, not blocking.
- **O2 — "verbatim" under CC. ✅ RESOLVED (probe) → CODEGEN.** `import()`/`require` are
  unavailable in Workflow scripts (error: `"import() is not available in workflow scripts."`,
  every specifier), so the CC path **cannot** load the engine — it gets the engine **inlined
  by a build step** (automated copy; embed-drift test stays but guards lib→generated, not a
  hand-copy). Indirect `log()`/helper calls work, so wrapping flow in functions is safe. The
  generic runner is unaffected (imports normally). *Single source preserved either way — the
  CC copy is now mechanical.*
- **O3 — judge under `generic`. ✅ DECIDED.** Judge defaults to the **invoking host's own
  model** (`"judge": "host"`): CC forms the council → CC judges, zero extra config.
  Overridable to any configured member id. Off-CC with no native model, the user must name an
  explicit `api`/`cli` judge member (no silent fallback). Keeps the stake-free property (the
  judge authored none of the candidate verdicts).
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
- **O8 — `budget` primitive (surfaced by /verify).** ultrapowers reads an optional `budget`
  global (`budget.remaining()`) for a token ceiling. Decision: does the engine core expose
  `budget` as an optional 5th primitive (CC provides it; generic computes spend from member
  responses), or do apps self-manage a cap? ultrapowers degrades to a max-task cap when
  `budget` is absent, so it is **optional, not blocking** — but it is the one need beyond the
  4 primitives that verification found.

## 8. Suggested build order (TDD, mirrors v1's C1)

1. Extract engine: parametrize the three SKILL.md bodies on `(ctx, members, judge)`; land
   `lib/engine/{poll,consensus,debate}.mjs` importing `council-core.mjs`. Prove byte-equal
   behavior against current scripts (extend `embed-drift` / `scripts-syntax` tests).
2. `generic` binding + `CliMember`/`ApiMember` adapters + schema util (O4). Make the eval
   harness (`eval/`) run the engine through the generic binding headlessly — instant CI proof.
3. `cc` binding: a **build step** inlines the engine into each SKILL.md (O2 → codegen) around
   a thin shim that builds a CC `ctx` + member list and calls it; regenerate on engine change.
4. Detection + override (§4). Member config (§5). Then open API/local members.
