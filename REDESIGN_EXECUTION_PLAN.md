# JSON Comparator — UX/UI Redesign Execution Plan

**Target file:** `json_compare.html` (single self-contained file)
**Goal:** Transform a feature-rich-but-cluttered JSON diff tool into a best-in-class developer experience **without** breaking the zero-dependency, offline, single-file architecture or the passing test suite.
**Status:** This plan documents the redesign that was implemented. Use it to (a) reproduce the change from a clean `json_compare.html`, (b) review it as a PR plan, or (c) extend it (see Phase 6 backlog).

---

## Guardrails (read first — non-negotiable)

1. **Single file, zero dependencies.** All work stays inside `json_compare.html`. No build step, no external requests, no new libraries. The Content-Security-Policy meta tag (`connect-src 'none'`) must remain intact.
2. **Do NOT touch the `DIFF-CORE` block.** Everything between `/* ===== DIFF-CORE:START ... */` and `/* ===== DIFF-CORE:END ===== */` must stay **byte-identical** to `src/diff-core.js`. `tests/diff-core-parity.test.js` extracts and compares it — any edit fails CI.
3. **Preserve all element IDs and event-listener contracts.** The wiring depends on ~99 static IDs. Regroup/restyle freely, but do not rename IDs (`compareBtn`, `results`, `stats`, `segTree`, `ftAdded`, etc.).
4. **Keep core logic in the worker/parsers untouched.** Only the presentation (CSS), structure (HTML body), and rendering/wiring JS outside the core block change.
5. **Back up before editing:** `cp json_compare.html json_compare.BACKUP.html`.

---

## Phase 0 — Codebase recon (understand before changing)

- Map the file: `<style>` (design tokens, themes, components), `<body>` (appbar → panes → actions → results → modals), `<script>` (DIFF-CORE block, lenient parsers, tree derivation, rendering, state+wiring, selection/export, share URL, session, library, a11y, prefs).
- Note the **four renderers** that must stay consistent: `renderTable`, `renderTreeNode`, `_tableRowHTML` (virtual table), `_virtTreeRowHTML` (virtual tree).
- Note the central render flow: `render()` → worker/sync → `_applyDiffResult()` → `renderView()` (view switch, filter, virtualization).
- Confirm which tests read the HTML: only `diff-core-parity.test.js`. `highlight.test.js` inlines its own copy. `accessibility.test.js` is pure logic.

---

## Phase 1 — Visual system (CSS)

In `<style>`:

1. Add a spacing scale and wider layout token to `:root`:
   `--s1..--s6` (4/8/12/16/24/32px) and `--maxw: 1320px`. Point `.wrap` and `.appbar-inner` at `--maxw`. Trim appbar padding to `14px` and raise its `z-index` to 30.
2. **Sticky compare toolbar.** Add a `.toolbar` rule: `position: sticky; top: 62px; z-index: 18;` with translucent blurred background, border, radius, shadow. Add helpers: `.tb-group`, `.tb-spacer` (flex:1), `.tb-divider`, `.tb-secondary`.
3. **Pane header.** Add `.pane-tools` (right-aligned flex), `.side-tag` (small uppercase label), give `.mini` buttons icon support and slightly larger hit area.
4. **Diff summary.** Add `.diff-total` (bold leading number) and `.stat.unchanged`; bump `.stat .n` weight/size; make `.results-head` sticky (`top: 132px; z-index: 16`).
5. **Row copy actions.** `.row, .trow, .vt-row { position: relative; }`; add `.row-actions` (absolute, right, `display:none`, revealed on `:hover`/`:focus-within`) and `.row-act` buttons.
6. **Filter presets:** `.filter-presets` segmented chip group with `.active` state.
7. **Shortcuts popover:** `.shortcuts-pop` fixed panel with `<dl>`/`<kbd>` styling.
8. **Empty-state polish:** `.state-actions`, `.state .hint`.
9. **Responsive fallback** `@media (max-width: 820px)`: make `.toolbar` and `.results-head` static, hide `.pane-head .count`.

**Checkpoint:** open the file in a browser; layout intact in light + dark, ≥820px and <820px.

---

## Phase 2 — Structure & IA (HTML body)

