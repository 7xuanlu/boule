# Council Plugin v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the existing multi-CLI council as a lean Claude Code plugin — one user-only `/council` skill with three modes (default poll / consensus / adversarial), three LLM-as-judge bias controls applied at the judging step, member-isolation + contamination controls, and a published eval proving all three controls help.

**Architecture:** A thin `SKILL.md` parses `$ARGUMENTS[0]` as the mode and dispatches to a `modes/*.md` whose body is a `Workflow`-tool JS script. The *testable* core (mode dispatch, contamination gate, bias-control helpers, codex isolation, nonce) lives in one canonical `lib/council-core.mjs` that is node-unit-tested; mode scripts embed the relevant functions, and a drift test asserts the embedded copies match the canonical lib. The eval harness (`eval/`) is standalone Node that runs each mode with a control off vs on and reports literature-validated deltas.

**Tech Stack:** Claude Code plugin (skills/agents/Workflow tool), Node >=20 (`node:test` + `node --check`), the `@openai/codex` and `@google/gemini-cli` CLIs (read-only), markdown prompt files. Reference source: `~/.claude/commands/council.md` (the battle-tested adversarial flow). Spec: `docs/superpowers/specs/2026-06-14-council-plugin-design.md`.

---

## File Structure

```
council/                                  (plugin root = repo root for v1)
  .claude-plugin/
    plugin.json                           plugin manifest + marketplace metadata
  skills/council/
    SKILL.md                              THIN: frontmatter + parse $1 + dispatch + /council help
    modes/
      default.md                          poll -> stake-free synth         (Workflow script)
      consensus.md                        propose -> anon peer-rank -> synth (Workflow script)
      adversarial.md                      form->attack->defend->judge       (Workflow script, ported)
    reference/
      bias-controls.md                    the 3 controls' mechanics + citations (loaded at judging)
      prompts.md                          canonical member/judge prompt templates (host-agnostic)
  agents/
    conduit.md                            read-only, isolated-profile CLI relay
    judge.md                              stake-free synthesizer/judge
  lib/
    council-core.mjs                      canonical tested core (dispatch, gate, controls, nonce, isolation)
  test/
    council-core.test.mjs                 node:test unit tests for the core
    embed-drift.test.mjs                  asserts mode scripts embed the canonical functions unchanged
    scripts-syntax.test.mjs              node --check every embedded Workflow script
  eval/
    harness.mjs                           run a mode with control off vs on; emit metrics
    metrics.mjs                           position-consistency, length-controlled win-rate, panel-vs-single, agreement%
    datasets/                             MT-Bench subset + length-confound pairs (+ provenance README)
    results/                             .gitignored output
  README.md                               positioning + install + usage + the eval table
```

**Responsibility boundaries:** `lib/council-core.mjs` is the single source of truth for all testable logic; everything else is prose/orchestration that *uses* it. Modes differ only in how candidates are gathered; all share `judge.md` + the controls. The eval never imports a mode's markdown — it calls the same core functions + a mode runner.

**Platform `[impl-verify]` flags resolved in Task 1** (from the spec section 14): plugin skill dispatch mechanism, `$ARGUMENTS` multi-line capture (-> keep/drop `--file`), on-demand `modes/*.md` loading. Build tasks below assume Task 1's findings; if a finding contradicts an assumption, fix that task's affected step before proceeding.

---

## Task 1: Plugin scaffold + platform-assumption spike

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `skills/council/SKILL.md` (minimal, dispatch stub)
- Create: `test/scripts-syntax.test.mjs`

- [ ] **Step 1: Write the plugin manifest**

`.claude-plugin/plugin.json`:
```json
{
  "name": "council",
  "description": "Lean, research-backed multi-LLM council with debiased judging (position-swap, verbosity-norm, stake-free judge).",
  "version": "0.1.0",
  "author": "7xuanlu"
}
```

- [ ] **Step 2: Write a minimal dispatch SKILL.md**

