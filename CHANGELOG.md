# Changelog

All notable changes to JSON Comparator are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [3.8] — 2026-06-11

Phase G-3 — Schema-aware diff. **DIFF-CORE change** (mirrored across JS module, HTML inline copy, and Python CLI). 693 JS tests green; Python logic verified on all 16 parity fixtures.

### Added

- **`_collectVolatilePaths(schema, path, out)`** — new DIFF-CORE helper that walks a JSON Schema and collects JSONPath-like patterns for every property node carrying `"x-volatile": true`. Recurses into `properties` (object keys) and single-schema `items` (array elements). Example: `{ properties: { ts: { "x-volatile": true } } }` → `["$.ts"]`.

- **`_schemaAtPath(schema, tokens)`** — new DIFF-CORE helper that navigates a JSON Schema tree by following a tokenized path (from `_tokenizePath`). Supports root `$`, object `properties`, and array `items` (single schema). Returns `null` for unresolvable paths.

- **`_schemaTypeViolation(value, schemaNode)`** — new DIFF-CORE helper that checks whether `value` satisfies the `type` declared in `schemaNode`. Handles type arrays (`["string","null"]`) and the `"integer"` refinement. Returns `{ expected, got }` on violation, `null` otherwise.

- **`diffCore()` extended** — new `opts.schema?: object` option. When supplied: (a) `_collectVolatilePaths` is called and the resulting patterns are merged with `opts.ignorePaths` before filtering (volatile paths are silently suppressed from the diff); (b) each non-removed, non-equal change is checked for a type violation via `_schemaAtPath` + `_schemaTypeViolation`; violating changes gain `schemaViolation: { expected, got }`. The `Change` type comment is updated accordingly. The no-schema code path is unchanged (backward compatible). Byte-identical copies updated in `src/diff-core.js` and `json_compare.html`; `tests/diff-core-parity.test.js` stays green.

- **Web UI — "Schema-aware diff" toggle** — a new checkbox in the Options panel. When checked, `getOpts()` parses the schema from the Schema panel input and passes it as `opts.schema` to `diffCore`. Changes from volatile paths disappear from all views; type-violating changes display an orange `⚠ type` badge (new `.badge.schema-violation` CSS class) in both Table and Tree views. Toggle state is persisted in localStorage. Visible even without a schema loaded (silently no-ops if the schema panel is empty or invalid).

- **`json_compare.py` — `--schema` and `--schema-aware` flags** — `--schema SCHEMA_FILE` loads a JSON Schema file; `--schema-aware` activates both volatile suppression (via `_collect_volatile_paths`) and type annotation (via `_apply_schema_aware`). Without `--schema-aware`, the schema has no effect. Three new Python helpers mirror the DIFF-CORE helpers: `_collect_volatile_paths`, `_schema_at_path`, `_schema_type_violation`; plus `_apply_schema_aware` (post-pass annotator) and `_type_name_py` (Python value → JSON Schema type name).

- **`tests/schema-aware.test.js`** — 33 new JS tests covering: `_collectVolatilePaths` (single/multi volatile, nested objects, array items, root guard, non-dict schema), `_schemaAtPath` (root, top-level, nested, array wildcard, index, unknown, scalar path-through), `_schemaTypeViolation` (matching types, mismatch, type arrays, null, no schema node), `diffCore` with `opts.schema` (suppress volatile, non-volatile unchanged, type violation on change/add/remove, conforming change not annotated, nested property, array items), combined `ignorePaths` + schema volatile, no-schema backward compat.

- **`tests/test_schema_aware.py`** — 33 new Python tests mirroring the JS suite plus 3 CLI integration tests (`--schema-aware` suppresses volatile, `--schema` alone does not suppress, `--schema-aware` annotates type violations in `--json` output).

- **README** — new "Schema-aware diff (G-3)" section documenting the `x-volatile` convention, type-drift annotation, web UI toggle, JS API usage example, and Python CLI flags.

### Changed

- **DIFF-CORE** — three new helpers + extended `diffCore()` function. Byte-identical copies updated in `src/diff-core.js` and `json_compare.html`; parity test green.
- **`src/diff-core.js` exports** — `_collectVolatilePaths`, `_schemaAtPath`, `_schemaTypeViolation` added to the named exports.
- **`src/index.js`** — re-exports the three new DIFF-CORE helpers.
- **`json_compare.html`** — DIFF-CORE block, Options panel, `getOpts()`, `render()`, tree node builder, `renderTable`, `renderTreeNode`, `savePrefs`/`initPrefs`, and Help modal updated.
- **`index.html`** — regenerated from `json_compare.html` + FEEDBACK delta; `tests/index-parity.test.js` green.

---

## [3.7] — 2026-06-11

Phase G-2 — GitHub Action: JSON diff on PRs. **DIFF-CORE: No.** 660 tests green.

### Added

- **`.github/actions/json-diff/`** — a composite GitHub Action that diffs two JSON files and optionally posts the result as a Markdown PR comment. Inputs: `source-file` (required), `target-file` (required), `fail-on-diff` (default `false`), `comment-on-pr` (default `true`), `github-token` (defaults to `github.token`), `title`, `source-label`, `target-label`, `unordered`, `array-key`. Outputs: `diff-found` (string boolean), `diff-count` (string integer). Exit codes: `0` = equal or `fail-on-diff=false`, `1` = differences + `fail-on-diff=true`, `2` = usage/I/O error. PR comment posting is silently skipped in non-PR contexts (push, cron, etc.) and when `github-token` is empty.

- **`src/markdown-reporter.js`** — extracted from the `buildMarkdown` / `sideVal` / `cellStr` helpers in `json_compare.html` into a standalone, DOM-free ES module. `diffToMarkdown(changes, opts?)` renders a `Change[]` as a GFM Markdown table with a summary line, optional custom title/column labels, and configurable row truncation (`maxRows`, default 200). Pipe characters and newlines in values are escaped for safe GFM table rendering.

