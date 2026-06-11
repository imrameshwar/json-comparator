# JSON Comparator

A self-contained toolkit for comparing two JSON documents and seeing exactly what changed — added, removed, changed values, and type changes — with both a polished web UI and a command-line script.

> **🔒 Your data never leaves your browser.**
> `json_compare.html` is a fully offline, zero-dependency single file. It makes no network requests, stores no data on any server, and works entirely from `file://` URLs with no install or build step required. The Content Security Policy header (`connect-src 'none'`) enforces this at the browser level. The only time data touches a network is if you explicitly use the **Share URL** feature — which embeds both documents verbatim in the URL fragment and shows a privacy warning before doing so.

## License

MIT — see [LICENSE](LICENSE).

---

## What's in this folder

| File | What it is |
| --- | --- |
| `json_compare.html` | The web app. A single self-contained file — no install, no server, no internet. Just open it in a browser. |
| `index.html` | The GitHub Pages build: `json_compare.html` + a feedback widget (the only difference). |
| `json_compare.py` | A zero-dependency command-line comparator (Python 3). Handy for scripts and CI. |
| `manifest.json` | PWA manifest linked from `index.html` (makes the hosted page installable). |
| `icons/` | SVG app icons for the PWA manifest. |
| `source.json` | Starter "source" document (empty `{}` — fill it in). |
| `target.json` | Starter "target" document (empty `{}` — fill it in). |
| `README.md` | This guide. |

---

## Web app — `json_compare.html`

### Getting started

Double-click `json_compare.html` to open it in your default browser. Paste JSON into the **Source** and **Target** panes and press **Compare** (or `Ctrl/Cmd + Enter`).

New here? Press **Load sample** — in the empty state or the toolbar — to drop in a built-in example (added / removed / changed / nested / array cases) and see a comparison instantly.

If a pane isn't valid JSON, the error banner names the **line and column** of the problem and offers a **Jump to error** button that takes you straight to it (and, when it can, offers to auto-repair the document instead).

### Features

**Ways to view the diff**

- **Tree view** (default) — the JSON structure as a collapsible tree. Every node is color-coded: green = added, red = removed, amber = a changed value, and violet = *contains changes* (any parent whose descendants differ, however deep). Each container shows a badge counting the changes inside it. Unchanged branches auto-collapse so you land on the differences.
- **Table view** — a flat list of every change with its path, e.g. `$.address.geo.lng`.
- **Raw view** — a side-by-side (or unified) text diff of the two documents, pretty-printed. Changed lines are highlighted, and within each changed line a **word-level diff** marks just the parts that actually differ, so the real change stands out even on long lines. The two side-by-side columns **scroll in sync**. Use the Split / Unified toggle in the view's header to switch layouts.

**Differences only / All fields** — toggle between showing just the changes or every field including unchanged ones.

**Select rows and generate a shareable table** — tick the checkboxes next to any changes (a parent checkbox selects its whole branch), then press **Generate table** to get a clean table you can copy as:

- **Markdown** — for GitHub, Jira, Notion.
- **Rich HTML** — pastes formatted into Google Docs, Gmail, Slack.
- **TSV** — drops straight into Excel / Google Sheets columns.
- **CSV download**.

**Save & reload comparisons (Library)** — the bookmark icon saves the current comparison (with a name); the folder icon opens your library. Use the search box to find saved items by name. Click any saved item to reload both documents and view settings instantly. Saved comparisons live in the browser's local storage and persist between sessions.

**Save / Load session files** — **Save session** downloads a single `.json` bundling both documents plus your settings. **Load session** (or just drag a `.json` file onto the page) restores everything. This is the portable backup — share it or move it between machines. Import also accepts a plain `[source, target]` array.

**Share URL** — the share icon (toolbar, next to Load) encodes both documents and all settings into the URL fragment (`#state=…`) so anyone with the link can open the exact same comparison. Nothing is sent to a server — the data lives entirely in the URL. A privacy notice is always shown before copying. If the encoded fragment would exceed **64 KB** (where many chat apps and browsers silently truncate URLs), an additional warning appears and the dialog suggests **Save session** as the more reliable alternative. You can still proceed regardless.

**Export full diff report** — the **Export report ▾** button next to Generate table downloads the entire diff (all changes, not just selected rows) as a Markdown file (for GitHub/Jira/Notion) or a standalone HTML file (a self-contained page with summary chips and styled table, ready to attach to a ticket or PR).