1. **Appbar:** add `#helpBtn` (question-mark icon) before the save button.
2. **Pane headers (×3 — source, target, base):** wrap name + `.side-tag` ("before"/"after"/"ancestor"); move count + buttons into `.pane-tools`; reorder to `Upload, Paste, Format, Minify, Copy, Clear` (base omits Minify); add a hidden `<input type="file" class="pane-file" data-target="…" hidden>` per pane.
3. **Action bar → sticky toolbar:** wrap `.actions` in `.toolbar`. Left `.tb-group`: Compare (primary), Load sample, Swap. Then `.tb-spacer`. Right `.tb-secondary`: Unordered checkbox, Options, `.tb-divider`, Save, Load, Share (shorten labels). Keep the hidden `#sessionFile` input and all IDs.
4. **Filter bar:** add a `.filter-presets` group (All/Added/Removed/Changed) with `data-preset` attributes; improve input placeholders.
5. **Empty state:** add `#phCompare` + `#phSample` buttons and a `<kbd>` shortcut hint.
6. **Shortcuts popover:** add `#shortcutsPop` dialog near `#toast`.

**Checkpoint:** no duplicate IDs; all original IDs still present.

---

## Phase 3 — Power-user features & wiring (JS, outside DIFF-CORE)

1. **Tree node path:** in `changeToNode`, set `node.path = ch.path` in both branches; for added/removed subtree roots also set `node[side] = value` so whole-subtree copy works.
2. **Shared copy control:** add `rowActsHTML(o)` helper (returns "" when `!o.path`) producing `.row-actions` with copy-path / copy-value buttons (strings copied raw, objects/arrays as compact JSON, all `escapeHtml`-escaped). Append its output in all four renderers.
3. **Delegated copy handler:** at the very top of the `#results` click listener, `closest('.row-act')` → `copyText(...)` → `stopPropagation()` + return (before toggle/select logic).
4. **Per-pane upload:** handle `data-act="upload"` in the `.mini` handler (clicks the matching `.pane-file`); add a `.pane-file` change handler that reads the file as text into the pane, updates counts/highlight, toasts, and re-renders if already compared. Enforce the 50 MB limit.
5. **Filter presets:** add `syncPresetActive()`; wire preset buttons to set `ftAdded/ftRemoved/ftChanged`; call `syncPresetActive()` from the type-checkbox change handlers and `clearFilter`.
6. **Diff summary:** in `_applyDiffResult`, count `equal` too; render a leading `.diff-total` and an optional `.stat.unchanged`.
7. **Empty-state actions:** wire `#phCompare`/`#phSample` to click `#compareBtn`/`#sampleBtn`.
8. **Shortcuts popover:** `toggleShortcuts()`; wire `#helpBtn`, outside-click close, and `?` key (when not typing); close on `Esc`.
9. **Bug fix:** correct the broken "all fields / nothing to show" copy in `emptyState()`.

---

## Phase 4 — Verification

Run all of these and require PASS:

1. **DIFF-CORE parity** (the one HTML-reading test):
   extract lines between `===== DIFF-CORE:START` and `===== DIFF-CORE:END` from both `src/diff-core.js` and `json_compare.html`; assert identical.
2. **Structural smoke:** no duplicate static IDs; all critical IDs preserved; new elements present (`helpBtn`, `shortcutsPop`, `phCompare`, `phSample`, 3× `pane-file`, 3× upload, 4× preset).
3. **JS syntax:** extract the `<script>` body and run `node --check`.
4. **Data contract:** run real `diff` (`src/diff-core.js`) over `fixtures/*`; assert every non-equal change has a string `.path` and `rowActsHTML` yields valid markup.
5. **Full suite (local, needs npm registry access):** `npm install && npm test` — expect green.
6. **Manual visual:** open in a browser; verify sticky toolbars, primary CTA prominence, pane upload, copy path/value (hover a diff row), filter presets, summary total, `?` shortcuts, dark mode, and <820px layout.

---

## Phase 5 — Rollback

If anything regresses: `cp json_compare.BACKUP.html json_compare.html`. Because all changes are additive/structural and the core block is untouched, partial revert of a single phase is also safe.

---

## Phase 6 — Optional backlog (not yet implemented)

- **Resizable split panes** (draggable divider; persist ratio).
- **Scroll/selection sync** between left/right in Raw split view.
- **Copy path/value in the virtual table** rows (currently virtual tree + both non-virtual renderers have it; virtual table omitted to avoid touching the perf-hot path — revisit if needed).
- **"Contains changes" filter** for the tree (note: it's a synthetic container state, not a `Change.op`, so it needs tree-level filtering rather than reusing the change-type filter).
- **Inline minimap / diff density gutter** for very large diffs.

---

## Appendix — Execution prompt

A ready-to-paste prompt for handing this to a coding agent is in `REDESIGN_PROMPT.md`.