`skills/council/SKILL.md`:
```markdown
---
name: council
description: Multi-LLM council with debiased judging. Modes - default (poll), consensus, adversarial.
disable-model-invocation: true
argument-hint: "[default|consensus|adversarial|help] <proposal>"
---

Parse the FIRST whitespace-delimited token of "$ARGUMENTS" as the MODE; the remainder is the PROPOSAL.

- `help`  -> print the mode/cost/flags table below; stop.
- `consensus` -> read and follow `modes/consensus.md`.
- `adversarial` -> read and follow `modes/adversarial.md`.
- anything else (or empty) -> treat the whole of "$ARGUMENTS" as the proposal and follow `modes/default.md`.

Modes: `default` ~4 calls; `consensus` ~7 calls; `adversarial` ~13 calls.
```

- [ ] **Step 3: Verify platform assumptions (the `[impl-verify]` flags)**

Run these manual checks in a live Claude Code session and record results as a comment block at the top of `skills/council/SKILL.md`:
1. Install the plugin locally; confirm `/council` appears and is user-only (no model auto-trigger).
2. `/council help` with a **multi-line pasted** proposal — confirm `$ARGUMENTS` captures the full multi-line text. **If yes -> delete `--file` from the plan (spec section 4 `[impl-verify]`).** If no -> keep `--file` (Task 8 adds it).
3. Confirm a `modes/default.md` referenced from SKILL.md is loaded only when dispatched (on-demand), not at session start.

Expected: dispatch works; record the multi-line + on-demand findings.

- [ ] **Step 4: Write the embedded-script syntax test**

`test/scripts-syntax.test.mjs`:
```javascript
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Every modes/*.md embeds one ```js Workflow script. Extract + node --check it
// (wrapped in an async fn so top-level await/return/export are legal, mirroring the runtime).
function extractScript(md) {
  const m = md.match(/```js\n([\s\S]*?)\n```/)
  return m ? m[1] : null
}
test('every mode script is valid JS', () => {
  const dir = 'skills/council/modes'
  for (const f of readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const js = extractScript(readFileSync(join(dir, f), 'utf8'))
    if (js === null) continue
    const wrapped = 'async function __wf(){\n' + js.replace('export const meta', 'const meta') + '\n}\n'
    const tmp = join(mkdtempSync(join(tmpdir(), 'wf-')), 'c.mjs')
    writeFileSync(tmp, wrapped)
    execFileSync(process.execPath, ['--check', tmp]) // throws on syntax error
  }
})
```

- [ ] **Step 5: Run the syntax test (passes vacuously — no modes yet)**

Run: `node --test test/scripts-syntax.test.mjs`
Expected: PASS (0 mode files yet). Create `skills/council/modes/.gitkeep` so the dir exists.

- [ ] **Step 6: Commit**

```bash
git add .claude-plugin skills/council/SKILL.md test/scripts-syntax.test.mjs skills/council/modes/.gitkeep
git commit -m "feat(council): plugin scaffold + dispatch stub + script-syntax test"
```

---

## Task 2: Core — mode dispatch parser (TDD)

**Files:**
- Create: `lib/council-core.mjs`
- Create: `test/council-core.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/council-core.test.mjs`:
```javascript
import { test } from 'node:test'
import assert from 'node:assert'
import { parseInvocation } from '../lib/council-core.mjs'

