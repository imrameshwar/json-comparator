# JSON Comparator — UI/UX Enhancement Plan

> **✅ Validation 2026-06-10 (post-execution):** Phases A, B, C all verified — code inspection, 321/321 tests green (incl. diff-core parity), and live functional checks on the deployed site (sample load, nav counter `1/9`, Raw word-level marks, scroll sync, keyboard-resizable splitter, stale dimming, error banner with line/col + Jump). `index.html` differs from `json_compare.html` only by the feedback delta. **Remaining:** (1) NEW — declining the auto-repair offer leaves no error banner (silent failure path; fall through to `showError` with line/col + Jump after Cancel); (2) P2 backlog untouched (expected); (3) no automated parity test for the `index.html` feedback delta; (4) P1-7 mobile pass code-verified but not visually tested at 390 px; (5) untracked in git: plan docs + `package-lock.json` (commit the lockfile for reproducible CI).

**Date:** 2026-06-10 · **Reviewed:** `index.html` (deployed) + `json_compare.html` (offline), live check of https://imrameshwar.github.io/json-comparator/
**Verdict:** The v2.0 redesign landed well — sticky toolbar, collapsed inputs bar, diff summary, copy-path/value row actions, shortcuts popover, repair-offer, a11y pass. What remains is a set of **verified visual defects (P0)**, a handful of **high-leverage UX gaps (P1)**, and a **polish/feature backlog (P2)**. No architectural change needed.

**Guardrails (unchanged from REDESIGN_EXECUTION_PLAN.md):** single file, zero deps, CSP intact, DIFF-CORE byte-identical to `src/diff-core.js`, all ~99 element IDs preserved, tests stay green.

---

## P0 — Verified defects (fix first)

### P0-1 · Pane-header tools overflow and get clipped
At ~1100–1300 px viewport, the per-pane button row (`Upload Paste Format Minify Copy Clear`) overflows: **Copy/Clear are cut off and unreachable** on both panes (`.pane` has `overflow: hidden`). Reproduced on the live site at 1176 px.
**Fix:** allow `.pane-tools { flex-wrap: wrap; row-gap: 4px }`, or collapse to icon-only buttons below ~1280 px (`.mini` text hidden, tooltip retained), or move overflow actions into a per-pane `⋯` kebab menu. Wrap is the cheapest safe fix.

### P0-2 · Sticky-offset collision when the toolbar wraps
`.toolbar { top: 62px }` and `.results-head { top: 132px }` are hardcoded to a **one-row** toolbar. Below ~1250 px the secondary group wraps to a second row (~150 px tall), and on scroll the stats chips and selbar slide **under** the toolbar — half-clipped "added/removed/changed" chips and a bleeding Generate-table button. Reproduced live.
**Fix options (pick one):**
- Measure at runtime: `ResizeObserver` on `.toolbar` → set `--toolbar-h` custom property → `.results-head { top: calc(62px + var(--toolbar-h)) }`.
- Or prevent the wrap: shorten labels / icon-only secondary buttons under 1280 px so the toolbar stays one row.
- Or make `.results-head` non-sticky whenever the toolbar is taller than one row (extend the existing ≤820 px static fallback upward).

### P0-3 · Stale results remain visible under an error banner
After a failed compare (invalid JSON), the previous diff — summary chips, counts, full tree — stays fully rendered below the error banner. Easy to misread old results as current. Reproduced live.
**Fix:** on `showError()` from a compare, either hide `#resultsWrap`, or add a `.stale` class (e.g. `opacity:.45; filter:saturate(.6); pointer-events:none` + an inline "showing previous result" note). Clear the class on the next successful render. Also mark stale when inputs are edited after a compare (the inputs-bar already knows the compared state).

### P0-4 · Parse-error UX: no location, no way to jump
Errors surface as a banner with the raw engine message ("Unexpected token '}' …"). In a 2 MB document the user has to hunt for the problem by eye. The editors have no line numbers; Raw view does.
**Fix (incremental):**
1. Extract line/column — wrap the failing parse with a position scanner (lenient parsers already track `pos`; for strict JSON parse the message position in Chromium/Firefox or re-scan) and show "line 14, column 7" in the banner.
2. Add a **"Jump to error"** button in the banner → focus the pane, `setSelectionRange` at the offset, scroll it into view.
3. (Stretch) transient error-line highlight via the existing highlight overlay `<pre>`.
This composes with the existing `offerRepair()` flow — repair stays first choice, jump is the fallback.

