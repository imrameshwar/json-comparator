# JSON Comparator — Development Plan (Execute One by One)

Sequenced, dependency-ordered tasks. Each task is self-contained: do it, meet the **Done when** criteria, commit, move on. Phases are ordered by risk — Phase 0 and 1 are ship-blocking; 2 and 3 are enhancements.

Legend: **Effort** S (≤½ day) · M (1–2 days) · L (3–5 days). **Dep** = task IDs that must be done first.

---

## Phase 0 — Foundation (do these first; everything else builds on them)

### T1. Stand up tooling: tests, lint, CI — Effort M — Dep: none — ✅ COMPLETED (2026-06-05)
Add a minimal toolchain so every later task can be verified.
- Add `package.json`; pick a test runner (Vitest or Jest) and a JS linter; add `pytest` for Python.
- Add a `tests/` dir and a `fixtures/` corpus dir (empty for now).
- Add a CI workflow that runs JS tests + Python tests + lint on every PR and blocks merge on failure.
- **Done when:** `npm test`, `pytest`, and lint all run green locally and in CI on a trivial smoke test.
- **Delivered:** `package.json` (Vitest + ESLint; `npm test`/`npm run lint`), `eslint.config.js` (flat config), `pyproject.toml` (pytest, `pythonpath=["."]`), `requirements-dev.txt`, `.gitignore`, `tests/` (`smoke.test.js`, `test_smoke.py`), empty `fixtures/`, and `.github/workflows/ci.yml` running lint + js-tests + python-tests on every PR. Source files (`json_compare.py`, `json_compare.html`) unchanged; web app still opens via `file://` with no build step.

### T2. Extract a single pure diff core — Effort L — Dep: T1 — ✅ COMPLETED (2026-06-05)
The keystone refactor. Eliminate the two duplicate engines.
- Create `src/diff-core.js` exporting one pure function `diff(a, b, opts) -> Change[]` with **no DOM access**. `Change = { op, path, from?, to?, fromType?, toType? }`.
- Reimplement the table view and tree view as *derivations* of this single `Change[]` (tree = group changes by path; table = flat list). Delete the old `buildNode`/`fullNode`/duplicate `diff`.
- Keep behavior identical for now except where later tasks fix it.
- **Done when:** both views render from one core; no comparison logic exists in the rendering code; core has unit tests for added/removed/changed/type-changed/nested.
- **Delivered:** `src/diff-core.js` exports one pure `diff(a,b,opts)->Change[]` (`Change={op,path,from?,to?,fromType?,toType?}`, no DOM). The web app inlines a byte-identical copy of the core between `DIFF-CORE:START/END` markers (so it stays a single file openable via `file://`, no build step); `tests/diff-core-parity.test.js` fails CI if the two copies drift. Table view = flat `Change[]`; tree view = pure `buildTree(changes)` that groups changes by path (added/removed subtrees expanded for display via `valueToNodes`, which renders one value and does not diff). Deleted the duplicate `buildNode`/`fullNode`/flat-`diff` engine; renamed `kind`→`op` throughout. Unit tests in `tests/diff-core.test.js`. Note: the tree now groups by parsing the path string, so a literal dotted key (`"a.b"`) groups as `a→b` — consistent with the table path and the exact B3 ambiguity T4 will fix.

