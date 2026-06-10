# Changelog

All notable changes to JSON Comparator are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [2.2] — 2026-06-10

Enhancement plan **Phase B** — onboarding, per-view control gating, and a narrow/mobile pass (P1-1, P1-2, P1-7). No architectural change; DIFF-CORE byte-identical, CSP intact (`connect-src 'none'`), all element IDs preserved.

### Added

- **Load sample (P1-1)** — a built-in source/target pair exercising added, removed, changed (string/number/boolean), nested-object, array, and unchanged cases. Available two ways: a **Load sample** button in the empty-state placeholder (next to a **Paste your own JSON** shortcut) and a **Load sample** button in the compare toolbar (`#sampleBtn`). Restores the onboarding affordance the README already referenced. New IDs: `sampleBtn`, `phSample`, `phCompare`.

### Changed

- **Controls are gated per view (P1-2)** — the change-type **legend** and the **selection bar** (Select all / Generate table / JSON Patch) now appear only in Tree and Table views, where they function. In Raw view only the Split/Unified toggle shows; in 3-Way view only the merge stats show (the whole sub-bar is hidden). Wiring-only change in `renderView()`; no renderer logic touched.
- **Narrow / mobile pass (P1-7)** — below 560 px the per-pane tool row stays on a single horizontally-scrollable line (Copy/Clear remain reachable without stacking), the secondary toolbar buttons collapse to icon-only (Compare and Load sample keep their labels), and the filter search inputs take a full-width row so nothing overflows at ~390 px. Toolbar button labels are now wrapped in `.btn-label` spans to support the icon-only collapse. Sticky headers were already disabled ≤820 px (Phase A).

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