---

## P1 — High-leverage UX gaps

### P1-1 · Restore "Load sample" (first-run onboarding)
The README and the redesign plan both reference a sample button; the current build has none (`sampleBtn` gone). A first-time visitor faces two empty boxes. Add **Load sample** to the empty-state placeholder (alongside the existing tip) and optionally to the toolbar left group. One small built-in pair of documents exercising added/removed/changed/nested/array cases is enough. Update README if the toolbar copy changes.

### P1-2 · Gate controls per view
`#treeTools` is already hidden outside Tree view, but in Raw view the **legend** (incl. "Contains changes") and the **selection bar** (Select all / Generate table / JSON Patch) remain visible (verified live: both `display:flex` in raw mode) — none of which function there. The selection bar is only hidden for 3-Way.
**Fix:** in `renderView()`, also gate `.legend` and `#selbar` per mode (Tree/Table: shown; Raw: raw-toggle only; 3-Way: tw-stats only — already done for selbar). Wiring-only, no renderer changes.

### P1-3 · Resizable split panes (backlog Phase 6, promote)
Source/Target are locked 1fr/1fr. Comparing a small config against a large payload wastes half the width. Add a 6 px drag handle between panes → sets `grid-template-columns` via a custom property; double-click resets 50/50; persist ratio in prefs. Keyboard: handle focusable, ←/→ adjusts 5%.

### P1-4 · Scroll sync in Raw split view (backlog Phase 6, promote)
The two Raw panes scroll independently; padding rows already align them line-for-line, so syncing `scrollTop` (with a re-entrancy guard) is cheap and removes the main friction of the split view.

### P1-5 · Word-level (intra-line) highlight in Raw view
Changed lines are flagged whole-line; for long lines the actual change is invisible. For paired changed lines, run a char/word LCS and wrap differing spans in `<mark class="seg-add/seg-del">`. Cap at lines < 1,000 chars to protect performance. This is the single biggest readability win in Raw view.

### P1-6 · Nav counter initial state
`#navPos` shows "— / 6" until N/P is pressed. Initialize to `1 / 6` and highlight the first diff on render (or show `0 / 6` with the first Next press going to 1). Cosmetic but visible on every comparison.

### P1-7 · Mobile/narrow pass
Media queries exist (560/800/820/900 px) but the toolbar becomes a tall stack, pane tools cramp, and sticky headers consume most of a phone viewport. One focused pass: icon-only toolbar buttons, horizontal-scroll pane tools (`overflow-x: auto`), disable sticky results-head, and verify the filter bar wraps cleanly at 390 px.

---

## P2 — Polish & feature backlog

| # | Item | Notes |
|---|------|-------|
| P2-1 | **Editor line numbers + current-line tint** | Extend the existing highlight-overlay technique with a gutter; respect the 80 k-char highlight cutoff. Pairs with P0-4. |
| P2-2 | **Filter presets** (All/Added/Removed/Changed chips) | Planned in redesign Phase 2/3, never shipped (`filter-presets` absent). The three checkboxes work; presets are one-tap ergonomics. |
| P2-3 | **"Contains changes" tree filter** | Synthetic container state — needs tree-level filtering, per Phase 6 note. |
| P2-4 | **Copy actions in virtual table rows** | `rowActsHTML` is in all four renderers now — verify hover affordance works in virtual mode and add `.vt-row:hover` reveal if missed. |
| P2-5 | **Diff minimap / density gutter** | For 10k+ row diffs; align with virtualizer row index. |
| P2-6 | **Library bulk export/import** | localStorage is fragile (README already warns); one button to download all saved comparisons as a single file, and re-import. |
| P2-7 | **Standalone HTML report export** | "Generate table" covers snippets; a self-contained report (summary + selected/all changes, both themes) is shareable with non-users. |
| P2-8 | **Share-URL length guard** | Warn when the encoded fragment exceeds ~64 KB (browser/chat-app URL limits) and suggest Save session instead. |
| P2-9 | **`prefers-reduced-motion`** | Wrap `inputsBarIn`, flash outline, spinner transitions in a `@media (prefers-reduced-motion: reduce)` guard. |
| P2-10 | **`aria-keyshortcuts`** | Add to Compare, Next/Prev, help button — complements the shortcuts popover. |
| P2-11 | **Ignore-paths (glob)** | `ignoreKeys` matches key names globally; power users want `$.meta.*.updatedAt`-style path patterns. Touches DIFF-CORE → must mirror to `src/diff-core.js` + Python CLI + parity test. Schedule deliberately. |

