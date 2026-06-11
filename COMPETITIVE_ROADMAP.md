# JSON Comparator — Competitive Roadmap (AI-Executable Plan)

**Date:** 2026-06-11
**Derived from:** [`COMPETITIVE_ANALYSIS.md`](COMPETITIVE_ANALYSIS.md)
**Continues:** `ENHANCEMENT_PLAN.md` (Phases A–D shipped). This adds **Phases E–G**.

This plan is written to be executed by an AI coding agent **one task at a time**. Each task has a
stable ID, a rationale, explicit scope, the files it touches, a **DIFF-CORE flag**, "Done when"
acceptance criteria, an effort/model recommendation, and a **ready-to-paste execution prompt**.

---

## How to use this doc

1. Pick the next unblocked task (dependencies are noted).
2. Copy that task's **Execution prompt** block into a fresh AI session.
3. The agent restates "Done when", outlines its approach, implements, runs tests, and reports pass/fail per bullet.
4. Update the **Status** column below when done.

### Task status tracker

| ID | Title | Phase | DIFF-CORE? | Depends on | Status |
|---|---|---|---|---|---|
| E-1 | Find-in-document (Ctrl-F) search | E · Quick wins | No | — | ✅ done |
| E-2 | Sort-keys + restore Minify | E · Quick wins | No | — | ✅ done |
| E-3 | Indent choice on Format (2/3/4/tab) | E · Quick wins | No | E-2 | ✅ done |
| E-4 | Share-URL length guard | E · Quick wins | No | — | ✅ done |
| E-5 | Configurable highlight cutoff | E · Quick wins | No | — | ✅ done |
| F-1 | JSON Schema validation | F · High-impact | No | — | ✅ done |
| F-2 | JSONPath query bar | F · High-impact | No | — | ✅ done |
| F-3 | 3-Way: resolve + export merge | F · High-impact | No* | — | ✅ done |
| F-4 | Ignore-paths globs | F · High-impact | **YES** | — | ✅ done |
| G-1 | Publish diff engine as npm package | G · Platform | **YES (read-only)** | — | ✅ done |
| G-2 | GitHub Action: JSON diff on PRs | G · Platform | No | G-1 | ✅ done |
| G-3 | Schema-aware diff | G · Platform | **YES** | F-1, F-4 | ✅ done |

\* F-3 reads `src/three-way.js`; only touches it if merge-resolution logic needs to live in the core.

---

## Guardrails (apply to EVERY task)

These are unchanged from `REDESIGN_EXECUTION_PLAN.md` / `ENHANCEMENT_PLAN.md`:

- **Single file, zero runtime deps.** `json_compare.html` stays openable via `file://` with no build step. Dev-only deps (test/lint/build tooling) are fine in `package.json`.
- **`json_compare.html` CSP stays `connect-src 'none'`.** No feature may add a network call to the offline file. Anything that needs the network (e.g. fetching a remote schema) is **opt-in, `index.html`-only, behind the FEEDBACK-style delta**, and must not regress the offline file's zero-request guarantee.
- **DIFF-CORE is byte-identical across its three copies.** The inline block in `json_compare.html`, `src/diff-core.js`, and the Python `json_compare.py` must agree. Any task flagged **DIFF-CORE: YES** must mirror the change to all three and keep `tests/diff-core-parity.test.js` green. Tasks flagged **No** must not touch the DIFF-CORE block at all.
- **Preserve element IDs.** Removing an element removes its listeners — guard with existence checks. Do not rename existing IDs; new IDs are fine.
- **`index.html` is regenerated** from `json_compare.html` + the FEEDBACK delta + the one CSP `connect-src` line. After any UI change, regenerate it and keep `tests/index-parity.test.js` green.
- **Tests + checks green.** `npm test` (incl. `diff-core-parity`, `index-parity`, `parity`), `npm run lint`, `node --check` on the extracted script, and `pytest` where Python is touched.
- **Docs.** Update `CHANGELOG.md` and `README.md` for any user-visible change.
- **Manual pass.** Light + dark, 1440 / 820 / 390 px, and a `file://` load of `json_compare.html` with DevTools Network proving zero requests.

---

## Generic execution template