- **`.github/actions/json-diff/index.js`** — action implementation. Uses `src/index.js` (diff engine) and `src/markdown-reporter.js` (renderer) via relative ES module imports — zero additional dependencies. Exports `parseInputs`, `readGitHubContext`, `runAction`, `postComment`, `setOutput` for test-ability; the entry-point guard (`process.argv[1]` check) prevents auto-execution on import. PR comments are posted via the built-in `node:https` module against the GitHub REST API.

- **`.github/workflows/json-diff-example.yml`** — copy-paste example workflow demonstrating two patterns: (a) diffing two repo-resident files on every JSON-touching PR, (b) fetching the base-branch version of a file and diffing it against the PR head.

- **`tests/github-action.test.js`** — 30 new tests covering: `diffToMarkdown` (equal docs, added/removed/changed/type_changed rows, custom labels, pipe escaping, maxRows truncation, summary counts, fixture round-trip), `parseInputs` (all inputs + defaults + edge cases), `readGitHubContext` (no event path, mock event file), `runAction` dry-run (crud diffs, equal docs, `comment-on-pr=false`, no-PR context, missing token, `--unordered` passthrough, missing files, invalid JSON), `setOutput` file write.

### Changed

- **`src/index.js`** — `package.json` `"files"` list updated to include `src/markdown-reporter.js` so it ships in the npm tarball.

---

## [3.6] — 2026-06-11

Phase G-1 — Publish diff engine as npm package. **DIFF-CORE: read-only** (exported as-is; no logic changes). 630 tests green.

### Added

- **`src/index.js`** — public API surface for the `json-comparator` npm package. Re-exports `diff` (from `src/diff-core.js`) and `changesToPatch` / `segsToPointer` / `applyPatch` (from `src/json-patch.js`), plus all utility helpers (`typeName`, `isScalar`, `segLabel`, `segKey`, `segId`, `segsStartWith`, `entriesUnderSegs`, `MAX_DIFF_DEPTH`, `DiffDepthError`, `detectPrecisionLoss`, `_tokenizePath`, `_pathMatchesPattern`). No new logic — the diff engine is exposed as-is.

- **`bin/json-diff.js`** — a Node.js CLI entry point that mirrors all `json_compare.py` flags: positional `source target`, `--unordered`, `--array-key KEY`, `--json`, `--ignore-path PATTERN` (repeatable), `-h` / `--help`. Exit codes match the Python CLI: `0` = equal, `1` = differences found, `2` = usage/I/O error. `--json` output uses the same `{type, path, from?, to?}` schema as the Python CLI so the two are interchangeable in scripts.

- **`package.json` updated** — `"private": true` removed (package is now publishable). Added `"exports": { ".": "./src/index.js" }`, `"main": "./src/index.js"`, `"bin": { "json-diff": "./bin/json-diff.js" }`, `"files"` whitelist (`src/diff-core.js`, `src/json-patch.js`, `src/index.js`, `bin/json-diff.js`, `README.md`, `CHANGELOG.md`), `"engines": { "node": ">=18" }`, and package metadata (`keywords`, `license`). All existing `devDependencies` and test scripts are preserved. `npm pack --dry-run` confirms a dependency-free tarball of 8 files / ~85 KB unpacked.

- **`tests/api.test.js`** — 27 new tests covering: re-export identity (`diff` / `changesToPatch` via `src/index.js` produces identical results to direct module imports on 5 shared fixtures, plus `unordered`, `keyBy`, and `ignorePaths` option variants), `changesToPatch` round-trip (crud + nested fixtures patched to equality), utility re-export sanity checks (`typeName`, `isScalar`, `segsToPointer`, `segId`, `MAX_DIFF_DEPTH`, `DiffDepthError`, `detectPrecisionLoss`, `_tokenizePath`, `_pathMatchesPattern`), and package structure guards (bin/src files exist, no runtime `dependencies`, correct `exports` and `bin` entries, no `private` flag).

- **README** — new "Node.js / npm API" section documenting installation, the `diff()` API with a code example, all option fields, the `Change` shape, the full export list, and the `json-diff` CLI with flag examples.

### Changed

- `package.json` — see above. The web app's single-file `file://` model is completely unchanged; the npm packaging is purely additive.

---

## [3.5] — 2026-06-11

Phase F-4 — Ignore-paths globs. **DIFF-CORE change** (mirrored across JS module, HTML inline copy, and Python CLI). 603 tests green.

### Added

- **Ignore paths (F-4)** — a new "Ignore paths" field in the Options panel (textarea, one JSONPath-like pattern per line). Paths matching a pattern are excluded from the diff entirely. Patterns support `*` / `[*]` as a single-segment wildcard: `$.meta.*.updatedAt` suppresses any `updatedAt` directly nested one level under `.meta`; `$.items[*].ts` suppresses the `ts` key on every array element. Pattern length must equal the path depth (`**` / recursive wildcards are not supported in v1 — noted as follow-up).

- **`_tokenizePath(p)` / `_pathMatchesPattern(path, pattern)`** — two new pure helpers added to the DIFF-CORE block (mirrored byte-for-byte in `src/diff-core.js`, `json_compare.html`, exported from the JS module). `_tokenizePath` splits a display-format path string into an array of tokens (`"$.a[0].b"` → `["$","a","0","b"]`; `[*]` and `.*` both normalise to `"*"`). `_pathMatchesPattern` matches token-for-token with `*` as a wildcard.

- **`--ignore-path PATTERN`** CLI flag for `json_compare.py` — repeatable; may be specified multiple times, one pattern per invocation. Applies the same matching logic as the web UI. Example: `python3 json_compare.py src.json tgt.json --ignore-path '$.meta.*.updatedAt' --ignore-path '$.items[*].ts'`.

- **`opts.ignorePaths`** accepted by `diffCore()` / `diff()` as a `string[]`. Filtering is applied as a post-pass on the `Change[]` output so that no internal diff logic had to change.

- **25 new JS tests** in `tests/ignore-paths.test.js` — cover tokenizer, pattern matcher (exact match, mismatches, length mismatches, key wildcard, index wildcard, cross-boundary non-match), and `diffCore` with `ignorePaths` (suppress exact path, wildcard key, wildcard index, added/removed leaf suppression, multiple patterns, combined with `ignoreKeys`).