---

## Maintenance & docs hygiene

1. **Two diverging 3.6 k-line files.** `index.html` = `json_compare.html` + feedback widget (+ relaxed CSP). Manual sync will drift. Either (a) document the rule "edit `json_compare.html`, re-apply the feedback patch" in CHANGELOG/README, or (b) add a tiny build script (still zero runtime deps) that injects the feedback block + CSP line to produce `index.html`. A parity test à la diff-core (assert the two files are identical outside the FEEDBACK markers) makes drift impossible.
2. **README drift:** still advertises "Load sample" (removed) — fix via P1-1 or edit the text. If the deployed page keeps the feedback form, footnote the privacy claim for `index.html` ("the only network call is the feedback form, and only when you submit it"); the claim remains fully true for `json_compare.html`.
3. **Plan-doc drift:** REDESIGN_EXECUTION_PLAN.md describes filter presets and `phCompare`/`phSample` empty-state buttons as implemented — they aren't. Mark them as backlog (now P2-2 / P1-1).

---

## Phase D — Productization (added 2026-06-10, post A–C validation)

A professional-site feature audit: the diff *features* are competitive; what's missing is the packaging around them. Verified absent from the repo: favicon, meta description, OG tags, footer, LICENSE, PWA manifest.

### D-ADD (missing, prioritized)

| # | Item | Detail |
|---|------|--------|
| D-1 | **Site identity meta** | Favicon (inline SVG data-URI to stay single-file), `<meta name="description">`, Open Graph + Twitter card tags, `theme-color`. Both files. ~30 min, highest visibility-per-effort. |
| D-2 | **Footer / About** | Slim footer: version (from CHANGELOG), GitHub link, license name, and the privacy guarantee ("your data never leaves your browser") — currently README-only, it's the strongest selling point and invisible in the app. For `index.html`, footnote the feedback-form exception. |
| D-3 | **LICENSE file** | None exists — repo is legally "all rights reserved". Pick MIT (or Apache-2.0) and reference it in the footer + README. |
| D-4 | **Help / About modal** | The `?` popover covers shortcuts only. Add a Help dialog (reuse modal + focus-trap infra) explaining the four views, the Options (keyed arrays, tolerance, ignore keys, formats), session vs library vs share, and the privacy model. |
| D-5 | **PWA manifest** | The tool is already fully offline — add `manifest.json` + icons so it's installable. Keep `json_compare.html` self-contained (manifest only linked from `index.html`). |
| D-6 | **Editor line numbers** (= P2-1) | The one table-stakes competitor feature still missing. Gutter via the existing highlight-overlay technique; respects the 80 k-char cutoff; pairs with jump-to-error. |
| D-7 | **Full diff report export** (= P2-7) | One-click export of the *entire* diff (not just selected rows) as Markdown / standalone HTML — for PR descriptions and tickets. Reuse the Generate-table serializers. |

### D-REMOVE / demote (feature-creep trims)

| # | Item | Action |
|---|------|--------|
| D-8 | **3-Way tab** | Half a feature: classifies conflicts but can't resolve or export a merge. Either add "export merged result" or demote it out of the primary tab row (e.g. enabled only when a Base doc is provided). Decide; don't leave as-is. |
| D-9 | **Library folders** | Folder create/rename/move/delete on top of fragile localStorage is heavy. Keep saved comparisons + Recent; replace folder management with a simple name search. Migrate existing folders gracefully (flatten, keep names as prefix). |
| D-10 | **"Unordered arrays" toolbar checkbox** | Move into the Options panel — it's the only diff option promoted to the toolbar (inconsistent, costs wrap space). Keep the persisted pref key. |
| D-11 | **Minify pane buttons** | Cut from the pane tool row (or fold into a per-pane ⋯ menu). Editing-for-size is out of scope for a diff tool; the row is the most crowded strip in the UI. |

