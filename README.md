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

**Export full diff report** — the **Export report ▾** button next to Generate table downloads the entire diff (all changes, not just selected rows) as a Markdown file (for GitHub/Jira/Notion) or a standalone HTML file (a self-contained page with summary chips and styled table, ready to attach to a ticket or PR).

**Editor line numbers** — each input pane shows line numbers in a gutter that scrolls in sync with the editor. Numbers hide automatically for very large files (>80 k chars) where syntax highlighting is also disabled.

**Per-pane tools** — each input has **Upload**, **Paste**, **Format** (pretty-print), **Copy**, and **Clear**. **Swap** exchanges source and target. Drag the **divider** between the two editors to give more width to the larger document — double-click it to reset to 50/50, or focus it and use ← / → (5% steps) and Home / End. The split is remembered between sessions.

**Help & About** — the `?` button opens a keyboard-shortcuts popover with a "Help & About…" link that opens a full help dialog: views overview, Options explained, Session vs Library vs Share, and the privacy model.

**3-Way merge view** — appears automatically in the view tabs when the Base pane has content. Shows left-only, right-only, and conflicting changes side-by-side against the common ancestor.

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

## Quick reference: what counts as a difference

- **Added** — a key or array item present in target but not source.
- **Removed** — present in source but not target.
- **Changed** — same path, different value.
- **Type change** — same path, value changed type (e.g. number → string). The web app and script both flag these distinctly.

Paths use a `$` root with dot notation for object keys and brackets for array indices: `$.address.geo.lng`, `$.roles[1]`. Unordered scalar arrays use `[*]`.