**Editor line numbers** — each input pane shows line numbers in a gutter that scrolls in sync with the editor. Numbers hide automatically for very large files (>80 k chars) where syntax highlighting is also disabled. Enable the **"Force highlight on large inputs"** toggle in Options to override this cutoff (see below).

**Per-pane tools** — each input has **Upload**, **Paste**, **Format** (pretty-print with the chosen indent), **Sort** (recursively alphabetise object keys; arrays untouched), **Minify** (collapse to single-line JSON), **Copy**, and **Clear**. **Swap** exchanges source and target. Drag the **divider** between the two editors to give more width to the larger document — double-click it to reset to 50/50, or focus it and use ← / → (5% steps) and Home / End. The split is remembered between sessions.

**Format indent** — the Options panel includes a **Format indent** selector (2 spaces · 3 spaces · 4 spaces · Tab). The chosen indent is used by both **Format** and **Sort**; **Minify** always produces single-line JSON. Default is 2 spaces. The preference persists across reloads.

**Force highlight on large inputs** — the Options panel includes a **"Force highlight on large inputs (⚠ perf)"** checkbox. By default, syntax highlighting and line-number gutters are disabled for inputs exceeding 80 000 characters to protect browser performance. Checking this box overrides the cutoff and re-enables highlighting regardless of file size — useful when you need to inspect a large file and can accept a slower browser. The tooltip on the checkbox restates the trade-off. The preference persists across reloads.

