# JSON Comparator

A self-contained toolkit for comparing two JSON documents and seeing exactly what changed — added, removed, changed values, and type changes — with both a polished web UI and a command-line script.

> **🔒 Your data never leaves your browser.**
> `json_compare.html` is a fully offline, zero-dependency single file. It makes no network requests, stores no data on any server, and works entirely from `file://` URLs with no install or build step required. The Content Security Policy header (`connect-src 'none'`) enforces this at the browser level. The only time data touches a network is if you explicitly use the **Share URL** feature — which embeds both documents verbatim in the URL fragment and shows a privacy warning before doing so.

## What's in this folder

| File | What it is |
| --- | --- |
| `json_compare.html` | The web app. A single self-contained file — no install, no server, no internet. Just open it in a browser. |
| `json_compare.py` | A zero-dependency command-line comparator (Python 3). Handy for scripts and CI. |
| `source.json` | Starter "source" document (empty `{}` — fill it in). |
| `target.json` | Starter "target" document (empty `{}` — fill it in). |
| `README.md` | This guide. |

---

## Web app — `json_compare.html`

### Getting started

Double-click `json_compare.html` to open it in your default browser. Paste JSON into the **Source** and **Target** panes and press **Compare** (or `Ctrl/Cmd + Enter`).

If a pane isn't valid JSON, the error banner names the **line and column** of the problem and offers a **Jump to error** button that takes you straight to it (and, when it can, offers to auto-repair the document instead).

### Features

**Two ways to view the diff**

- **Tree view** (default) — the JSON structure as a collapsible tree. Every node is color-coded: green = added, red = removed, amber = a changed value, and violet = *contains changes* (any parent whose descendants differ, however deep). Each container shows a badge counting the changes inside it. Unchanged branches auto-collapse so you land on the differences.
- **Table view** — a flat list of every change with its path, e.g. `$.address.geo.lng`.

**Differences only / All fields** — toggle between showing just the changes or every field including unchanged ones.

**Select rows and generate a shareable table** — tick the checkboxes next to any changes (a parent checkbox selects its whole branch), then press **Generate table** to get a clean table you can copy as:

- **Markdown** — for GitHub, Jira, Notion.
- **Rich HTML** — pastes formatted into Google Docs, Gmail, Slack.
- **TSV** — drops straight into Excel / Google Sheets columns.
- **CSV download**.

**Save & reload comparisons (Library)** — the bookmark icon saves the current comparison (with a name and folder); the folder icon opens your library. Folders are collapsible — click one to reveal its saved comparisons. Click any saved item to reload both documents and view settings instantly. You can rename, delete, and move items between folders, and create/rename/delete folders. Saved comparisons live in the browser's local storage and persist between sessions.

**Save / Load session files** — **Save session** downloads a single `.json` bundling both documents plus your settings. **Load session** (or just drag a `.json` file onto the page) restores everything. This is the portable backup — share it or move it between machines. Import also accepts a plain `[source, target]` array.

**Per-pane tools** — each input has **Copy**, **Paste**, **Format** (pretty-print), and **Clear**. **Swap** exchanges source and target.

**Other** — light/dark theme toggle, live character counts, and an "Unordered scalar arrays" option that ignores order when comparing arrays of primitives.

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