**Explicitly keep (differentiators):** offline/single-file privacy, auto-repair, JSONC/JSON5/NDJSON tolerance, big-number warning, JSON Patch export, shareable Markdown/TSV/rich tables, 50 MB worker + virtualization. D-2/D-4 are where these get said out loud.

### Phase D execution prompt (ready to paste)

```
Read ENHANCEMENT_PLAN.md, section "Phase D — Productization", and the guardrails
in REDESIGN_EXECUTION_PLAN.md. Execute Phase D in two commits:

Commit 1 — D-ADD (D-1…D-7):
- Inline SVG favicon (data URI), meta description, OG + Twitter tags, theme-color
  in BOTH json_compare.html and index.html.
- Slim footer: app version, GitHub repo link, license name, privacy line
  ("Your data never leaves your browser"); in index.html add the feedback-form
  footnote. Keep it one row, muted, responsive.
- Add MIT LICENSE file; reference it in footer + README.
- Help/About modal (reuse existing modal + installFocusTrap): views overview,
  Options explained, session vs library vs share, privacy model. Link it from
  the existing help button alongside the shortcuts popover.
- PWA manifest.json + icons, linked ONLY from index.html (json_compare.html
  stays fully self-contained).
- Editor line-number gutter using the existing highlight-overlay technique
  (respect the 80k-char highlight cutoff; align with textarea scroll).
- "Export report" button next to Generate table: whole-diff export as Markdown
  and standalone HTML, reusing the existing serializers.

Commit 2 — D-REMOVE (D-8…D-11):
- 3-Way: keep the engine, but only show the tab when the Base pane has content
  (or a "3-way" toggle in Options enables it). Update Help text.
- Library: remove folder management UI; flatten existing folders into
  "FolderName / ItemName" labels; add a name-search input. No data loss.
- Move the "Unordered arrays" checkbox from the toolbar into the Options panel
  (same id + persisted pref).
- Remove Minify from pane tool rows (keep Format).

Rules: single file, zero runtime deps; json_compare.html CSP stays
connect-src 'none'; DIFF-CORE byte-identical; do not rename existing IDs
(removing an element removes its listeners — guard with existence checks).
After each commit: regenerate index.html from json_compare.html + feedback
delta, npm test green (incl. parity tests), node --check, update CHANGELOG.md
and README.md, manual check at 1440/820/390 px in both themes, and confirm
file:// load of json_compare.html makes zero network requests.
```

**Settings:** Claude Sonnet 4.6, medium effort for Commit 1 (mechanical packaging); Opus 4.8 or high effort for Commit 2 (removals touch wiring — listeners, prefs migration, library data).

---

## Suggested phasing

| Phase | Scope | Effort |
|-------|-------|--------|
| **A** | P0-1 … P0-4 + P1-6 (defects, error UX) | ~1 day ✅ |
| **B** | P1-1, P1-2, P1-7 (onboarding, view gating, mobile) | ~1 day ✅ |
| **C** | P1-3, P1-4, P1-5 (split panes, scroll sync, word-level diff) | 1–2 days ✅ |
| **D** | Productization: D-1…D-11 above (+ remaining P2 picked opportunistically) | 1–2 days |

## Verification (every phase)

- `npm test` green; **diff-core parity** test passes (no edits inside DIFF-CORE except P2-11, which requires mirroring all three copies).
- No duplicate/renamed IDs (structural smoke).
- `node --check` on extracted script.
- Manual: light + dark, 1440 / 1176 / 820 / 390 px, scroll-with-sticky-headers, keyboard-only walkthrough, `file://` load of `json_compare.html` with DevTools network tab proving zero requests.
- Sync any user-visible change to README + CHANGELOG, and re-apply/regenerate `index.html`.