test('parseInvocation splits mode from proposal', () => {
  assert.deepEqual(parseInvocation('consensus should we ship X'),
    { mode: 'consensus', proposal: 'should we ship X' })
  assert.deepEqual(parseInvocation('adversarial plan A'),
    { mode: 'adversarial', proposal: 'plan A' })
})
test('unknown leading token -> default mode, whole text is proposal', () => {
  assert.deepEqual(parseInvocation('is this design sound?'),
    { mode: 'default', proposal: 'is this design sound?' })
})
test('bare mode word -> help/empty proposal', () => {
  assert.deepEqual(parseInvocation('help'), { mode: 'help', proposal: '' })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/council-core.test.mjs`
Expected: FAIL — `parseInvocation` is not exported.

- [ ] **Step 3: Implement minimal `parseInvocation`**

In `lib/council-core.mjs`:
```javascript
const MODES = new Set(['default', 'consensus', 'adversarial', 'help'])
export function parseInvocation(args) {
  const s = String(args ?? '').trim()
  const sp = s.indexOf(' ')
  const first = (sp === -1 ? s : s.slice(0, sp)).toLowerCase()
  if (MODES.has(first)) return { mode: first, proposal: sp === -1 ? '' : s.slice(sp + 1).trim() }
  return { mode: 'default', proposal: s }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/council-core.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/council-core.mjs test/council-core.test.mjs
git commit -m "feat(council): mode-dispatch parser (parseInvocation)"
```

---

## Task 3: Core — contamination gate (TDD, verified thresholds)

**Files:**
- Modify: `lib/council-core.mjs`
- Modify: `test/council-core.test.mjs`

> Thresholds (`foreign >= 8` OR `coverage < 0.20`) were verified live against the real contaminated sample (28 foreign / 14% cov) vs three clean runs (<=3 / >=26%). See spec section 8.5.

- [ ] **Step 1: Write the failing test**

Append to `test/council-core.test.mjs`:
```javascript
import { isContaminated, _coverage, _foreignCount } from '../lib/council-core.mjs'

const PROPOSAL = 'package a multi-llm council as a claude code plugin with bias controls position-swap consensus stake-free synthesis progressive disclosure'

test('gate flags an off-topic (context-bleed) verdict', () => {
  const bleed = { key_claims: ['lean packaging is fine'],
    risks: ['U-shape cost curves assume crossover', 'A-sonnet coordinator and B-parity unclear',
            'N-power insufficient for slope', 'Meter-B re-witness capture-head undefined',
            'B-full vs B-parity arm', 'prompt-caching cache-hit flattening'],
    unknowns: ['SP-coordinator vs UP-cost', 'task-order alias confound'] }
  assert.equal(isContaminated(bleed, PROPOSAL), true)
})
test('gate passes an on-topic verdict', () => {
  const clean = { key_claims: ['single council skill keeps standing context low'],
    risks: ['consensus and adversarial modes add complexity', 'stake-free synthesis is single point'],
    unknowns: ['which published eval proves the bias controls'] }
  assert.equal(isContaminated(clean, PROPOSAL), false)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/council-core.test.mjs`
Expected: FAIL — `isContaminated` not exported.

- [ ] **Step 3: Implement the gate (verified logic from the patched command)**

Append to `lib/council-core.mjs`:
```javascript
export function _foreignCount(txt, propLower) {
  let n = 0
  for (const x of new Set(txt.match(/\b[A-Za-z]+-[A-Za-z]+\b/g) || []))
    if (x.length > 3 && propLower.indexOf(x.toLowerCase()) === -1) n++
  return n
}
export function _coverage(txt, propVocab) {
  const sv = new Set(txt.toLowerCase().match(/[a-z][a-z\-]{3,}/g) || [])
  if (sv.size === 0) return 1
  let hit = 0
  for (const w of sv) if (propVocab.has(w)) hit++
  return hit / sv.size
}
export function isContaminated(verdict, proposal) {
  if (verdict == null) return false
  const propLower = String(proposal).toLowerCase()
  const propVocab = new Set(propLower.match(/[a-z][a-z\-]{3,}/g) || [])
  const txt = [...(verdict.key_claims || []), ...(verdict.risks || []), ...(verdict.unknowns || [])].join(' ')
  return _foreignCount(txt, propLower) >= 8 || _coverage(txt, propVocab) < 0.20
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/council-core.test.mjs`
Expected: PASS (5 tests total).

- [ ] **Step 5: Commit**

```bash
git add lib/council-core.mjs test/council-core.test.mjs
git commit -m "feat(council): contamination gate (verified thresholds, spec 8.5)"
```

---

## Task 4: Core — nonce + bias-control helpers (TDD)

**Files:**
- Modify: `lib/council-core.mjs`
- Modify: `test/council-core.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `test/council-core.test.mjs`:
```javascript
import { runNonce, counterbalance } from '../lib/council-core.mjs'

test('runNonce is deterministic per proposal, differs across proposals', () => {
  assert.equal(runNonce('alpha'), runNonce('alpha'))
  assert.notEqual(runNonce('alpha'), runNonce('beta'))
  assert.match(runNonce('alpha'), /^council-[a-z0-9]+$/)
})
test('counterbalance yields both orderings for a 2-item pair', () => {
  const orders = counterbalance(['A', 'B'])
  assert.equal(orders.length, 2)
  assert.deepEqual(orders[0], ['A', 'B'])
  assert.deepEqual(orders[1], ['B', 'A'])
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/council-core.test.mjs`
Expected: FAIL — `runNonce`/`counterbalance` not exported.

- [ ] **Step 3: Implement (no Date/Math.random — workflow scripts forbid them; derive from content)**

Append to `lib/council-core.mjs`:
```javascript
export function runNonce(proposal) {
  const h = Array.from(String(proposal)).reduce((a, c) => ((a * 31 + c.charCodeAt(0)) >>> 0), 7)
  return 'council-' + h.toString(36)
}
// position-swap: return both orderings so the judge sees a counterbalanced pair
export function counterbalance(items) {
  return [items.slice(), items.slice().reverse()]
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/council-core.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/council-core.mjs test/council-core.test.mjs
git commit -m "feat(council): runNonce + counterbalance (position-swap helper)"
```

---

## Task 5: Core — codex isolation command builder (TDD)

**Files:**
- Modify: `lib/council-core.mjs`
- Modify: `test/council-core.test.mjs`

> Verified live: an isolated `CODEX_HOME` containing only `auth.json` (no config/projects/global-state) + a neutral `mktemp` cwd runs codex cleanly with auth preserved (spec section 8.5).

- [ ] **Step 1: Write the failing test**

Append to `test/council-core.test.mjs`:
```javascript
import { codexCmd, geminiCmd } from '../lib/council-core.mjs'

test('codexCmd isolates CODEX_HOME + cwd and preserves auth', () => {
  const c = codexCmd('gpt-5.5', '/t/in.txt', '/t/out.txt')
  assert.match(c, /CODEX_HOME="\$CH"/)
  assert.match(c, /cp "\$HOME\/\.codex\/auth\.json"/)
  assert.match(c, /mktemp -d/)
  assert.match(c, /-s read-only/)
  assert.match(c, /model_reasoning_effort=xhigh/)
  assert.match(c, /--ephemeral/)
})
test('geminiCmd runs read-only plan mode', () => {
  const g = geminiCmd('gemini-3.1-pro-preview', '/t/in.txt')
  assert.match(g, /--approval-mode plan/)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/council-core.test.mjs`
Expected: FAIL — `codexCmd`/`geminiCmd` not exported.

- [ ] **Step 3: Implement the command builders**

Append to `lib/council-core.mjs`:
```javascript
export function codexCmd(model, inFile, outFile) {
  return `CH="$(mktemp -d)"; cp "$HOME/.codex/auth.json" "$CH/" 2>/dev/null; ND="$(mktemp -d)"; ` +
    `( cd "$ND" && CODEX_HOME="$CH" codex exec -m ${model} -s read-only ` +
    `-c model_reasoning_effort=xhigh --skip-git-repo-check --ephemeral -o "${outFile}" - < "${inFile}" ); ` +
    `rc=$?; rm -rf "$CH" "$ND"; exit $rc`
}
export function geminiCmd(model, inFile) {
  return `gemini -m ${model} --approval-mode plan -p "$(cat "${inFile}")" 2>/dev/null`
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/council-core.test.mjs`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/council-core.mjs test/council-core.test.mjs
git commit -m "feat(council): isolated codex + gemini CLI command builders"
```

---

## Task 6: Agent — conduit.md (read-only, isolated relay)

**Files:**
- Create: `agents/conduit.md`

> Port the conduit prompt from `~/.claude/commands/council.md` (the `cliConduit` template), substituting the isolated `codexCmd` from Task 5. The conduit is a pass-through that forwards the CLI's JSON verbatim (light syntax repair only — never content substitution).

- [ ] **Step 1: Write `agents/conduit.md`**

```markdown
---
name: council-conduit
description: Pass-through relay to an external model CLI (codex/gemini). Forwards JSON verbatim.
---

You are a PASS-THROUGH CONDUIT to an external model's CLI — NOT a judge. Forward its view UNCHANGED. Do NOT re-evaluate, inject opinion, or editorialize.

Steps:
1. Write the EXTERNAL PROMPT (everything below the marker, verbatim) to "$TMPDIR/council_<id>_<nonce>_in.txt".
2. Run the provided command WITH THE BASH SANDBOX DISABLED (it needs network + IPC; a sandboxed attempt fails with "Operation not permitted"). codex runs in an isolated CODEX_HOME (auth-only) + neutral cwd; both CLIs are read-only.
3. Read the model's final JSON (codex: from the `-o` out file; gemini: from stdout).
4. Emit that JSON VERBATIM as your structured output. Repair ONLY malformed syntax (unbalanced braces/quotes); NEVER change content. Ensure the "model" field is the requested id.

EXTERNAL PROMPT:
<injected by the mode script>
```

- [ ] **Step 2: Validate the agent frontmatter loads**

Run (live): install plugin, confirm the workflow can spawn `council-conduit` via `agentType`. Record OK in a comment.

- [ ] **Step 3: Commit**

```bash
git add agents/conduit.md
git commit -m "feat(council): read-only isolated CLI conduit agent"
```

---

## Task 7: Agent — judge.md (stake-free synth + controls)

**Files:**
- Create: `agents/judge.md`
- Create: `skills/council/reference/bias-controls.md`

> Port the stake-free judge prompt from `council.md` (the `judgePrompt`), adding explicit position-swap (counterbalanced ordering of the candidates it reads) and verbosity-norm (ignore length/style) instructions. The judge authored none of the candidates.

- [ ] **Step 1: Write `skills/council/reference/bias-controls.md`**

Document the three controls' judging-time mechanics + citations (position-swap: counterbalanced order, Shi 2024; verbosity-norm: ignore length / length-controlled, Dubois 2024; stake-free: synthesizer authored none, Verga 2024). This file is loaded at the judging step.

- [ ] **Step 2: Write `agents/judge.md`**

```markdown
---
name: council-judge
description: Stake-free synthesizer/judge. Authored no candidate; applies the three bias controls.
---

You are an impartial JUDGE. You authored NONE of the candidate answers below — you have no position to defend. Decide from the evidence only. Apply the three bias controls:
- POSITION-SWAP: the candidates are presented in a counterbalanced order; judge on content, not slot.
- VERBOSITY-NORM: do NOT reward length or polish; ignore style; weigh substance only.
- STAKE-FREE: identities are hidden and you wrote none of these; do not self-favor.

Return ONLY the JSON object specified by the calling mode.
```

- [ ] **Step 3: Commit**

```bash
git add agents/judge.md skills/council/reference/bias-controls.md
git commit -m "feat(council): stake-free judge agent + bias-controls reference"
```

---

## Task 8: SKILL.md dispatch finalization + `/council help`

**Files:**
- Modify: `skills/council/SKILL.md`

- [ ] **Step 1: Finalize dispatch + help text**

Replace the help line with a full table (modes, ~calls, flags). If Task 1 Step 3 found `$ARGUMENTS` does NOT capture multi-line cleanly, add `--file <path>` handling here; otherwise omit `--file` (per spec section 4 `[impl-verify]`).

- [ ] **Step 2: Manual smoke**

Run (live): `/council help` -> prints the table; `/council` with a short proposal -> dispatches to default. Record OK.

- [ ] **Step 3: Commit**

```bash
git add skills/council/SKILL.md
git commit -m "feat(council): finalize dispatch + /council help"
```

---

## Task 9: Mode — default (poll -> stake-free synth)

**Files:**
- Create: `skills/council/modes/default.md`
- Create: `test/embed-drift.test.mjs`

- [ ] **Step 1: Write `modes/default.md`**

A `Workflow` script that: embeds the Task 2–5 core functions (verbatim copy from `lib/council-core.mjs`), asks the 3 members once in parallel (claude main-loop; codex/gemini via the conduit using `codexCmd`/`geminiCmd`, prompts carrying `runNonce(proposal)`), runs `isContaminated` on each verdict and drops flagged members, then calls the `council-judge` agent over the counterbalanced candidate set. `meta.name = 'council-default'`.

- [ ] **Step 2: Write the embed-drift test**

`test/embed-drift.test.mjs`:
```javascript
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Each embedded core function must match the canonical lib byte-for-byte (no silent drift).
const lib = readFileSync('lib/council-core.mjs', 'utf8')
const FUNCS = ['isContaminated', 'runNonce', 'counterbalance', 'codexCmd']
function bodyOf(src, name) {
  const m = src.match(new RegExp(`export function ${name}\\b[\\s\\S]*?\\n}`))
  return m ? m[0].replace(/^export /, '') : null
}
test('mode scripts embed canonical core functions unchanged', () => {
  for (const f of readdirSync('skills/council/modes').filter(x => x.endsWith('.md'))) {
    const md = readFileSync(join('skills/council/modes', f), 'utf8')
    for (const fn of FUNCS) {
      const canon = bodyOf(lib, fn)
      assert.ok(canon, `lib missing ${fn}`)
      assert.ok(md.includes(canon), `${f} drifted on ${fn}`)
    }
  }
})
```

- [ ] **Step 3: Run tests (syntax + drift)**

Run: `node --test test/`
Expected: PASS — `scripts-syntax` validates default.md's JS; `embed-drift` confirms the embedded functions match the lib.

- [ ] **Step 4: Manual end-to-end smoke**

Run (live): `/council is a single-skill plugin a good idea?` -> returns a synthesized answer + disagreements; cost line in tokens. Record OK.

- [ ] **Step 5: Commit**

```bash
git add skills/council/modes/default.md test/embed-drift.test.mjs
git commit -m "feat(council): default poll mode + embed-drift guard"
```

---

## Task 10: Mode — consensus (propose -> anon peer-rank -> synth)

**Files:**
- Create: `skills/council/modes/consensus.md`

- [ ] **Step 1: Write `modes/consensus.md`**

`Workflow` script: propose (3 parallel, no cross-talk) -> each member ranks the 3 anonymized answers, each ranker shown a `counterbalance`d ordering (position-swap showcase) -> `isContaminated` filter -> `council-judge` synth (verbosity-norm + stake-free). Embeds the same core functions; `meta.name = 'council-consensus'`.

- [ ] **Step 2: Run tests**

Run: `node --test test/`
Expected: PASS (syntax + drift now cover consensus.md too — the drift test already iterates all modes).

- [ ] **Step 3: Manual smoke + commit**

Run (live): `/council consensus <short proposal>` -> ranked consensus + agree/split map. Then:
```bash
git add skills/council/modes/consensus.md
git commit -m "feat(council): consensus peer-rank mode"
```

---

## Task 11: Mode — adversarial (port the existing flow)

**Files:**
- Create: `skills/council/modes/adversarial.md`

- [ ] **Step 1: Port `~/.claude/commands/council.md`'s Workflow script**

Copy the form->attack->defend->judge script from `council.md` into `modes/adversarial.md`. Integrate the canonical core: the inline conduit/gate/nonce/isolation in `council.md` are already the Task 2–5 logic (the command was patched with them), so align the embedded copies to match `lib/council-core.mjs` byte-for-byte (so `embed-drift` passes). `meta.name = 'council-adversarial'`.

- [ ] **Step 2: Run tests**

Run: `node --test test/`
Expected: PASS (syntax + drift cover adversarial.md).

- [ ] **Step 3: Manual smoke + commit**

Run (live): `/council adversarial <short proposal>` -> form/attack/defend/judge report. Then:
```bash
git add skills/council/modes/adversarial.md
git commit -m "feat(council): adversarial mode (ported from existing /council)"
```

---

## Task 12: Eval — harness + metrics scaffold

**Files:**
- Create: `eval/metrics.mjs`
- Create: `eval/harness.mjs`
- Create: `test/metrics.test.mjs`
- Create: `eval/datasets/README.md`

- [ ] **Step 1: Write failing metric tests**

`test/metrics.test.mjs`:
```javascript
import { test } from 'node:test'
import assert from 'node:assert'
import { positionConsistency, lengthControlledWinRate } from '../eval/metrics.mjs'

test('positionConsistency = fraction of pairs with order-stable verdict', () => {
  // each pair: verdict in order A-B vs B-A; consistent if same winner
  const pairs = [{ ab: 'A', ba: 'A' }, { ab: 'A', ba: 'B' }, { ab: 'B', ba: 'B' }]
  assert.equal(positionConsistency(pairs), 2 / 3)
})
test('lengthControlledWinRate returns a win-rate in [0,1]', () => {
  const obs = [{ win: 1, lenDiff: 100 }, { win: 0, lenDiff: -100 }, { win: 1, lenDiff: 0 }]
  const r = lengthControlledWinRate(obs)
  assert.ok(r >= 0 && r <= 1)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/metrics.test.mjs`
Expected: FAIL — metrics not exported.

- [ ] **Step 3: Implement `eval/metrics.mjs`** (position-consistency exact; length-controlled win-rate via a small logistic fit on `[intercept, lenDiff]`, report sigmoid(intercept))

```javascript
export function positionConsistency(pairs) {
  if (pairs.length === 0) return 1
  return pairs.filter(p => p.ab === p.ba).length / pairs.length
}
// logistic regression win ~ 1 + lenDiff; return sigmoid(intercept) = win-rate at lenDiff=0
export function lengthControlledWinRate(obs, iters = 500, lr = 0.01) {
  let b0 = 0, b1 = 0
  for (let i = 0; i < iters; i++) {
    let g0 = 0, g1 = 0
    for (const o of obs) {
      const p = 1 / (1 + Math.exp(-(b0 + b1 * o.lenDiff)))
      g0 += (p - o.win); g1 += (p - o.win) * o.lenDiff
    }
    b0 -= lr * g0 / obs.length; b1 -= lr * g1 / obs.length
  }
  return 1 / (1 + Math.exp(-b0))
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/metrics.test.mjs`
Expected: PASS.

- [ ] **Step 5: Write `eval/harness.mjs`** (runs a mode runner with a control flag off/on, collects observations) **+ `eval/datasets/README.md`** documenting the MT-Bench subset + that public human/GPT-4 labels are **reused, not regenerated** (spec section 9; the `[open]` availability check goes here).

- [ ] **Step 6: Commit**

```bash
git add eval/metrics.mjs eval/harness.mjs test/metrics.test.mjs eval/datasets/README.md
git commit -m "feat(eval): metrics (position-consistency, length-controlled win-rate) + harness"
```

---

## Task 13: Eval — the three control experiments + report

**Files:**
- Create: `eval/run.mjs`
- Modify: `eval/metrics.mjs` (add `panelVsSingleBiasDelta`, `selfPreferenceUplift`, `humanAgreement`)
- Modify: `test/metrics.test.mjs` (extend)

- [ ] **Step 1: Write failing tests for the remaining metrics**

Extend `test/metrics.test.mjs` with cases for `panelVsSingleBiasDelta` (control #3), `selfPreferenceUplift` (#3), and `humanAgreement` (validity, bar > 0.80). Provide small fixtures with known expected values.

- [ ] **Step 2: Run -> fail; Step 3: implement the three metrics; Step 4: run -> pass.**

Run: `node --test test/metrics.test.mjs` (FAIL -> implement -> PASS).

- [ ] **Step 5: Write `eval/run.mjs`**

Orchestrates, per spec section 9: control #1 (position-swap off/on -> positionConsistency delta), #2 (verbosity-norm off/on -> lengthControlledWinRate delta), #3 (stake-free vs single-judge -> panelVsSingleBiasDelta + selfPreferenceUplift), validity (humanAgreement vs reused MT-Bench labels). Emits a markdown table `metric | off | on | delta | source` to `eval/results/` (gitignored).

- [ ] **Step 6: Run the harness on a tiny dataset slice (smoke)**

Run: `node eval/run.mjs --smoke`
Expected: emits a results table for all three controls without error (values indicative on the slice).

- [ ] **Step 7: Commit**

```bash
git add eval/run.mjs eval/metrics.mjs test/metrics.test.mjs
git commit -m "feat(eval): three-control experiments + results table (C2: all three)"
```

---

## Task 14: Integration smoke + README

**Files:**
- Modify: `lib/council-core.mjs` (add `runCouncilCore`)
- Create: `test/integration.test.mjs`
- Modify: `README.md` (add Install/Usage/Eval sections)

- [ ] **Step 1: Write an integration test with mocked CLIs**

`test/integration.test.mjs`: feed a known proposal + canned member verdicts (including one contaminated) through the core path (`parseInvocation` -> member collection stub -> `isContaminated` filter -> judge stub); assert the contaminated member is dropped and a synthesis is produced from the rest. Pure Node, no live CLIs.

```javascript
import { test } from 'node:test'
import assert from 'node:assert'
import { runCouncilCore } from '../lib/council-core.mjs'

test('contaminated member is dropped; clean members synthesized', () => {
  const proposal = 'should the council ship as a single skill with modes'
  const raw = [
    { id: 'claude', verdict: { key_claims: ['single skill keeps context low'], risks: ['mode sprawl'], unknowns: [] } },
    { id: 'gemini', verdict: { key_claims: ['modes are a clean interface'], risks: ['discoverability'], unknowns: [] } },
    { id: 'codex',  verdict: { key_claims: ['x'], risks: ['U-shape crossover', 'A-sonnet B-parity', 'N-power slope', 'Meter-B re-witness', 'capture-head undefined', 'B-full arm'], unknowns: ['SP-coordinator'] } },
  ]
  const { live, dropped } = runCouncilCore(proposal, raw)
  assert.deepEqual(dropped, ['codex'])
  assert.equal(live.length, 2)
})
```

- [ ] **Step 2: Run -> fail; implement `runCouncilCore(proposal, rawVerdicts)` in `lib/council-core.mjs` (filter via `isContaminated`, return `{ live, dropped }`); run -> pass.**

Run: `node --test test/integration.test.mjs`
Expected: PASS — contaminated member excluded; >=2 clean members.

- [ ] **Step 3: Write `README.md` Install/Usage/Eval sections** — install (`/plugin marketplace add`...), the three modes + costs, the bias-control + eval table, and the section-8.5 contamination note. Keep the existing positioning prose.

- [ ] **Step 4: Run the full suite**

Run: `node --test test/`
Expected: PASS (all unit + drift + syntax + integration tests).

- [ ] **Step 5: Commit**

```bash
git add README.md test/integration.test.mjs lib/council-core.mjs
git commit -m "feat(council): integration smoke + install/usage/eval README"
```

---

## Self-Review (run before handoff)

**Spec coverage** (each spec section -> task):
- section 3 progressive disclosure -> Task 1 (thin SKILL.md), Tasks 9–11 (on-demand modes). OK
- section 4 invocation + `--file` `[impl-verify]` -> Task 1 Step 3 + Task 8. OK
- section 5 three modes -> Tasks 9, 10, 11. OK
- section 6 bias controls + C1 build-order (controls before modes) -> Tasks 3–5, 7 precede 9–11. OK
- section 8 agents -> Tasks 6, 7. OK
- section 8.5 isolation + contamination gate -> Tasks 3, 5, 6, 9 (filter). OK
- section 9 eval all three controls + named benchmarks + reused labels -> Tasks 12, 13. OK
- section 11 testing (dispatch, degradation, controls, eval smoke) -> Tasks 2, 9, 12–14. OK
- section 12 host-agnostic core -> `lib/council-core.mjs` is pure (no Workflow deps). OK

**Placeholder scan:** no "TBD"/"add error handling"/"similar to Task N" — ported prompts reference the concrete source file `council.md`; all test/impl steps show code. OK

**Type consistency:** `parseInvocation`, `isContaminated(verdict, proposal)`, `runNonce`, `counterbalance`, `codexCmd`, `geminiCmd`, `runCouncilCore` names/signatures are used identically in tests, lib, embed-drift, and integration. OK

**Open dependency:** Tasks 1/8 gate `--file` on the live `$ARGUMENTS` finding; Task 12 notes the MT-Bench label-availability `[open]` — both surfaced, not hidden.
