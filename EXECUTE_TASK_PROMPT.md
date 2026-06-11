# Task Execution Prompt

Use this to execute one task from `DEVELOPMENT_PLAN.md` at a time. Copy the template, fill the four blanks, paste it as your message.

---

## Template

```
Act as a senior engineer working on the JSON Comparator in this folder.
Read DEVELOPMENT_PLAN.md and PRODUCTION_PLAN.md for context, then execute exactly ONE task:

TASK: <task id + title, e.g. "T1 — Stand up tooling: tests, lint, CI">

Rules:
- Scope: do only this task. If you discover follow-up work, note it; do not start it.
- Respect dependencies: confirm the blocking tasks are done before starting. If a dependency is missing, stop and tell me.
- Before coding: restate the task's "Done when" criteria and outline your approach in 3–5 bullets. Wait for nothing unless a decision is genuinely ambiguous — pick the sensible default and note it.
- Keep the project's value props intact: zero-dependency where possible, single-file web app stays openable via file://, CLI/web parity.
- After coding: run the tests/lint, paste the output, and show a summary of files changed.
- Verify against every "Done when" bullet and state pass/fail for each.
- Update the tracker: mark this task in_progress at start, completed at end.
- Keep changes minimal and reviewable; don't refactor unrelated code.

Deliver: the code changes, test output, and a one-paragraph summary of what changed and why.
```

---

## Ready-to-run: T1

```
Act as a senior engineer working on the JSON Comparator in this folder.
Read DEVELOPMENT_PLAN.md and PRODUCTION_PLAN.md for context, then execute exactly ONE task:

TASK: T1 — Stand up tooling: tests, lint, CI

Do this:
- Add package.json with a JS test runner (Vitest) and a linter (ESLint).
- Add Python testing via pytest; create tests/ and fixtures/ directories.
- Add a CI workflow (GitHub Actions) that runs JS tests + Python tests + lint on every PR and blocks merge on failure.
- Add one trivial smoke test on each side (JS + Python) so the pipeline proves green.

Constraints:
- Don't change json_compare.html or json_compare.py behavior — this task is tooling only.
- Keep the web app openable directly via file:// (no build step required to use it).

Done when:
- `npm test`, `pytest`, and lint all run green locally on the smoke tests.
- CI config is present and runs the same three checks.

After coding: paste the command output for npm test / pytest / lint, list files added, confirm each "Done when" bullet, and update the tracker (T1 → completed).
```

---

## Tips
- One task per session keeps context tight and diffs reviewable.
- For the keystone refactor (T2), add: "Do not change observable diff results yet — this is a pure refactor; the parity/fixture tests must still pass."
- For bug-fix tasks (T4–T9), add: "Write the failing test first (red), then make it pass (green)."
- The only task with no blockers right now is **T1** — start there.