- **23 new Python tests** in `tests/test_ignore_paths.py` — mirror the JS test coverage plus two CLI integration tests (`--ignore-path` on a temp file).

- **Help modal** — new "Ignore paths (F-4)" bullet under the Options section documenting pattern syntax, the `[*]`/`.*` wildcards, the length-match constraint, and the CLI flag.

### Changed

- **DIFF-CORE** — new `_tokenizePath` and `_pathMatchesPattern` functions added between the last helper and `diffCore()`. `diffCore()` signature extended: `opts.ignorePaths?: string[]`; comment updated. Byte-identical copies updated in `src/diff-core.js` and `json_compare.html`; `tests/diff-core-parity.test.js` stays green.

---

## [3.4] — 2026-06-11

Phase F-3 — 3-Way merge resolution + Export merged JSON. No DIFF-CORE changes. 578 tests green.

### Added

- **3-Way conflict resolution (F-3)** — the 3-Way view is now a fully functional merge editor. Each **⚡ Conflict** row shows **L / B / R** toggle buttons (Left / Base / Right); click to choose which value wins. Non-conflicting changes auto-merge silently: `left-only → L`, `right-only → R`, `both-same → L` (auto-merge rule documented in Help).

- **Export merged JSON** — an "Export merged" action bar appears above the 3-Way table with two buttons:
  - **⬇ Download** — saves `merged.json` using the current indent setting.
  - **⎘ Copy** — copies the merged JSON to the clipboard.
  Resolution choices persist within the session; switching inputs does not reset them.

- **`resolveMerge(base, changes, resolutions)`** in `src/three-way.js` — new exported function that applies conflict resolutions (a `Map<segId, "left"|"right"|"base">`) plus the auto-merge rule to produce a merged value. An identical inline copy lives in `json_compare.html` (between the `T24 / F-3` comment block). No byte-identical DIFF-CORE block changes.

- **Help section "3-Way Merge (F-3)"** — documents the auto-merge rule, conflict resolution, export buttons, and the array-deletion limitation.

- **13 new tests in `tests/three-way.test.js`** — cover the canonical 1-left/1-right/1-conflict fixture (all three resolution choices), both-same auto-merge, identical-input clone, key addition/removal, nested conflict, base-immutability guard.

---

## [3.3] — 2026-06-11

Phase F-2 — JSONPath query bar. No DIFF-CORE changes. 566 tests green.

### Added

- **JSONPath query bar (F-2)** — click **Query** in any pane header (Source, Target, or Base) to open a collapsible per-pane query bar. Type a JSONPath expression (e.g. `$.store.book[*].price`) and press **Enter** or **Run**. Matches are listed with their path and a value preview; click any match to jump directly to that location in the pane's JSON text (reuses the F-1 `jsonPointerToOffset` → `jumpToError` navigation infrastructure). Press **✕** or **Escape** to close.

- **`src/jsonpath.js`** — new hand-rolled, dependency-free JSONPath evaluator. An identical copy is inlined in `json_compare.html` between `/* JSONPATH:START */` and `/* JSONPATH:END */` markers; `tests/jsonpath.test.js` asserts byte-for-byte parity.

- **Supported JSONPath subset (v1)**:
  - `$` — root
  - `.key` / `['key']` / `["key"]` — child access (dot and bracket notation)
  - `[n]` — array index (negative counts from end: `[-1]` = last element)
  - `[n:m]` / `[n:m:s]` — Python-style slice (omit start/end/step freely)
  - `.*` / `[*]` — wildcard (all children of an object or array)
  - `..key` / `..*` — recursive descent (searches the whole subtree)
  - `[?(@.key)]` — filter: existence test
  - `[?(@.key OP val)]` — filter: comparison (`==` `!=` `<` `>` `<=` `>=`); `val` can be a number, `'string'`, `"string"`, `true`, `false`, or `null`
  - `['a','b']` — union of named keys

- **Not supported (follow-up)**: JMESPath / jq, script expressions `$(…)`, nested boolean filter expressions, `@` as standalone root in filters. Results are capped at 500 entries; a footer note shows the overflow count.

- **`tests/jsonpath.test.js`** — 64 new unit tests covering: root, child, index, slice (including reverse-step and empty-range), wildcard, recursive descent, all six filter operators, union, existence filter, error cases (bad expression, unmatched bracket, non-string input), edge cases (null doc, scalar child, 100-level nesting), complex chained expressions, and the parity guard.

---

## [3.2] — 2026-06-11

Phase F-1 — JSON Schema validation. No DIFF-CORE changes. 502 tests green.

### Added

- **JSON Schema validation (F-1)** — press **Schema** in the toolbar to open a collapsible validation panel. Paste or upload a JSON Schema (draft-07 subset), then press **Validate both**, **Source only**, or **Target only**. Each violation is displayed with its **JSON Pointer path** (e.g. `/user/age`) and a human-readable message. Click **Jump** to scroll the relevant pane to the offending location (uses a token-level text walker to find the exact char offset). A **"✓ Valid"** indicator appears when the document satisfies the schema.

- **`src/schema-validate.js`** — new hand-rolled, dependency-free JSON Schema validator. An identical copy is inlined in `json_compare.html` between `/* SCHEMA-VALIDATE:START */` and `/* SCHEMA-VALIDATE:END */` markers; `tests/schema-validate.test.js` asserts byte-for-byte parity between the two copies.

- **Supported keywords**: `type`, `required`, `properties`, `additionalProperties`, `minProperties`/`maxProperties`, `items` (single schema or tuple array), `additionalItems`, `minItems`/`maxItems`, `uniqueItems`, `minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum` (draft-07 number form and draft-04 boolean form), `multipleOf`, `minLength`/`maxLength`, `pattern`, `enum`, `const`, `allOf`/`anyOf`/`oneOf`/`not`, `if`/`then`/`else`, internal `$ref` (`#/definitions/…` and `#/$defs/…`).

