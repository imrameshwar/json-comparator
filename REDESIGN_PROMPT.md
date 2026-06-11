# Execution Prompt — JSON Comparator UX/UI Redesign

> Paste the block below to a coding agent (Claude Code / Cowork / etc.) working in the `json-comparator` repo.
> It is self-contained and references `REDESIGN_EXECUTION_PLAN.md` for the detailed steps.

---

You are a senior product designer + senior frontend engineer working in this repo. The app is `json_compare.html` — a single, self-contained, zero-dependency, offline JSON diff tool. It is feature-rich but the UX/UI needs to reach best-in-class developer-tool quality. Execute the redesign described in `REDESIGN_EXECUTION_PLAN.md`.

**Hard constraints (do not violate):**
- Keep it a **single self-contained `json_compare.html`** — no build step, no external requests, no new dependencies. The CSP meta tag must stay intact.
- **Never edit the `DIFF-CORE` block** (between `/* ===== DIFF-CORE:START */` and `/* ===== DIFF-CORE:END ===== */`). It must remain byte-identical to `src/diff-core.js` (`tests/diff-core-parity.test.js` enforces this).
- **Do not rename any element ID** — the wiring depends on them. Regroup and restyle freely.
- Back up first: `cp json_compare.html json_compare.BACKUP.html`.

**Do this, in order:**
1. Recon: read `<style>`, `<body>`, and `<script>` so you understand the four renderers (`renderTable`, `renderTreeNode`, `_tableRowHTML`, `_virtTreeRowHTML`) and the `render() → _applyDiffResult() → renderView()` flow.
2. **CSS (Phase 1):** spacing tokens + wider `--maxw`; sticky `.toolbar`; grouped `.pane-tools` + `.side-tag`; upgraded `.stat`/`.diff-total` + sticky `.results-head`; hover `.row-actions`/`.row-act`; `.filter-presets`; `.shortcuts-pop`; empty-state polish; `@media (max-width:820px)` fallback.
3. **HTML (Phase 2):** `#helpBtn` in appbar; rebuild 3 pane headers (side tags, grouped tools, Upload button, hidden `.pane-file` input each); wrap actions in a sticky `.toolbar` with a left primary group (Compare/Sample/Swap) and a right demoted secondary group (Unordered/Options · Save/Load/Share); add filter `.filter-presets` chips; richer empty state with `#phCompare`/`#phSample`; add `#shortcutsPop`.
4. **JS (Phase 3, outside DIFF-CORE):** store `node.path` (+ subtree value) in `changeToNode`; add `rowActsHTML()` and call it in all four renderers; add a delegated `.row-act` copy handler at the top of the `#results` click listener; per-pane file upload; filter-preset wiring + `syncPresetActive()`; diff summary total + unchanged count; empty-state button wiring; shortcuts popover (`#helpBtn`, `?` key, click-outside, `Esc`); fix the broken "nothing to show" empty-state copy.

**Verify before finishing (all must pass):**
- DIFF-CORE parity: the block in `json_compare.html` matches `src/diff-core.js` exactly.
- No duplicate static IDs; all original critical IDs still present; new elements present.
- `node --check` on the extracted `<script>` body passes.
- Real `diff` over `fixtures/*` shows every non-equal change carries a string `.path`.
- `npm test` (if the registry is reachable) is green.
- Manually open the file: sticky toolbars, prominent Compare CTA, pane upload, hover copy-path/value, filter presets, summary total, `?` shortcuts, dark mode, and <820px layout all work.

Report a concise summary of what changed and the verification results. If `npm test` can't run (blocked registry), say so and rely on the programmatic checks above.