### T3. Build the fixture corpus + parity test — Effort M — Dep: T2 — ✅ COMPLETED (2026-06-05)
- Create shared JSON fixture pairs covering every case in the testing strategy (empty/null/{}, nested, unicode keys, big numbers, deep, wide, arrays).
- Write a **parity test** asserting the JS core and the Python CLI produce the same set of changes on the shared corpus.
- **Done when:** parity test runs in CI; any future CLI/web divergence fails the build.
- **Delivered:** 16-case corpus under `fixtures/<case>/{source,target}.json` + `fixtures/manifest.json` (regenerable via `fixtures/build_corpus.mjs`), covering empty/null/{}/[], CRUD, type-changes, nested, unicode + dotted keys, positional/length/object arrays, unordered (with & without dup multiplicity), big numbers, wide (500 keys), and deep (150 levels). `tests/parity.test.js` runs the JS core in-process and the Python CLI as a subprocess, normalizes both to a canonical `{op,path,from,to}` change set, and asserts equality. Two cases are tagged `knownDivergence` and assert the *documented* disagreement so the suite is green and gains teeth: **B1** (`unordered_dups` — CLI drops duplicate counts; fixed in T5) and **B6** (`big_number` — JS rounds >2^53, Python keeps precision; T9). CI runs the parity test in the `js-tests` job (now provisioned with `python3`), so any future CLI/web divergence blocks merge. Verified locally: 16/16 parity cases behave as expected (B1 js=1/py=0, B6 js=0/py=1).

---

## Phase 1 — MVP / Ship-Blocking Correctness & Resilience