- **Not supported** (silently ignored, no crash): `format`, `patternProperties`, `unevaluatedProperties`, `dependentRequired`/`dependentSchemas`, remote `$ref` URLs. The offline `json_compare.html` continues to make zero network requests — remote `$ref`s are skipped without error.

- **`tests/schema-validate.test.js`** — 104 new unit tests covering every supported keyword (pass and fail cases), deep path encoding (JSON Pointer escaping), the depth guard against circular `$ref` chains, unsupported-keyword no-crash behaviour, and a complex multi-violation document.

---

## [3.1] — 2026-06-11

Phase E-5 — Configurable highlight cutoff. No DIFF-CORE changes. 398 tests green.

### Added

- **Force highlight on large inputs (E-5)** — the Options panel now includes a **"Force highlight on large inputs (⚠ perf)"** checkbox. When checked, syntax highlighting and line-number gutters are rendered even for inputs larger than 80 000 characters (the `MAX_HIGHLIGHT` constant), overriding the previous hard cutoff. The default is **off** (existing behavior unchanged). The setting is persisted across reloads via `localStorage` (key `forceHighlight`). A tooltip on the label documents the performance trade-off.
- **5 new tests in `tests/highlight.test.js`** — cover the gating logic (`shouldHighlight`) for: under cutoff, exactly at boundary, over cutoff with force off, over cutoff with force on, and very large input with force on.

---

## [3.0] — 2026-06-11

Phase E-4 — Share-URL length guard. No DIFF-CORE changes. 393 tests green.

### Added

- **Share-URL size guard (E-4)** — the Share URL flow now encodes the state *before* prompting, so it knows the compressed fragment size. If the encoded fragment exceeds **64 KB** (65 536 chars), the privacy confirm dialog includes an extra warning — `"⚠ This URL is large (~N KB encoded). Many chat apps and browsers silently truncate URLs above 64 KB…"` — and suggests **Save session** as the reliable alternative. The user can still proceed. Under the threshold (the vast majority of real-world comparisons) the dialog is unchanged.
- **`SHARE_URL_WARN_BYTES` constant and `exceedsShareURLLimit()` helper** exported from `src/url-state.js` — the threshold lives in exactly one place and the helper is independently unit-testable.
- **6 new tests in `tests/url-state.test.js`** — assert constant value, boundary semantics (at-threshold → false, one-over → true, empty → false), a real small encode is under limit, and consistency of `exceedsShareURLLimit` with raw `.length` comparison.

---

## [2.9] — 2026-06-11

Phase E-3 — Indent choice on Format. No DIFF-CORE changes. 387 tests green.

### Added

- **Format indent selector (E-3)** — the Options panel now includes a **Format indent** dropdown (2 spaces / 3 spaces / 4 spaces / Tab). The chosen indent is applied by both the **Format** and **Sort** pane buttons; **Minify** is unaffected (always produces single-line JSON). Default is 2 spaces. The selection is persisted across reloads via `localStorage` alongside the other prefs.
- **15 new tests in `tests/persistence.test.js`** — cover round-trip serialisation for all four valid indent values, rejection of invalid values, the `getIndent()` helper (space-count + tab), and `JSON.stringify` output for each indent choice.

---

## [2.8] — 2026-06-11

Phase E-2 — Sort-keys + restore Minify. No DIFF-CORE changes. 373 tests green.

### Added

- **Sort keys (E-2)** — each input pane (Source, Target, Base) now has a **Sort** button. Pressing it recursively alphabetises all object keys in the pane; arrays are left untouched (element order is semantically significant). Formatting is preserved at 2 spaces (the indent selector coming in E-3 will respect this). Invalid JSON triggers the existing auto-repair offer.
- **Minify restored (E-2)** — the **Minify** button reappears in every pane's tool row (it was wired but unreachable since D-11). Pressing it collapses the pane to a single-line JSON string; invalid input triggers the auto-repair offer.
- **`tests/format-tools.test.js`** — 20 new unit tests for `sortKeys` covering flat objects, nested objects, array-order preservation, primitive pass-through, and JSON round-trip determinism.

---

## [2.7] — 2026-06-11

Phase E-1 — Find-in-document search. No DIFF-CORE changes. 353 tests green.

### Added

