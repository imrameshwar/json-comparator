# Execute the Competitive Roadmap — Master Prompt

Use this to drive `COMPETITIVE_ROADMAP.md` with an AI agent. Two ways to run it:

- **One task at a time (recommended):** paste the master prompt and set `TASK:` to a single ID (e.g. `E-1`).
- **A whole phase / the lot:** set `TASK:` to a range (e.g. `E-1..E-5`) or `Phase E`. The agent does them in order, stopping for review after each.

The per-task prompts already embedded in `COMPETITIVE_ROADMAP.md` still work standalone; this master prompt is the orchestrator that adds the loop, checkpoints, and reporting.

---

## Master prompt (copy-paste)

```
Act as a senior engineer working on the JSON Comparator in this repository.

CONTEXT — read first:
- COMPETITIVE_ROADMAP.md  → Guardrails, the task status tracker, and each task's scope + "Done when".
- COMPETITIVE_ANALYSIS.md → why each task matters.
Do not re-derive the plan; execute it as written.

SCOPE FOR THIS RUN:
TASK: <one ID like E-1, a range like E-1..E-5, or "Phase E">

OPERATING RULES:
1. Work tasks in tracker order. Before each task, confirm its dependencies (column "Depends on") are
   done; if a dependency is missing, STOP and tell me.
2. Honor EVERY guardrail in COMPETITIVE_ROADMAP.md. In particular:
   - json_compare.html stays a single file, zero runtime deps, openable via file://, CSP connect-src 'none'.
   - If a task is flagged "DIFF-CORE: YES", mirror the change identically across the inline DIFF-CORE block
     in json_compare.html, src/diff-core.js, and json_compare.py, and keep tests/diff-core-parity.test.js green.
     If it's flagged "No", do not touch the DIFF-CORE block at all.
   - No new network calls in json_compare.html. Anything needing the network is index.html-only and opt-in.
   - Preserve existing element IDs (guard removed elements with existence checks).

PER-TASK LOOP (repeat for each task in scope):
  a. Restate that task's "Done when" bullets and outline your approach in 3–5 bullets. Pick sensible
     defaults for anything ambiguous and state them — don't wait unless a decision is genuinely blocking.
  b. Implement only that task. Note any follow-ups you discover; do not start them.
  c. Run and PASTE output for: `npm test` (incl. diff-core-parity, index-parity, parity), `npm run lint`,
     `node --check` on the extracted script, and `pytest` if Python changed.
  d. If the UI changed, regenerate index.html from json_compare.html + the FEEDBACK delta and confirm
     tests/index-parity.test.js passes.
  e. Confirm pass/fail for EACH "Done when" bullet explicitly.
  f. Update CHANGELOG.md and README.md for any user-visible change, and flip this task's Status in the
     COMPETITIVE_ROADMAP.md tracker table (☐ todo → ✅ done).
  g. Give a one-paragraph summary (what changed + why) and the list of files touched.

CHECKPOINT:
- After EACH task, stop and wait for my "continue" before starting the next one in the range.
- If any test/lint/check is red and you can't make it green within the task's scope, STOP and report —
  do not weaken or skip tests, and do not edit the DIFF-CORE block to force parity.

DELIVER per task: approach → code changes → command output → Done-when pass/fail → docs/tracker updated → summary.
```

---

## Notes
- **Start here:** `TASK: E-1` (lowest risk, highest daily value). Phase E is all UI-only.
- **Model/effort:** each task in `COMPETITIVE_ROADMAP.md` recommends one (Sonnet 4.6 for mechanical, Opus 4.8 / high for engine or correctness-sensitive work). Match it.
- **Highest-risk tasks:** F-4 and G-3 touch DIFF-CORE — run them alone, never batched, and watch the parity test.
- **Autonomous variant:** to let it run a whole phase without stopping between tasks, replace the CHECKPOINT block with: "Proceed through all tasks in scope without pausing; stop only on a red test/lint/check or a missing dependency, and give one consolidated report at the end." Use this only when you're comfortable reviewing a larger diff at once.