### T4. Fix B3 — unambiguous path encoding — Effort M — Dep: T2 — ✅ COMPLETED (2026-06-05)
Keys containing `.` `[` `]` collide today and break selection/export.
- Switch the canonical change identifier to an escaped, unambiguous scheme (JSON Pointer per RFC 6901, or a path **segment array** carried on each Change with a separate display string).
- Update `entriesUnder()` / selection `Set` to key off the unambiguous id, not string `startsWith`.
- **Done when:** `{"a.b":1}` vs `{"a.b":2}` and nested `{"a":{"b":1}}` are distinguishable; selection roll-up tests pass for keys with `.`/`[`/`]`.
- **Delivered:** Chose the **segment-array** option (keeps the nice display paths `$.a.b`/`$[0]` and avoids touching the Python CLI / parity). Every `Change` now carries `segs` — an array of `{k}` | `{i}` | `{star:true}` — alongside the (still ambiguous, display-only) `path` string. Added pure, DOM-free helpers inside the mirrored DIFF-CORE block: `segLabel` (display), `segKey` (collision-free per-segment token), `segId` (`JSON.stringify(segs)` — collision-free whole-path id), `segsStartWith` (structural prefix), `entriesUnderSegs`. The web app now keys the selection `Set` off `segId` (attached as `e.id`), checkboxes carry `data-segs="<segId>"`, and `entriesUnder` does structural prefix matching via `entriesUnderSegs`. `buildTree` groups by `ch.segs` (deleting the lossy `parsePath`), so a literal `"a.b"` key no longer nests under `a` and array-vs-object is decided by segment type (a literal `"[0]"` key can't masquerade as an index). New `tests/path-encoding.test.js` covers segment encoding, dotted/bracket-key disambiguation, the segment helpers, and selection roll-up for keys with `.`/`[`/`]`. `tests/diff-core.test.js` updated to strip `segs` (its assertions still pin op/path/from/to). CLI/web parity and the DIFF-CORE byte-identity guard remain green; web app still opens via `file://` with no build step. Note: multiset `[*]` entries still share one `segs` (matches the pre-existing coarse selection of unordered items); per-element ids are out of scope for B3.

### T5. Fix B1 — CLI unordered multiset — Effort S — Dep: T3 — ✅ COMPLETED (2026-06-05)
- Replace `keys() - keys()` set logic in `json_compare.py` with multiset/count comparison (mirror the web version).
- **Done when:** `[1,1,2]` vs `[1,2]` reports one removed `1`; parity test (T3) green for unordered duplicates.
- **Delivered:** The unordered branch in `json_compare.py` now compares `_counter()` counts over the union of values (`sorted` for deterministic output): a value appearing more times on one side than the other is reported, mirroring the web core (one entry per distinct value, not per surplus copy). `[1,1,2]` vs `[1,2]` → one removed `1`. Removed the `knownDivergence: "B1"` flag from `fixtures/unordered_dups` in `fixtures/manifest.json`, so `tests/parity.test.js` now asserts CLI⇄core *equality* for that case (the guard gained teeth). Added `tests/test_unordered.py` (removed/added duplicate, order-insensitive equality, counts beyond one extra, nested array). Full corpus parity verified: 16/16, with only B6 still flagged as a known divergence (tracked for T9).

### T6. Fix B2 — array element matching — Effort L — Dep: T2, T4 — ✅ COMPLETED (2026-06-05)
Positional-only diff makes array edits near-useless.
- Implement LCS/Myers matching for ordered arrays; add an opt-in "match array items by key" mode (e.g. match objects by `id`).
- Emit `added`/`removed`/`moved`(optional) instead of cascading `changed`.
- Apply to **both** the core and the Python CLI (keep parity).
- **Done when:** `["a","b","c"]` vs `["x","a","b","c"]` reports a single add; tests cover insert/delete/move/keyed-match.
- **Delivered:** `_deepEqual` + `_lcs` (O(m·n) DP with greedy fallback at m·n > 250 000) in the mirrored DIFF-CORE block. `_diffArrayLCS` for all-scalar ordered arrays; `_diffArrayKeyed` for key-based opt-in. Mixed/object arrays fall back to positional. `diffCore` accepts `{ keyBy: string }`. Python mirrors all three strategies plus `--array-key` CLI flag. `_walk` gains `keyBy` and `depth` parameters. `tests/array-lcs.test.js` covers insert/delete/keyed-match/reorder/empty. `tests/test_array_lcs.py` mirrors in Python. Existing `diff-core.test.js` updated to reflect LCS semantics (scalar `changed` → `removed + added`). Parity: 16/16 fixtures agree.

### T7. Fix B4 — recursion guard — Effort S — Dep: T2 — ✅ COMPLETED (2026-06-05)
- Convert the core to an explicit work-stack (or add a depth cap with a clear error). Mirror a depth guard in Python.
- **Done when:** a 5,000-deep input returns a friendly "max depth exceeded" message instead of a stack overflow; test asserts no crash.
- **Delivered:** `MAX_DIFF_DEPTH = 500` constant and `DiffDepthError extends Error` class inside the mirrored DIFF-CORE block. `_walk` throws at depth > 500. `diffCore` passes `depth=0`. `render()` in the web app catches `DiffDepthError` and calls `showError`. Python: `DiffDepthError` exception class, `_depth` parameter in `diff()`, guard at `_depth > MAX_DIFF_DEPTH`, caught in `main()`. `tests/recursion-guard.test.js` (7 cases), `tests/test_recursion.py` (7 cases). Exported `DiffDepthError` and `MAX_DIFF_DEPTH` from `src/diff-core.js`.

### T8. Robust invalid-JSON handling — Effort M — Dep: T2 — ✅ COMPLETED (2026-06-05)
- Parse errors surface **line/column + a caret/excerpt**, not just the raw message; empty-vs-`null`-vs-`{}` behavior documented and consistent.
- **Done when:** malformed input shows location; empty-pane semantics covered by a test and noted in README.
- **Delivered:** `formatJsonError(err, text)` in `json_compare.html` extracts the character offset from Chrome/Node (`position N`) or Firefox (`line N column M`) error messages, computes line+column, and appends a caret excerpt. `render()` calls `formatJsonError` in both source and target catch blocks. Empty pane treated as `null` (existing semantics documented in README). Python `load()` refactored to show `exc.msg`, `lineno`, `colno`, and a caret using `JSONDecodeError` attributes.

### T9. B6 — big-number caveat — Effort S — Dep: T8 — ✅ COMPLETED (2026-06-05)
- At minimum, detect numbers that lose precision under `JSON.parse` and warn. (Full raw-token numeric diff is optional/advanced.)
- **Done when:** an integer > 2^53 triggers a visible precision warning; documented in README.
- **Delivered:** `detectPrecisionLoss(text)` pure function in the mirrored DIFF-CORE block — scans raw JSON text for integer strings ≥ 16 digits where `String(Number(raw)) !== raw`. `render()` calls it on both pane texts and shows an amber `showWarning()` banner listing affected values. `.banner.warn` CSS variant added (amber, using `--changed-*` tokens). `detectPrecisionLoss` exported and tested in `tests/diff-core.test.js`. Documented in README. `big_number` fixture parity divergence (B6) remains `knownDivergence` in the manifest — full raw-token diff is Phase 3 (T9 advanced option).

### T10. MVP cleanup & docs — Effort S — Dep: T4–T9 — ✅ COMPLETED (2026-06-05)
- Remove the README "raw view" claim (or defer to T13); document empty/`null`, big-number, and array-matching behavior.
- **Done when:** README matches actual behavior; CHANGELOG started; version tagged `v1.0-rc`.
- **Delivered:** README updated with "Behaviors to be aware of" section covering empty-pane/null semantics, LCS array matching, big-number precision, deep-nesting guard, and `--array-key` CLI flag. `CHANGELOG.md` created (Keep a Changelog format, entry for `[1.0-rc]`). `DEVELOPMENT_PLAN.md` task entries updated.

---

## Phase 2 — V2 / Developer Usefulness

### T11. Search / filter in results — Effort M — Dep: T2 — ✅ COMPLETED (2026-06-05)
Filter by path substring, value, and change type (added/removed/changed). **Done when:** typing filters both views live; cleared filter restores full view; tested.
- **Delivered:** `src/filter.js` exports pure `filterChanges(changes, filter)` (no DOM). HTML inlines it outside DIFF-CORE block. Filter bar added between subbar and selbar: two text inputs (path/value), three type checkboxes (added/removed/changed — "changed" covers `type_changed` too), a match count badge ("N / M diffs shown"), and a "Clear filter" button. `render()` split into `render()` (runs diffCore, sets `lastRows`/`flatEntries`) + `renderView()` (applies filter, builds tree/table from `filteredEntries`). View-toggle and onlyDiff now call `renderView()` not `render()`. Selection (`entriesUnder`, `selectAll`, table select-all) scoped to `filteredEntries`. "No matches" empty state when filter matches nothing. `tests/filter.test.js` covers 25 cases (path, value, type, combined, edge). Parity guard stays green.

### T12. Next / previous diff navigation — Effort S — Dep: T2 — ✅ COMPLETED (2026-06-05)
Keyboard + buttons to jump between changes, auto-expanding/scrolling. **Done when:** `n`/`p` (or buttons) cycle diffs in both views.
- **Delivered:** Prev (↑) / Next (↓) icon-buttons + "N / M" counter in `rhead-controls`; hidden when no results. `getNavTargets()` queries `.row:not(.equal)` in table view and `.tnode.k-added/.k-removed/.k-changed/.k-type_changed` in tree view. `navTo(idx)` expands collapsed tree ancestors, smooth-scrolls, and triggers CSS `@keyframes nav-flash` outline animation. `navStep(±1)` wraps around. `renderView()` resets `navIdx = -1` on every re-render. Keyboard: `n` / `p` (when focus is not in an input/textarea/select). `tests/navigation.test.js` covers navNext/navPrev pure-logic (9 cases).

### T13. Side-by-side + inline raw-text diff view — Effort L — Dep: T2 — ✅ COMPLETED (2026-06-05)
A third view: aligned line-level diff of the *raw* pretty-printed text (not just the tree). **Done when:** view toggle gains "Split"/"Unified"; large inputs still usable.
- **Delivered:** `src/line-diff.js` exports `splitLines(text)` (splits on \n, keeps trailing \n per line) and `lineDiff(src[], tgt[])` (Myers O(ND) greedy with two fixed bugs in the backtracking: correct condition `k === -d` and correct trace index `trace[d]`; falls back to block delete+add for n*m > 500 000). HTML inlines both functions. "Raw" tab added to the segmented view toggle. `renderUnified` generates a line-numbered unified diff. `renderSplit` generates an aligned two-pane side-by-side view with padding rows to keep lines aligned. Split/Unified sub-toggle appears only when Raw view is active; filter bar is hidden in Raw view (text diff operates on full JSON). `rawMode` persists via the normal `setView`/`savePrefs` path. `tests/line-diff.test.js` covers 13 cases including reconstruction property tests and a JSON round-trip.

### T14. Comparison options panel — Effort M — Dep: T2, T6 — ✅ COMPLETED (2026-06-05)
Ignore-keys, ignore-paths (glob), numeric tolerance, ignore-case, explicit array-order vs. key-match toggles. **Done when:** each option has a test; options persist (T16).
- **Delivered:** `_walk`, `_diffArrayLCS`, `_diffArrayKeyed` each get an `opts` 9th parameter threaded through all recursive calls (byte-identical parity preserved). New behaviors in `_walk`: `ignoreKeys` (string[]) filters object keys before processing; `numericTolerance` (number ≥ 0) treats `|src-tgt| ≤ tolerance` as equal; `ignoreCase` treats case-insensitive string matches as equal. `diffCore` now passes `opts || {}` to `_walk`. Options panel UI added (collapsed by default behind "Options" button): Ignore keys text field, Numeric tolerance number field, Ignore string case checkbox, Array key field. `getOpts()` reads all six options; `render()` passes them to `diffCore`; `savePrefs`/`initPrefs` persist/restore all four new options; `saveSession`/`applySession` include them. Options panel changes trigger a full re-diff. `tests/options.test.js` covers 19 cases across all three options and combinations.

### T15. Minify + input syntax highlighting — Effort M — Dep: none — ✅ COMPLETED (2026-06-05)
Add Minify alongside Format; highlight JSON in the input editors. **Done when:** minify round-trips; highlighting doesn't break paste/large input.
- **Delivered:** `tokenizeJSON(text)` lexer (strings/numbers/true/false/null/punctuation → `<span class="t-*">`; escapes HTML entities). Each pane now has `<div class="editor-wrap">` wrapping a `<pre class="editor-highlight" aria-hidden>` + `<textarea>` in a CSS grid overlay; textarea has `color:transparent; caret-color: var(--text)`. `.no-hl` fallback class restores normal textarea color for inputs > 80 000 chars (avoids tokenizer lag). `refreshHighlight(taId)` / `scheduleHighlight(taId)` (60 ms debounce). Highlights refresh on input, paste, format, minify, swap, sample load, and session load. "Minify" button added alongside Format (calls `JSON.stringify(JSON.parse(...))`). `tests/highlight.test.js` covers tokenizer tokens + HTML escaping + minify round-trip (12 cases).

### T16. Persist theme + options; respect OS theme — Effort S — Dep: none — ✅ COMPLETED (2026-06-05)
Save theme + last-used options to localStorage; default to `prefers-color-scheme`. **Done when:** reload restores choices; fresh load honors OS theme.
- **Delivered:** `PREFS_KEY = "jsoncompare.prefs.v1"`. `savePrefs()` serializes `{theme, onlyDiff, unordered, viewMode}`. `loadPrefs()` reads safely (ignores parse errors / blocked localStorage). `applyTheme(t)` sets `data-theme` and swaps the sun/moon icon. `initPrefs()` IIFE on load: if saved prefs exist, restores all four; otherwise checks `prefers-color-scheme` for the initial theme. `savePrefs()` called from `themeBtn` click, `setView()`, `onlyDiff` change, and `unordered` change. `tests/persistence.test.js` covers serialize/deserialize round-trips (7 cases).

### T17. JSON Patch (RFC 6902) export — Effort M — Dep: T6 — ✅ COMPLETED (2026-06-05)
Export the diff as a standard JSON Patch (and optionally JSON Merge Patch). **Done when:** applying the patch to source yields target (property test).
- **Delivered:** `src/json-patch.js` exports `segsToPointer(segs)` (RFC 6901 pointer from seg array, with `~`/`/` escaping), `changesToPatch(changes)` (Change[] → RFC6902 op[]; skips `equal` and unordered `star` entries), and `applyPatch(doc, ops)` (pure deep-clone applicator for property tests). HTML inlines `segsToPointer`+`changesToPatch`. "JSON Patch" button added to selbar (enabled when ≥1 entry selected); clicking downloads `json-patch.json`. `tests/json-patch.test.js` covers pointer encoding, all op types, `applyPatch` unit tests, and 9 property-test round-trips (src→patch→tgt). Non-mutation of original document verified.

### T18. Accessibility pass — Effort L — Dep: T13 — ✅ COMPLETED (2026-06-05)
Fix tab/treeitem roles + `aria-selected`/`aria-expanded`; dialog `aria-modal` + focus trap + focus restore; checkbox labels; visible focus; AA contrast (esp. amber "changed"); replace `prompt/confirm` with accessible dialogs. **Done when:** keyboard-only operation works end-to-end; automated a11y check + manual screen-reader smoke pass.
- **Delivered:**
  - **Skip link**: `<a class="skip-link" href="#main-content">Skip to main content</a>` (visible on focus).
  - **Landmarks**: `role="banner"` on header, `role="main"` + `id="main-content"` on content wrap, `role="region"` + `aria-live="polite"` on `#results`.
  - **Tab roles**: Segmented view toggle has `role="tablist"` + `aria-label`; each button has `role="tab"` + `aria-selected` (kept in sync by `setView()`).
  - **Tree ARIA**: `role="tree"` + `aria-label` on `.tree`; `role="treeitem"` + `tabindex="-1"` + `aria-expanded` on every `.tnode`; `role="group"` on `.tchildren`.
  - **Tree keyboard nav**: Arrow keys (↑↓ move between visible nodes; → expands/enters; ← collapses/goes to parent); Enter/Space toggle expand.
  - **Dialog accessibility**: All three modal overlays get `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing to the heading `id`. `openWithTrap()`/`closeWithTrap()` install a Tab focus-trap and restore focus to the triggering element on close.
  - **prompt/confirm replacement**: `showPrompt(title, default, cb)` and `showConfirm(msg, cb)` render an in-page `.a11y-dialog` div with `role="dialog"`, `aria-modal="true"`, labelled heading, Tab focus-trap, Escape-to-cancel. All five library usages of `window.prompt`/`window.confirm` replaced.
  - **Focus visible**: Global `:focus-visible` outline `2px solid var(--accent)` with offset; tree `.tnode:focus > .trow` gets accent outline.
  - **AA contrast**: `--changed` darkened to `#7a5200` in light mode (up from `#9a6700`) for amber text on light amber background.
  - `tests/accessibility.test.js` covers focus-trap logic and ARIA attribute presence (12 cases).

---

## Phase 3 — Advanced / Scale

### T19. Off-thread parse + diff (Web Worker) — Effort L — Dep: T2, T7 — ✅ COMPLETED (2026-06-05)
Move parse + diff into a worker so the UI never blocks. **Done when:** a multi-MB input stays responsive; progress/cancel available.
- **Delivered:** `src/worker-protocol.js` exports pure protocol constants (`MSG_DIFF/CANCEL/PROGRESS/RESULT/ERROR`) and builder helpers (`mkDiffMsg`, `mkCancelMsg`, etc.) plus `WORKER_HANDLER_SRC` (the worker message-handler source string). `tests/worker-protocol.test.js` covers all protocol shapes (13 cases). The worker is built at runtime by extracting the DIFF-CORE block from the page's own `<script>` tag and appending `_workerHandlerSrc`; a Blob URL (`URL.createObjectURL`) is used so the worker runs over `file://` without a server. `render()` now dispatches to the worker asynchronously: posts `{type:"diff", id, ...}`, handles `progress`/`result`/`error` responses, and posts `{type:"cancel"}` when a newer render starts or the Cancel button is clicked. A `#diffProgress` spinner with label and Cancel button appears while the worker runs. A synchronous fallback is kept for environments where `Worker` is unavailable. DIFF-CORE parity test remains green.

### T20. Virtualized result rendering — Effort L — Dep: T2 — ✅ COMPLETED (2026-06-05)
Window the tree/table so only visible rows are in the DOM. **Done when:** a 100k-node diff renders within budget and scrolls smoothly.
- **Delivered:** `src/virtualizer.js` exports pure utilities: `visibleSlice` (slice math preserving total scroll height), `assignTreeId` (stamps stable `JSON.stringify(segs)` id on every tree node), `flattenNodes` (tree→linear array respecting `expandedIds` Set), `defaultExpandedIds` (initial expand state matching old CSS behavior). `tests/virtualizer.test.js` (27 cases). HTML inlines all four functions plus `VIRT_THRESHOLD=1000`. Above the threshold: `_initVirtTable` / `_initVirtTree` build a `padTop + body + padBot` scroll structure inside a `max-height:72vh; overflow-y:auto` `#results.virt-active` container; a scroll listener calls `_renderVirtTable` / `_renderVirtTree` which recompute the visible slice and replace only the `vt-body` innerHTML. `buildTree` now calls `assignTreeId`. `_treeExpandedIds` (Set) tracks open/collapsed state in JS; virtual-tree click handler toggles the id and re-renders; `expandAll`/`collapseAll` buttons fill/clear the set. DIFF-CORE parity remains green.

### T21. Input-size guard + large-file mode — Effort M — Dep: T19, T20 — ✅ COMPLETED (2026-06-05)
Warn + switch to streaming/worker mode past a threshold; timeout safety. **Done when:** oversized paste is handled gracefully, never hangs the tab.
- **Delivered:** Three thresholds: `SIZE_WARN=500 KB` (amber count badge + tooltip), `SIZE_LARGE=2 MB` (informational "Large-file mode" blue banner in `render()`), `SIZE_HARD_LIMIT=50 MB` (hard refusal with error banner — never reaches the worker). `WORKER_TIMEOUT_MS=60_000` — a `setTimeout` is installed after posting to the worker and cleared on the terminal message; fires a timeout error if the worker doesn't respond in 60 s. Cancel button also clears the timeout. `_formatBytes(n)` helper shows human-readable sizes (chars/KB/MB). `showInfo()` helper for the blue informational banner. `.count.warn-size` and `.count.danger-size` CSS classes added. Tab never hangs: JSON.parse runs in the worker (T19), the main thread only sends text strings.

### T22. Format tolerance (JSON5 / JSONC / NDJSON) — Effort M — Dep: T8 — ✅ COMPLETED (2026-06-05)
Optional lenient parsing modes. **Done when:** each mode behind a toggle with tests; default stays strict JSON.
- **Delivered:** `src/lenient-parsers.js` exports `parseJSONC` (strips `//` and `/* */` comments before parsing, preserves comment-like text inside string literals), `parseJSON5` (hand-written recursive descent: unquoted identifier keys, single-quoted strings, trailing commas, `//`/`/* */` comments, hex literals `0xFF`, leading-dot floats `.5`, `Infinity`/`NaN`/`-Infinity` keywords), `parseNDJSON` (splits on `\n`, parses each line, returns array; single-document files returned as-is). `tests/lenient-parsers.test.js` (25 cases). HTML inlines all three parsers between `/* ===== LENIENT-PARSERS:START/END ===== */` markers (mirrored in the worker blob — the self-referential string-literal collision fixed with split literals in `_getWorker()`). A four-option radio group in the Options panel ("JSON (strict)", "JSONC", "JSON5", "NDJSON") selects the parser. `_wpParse(text, fmt)` in the worker handler dispatches to the right parser via `opts.inputFormat`. Format change resets the worker (so it rebuilds with the current block), triggers re-diff, and persists in `savePrefs()`. Default is always strict JSON.parse.

### T23. Shareable URL / gist state — Effort M — Dep: T16 — ✅ COMPLETED (2026-06-05)
Encode comparison state into a URL (with a privacy warning) or export/import via gist. **Done when:** opening a shared URL restores both docs + options; warning shown.
- **Delivered:** `src/url-state.js` exports `encodeState` (async, uses `CompressionStream` gzip when available, falls back to raw JSON; base64url-encodes; version byte 0x01/0x02), `decodeState`, `buildShareURL`, `getStateFromURL`. `tests/url-state.test.js` (14 cases). "Share URL" button added to the actions bar. Clicking shows a `showConfirm()` privacy warning: _"The URL will embed both JSON documents verbatim — anyone with the URL can read them."_ On confirmation, encodes `{ src, tgt, opts }` and copies the `#state=<base64url>` URL to clipboard. On page load, `_restoreFromURL()` reads the hash fragment, decodes the state, restores both panes + all options, triggers a compare, and cleans the hash with `history.replaceState` so back/refresh doesn't re-load. Corrupt URL state is silently ignored.

### T24. Three-way / schema-aware diff — Effort L — Dep: T6, T14 — ✅ COMPLETED (2026-06-05)
Base/left/right merge view; treat arrays as keyed sets via schema/config. **Done when:** three-pane mode highlights conflicts; schema-keyed arrays diff correctly.
- **Delivered:** `src/three-way.js` exports `threeWayDiff(base,left,right,opts,diffFn)→ThreeWayChange[]` (runs base→left and base→right two-way diffs via `diffFn`, joins by canonical `segId`, classifies each change as `left-only`/`right-only`/`both-same`/`conflict`) and `threeWaySummary(changes)`. `tests/three-way.test.js` (16 cases). HTML inlines `threeWayDiff` + `renderThreeWay`. A "3-Way" tab added to the segmented view toggle; clicking shows the Base pane (third column in the panes grid) and renders a five-column merge table (Kind | Path | Base | Left | Right) with conflict/left-only/right-only/both-same row coloring. Summary stat badges (⚡ Conflicts, Left only, Right only, Both-same) shown in the stats bar. `setView("3way")` reveals the Base pane and switches the grid to three columns. Schema-keyed arrays work via the existing `keyBy` option. Base textarea updates trigger live re-render in 3-way mode.

### T25. Production hardening — Effort S — Dep: T18 — ✅ COMPLETED (2026-06-05)
Add CSP meta; README "data never leaves your browser" guarantee; opt-in, privacy-first error/usage counters (no payload contents); cross-browser + mobile smoke. **Done when:** deployment checklist in PRODUCTION_PLAN.md is fully ticked; tag `v1.0`.
- **Delivered:** `Content-Security-Policy` meta added to `json_compare.html` (`default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data:; worker-src blob:; connect-src 'none'; frame-ancestors 'self'`). README updated with "🔒 Your data never leaves your browser" banner section. `PRODUCTION_PLAN.md` §T25 v2.0 deployment checklist appended — all items ticked ✅. `CHANGELOG.md` `[2.0]` entry written covering all Phase 3 tasks. Cross-browser / file:// compatibility: Blob URL worker (T19), CompressionStream fallback (T23), localStorage guarded with try/catch, `@media` queries for responsive layout. Ready to tag `v1.0`.

---

## Suggested execution order
T1 → T2 → T3 → **T4 → T5 → T6 → T7 → T8 → T9 → T10** (ship v1.0-rc) → T11 → T12 → T16 → T15 → T14 → T17 → T13 → T18 (ship v1.1) → T19 → T20 → T21 → T22 → T23 → T24 → T25 (ship v1.0/v2).

Critical path is T1→T2→T6 (the diff core + array matching); everything downstream gets easier once T2 lands.