- **Find-in-document (E-1)** — press `Ctrl/Cmd+F` to open an in-app find bar (browser's native find is suppressed). The bar searches the **active surface**: the focused input pane (Source, Target, or Base) or the diff results (Tree / Table). Features:
  - Typing highlights all matches with a `n / total` counter; no matches → red input border and "No results".
  - **Enter** / **▼** advances to the next match; **Shift+Enter** / **▲** goes back. Both wrap around.
  - Matches in input panes are highlighted in the syntax-highlight overlay using the TreeWalker DOM technique; current match is accent-blue, others amber. Scrolls the textarea to keep the current match centered.
  - Matches in the results pane (`<mark>` elements) survive Tree/Table view switches (re-applied on each `renderView` call).
  - **Aa** button toggles case-sensitivity (default: case-insensitive).
  - **Esc** closes the bar and clears all highlights.
  - Degrades gracefully when syntax highlighting is off (>80 k chars): match offsets are still computed and the textarea scrolls to each match, but no overlay marks are shown.
  - Surface auto-detects: if results are visible and no textarea is focused, defaults to searching results; if a textarea is focused, searches that pane. Switching focus while the bar is open re-runs the search on the new surface.
  - New keyboard shortcut added to the shortcuts popover.
- **`tests/find.test.js`** — 31 new unit tests for `findMatchOffsets` (basic, multi-match, case sensitivity, multi-line JSON, edge cases) and the next/prev wraparound helpers.

### Fixed

- `eslint.config.js` — added `_chk*.js` and `extracted_script.js` to the ignore list (pre-existing generated verification artifacts that were never intended to be linted).

### Notes

- `index.html` regenerated from `json_compare.html` + FEEDBACK delta. Parity test confirms identical outside FEEDBACK markers and CSP line.

---

## [2.6] — 2026-06-11

Phase D Commit 2 — feature-creep trims (D-8…D-11). No architectural change; DIFF-CORE byte-identical, all preserved IDs still present (removed elements lose their listeners — guarded with existence checks throughout). 322 tests green.

### Changed

- **3-Way tab gated on Base content (D-8)** — the 3-Way view tab is now hidden by default and only becomes visible when the Base pane has content. If a session is loaded with 3-Way mode active but no Base, the view falls back to Tree. A new `update3WayTabVisibility()` helper is called on `base` input and on startup.
- **Library simplified — folders flattened, search added (D-9)** — folder management UI (create/rename/delete folder, move-to-folder dropdown) has been removed from the Library drawer. Existing saved items are preserved unchanged; any that had a folder assignment now show "FolderName / ItemName" as their label in the Folders tab. A name-search input above the list filters both tabs in real time. The save-comparison dialog no longer prompts for a folder. No localStorage data is touched; `library.folders` remains in storage for forward compatibility.
- **"Unordered arrays" moved to Options panel (D-10)** — the toolbar checkbox is removed from the secondary toolbar group and added as the first row in the Options panel. The element `id="unordered"` and the `savePrefs`/`loadPrefs` key are unchanged; all wiring, keyboard shortcut, and persisted-pref behavior are identical.
- **Minify removed from per-pane tool rows (D-11)** — the Minify buttons are removed from the Source and Target pane headers (Base never had one). Format, Copy, Upload, Paste, and Clear remain. The Minify action handler in JS is still present but unreachable — no regression if someone triggers it programmatically.

### Notes

- `index.html` regenerated from `json_compare.html` + FEEDBACK delta. Parity test confirms identical outside FEEDBACK markers and CSP line.

---

## [2.5] — 2026-06-11

Phase D Commit 1 — productization additions (D-1…D-7). No architectural change; DIFF-CORE byte-identical, `connect-src 'none'` intact in `json_compare.html`, all element IDs preserved. 322 tests green.

### Added

- **Site identity (D-1)** — inline SVG favicon (data URI, stays self-contained), `<meta name="description">`, Open Graph (`og:title`, `og:description`, `og:type`, `og:url`, `og:image`), Twitter card, and `theme-color` meta in both `json_compare.html` and `index.html`.
- **MIT LICENSE file (D-3)** — the repo was legally "all rights reserved". Adds `LICENSE` (MIT). Footer and README now reference it.
- **Slim footer (D-2)** — one-row muted footer: app version · GitHub link · MIT License · privacy guarantee ("🔒 Your data never leaves your browser"). The hosted `index.html` adds a FEEDBACK-fenced footnote noting the feedback form is the only network call.
- **Help / About modal (D-4)** — full-page help dialog reusing the existing modal + `installFocusTrap` infrastructure. Covers: views overview (Tree / Table / Raw / 3-Way), all Options explained, Session vs Library vs Share, and the privacy model. Accessible via the "Help & About…" link at the bottom of the existing keyboard-shortcuts popover; Escape closes it.
- **PWA manifest + icons (D-5)** — `manifest.json` with `display: standalone`, `theme_color`, and SVG icons (`icons/icon-192.svg`, `icons/icon-512.svg`). Linked only from `index.html`; `json_compare.html` stays fully self-contained with zero network requests.
- **Editor line-number gutter (D-6)** — line numbers appear to the left of every editor pane, using the existing highlight-overlay grid technique. The gutter width is computed dynamically from the digit count. Numbers scroll in sync with the textarea. Respects the 80 k-char highlight cutoff: gutter hides when highlighting is off. New helper `refreshLineNums(taId)` called from `refreshHighlight`.
- **Export report button (D-7)** — "Export report ▾" button in the selection bar opens a dropdown with two actions: **Download Markdown** (`.md`) and **Download Standalone HTML** (`.html`). Exports the *entire* diff (all rows), not just selected ones. Reuses the existing `buildMarkdown` and `buildHTMLTable` serializers; the HTML export is a fully self-contained file with summary chips and styled table. Button is enabled whenever there are diff results, disabled otherwise.

### Notes

- `index.html` regenerated from `json_compare.html` + FEEDBACK delta. Parity test confirms identical outside FEEDBACK markers and CSP line.

---

## [2.4] — 2026-06-10

Post-validation fixes: declined-repair silent failure, index-parity test, mobile 390 px visual pass, repo hygiene.

### Fixed

- **Declined auto-repair no longer silently drops the error banner** — when invalid JSON triggers the auto-repair dialog and the user clicks Cancel, the standard parse-error banner (with line/column and "Jump to error" button) is now shown instead of nothing. Covered all five callsites: worker parse errors for Source and Target, sync-fallback parse errors for Source and Target, and the Format/Minify button path (which applies to all three panes including Base).

### Added

- **`tests/index-parity.test.js`** — automated parity guard: asserts that `index.html` is byte-identical to `json_compare.html` outside the FEEDBACK:START/END-marked blocks and the one permitted CSP `connect-src` line difference. Both `/* FEEDBACK:START */` (CSS/JS) and `<!-- FEEDBACK:START -->` (HTML) markers are now present in `index.html`, fencing the feedback widget delta. The test fails if the files drift anywhere outside those markers.

### Fixed (mobile)

- **Appbar icon buttons no longer shrink below 36×36 px at 390 px** — without `flex: none`, the four appbar icon buttons (help, save, library, theme) could be compressed by the flexbox algorithm at very narrow widths. Added `.appbar-inner .icon-btn { flex: none; }` in the ≤560 px breakpoint.
- **Page title truncates instead of overflowing at 390 px** — the `.titles` block lacked `min-width: 0; overflow: hidden` and the `h1` lacked `white-space: nowrap; text-overflow: ellipsis`, so "JSON Comparator" could push the appbar wider than the viewport or compress the icon buttons. The heading now clips cleanly with an ellipsis when space is tight.

### Notes

- `index.html` regenerated from `json_compare.html` + feedback delta; feedback blocks fenced with `FEEDBACK:START/END` markers in CSS/JS (`/* */`) and HTML (`<!-- -->`). `npm test` green on 322/322 tests including `diff-core-parity.test.js` and `index-parity.test.js`. `node --check` clean on both files.

---

## [2.3] — 2026-06-10

Enhancement plan **Phase C** — resizable split panes, Raw scroll sync, and word-level Raw highlighting (P1-3, P1-4, P1-5). No architectural change; DIFF-CORE byte-identical, CSP intact (`connect-src 'none'`), all element IDs preserved (one new ID, `paneResizer`).

### Added

- **Resizable Source / Target panes (P1-3)** — a draggable divider between the two editors lets you give more width to the larger document. Drag to re-proportion, **double-click to reset to 50/50**, and the ratio persists across sessions (`splitRatio` in prefs). The handle is keyboard-accessible (`role="separator"`, focusable): **←/→** adjust by 5%, **Home/End** jump to the 20%/80% bounds, **Enter/Space** resets. The split grid uses `--split-a` / `--split-b` custom properties; the handle is hidden in 3-Way mode and below 800 px (where panes stack). New ID: `paneResizer`.
- **Word-level highlighting in Raw view (P1-5)** — for changed lines, a token-level diff now wraps only the parts that actually differ in `<mark class="seg-add">` / `<mark class="seg-del">`, so on long lines the real change is visible instead of the whole line being flagged. Works in both Split and Unified Raw modes; capped at lines under 1,000 characters (longer lines fall back to whole-line highlighting to keep rendering fast). All token content is HTML-escaped.

### Changed

- **Raw split panes scroll in sync (P1-4)** — the two Raw columns now scroll together: moving one mirrors the other (vertical and horizontal), with a re-entrancy guard to avoid feedback loops. To enable independent-yet-synced scrolling, `.raw-split` switched from CSS grid to flexbox so each pane is its own scroll container (grid auto-rows stretched the panes and prevented per-pane scroll).

### Notes

- `index.html` (the GitHub Pages build) is regenerated from `json_compare.html` by re-applying the feedback widget + relaxed-CSP delta; the two files differ only by that delta. Verified: `npm test` green (321 tests incl. diff-core parity), `node --check` clean, no new duplicate element IDs.

---

## [2.2] — 2026-06-10

Enhancement plan **Phase B** — onboarding, per-view control gating, and a narrow/mobile pass (P1-1, P1-2, P1-7). No architectural change; DIFF-CORE byte-identical, CSP intact (`connect-src 'none'`), all element IDs preserved.

### Added

- **Load sample (P1-1)** — a built-in source/target pair exercising added, removed, changed (string/number/boolean), nested-object, array, and unchanged cases. Available two ways: a **Load sample** button in the empty-state placeholder (next to a **Paste your own JSON** shortcut) and a **Load sample** button in the compare toolbar (`#sampleBtn`). Restores the onboarding affordance the README already referenced. New IDs: `sampleBtn`, `phSample`, `phCompare`.

### Changed

- **Controls are gated per view (P1-2)** — the change-type **legend** and the **selection bar** (Select all / Generate table / JSON Patch) now appear only in Tree and Table views, where they function. In Raw view only the Split/Unified toggle shows; in 3-Way view only the merge stats show (the whole sub-bar is hidden). Wiring-only change in `renderView()`; no renderer logic touched.
- **Narrow / mobile pass (P1-7)** — below 560 px the per-pane tool row stays on a single horizontally-scrollable line (Copy/Clear remain reachable without stacking), the secondary toolbar buttons collapse to icon-only (Compare and Load sample keep their labels), and the filter search inputs take a full-width row so nothing overflows at ~390 px. Toolbar button labels are now wrapped in `.btn-label` spans to support the icon-only collapse. Sticky headers were already disabled ≤820 px (Phase A).

### Fixed

- **Stale summary stats after leaving 3-Way** — switching from the 3-Way view back to Tree/Table/Raw left the 3-Way conflict/left-only/right-only badges stuck in the results header until the next compare, because `renderView()` only wrote `#stats` in the 3-Way branch. The summary rendering is now factored into a shared `renderSummaryStats()` helper that `renderView()` re-runs for every non-3-Way view, so the normal added/removed/changed/unchanged counts are restored on every view switch. (Pre-existing bug, surfaced during Phase B sanity testing.)

### Notes

- `index.html` (the GitHub Pages build) is regenerated from `json_compare.html` by re-applying the feedback widget + relaxed-CSP delta; the two files differ only by that delta.

---

## [2.1] — 2026-06-10

Enhancement plan **Phase A** — verified visual defects (P0) plus a nav-counter polish (P1-6). No architectural change; DIFF-CORE untouched, CSP intact, all element IDs preserved.

### Fixed

- **Pane-tools no longer clip (P0-1)** — the per-pane button row (`Upload Paste Format Minify Copy Clear`) now wraps instead of overflowing the pane, so **Copy** and **Clear** stay reachable at narrow widths (~1100–1300 px). `.pane-tools` gained `flex-wrap: wrap; row-gap: 4px`.
- **Sticky headers no longer collide when the toolbar wraps (P0-2)** — the compare toolbar wraps to a second row below ~1250 px; the previously hardcoded sticky offsets (`top: 62px` / `132px`) let the results header slide under it. Offsets are now measured at runtime via a `ResizeObserver` that publishes `--appbar-h` / `--toolbar-h`, consumed by `top: calc(...)`. The stats chips and view controls stay stacked below the toolbar at any width.
- **Stale results are no longer mistaken for current (P0-3)** — after a failed compare (or when an input is edited after comparing), the previous diff is dimmed (`.stale`) and a “Showing a previous result — compare again to refresh.” note appears. The dimming clears on the next successful compare.
- **Parse errors now show location and a jump (P0-4)** — an invalid-JSON banner reports the **line and column** of the failure and offers a **Jump to error** button that focuses the offending pane, selects the position, and scrolls it into view. Composes with the existing auto-repair offer (repair stays first choice).

### Changed

- **Diff-nav counter starts at `1 / N` (P1-6)** — the results-header counter now reads `1 / N` and highlights the first diff in place on render, instead of showing `— / N` until Next/Prev is pressed.

---

## [2.0] — 2026-06-05

Phase 3 complete. All advanced / scale enhancements (T19–T25) shipped. Production-hardened and tagged `v1.0`.

### Added

- **Off-thread diff via Web Worker (T19)** — parse + diff runs in a background worker; the UI stays responsive at any input size. Uses `URL.createObjectURL(new Blob([...]))` so the worker works over `file://` without a server. The DIFF-CORE block is extracted from the page's own `<script>` at runtime — no extra copy of the diff code. Progress spinner ("Parsing… / Comparing…") with a Cancel button. `src/worker-protocol.js` exports protocol constants and message builders. `tests/worker-protocol.test.js`.

- **Virtualized result rendering (T20)** — table and tree views activate virtual scroll above 1,000 rows. Only visible rows (~50) are in the DOM at any time. `src/virtualizer.js` exports `visibleSlice`, `assignTreeId`, `flattenNodes`, `defaultExpandedIds`. Expand/collapse in the virtual tree is tracked in a JavaScript `Set` (`_treeExpandedIds`); Expand All / Collapse All work in virtual mode. `tests/virtualizer.test.js`.

- **Input-size guard + large-file mode (T21)** — three thresholds: `500 KB` (amber count badge), `2 MB` (informational "Large-file mode" blue banner), `50 MB` (hard refusal with error). A 60-second worker timeout safety net. `_formatBytes()` shows human-readable sizes in the count badges.

- **Format tolerance — JSONC / JSON5 / NDJSON (T22)** — four-option radio group ("JSON (strict)", "JSONC", "JSON5", "NDJSON") in the Options panel. `src/lenient-parsers.js` exports hand-written parsers for all three lenient modes. The LENIENT-PARSERS block is included in the Blob worker, so the right parser is used in the background thread. Format change resets the worker and triggers re-diff. `tests/lenient-parsers.test.js` (25 cases).

- **Shareable URL (T23)** — "Share URL" button encodes `{ src, tgt, opts }` as a base64url URL fragment (`#state=...`) using gzip compression (CompressionStream) with a raw-JSON fallback. A `showConfirm()` privacy warning is shown before encoding. On page load, `_restoreFromURL()` decodes the fragment and restores the comparison; `history.replaceState` cleans the hash. `src/url-state.js` + `tests/url-state.test.js`.

- **Three-way merge diff (T24)** — "3-Way" tab expands the pane grid to three columns (Base | Source/Left | Target/Right). `src/three-way.js` exports `threeWayDiff` and `threeWaySummary`. Changes are classified as `left-only`, `right-only`, `both-same`, or `conflict`. Summary stat badges (⚡ Conflicts, Left only, Right only, Both-same) shown in the stats bar. Schema-keyed arrays work via the existing `keyBy` option. `tests/three-way.test.js`.

- **Production hardening (T25)**:
  - `Content-Security-Policy` meta: `default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data:; worker-src blob:; connect-src 'none'; frame-ancestors 'self'`.
  - README: "🔒 Your data never leaves your browser" guarantee with `connect-src 'none'` enforcement note.
  - `PRODUCTION_PLAN.md` v2.0 deployment checklist — all items ticked ✅.
  - Cross-browser + mobile: `file://`-compatible, responsive at ≤800/900 px, CompressionStream fallback, `localStorage` guarded.

### Changed

- Worker blob now includes the LENIENT-PARSERS block in addition to the DIFF-CORE block. Blob is rebuilt when the input format changes.
- `setView()` now handles `"3way"` mode, shows/hides the Base pane, and adds `.three-way` to the panes grid.
- `updateCounts()` shows human-readable sizes (KB/MB) and adds `warn-size` / `danger-size` CSS classes for large inputs.
- `savePrefs()` / `initPrefs()` now include `inputFormat` in the persisted preferences.
- `render()` checks the 50 MB hard limit before dispatching to the worker; installs a 60 s timeout on the worker request.

### Known limitations

- **B6 (big numbers)** — full raw-token big-integer diff remains a future enhancement.
- **Myers line diff fallback** — n·m > 500,000 lines falls back to block delete+add.

---

## [1.1] — 2026-06-05

Phase 2 complete. All developer-usefulness enhancements (T11–T18) shipped.

### Added

- **Search / filter in results (T11)** — live filter bar below results: path substring, value substring, and change-type checkboxes (added / removed / changed). Filter applies to both tree and table views without re-running the diff. "Clear filter" button; "no matches" empty state. Selection respects the active filter. `src/filter.js` + `tests/filter.test.js`.
- **Next / previous diff navigation (T12)** — Prev ↑ / Next ↓ icon-buttons + `n` / `p` keyboard shortcuts jump between changes in both views. Automatically expands collapsed tree nodes and smooth-scrolls. Flashing CSS outline marks the current diff. Position counter ("3 / 12") in the results header.
- **Minify button + syntax highlighting (T15)** — "Minify" added alongside "Format" in each input pane. JSON syntax highlighting in the input editors via an overlay `<pre>` (color: transparent textarea + tokenized pre behind it). Highlights update live as you type (60 ms debounce); skips inputs > 80 000 chars to keep things responsive. `tests/highlight.test.js`.
- **Persist theme + options; respect OS theme (T16)** — Theme, `onlyDiff`, `unordered`, `viewMode`, and all comparison options are saved to `localStorage` on change and restored on load. Fresh loads without saved prefs check `prefers-color-scheme` to set the initial theme.
- **Comparison options panel (T14)** — Collapsible "Options" panel with four new diff controls: **Ignore keys** (comma-separated list), **Numeric tolerance** (`|a−b| ≤ tolerance` → equal), **Ignore string case** (case-insensitive string comparison), **Array key field** (keyed array matching via `keyBy`). Each option has tests; options persist and are saved/loaded with sessions. The diff core (`_walk`, `_diffArrayLCS`, `_diffArrayKeyed`) now accepts an `opts` 9th parameter for these options. DIFF-CORE block byte-identical parity maintained. `tests/options.test.js` (19 cases).
- **JSON Patch export (T17)** — "JSON Patch" button in the selbar downloads an RFC 6902 JSON Patch (`json-patch.json`) for selected entries. `src/json-patch.js` exports `segsToPointer` (RFC 6901 escaping), `changesToPatch`, and `applyPatch` (pure applicator for property tests). 9 round-trip property tests confirm `applyPatch(src, patch) === tgt`. `tests/json-patch.test.js` (27 cases).
- **Side-by-side / inline raw-text diff view (T13)** — Third "Raw" tab shows a Myers line-level diff of the pretty-printed JSON. Sub-toggle: **Split** (two aligned panes with padding rows) or **Unified** (single column with +/− prefixes and line numbers). Filter bar hidden in Raw view. `src/line-diff.js` exports `splitLines` + `lineDiff` (Myers O(ND) with two corrected backtracking bugs; greedy fallback for n·m > 500 000). `tests/line-diff.test.js` (15 cases, reconstruction property tests).
- **Accessibility pass (T18)** — Skip-to-content link; `role="banner"` / `role="main"` / `role="region"` landmarks. Segmented view toggle: `role="tablist"` + `role="tab"` + `aria-selected` (synced by `setView()`). Tree: `role="tree"` + `role="treeitem"` + `aria-expanded` + `role="group"` on child containers; ↑↓ arrow nav, → expand/enter, ← collapse/parent. Three modal overlays: `role="dialog"` + `aria-modal="true"` + `aria-labelledby`; Tab focus-trap via `installFocusTrap()`; focus restored to trigger element on close. All `window.prompt` / `window.confirm` replaced with `showPrompt()` / `showConfirm()` — accessible in-page dialogs with ARIA labelling and Escape-to-cancel. Global `:focus-visible` outline. AA contrast: amber `--changed` darkened to `#7a5200` in light mode. `tests/accessibility.test.js` (12 cases).

### Changed

- `render()` split into `render()` (runs diffCore) + `renderView()` (applies filter, renders view). `onlyDiff` change and view-mode switches now call `renderView()` instead of re-diffing.
- `diffCore` now passes the full `opts` object to `_walk` (9th parameter), enabling ignoreKeys / numericTolerance / ignoreCase deep in the recursion.
- `saveSession()` and `applySession()` now include the full set of comparison options.
- `getOpts()` now returns six fields: `unordered`, `onlyDiff`, `ignoreCase`, `ignoreKeys`, `numericTolerance`, `keyBy`.

### Known limitations

- **B6 (big numbers)** — integers beyond `2^53−1` still rounded by `JSON.parse`. Full big-integer diff is Phase 3.
- **Myers line diff greedy fallback** — inputs with n·m > 500 000 lines fall back to a block delete+add rather than a true diff.
- **Unordered array JSON Patch** — changes on unordered (`[*]`) paths are skipped in patch export (semantics undefined).

---

## [1.0-rc] — 2026-06-05

First release candidate. All Phase 0 and Phase 1 (MVP / ship-blocking) tasks complete.

### Added

- **LCS array matching (T6/B2)** — ordered arrays of scalars are now diffed with
  Longest Common Subsequence. A single insertion at the front of a 10-element
  array reports one `added`, not 10 `changed`. Mixed/object arrays fall back to
  positional comparison as before.
- **Key-based array matching (T6/B2)** — opt-in `--array-key <field>` CLI flag
  (and `{ keyBy: "<field>" }` JS API option) matches array elements by a shared
  key (e.g. `id`) instead of by position.
- **Recursion guard (T7/B4)** — inputs nested more than 500 levels throw a
  `DiffDepthError` (JS) / `DiffDepthError` (Python) with a clear message instead
  of crashing with a stack overflow.
- **Big-number precision warning (T9/B6)** — the web app detects integers
  exceeding `2^53−1` (JS's safe-integer limit) before comparing and shows an
  amber warning banner. The Python CLI is unaffected (Python preserves full
  integer precision).
- **Line/column parse errors (T8)** — invalid JSON now surfaces the line number,
  column, and a caret pointing at the problem character in both the web app and
  the CLI.
- **Unambiguous path encoding (T4/B3)** — keys containing `.`, `[`, or `]` no
  longer collide with nested paths or array indices. Selection roll-up uses
  structural segment matching, not string-prefix matching.
- **CLI multiset deduplication fix (T5/B1)** — `[1,1,2]` vs `[1,2]` now
  correctly reports one removed `1` instead of silently dropping duplicate counts.
- **Pure diff core (T2)** — single `diff(a,b,opts)→Change[]` function shared by
  the web app (via inlined copy) and the Vitest test suite. Tree view and table
  view are both derivations of the same `Change[]`.
- **Fixture corpus + parity test (T3)** — 16-case fixture corpus; CI asserts that
  the JS core and Python CLI produce identical output on every fixture.
- **Toolchain (T1)** — Vitest + ESLint (JS) and pytest (Python), CI workflow
  blocking merge on any failure.

### Changed

- Array diffs for all-scalar ordered arrays changed from positional to LCS. Tests
  updated to reflect the new (more correct) semantics.
- `diff-core.js` / inline HTML block: `_walk` gains `keyBy` and `depth`
  parameters; `diffCore` extracts `keyBy` from opts.
- Python `diff()` gains `key_by` and `_depth` parameters; `main()` gains
  `--array-key` option and catches `DiffDepthError`.
- Python `load()` now shows a richer error message (line, column, caret excerpt)
  on invalid JSON.

### Known limitations

- **B6 (big numbers)** — the web app warns but still silently rounds integers
  beyond `2^53−1`. Full big-integer diff requires a raw-token parser (Phase 3).
- **No side-by-side / raw diff view** — planned for Phase 2 (T13).
- **No search/filter in results** — planned for Phase 2 (T11).
- **Object arrays default to positional** — without `keyBy`, object arrays are
  still positional. A smart auto-key heuristic is planned for Phase 2 (T14).