**Find in document (`Ctrl/Cmd+F`)** — opens an in-app find bar (the browser's native find is suppressed). Type to highlight all matches in the active surface — either a focused input pane or the diff results. Use **Enter** / **▼** for next match, **Shift+Enter** / **▲** for previous; both wrap around. A `n / total` counter tracks your position. **Aa** toggles case-sensitivity. **Esc** closes the bar and clears highlights. For large inputs (>80 k chars) where syntax highlighting is disabled, the bar still scrolls to each match even though overlay marks are not shown.

**JSONPath query bar** — click **Query** in any pane header (Source, Target, or Base) to open a per-pane query bar. Type a JSONPath expression and press **Enter** or **Run**. All matches are listed with their path (e.g. `$.store.book[0].price`) and a value preview; click any match to jump directly to that location in the JSON text. Press **✕** or **Escape** to close.

Supported JSONPath subset (v1): `$` root · `.key` / `['key']` child · `[n]` array index (negative from end) · `[n:m:s]` slice · `[*]` / `.*` wildcard · `..key` / `..*` recursive descent · `[?(@.key)]` existence filter · `[?(@.key OP val)]` comparison filter (`==` `!=` `<` `>` `<=` `>=`; val = number, `'string'`, boolean, null) · `['a','b']` union. Not supported (follow-up): JMESPath / jq, script expressions, nested boolean filters.

**JSON Schema validation** — press **Schema** in the toolbar to open the validation panel. Paste or upload a JSON Schema, then press **Validate both** (or Source/Target only). Each violation is listed with its JSON Pointer path (e.g. `$/user/age`) and a human-readable message; click **Jump** to scroll the pane to that location. Validates against a **draft-07 subset** implemented as a hand-rolled, dependency-free validator with no network requests.

Supported keywords: `type`, `required`, `properties`, `additionalProperties`, `minProperties`/`maxProperties`, `items` (single or tuple), `additionalItems`, `minItems`/`maxItems`, `uniqueItems`, `minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum`, `multipleOf`, `minLength`/`maxLength`, `pattern`, `enum`, `const`, `allOf`/`anyOf`/`oneOf`/`not`, `if`/`then`/`else`, internal `$ref` (`#/definitions/…` and `#/$defs/…`). Unsupported keywords (including `format`, `patternProperties`, remote `$ref`) are silently ignored — they produce no crash and no false violations.

**Help & About** — the `?` button opens a keyboard-shortcuts popover with a "Help & About…" link that opens a full help dialog: views overview, Options explained, JSON Schema validation, Session vs Library vs Share, and the privacy model.

**Ignore paths (F-4)** — the Options panel includes an "Ignore paths" textarea (one pattern per line). Any change whose path matches a pattern is excluded from the diff entirely. Patterns use a JSONPath-like syntax:

- `$` is the root.
- `.key` matches an object key; `[n]` matches an array index by number.
- `*` (written as `.*` for keys or `[*]` for indices) matches **any single segment** — one key name or one array index.
- Pattern length must equal the target path depth; there is no `**` recursive wildcard in v1.

Examples:

| Pattern | What it suppresses |
|---|---|
| `$.meta.*.updatedAt` | the `updatedAt` field under any direct child of `.meta` |
| `$.items[*].ts` | the `ts` field on every element of the `items` array |
| `$.version` | the top-level `version` key |

The same logic is available in the CLI as `--ignore-path PATTERN` (repeatable):

```bash
python3 json_compare.py src.json tgt.json \
  --ignore-path '$.meta.*.updatedAt' \
  --ignore-path '$.items[*].ts'
```

**3-Way merge + export (F-3)** — paste a common ancestor in the Base pane to unlock the 3-Way tab. Each path is classified as left-only, right-only, both-same (all auto-merged), or **⚡ Conflict**. Click **L / B / R** on each conflict row to pick the winning value (Left / Base / Right; default is Left). When all conflicts are resolved, click **⬇ Download** or **⎘ Copy** in the "Export merged" bar to get the final merged JSON. Choices persist for the session. Limitation: multiple array-element deletions in the same array may shift subsequent indices — review the output for those cases.

**Other** — light/dark theme toggle, live character counts, and an "Unordered arrays" option in the Options panel that ignores order when comparing scalar arrays.

### Behaviors to be aware of

**Empty pane / `null` semantics** — if a pane is left empty it is treated as JSON `null`. Comparing `null` vs an object reports a single `type_changed` difference. Comparing two empty panes reports no differences.

**Array matching** — ordered arrays of *scalars* (strings, numbers, booleans) are diffed using LCS (Longest Common Subsequence). A single insertion at the front of a 10-element array reports one `added`, not 10 `changed`. Arrays that contain objects or mixed types use positional comparison by default; use the `--array-key` CLI option (or `keyBy` in the JS API) for key-based matching of object arrays.

**Big-number precision warning** — JavaScript's `JSON.parse` silently rounds integers larger than `2^53−1` (9,007,199,254,740,991). If the web app detects any such integer in either pane it shows an amber warning banner. The CLI also reports these correctly (Python preserves full integer precision). If you need to compare large integers reliably, store them as strings in your JSON.

**Deeply nested input** — inputs nested more than 500 levels deep trigger a friendly "Input too deeply nested" error rather than a stack overflow.

**Stale results are dimmed** — if a compare fails, or you edit an input after comparing, the previous results stay on screen but are greyed out with a "Showing a previous result" note, so they're never mistaken for the current comparison. They refresh the moment you compare again.

### A note on storage

The **Library** uses the browser's local storage. A few browsers restrict this for files opened directly from disk (`file://`). If you see a note in the library saying so, either:

- use **Save session** files for persistence (always works), or
- serve the folder over a local server so storage is enabled, e.g.:

  ```bash
  cd json-comparator
  python3 -m http.server 8000
  # then open http://localhost:8000/json_compare.html
  ```

---

## Command-line script — `json_compare.py`

A dependency-free deep-diff for two JSON files. Requires Python 3.

### Usage

```bash
python3 json_compare.py source.json target.json
```

Options:

```bash
# compare lists of primitives without regard to order
python3 json_compare.py source.json target.json --unordered

# match array objects by a shared key instead of by position
python3 json_compare.py source.json target.json --array-key id

# emit machine-readable JSON instead of human-readable text
python3 json_compare.py source.json target.json --json

# exclude paths matching a JSONPath-like pattern (repeatable; * matches any single segment)
python3 json_compare.py source.json target.json --ignore-path '$.meta.*.updatedAt'
python3 json_compare.py source.json target.json \
  --ignore-path '$.meta.*.updatedAt' \
  --ignore-path '$.items[*].ts'

# schema-aware diff (G-3): suppress x-volatile paths and annotate type violations
python3 json_compare.py source.json target.json --schema schema.json --schema-aware
```

### Output

Human-readable mode prints each difference by path:

```
  + $.address.country  =  "US"        # added
  - $.address.zip      =  "10001"     # removed
  ~ $.age              :  30  ->  31   # changed
  ~ $.port             :  8080 (number)  ->  "8080" (string)   # type changed
```

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Files are equal |
| `1` | Differences found |
| `2` | Usage / parse error |

The exit codes make it easy to use in scripts or CI — for example, fail a build if two config files have drifted:

```bash
python3 json_compare.py expected.json actual.json || echo "Config drift detected!"
```

---

## Node.js / npm API — `json-comparator` (G-1)

The diff engine is published as a **zero-dependency npm package** so it can be consumed in Node.js scripts, CI pipelines, and other tooling — without a browser or the Python runtime.

### Installation

```bash
npm install json-comparator
```

### JavaScript API

```js
import { diff, changesToPatch, applyPatch } from "json-comparator";

const src = { a: 1, b: [1, 2, 3], c: "hello" };
const tgt = { a: 1, b: [1, 2, 4], c: "world", d: true };

// diff(a, b, opts?) → Change[]
const changes = diff(src, tgt);
// op ∈ "added" | "removed" | "changed" | "type_changed" | "equal"
const diffs = changes.filter(c => c.op !== "equal");
// → [{ op: "changed", path: "$.b[2]", … }, { op: "changed", path: "$.c", … }, { op: "added", path: "$.d", … }]

// changesToPatch(changes) → RFC 6902 Operation[]
const patch = changesToPatch(diffs);
// → [{ op: "replace", path: "/b/2", value: 4 }, …]

// Verify round-trip
const patched = applyPatch(src, patch);
// patched deep-equals tgt ✓
```

**`diff(a, b, opts?)`** options:

| Option | Type | Description |
|---|---|---|
| `unordered` | `boolean` | Treat scalar arrays as unordered multisets |
| `keyBy` | `string` | Match array objects by this key field (e.g. `"id"`) |
| `ignoreKeys` | `string[]` | Skip these object keys globally |
| `ignorePaths` | `string[]` | Skip paths matching these glob patterns (see F-4) |
| `numericTolerance` | `number` | Treat numbers within this tolerance as equal |
| `ignoreCase` | `boolean` | Compare strings case-insensitively |

**`Change` shape:**

```ts
{
  op:        "added" | "removed" | "changed" | "type_changed" | "equal";
  path:      string;        // display path, e.g. "$.user.address[0].zip"
  segs:      Seg[];         // canonical segment array (collision-free identity)
  from?:     unknown;       // source value (removed / changed / equal)
  to?:       unknown;       // target value (added / changed / equal)
  fromType?: string;        // for type_changed only
  toType?:   string;        // for type_changed only
}
```

All exports: `diff`, `changesToPatch`, `segsToPointer`, `applyPatch`, `typeName`, `isScalar`, `segLabel`, `segKey`, `segId`, `segsStartWith`, `entriesUnderSegs`, `MAX_DIFF_DEPTH`, `DiffDepthError`, `detectPrecisionLoss`, `_tokenizePath`, `_pathMatchesPattern`.

### Node.js CLI — `json-diff`

A `json-diff` binary is included, mirroring all `json_compare.py` flags:

```bash
# Human-readable (default)
json-diff source.json target.json

# Machine-readable JSON (same schema as json_compare.py --json)
json-diff source.json target.json --json

# Same options as the Python CLI
json-diff source.json target.json --unordered
json-diff source.json target.json --array-key id
json-diff source.json target.json --ignore-path '$.meta.*.updatedAt'
json-diff source.json target.json \
  --ignore-path '$.meta.*.updatedAt' \
  --ignore-path '$.items[*].ts'
```

Exit codes match the Python CLI: `0` = equal, `1` = differences found, `2` = usage/I/O error.

---

## GitHub Action — `json-diff` (G-2)

Diff two JSON files on every pull request and post the result as a Markdown comment. Optionally fail the build when unexpected drift is detected.

### Quick start

```yaml
# .github/workflows/json-diff.yml
name: JSON diff

on:
  pull_request:
    paths: ['**.json']

jobs:
  diff:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: tekion/json-comparator/.github/actions/json-diff@v1
        with:
          source-file: config/base.json
          target-file:  config/current.json
          fail-on-diff: 'true'          # break the build on any drift
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

The action posts a comment like this on the PR:

```
## JSON Diff Report

⚠️ **3 difference(s)** found: 1 added, 1 removed, 1 changed.

| Path | Change | Source | Target |
| --- | --- | --- | --- |
| $.b | changed | 2 | 20 |
| $.c | removed | 3 |  |
| $.d | added |  | 4 |
```

### Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `source-file` | ✅ | — | Path to the source (base) JSON file |
| `target-file` | ✅ | — | Path to the target (head) JSON file |
| `fail-on-diff` | | `false` | Exit 1 if differences are found |
| `comment-on-pr` | | `true` | Post Markdown diff as a PR comment |
| `github-token` | | `github.token` | Token for posting comments (needs `pull-requests: write`) |
| `title` | | `JSON Diff Report` | Heading for the Markdown report |
| `source-label` | | `Source` | Column label for the "before" values |
| `target-label` | | `Target` | Column label for the "after" values |
| `unordered` | | `false` | Treat scalar arrays as unordered multisets |
| `array-key` | | — | Match array objects by this key field (e.g. `id`) |

### Outputs

| Output | Description |
|---|---|
| `diff-found` | `"true"` if differences were found |
| `diff-count` | Number of differences (string) |

### Base-vs-head comparison example

Compare a file as it exists on the PR branch against the base branch:

```yaml
- name: Get base version of config.json
  run: git show origin/${{ github.base_ref }}:config.json > /tmp/config-base.json || echo '{}' > /tmp/config-base.json

- uses: tekion/json-comparator/.github/actions/json-diff@v1
  with:
    source-file: /tmp/config-base.json
    target-file:  config.json
    fail-on-diff: 'true'
    github-token: ${{ secrets.GITHUB_TOKEN }}
    title:         'Config drift check'
    source-label:  'Base branch'
    target-label:  'This PR'
```

A copy-paste example workflow is in [`.github/workflows/json-diff-example.yml`](.github/workflows/json-diff-example.yml).

---

## Schema-aware diff (G-3)

When a JSON Schema is supplied alongside the two documents, the diff engine gains two additional capabilities:

**1. Volatile-path suppression** — any schema property marked `"x-volatile": true` is automatically added to the "Ignore paths" list. Use this for fields that change on every write (timestamps, sequence numbers, ETags) and should never appear as drift.

```json
{
  "type": "object",
  "properties": {
    "name":      { "type": "string" },
    "updatedAt": { "x-volatile": true }
  }
}
```

With this schema, `$.updatedAt` changes are silently suppressed. The `x-volatile` annotation recurses through `properties` and array `items`, so `$.items[*].ts` works too.

**2. Type-drift annotation** — when a value changes (added or changed) and the new value violates the `type` declared in the schema for that property, the change is annotated with a `schemaViolation: { expected, got }` field. In the web UI, an orange **⚠ type** badge appears on the row.

### Web app

Open Options → check **Schema-aware diff** (requires a schema to be loaded in the Schema panel). Changes from volatile paths disappear; type violations gain an orange badge.

### JavaScript API

```js
import { diff } from "json-comparator";

const schema = {
  properties: {
    name:      { type: "string" },
    score:     { type: "number" },
    updatedAt: { "x-volatile": true },
  },
};

const src = { name: "Alice", score: 10,    updatedAt: "2024-01-01" };
const tgt = { name: "Alice", score: "ten", updatedAt: "2024-12-31" };

const changes = diff(src, tgt, { schema }).filter(c => c.op !== "equal");
// → [{ op: "changed", path: "$.score", …, schemaViolation: { expected: "number", got: "string" } }]
// $.updatedAt is suppressed (x-volatile: true)
```

### Python CLI

```bash
python3 json_compare.py source.json target.json \
  --schema schema.json \
  --schema-aware \
  --json
```

`--schema` loads the schema file; `--schema-aware` activates both volatile suppression and type annotation. Without `--schema-aware`, the schema file is loaded but has no effect (allowing safe incremental adoption).

---

## Quick reference: what counts as a difference

- **Added** — a key or array item present in target but not source.
- **Removed** — present in source but not target.
- **Changed** — same path, different value.
- **Type change** — same path, value changed type (e.g. number → string). The web app and script both flag these distinctly.

Paths use a `$` root with dot notation for object keys and brackets for array indices: `$.address.geo.lng`, `$.roles[1]`. Unordered scalar arrays use `[*]`.