```
Act as a senior engineer on the JSON Comparator in this folder.
Read COMPETITIVE_ROADMAP.md (Guardrails + the task below) and COMPETITIVE_ANALYSIS.md for context.
Execute exactly ONE task:

TASK: <paste task ID + title>

Before coding: restate the "Done when" bullets, confirm dependencies are met, and outline your
approach in 3–5 bullets. Pick sensible defaults for anything ambiguous and note them.

Honor ALL guardrails in COMPETITIVE_ROADMAP.md — especially the DIFF-CORE flag for this task and
the json_compare.html CSP connect-src 'none' rule.

After coding: run `npm test`, `npm run lint`, `node --check` on the extracted script (and `pytest`
if Python changed); paste the output; regenerate index.html if the UI changed; confirm each
"Done when" bullet pass/fail; update CHANGELOG.md + README.md; flip this task's Status in the
tracker table.

Scope: do only this task. Note follow-ups; don't start them.
```

Each task below also has a **filled-in prompt** ready to paste verbatim.

---

# Phase E — Quick wins (UI-only, no DIFF-CORE)

Goal: close obvious table-stakes gaps cheaply. None of these touch the diff engine.

### E-1 · Find-in-document (Ctrl-F) search
**Why:** Single biggest daily-friction gap (analysis Top-10 #4). No way to search within inputs or the rendered tree.
**Scope:** A search box (toggled by `Ctrl/Cmd+F`, scoped to the app, not the browser's native find) that searches the focused input pane and the rendered results (tree/table). Match highlighting with **next/prev** navigation and a match counter (`3 / 17`). Case-insensitive by default with a case toggle. Reuse the existing highlight-overlay technique for input matches; reuse the existing diff-navigation pattern (`#navPos`, Next/Prev) for results matches.
**Files:** `json_compare.html` (CSS/HTML/JS), regenerate `index.html`, new `tests/find.test.js`.
**DIFF-CORE:** No.
**Done when:**
- `Ctrl/Cmd+F` opens an in-app find bar; `Esc` closes it and clears highlights.
- Typing highlights all matches in the active surface (input pane OR results) with a `n / total` counter.
- Enter / Shift+Enter (and on-screen ▲▼) move to next/prev match and scroll it into view.
- Works in tree and table results; degrades gracefully when highlighting is off (>80 k chars) by still scrolling to matches.
- New unit test covers match-counting + next/prev wraparound. `npm test`, lint, `node --check` green. `index.html` regenerated; parity tests green.
**Effort:** ~1 day · **Model:** Sonnet 4.6 (or Opus high if overlay interaction gets fiddly).

> **Execution prompt — E-1**
> ```
> Act as a senior engineer on the JSON Comparator in this folder. Read COMPETITIVE_ROADMAP.md
> (Guardrails + task E-1) and COMPETITIVE_ANALYSIS.md. Execute exactly ONE task: E-1 — Find-in-document
> (Ctrl-F) search. Restate the Done-when bullets and outline your approach first. Reuse the existing
> highlight-overlay for input matches and the existing Next/Prev (#navPos) pattern for results matches;
> the find bar must intercept Ctrl/Cmd+F only inside the app and Esc must clear it. No DIFF-CORE changes,
> no new network calls. After coding: npm test + lint + node --check, regenerate index.html, confirm each
> Done-when bullet, update CHANGELOG.md + README.md, flip E-1 status in the tracker.
> ```

---

### E-2 · Sort-keys + restore Minify
**Why:** Table-stakes (analysis Top-10 #5). Minify handler exists but is unwired; no key-sort exists.
**Scope:** Add per-pane **Sort keys** (recursively alphabetize object keys; arrays untouched) and re-expose **Minify** in the per-pane tool row (or a per-pane `⋯` menu to avoid crowding — your call, note it). Sort is a pure text transform on the pane content, not a diff option.
**Files:** `json_compare.html`, regenerate `index.html`, extend `tests/options.test.js` or new `tests/format-tools.test.js`.
**DIFF-CORE:** No (editor-only transforms; the engine already ignores key order).
**Done when:**
- Each input pane has a working **Sort keys** action: valid JSON → keys recursively sorted, formatting preserved per current indent; invalid JSON → existing parse-error/repair flow.
- **Minify** is reachable from the UI again and collapses the pane to single-line JSON.
- Both respect the auto-repair offer on invalid input.
- Unit test asserts deterministic key order on a nested fixture. Tests/lint/check green; `index.html` regenerated.
**Effort:** ~0.5 day · **Model:** Sonnet 4.6.

> **Execution prompt — E-2**
> ```
> Act as a senior engineer on the JSON Comparator. Read COMPETITIVE_ROADMAP.md (Guardrails + task E-2).
> Execute ONE task: E-2 — Sort-keys + restore Minify. Add a per-pane "Sort keys" (recursive alphabetical,
> arrays untouched) and re-wire the existing (unused) Minify handler into the UI; decide whether to use the
> pane tool row or a per-pane ⋯ menu and note the choice. Editor-only transforms — DO NOT touch DIFF-CORE.
> Honor the auto-repair flow on invalid JSON. After: npm test + lint + node --check, regenerate index.html,
> add a key-order unit test, update CHANGELOG/README, flip E-2 status.
> ```

---

### E-3 · Indent choice on Format (2 / 3 / 4 spaces / tab)
**Why:** Every formatter competitor offers it; Format is currently fixed.
**Scope:** A small indent selector (persisted pref, like `splitRatio`) consumed by Format and Sort-keys (E-2). Default 2 spaces.
**Files:** `json_compare.html`, regenerate `index.html`, extend persistence test.
**DIFF-CORE:** No. **Depends on:** E-2 (shares the formatter path).
**Done when:** Indent selector present, persisted across reload, applied by Format + Sort-keys + Minify-aware paths; tests/lint/check green; `index.html` regenerated.
**Effort:** ~0.25 day · **Model:** Sonnet 4.6.

> **Execution prompt — E-3**
> ```
> Act as a senior engineer on the JSON Comparator. Read COMPETITIVE_ROADMAP.md (Guardrails + task E-3).
> Execute ONE task: E-3 — Indent choice on Format (2/3/4 spaces/tab), persisted like splitRatio, consumed by
> Format and Sort-keys. Default 2 spaces. No DIFF-CORE changes. After: tests/lint/check, regenerate index.html,
> extend the persistence test, update CHANGELOG/README, flip E-3 status.
> ```

---

### E-4 · Share-URL length guard
**Why:** Already backlogged (`ENHANCEMENT_PLAN.md` P2-8). Multi-MB URL fragments silently break in chat apps/browsers.
**Scope:** Before building the Share URL, if the encoded fragment exceeds ~64 KB, warn and suggest **Save session** instead (still allow proceeding).
**Files:** `json_compare.html` + `src/url-state.js` (mirror), regenerate `index.html`, extend `tests/url-state.test.js`.
**DIFF-CORE:** No.
**Done when:** Over-threshold encode shows a clear warning with the Save-session alternative; under-threshold unchanged; unit test covers the threshold boundary; tests/lint/check green; `index.html` regenerated.
**Effort:** ~0.25 day · **Model:** Sonnet 4.6.

> **Execution prompt — E-4**
> ```
> Act as a senior engineer on the JSON Comparator. Read COMPETITIVE_ROADMAP.md (Guardrails + task E-4).
> Execute ONE task: E-4 — Share-URL length guard (warn + suggest Save session above ~64 KB encoded fragment,
> still allow proceed). Mirror logic into src/url-state.js. No DIFF-CORE changes, no new network calls. After:
> tests/lint/check, extend tests/url-state.test.js for the boundary, regenerate index.html, update
> CHANGELOG/README, flip E-4 status.
> ```

---

### E-5 · Configurable highlight cutoff
**Why:** Highlighting + line numbers silently turn off above 80 k chars — exactly when big files appear (analysis weakness #3).
**Scope:** Make the 80 k cutoff a named constant + an Options toggle ("Force syntax highlighting on large inputs") with a perf caveat in the tooltip. Default unchanged (off >80 k) to protect performance.
**Files:** `json_compare.html`, regenerate `index.html`, extend `tests/highlight.test.js`.
**DIFF-CORE:** No.
**Done when:** Toggle present; when on, highlight + gutter render above 80 k (documented perf trade-off); when off, current behavior; test covers the gating logic; tests/lint/check green; `index.html` regenerated.
**Effort:** ~0.25 day · **Model:** Sonnet 4.6.

> **Execution prompt — E-5**
> ```
> Act as a senior engineer on the JSON Comparator. Read COMPETITIVE_ROADMAP.md (Guardrails + task E-5).
> Execute ONE task: E-5 — Configurable highlight cutoff. Turn the 80k char cutoff into a named constant and add
> an Options toggle to force highlighting on large inputs (default keeps current behavior). No DIFF-CORE changes.
> After: tests/lint/check, extend tests/highlight.test.js, regenerate index.html, update CHANGELOG/README,
> flip E-5 status.
> ```

---

# Phase F — High-impact features

### F-1 · JSON Schema validation
**Why:** Biggest single feature gap vs the market (analysis Top-10 #1); gateway to schema-aware diff (G-3).
**Scope:** A "Validate against schema" mode. User pastes/uploads a JSON Schema (draft-07 subset is acceptable for v1; document which keywords are supported). Each pane is validated; violations are listed with **path + message** and a **Jump-to** (reuse the parse-error jump). **Must be a hand-rolled validator or a vendored single-file validator** — no runtime npm dependency in `json_compare.html`, and **no network fetch of remote `$ref`s in the offline file** (remote-`$ref` fetch, if added at all, is `index.html`-only and opt-in). State the supported keyword set in Help + README.
**Files:** new `src/schema-validate.js` + inline copy in `json_compare.html`, regenerate `index.html`, new `tests/schema-validate.test.js`, Help/About + README updates.
**DIFF-CORE:** No (validation is a separate module).
**Done when:**
- A schema input exists; validating a pane lists violations with path + human message; valid → clear "valid" state.
- Jump-to navigates to the offending location in the pane.
- Supported keyword set documented (e.g. type, required, properties, items, enum, min/max, pattern, additionalProperties); unsupported keywords are ignored with a noted limitation, not a crash.
- `json_compare.html` makes zero network requests (verified). Unit tests cover valid + each supported-keyword violation. Tests/lint/check green; `index.html` regenerated.
**Effort:** 2–4 days · **Model:** Opus 4.8 / high effort (validator correctness matters).

> **Execution prompt — F-1**
> ```
> Act as a senior engineer on the JSON Comparator. Read COMPETITIVE_ROADMAP.md (Guardrails + task F-1) and
> COMPETITIVE_ANALYSIS.md. Execute ONE task: F-1 — JSON Schema validation. Add a "validate against schema"
> mode: user supplies a JSON Schema (draft-07 subset OK for v1 — document supported keywords), each pane is
> validated, violations listed with path + message + Jump-to (reuse the parse-error jump). Implement as a
> hand-rolled / vendored single-file validator with ZERO runtime npm deps and ZERO network calls in
> json_compare.html (any remote-$ref fetch is index.html-only and opt-in). Put core logic in
> src/schema-validate.js with an inline copy. No DIFF-CORE changes. After: unit tests for valid + each
> supported keyword, npm test + lint + node --check, regenerate index.html, update Help/About + CHANGELOG +
> README (state the supported keyword set), flip F-1 status.
> ```

---

### F-2 · JSONPath query bar
**Why:** Closes the query gap that makes JSON Editor Online feel like a superset (analysis Top-10 #2). Lets users interrogate *documents*, not just filter *changes*.
**Scope:** A query input (per pane, and optionally over the diff result set) accepting **JSONPath** (`$.store.book[*].price`). Show matched values/count; clicking a match jumps to it in the tree. Hand-rolled or vendored single-file JSONPath evaluator — **zero runtime npm deps, zero network**. (JMESPath/jq are explicitly out of scope for v1; note as follow-up.)
**Files:** new `src/jsonpath.js` + inline copy, regenerate `index.html`, new `tests/jsonpath.test.js`, Help + README.
**DIFF-CORE:** No.
**Done when:**
- A JSONPath query over a pane returns matches (values + count); invalid query → friendly error, no crash.
- Clicking/Enter on a match navigates to that node in the tree view.
- Supported JSONPath subset documented (root, child, recursive descent `..`, wildcard `*`, index, slice, filter `?()` optional/noted). Unit tests cover each supported operator. Tests/lint/check green; `index.html` regenerated; offline file makes zero requests.
**Effort:** 2–3 days · **Model:** Opus 4.8 / high effort.

> **Execution prompt — F-2**
> ```
> Act as a senior engineer on the JSON Comparator. Read COMPETITIVE_ROADMAP.md (Guardrails + task F-2).
> Execute ONE task: F-2 — JSONPath query bar. Add a per-pane JSONPath query input that returns matches
> (values + count) and navigates the tree to a clicked match. Hand-rolled/vendored single-file evaluator,
> ZERO runtime npm deps, ZERO network. Document the supported JSONPath subset; JMESPath/jq out of scope
> (note as follow-up). Core in src/jsonpath.js + inline copy. No DIFF-CORE changes. After: unit tests per
> operator, npm test + lint + node --check, regenerate index.html, update Help + CHANGELOG + README,
> flip F-2 status.
> ```

---

### F-3 · 3-Way: resolve conflicts + export merged result
**Why:** 3-Way is currently half a feature — it classifies but can't merge or export (analysis weakness #6; `ENHANCEMENT_PLAN.md` D-8 said "decide; don't leave as-is").
**Scope:** In 3-Way view, for each non-conflicting change auto-apply; for each conflict, let the user **pick left / right / base** per node; then **Export merged JSON** (download + copy). Decision rule for non-conflicts and the conflict-resolution model documented in Help.
**Files:** `json_compare.html` + `src/three-way.js` (if resolution logic belongs in the core), regenerate `index.html`, extend `tests/three-way.test.js`.
**DIFF-CORE:** No* (uses three-way module, not the byte-identical DIFF-CORE block — but keep `src/three-way.js` and its inline copy in sync and parity-tested if such a test exists).
**Done when:**
- Each conflict offers left/right/base selection; non-conflicts auto-merge per documented rule.
- "Export merged" produces valid JSON reflecting all resolutions (download + copy).
- Unit test merges a fixture with 1 left-only, 1 right-only, 1 conflict and asserts the resolved output for each choice. Tests/lint/check green; `index.html` regenerated. (If full merge is deferred, instead **demote the 3-Way tab** per D-8 and note why.)
**Effort:** 2–3 days · **Model:** Opus 4.8 / high effort.

> **Execution prompt — F-3**
> ```
> Act as a senior engineer on the JSON Comparator. Read COMPETITIVE_ROADMAP.md (Guardrails + task F-3) and
> ENHANCEMENT_PLAN.md D-8. Execute ONE task: F-3 — make 3-Way real: per-conflict left/right/base resolution +
> "Export merged JSON" (download + copy); auto-apply non-conflicts per a documented rule. Keep src/three-way.js
> and its inline copy in sync. No changes to the byte-identical DIFF-CORE block. After: unit test over a
> 1-left/1-right/1-conflict fixture asserting resolved output per choice, npm test + lint + node --check,
> regenerate index.html, update Help + CHANGELOG + README, flip F-3 status. If you judge full merge too large,
> instead demote the 3-Way tab per D-8 and document the rationale.
> ```

---

### F-4 · Ignore-paths globs
**Why:** Unlocks the regression/contract-testing use case (analysis Opportunity #3; `ENHANCEMENT_PLAN.md` P2-11). `ignoreKeys` only matches key names globally; power users want `$.meta.*.updatedAt`-style path patterns.
**Scope:** An "Ignore paths" Options input accepting one-or-more glob/path patterns; matching paths are excluded from the diff. **This touches DIFF-CORE** and must be mirrored across all three copies + the Python CLI, with parity preserved.
**Files:** **DIFF-CORE inline block in `json_compare.html`**, **`src/diff-core.js`**, **`json_compare.py`** (`--ignore-path`), regenerate `index.html`, extend `tests/diff-core.test.js` + `tests/options.test.js` + a Python test, keep `tests/diff-core-parity.test.js` green.
**DIFF-CORE:** **YES — mirror all three copies.**
**Done when:**
- A path pattern (e.g. `$.meta.*.updatedAt`, `$.items[*].ts`) excludes matching leaves from the diff in web + CLI identically.
- `tests/diff-core-parity.test.js` stays green (the three copies agree); JS + Python tests cover include/exclude cases.
- Glob semantics documented in Help + README + CLI `--help`. Tests/lint/check + pytest green; `index.html` regenerated.
**Effort:** 2–3 days · **Model:** Opus 4.8 / high effort (cross-copy parity is error-prone).

> **Execution prompt — F-4**
> ```
> Act as a senior engineer on the JSON Comparator. Read COMPETITIVE_ROADMAP.md (Guardrails + task F-4) and
> ENHANCEMENT_PLAN.md P2-11. Execute ONE task: F-4 — ignore-paths globs. Add an "Ignore paths" option accepting
> path/glob patterns (e.g. $.meta.*.updatedAt, $.items[*].ts) that exclude matching leaves from the diff.
> This TOUCHES DIFF-CORE: mirror the change identically across the inline block in json_compare.html,
> src/diff-core.js, and json_compare.py (add --ignore-path). Keep tests/diff-core-parity.test.js green. After:
> JS + Python tests for include/exclude, npm test + lint + node --check + pytest, regenerate index.html,
> document glob semantics in Help + README + CLI --help, update CHANGELOG, flip F-4 status.
> ```

---

# Phase G — Platform / distribution

### G-1 · Publish the diff engine as an npm package
**Why:** The diff core is the crown jewel, trapped in an HTML file (analysis Top-10 #10, Opportunity #4).
**Scope:** Package `src/diff-core.js` (+ `lenient-parsers.js`, `json-patch.js` as needed) as a published, dependency-free npm module with a documented JS API (`diff(a, b, opts)` → `Change[]`, `changesToPatch`). Add a `bin` CLI mirroring the Python one's flags. **Do not change the web app's single-file model** — this is additive packaging that consumes the *same* `src/` modules the inline copy is generated from.
**Files:** `package.json` (`name`, `version`, `exports`, `bin`, `files`), `src/index.js` (public API surface), `README` usage section, optional `tests/api.test.js`.
**DIFF-CORE:** **YES (read-only)** — must export the *exact same* logic; do not fork it. Parity test still governs.
**Done when:**
- `import { diff, changesToPatch } from '<pkg>'` works and returns the same `Change[]` the web app produces for shared fixtures.
- A CLI bin reproduces the Python CLI's `--unordered` / `--array-key` / `--json` behavior on the same fixtures.
- `npm pack` produces a dependency-free tarball; the web app still loads from `file://` unchanged. Tests/lint green.
**Effort:** 1–2 days · **Model:** Sonnet 4.6 (mechanical), Opus if API design needs judgment.

> **Execution prompt — G-1**
> ```
> Act as a senior engineer on the JSON Comparator. Read COMPETITIVE_ROADMAP.md (Guardrails + task G-1).
> Execute ONE task: G-1 — publish the diff engine as a dependency-free npm package. Expose src/diff-core.js
> (+ lenient-parsers, json-patch as needed) via src/index.js with a documented API (diff(a,b,opts)->Change[],
> changesToPatch) and a bin CLI mirroring json_compare.py flags. Additive only — DO NOT fork DIFF-CORE or
> change the web app's single-file file:// model. Keep diff-core-parity green. After: an api test asserting the
> package returns identical Change[] to the web app on shared fixtures, npm pack proves zero runtime deps,
> npm test + lint green, README usage section + CHANGELOG, flip G-1 status.
> ```

---

### G-2 · GitHub Action: JSON diff on PRs
**Why:** Lands the engine in CI ("fail the build / comment the diff on JSON drift") — the developer-workflow wedge.
**Scope:** A composite/JS GitHub Action wrapping G-1's CLI: given two paths (or a base/head pair), it posts a **Markdown diff** as a PR comment and optionally fails on unexpected changes. Reuse the existing Markdown serializer.
**Files:** `action.yml` + `.github/actions/json-diff/`, example workflow in README, `.github/workflows/` example.
**DIFF-CORE:** No (consumes G-1). **Depends on:** G-1.
**Done when:** Action diffs two JSON files, comments a Markdown diff on the PR, and exits non-zero on drift when configured; documented with a copy-paste workflow snippet; dry-run/local test passes.
**Effort:** 1–2 days · **Model:** Sonnet 4.6.

> **Execution prompt — G-2**
> ```
> Act as a senior engineer on the JSON Comparator. Read COMPETITIVE_ROADMAP.md (Guardrails + task G-2).
> Execute ONE task: G-2 — a GitHub Action wrapping the G-1 CLI that posts a Markdown JSON diff as a PR comment
> and can fail on drift. Reuse the existing Markdown serializer. Provide action.yml, the action implementation,
> and a copy-paste example workflow in README. Depends on G-1. After: a local/dry-run test of the diff+comment
> path, update CHANGELOG/README, flip G-2 status.
> ```

---

### G-3 · Schema-aware diff (differentiator)
**Why:** A genuine market first (analysis Opportunity #2): diff two documents *through* a schema — ignore fields the schema marks volatile, flag type drift against declared types.
**Scope:** With a schema loaded (F-1), the diff can (a) suppress changes on schema-flagged volatile paths, and (b) annotate changes that violate the declared type. Opt-in mode. **Touches DIFF-CORE** (the diff must consult schema metadata) → mirror across copies + parity.
**Files:** DIFF-CORE inline + `src/diff-core.js` + `json_compare.py`, `src/schema-validate.js`, regenerate `index.html`, tests + parity.
**DIFF-CORE:** **YES.** **Depends on:** F-1 (schema parsing) and F-4 (path-matching machinery to reuse).
**Done when:** With a schema + schema-aware mode on, volatile paths are excluded and type-drift changes are annotated, identically in web + CLI; parity green; tests cover suppress + annotate; documented.
**Effort:** 3–5 days · **Model:** Opus 4.8 / high effort.

> **Execution prompt — G-3**
> ```
> Act as a senior engineer on the JSON Comparator. Read COMPETITIVE_ROADMAP.md (Guardrails + task G-3) and
> confirm F-1 and F-4 are done. Execute ONE task: G-3 — schema-aware diff: with a schema loaded, optionally
> suppress changes on schema-flagged volatile paths and annotate changes that violate declared types. TOUCHES
> DIFF-CORE: mirror identically across the inline block, src/diff-core.js, and json_compare.py; keep
> diff-core-parity green. Reuse F-1 schema parsing and F-4 path matching. After: tests for suppress + annotate
> in JS + Python, npm test + lint + node --check + pytest, regenerate index.html, update Help + CHANGELOG +
> README, flip G-3 status.
> ```

---

## Suggested phasing

| Phase | Scope | Effort | Risk |
|---|---|---|---|
| **E** | E-1 … E-5 (find, sort/minify, indent, URL guard, highlight cutoff) | ~2–3 days total | Low (UI-only) |
| **F** | F-1 (schema), F-2 (JSONPath), F-3 (real 3-way), F-4 (ignore-paths) | ~8–13 days | Med–High (F-4 touches DIFF-CORE) |
| **G** | G-1 (npm), G-2 (Action), G-3 (schema-aware diff) | ~5–9 days | High for G-3 (DIFF-CORE + depends on F-1/F-4) |

**Recommended order:** E-1 → E-2 → E-3 → E-4 → E-5 (ship Phase E as one release), then F-1 → F-2 → F-3 → F-4, then G-1 → G-2, and G-3 last (it depends on F-1 + F-4).

## Verification checklist (run for every task)
- [ ] `npm test` green — incl. `diff-core-parity`, `index-parity`, `parity`.
- [ ] `npm run lint` clean.
- [ ] `node --check` on the extracted script clean.
- [ ] `pytest` green if Python touched.
- [ ] `index.html` regenerated from `json_compare.html` + FEEDBACK delta; parity test green.
- [ ] `file://` load of `json_compare.html` makes **zero** network requests (DevTools Network).
- [ ] Manual: light + dark, 1440 / 820 / 390 px.
- [ ] `CHANGELOG.md` + `README.md` updated; task Status flipped in the tracker table.
