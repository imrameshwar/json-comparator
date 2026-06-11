// src/markdown-reporter.js — G-2: Markdown diff report renderer.
//
// Extracted from the `buildMarkdown` / `sideVal` / `cellStr` helpers in
// json_compare.html so the GitHub Action (and any other Node.js tooling) can
// reuse the exact same serialisation logic without a DOM.
//
// No DOM access, no globals, no I/O.
//
// diffToMarkdown(changes, opts?) → string
//   changes:  Change[] from diffCore (equal entries are silently skipped)
//   opts: {
//     title?:       string  — heading for the report (default "JSON Diff Report")
//     sourceLabel?: string  — table column label for the "from" value (default "Source")
//     targetLabel?: string  — table column label for the "to"   value (default "Target")
//     maxRows?:     number  — truncate the table at this many rows (default 200)
//   }
//   Returns a Markdown string (GFM table) suitable for GitHub PR comments.

const BADGE_LABEL = {
  added:        "added",
  removed:      "removed",
  changed:      "changed",
  type_changed: "type changed",
  equal:        "same",
};

/** Stable JSON serialisation of a cell value (matches the web app's `fmt`). */
function fmt(v) { return JSON.stringify(v); }

/** Which value to show on which side of the diff. */
function sideVal(entry, side) {
  if (side === "from") return entry.op === "added"   ? undefined : entry.from;
  return entry.op === "removed" ? undefined : entry.to;
}

/** Convert a cell value to a display string ("" for absent). */
const cellStr = v => (v === undefined ? "" : fmt(v));

/**
 * Escape Markdown table cell content: pipes and literal newlines break GFM
 * tables, so we replace them with safe equivalents.
 * @param {*} s
 */
const escCell = s => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");

/**
 * Render a Change[] as a Markdown string.
 *
 * @param {import("./diff-core.js").Change[]} changes
 * @param {{ title?: string, sourceLabel?: string, targetLabel?: string, maxRows?: number }} [opts]
 * @returns {string}
 */
export function diffToMarkdown(changes, opts = {}) {
  const title       = opts.title       ?? "JSON Diff Report";
  const srcLabel    = opts.sourceLabel ?? "Source";
  const tgtLabel    = opts.targetLabel ?? "Target";
  const maxRows     = (typeof opts.maxRows === "number" && opts.maxRows > 0) ? opts.maxRows : 200;

  const diffs = changes.filter(c => c.op !== "equal");

  // ─── summary line ───────────────────────────────────────────────────────────
  if (diffs.length === 0) {
    return `## ${title}\n\n✅ **No differences found.** The two documents are identical.\n`;
  }

  const counts = { added: 0, removed: 0, changed: 0, type_changed: 0 };
  for (const c of diffs) { if (c.op in counts) counts[c.op]++; }
  const parts = [];
  if (counts.added)        parts.push(`${counts.added} added`);
  if (counts.removed)      parts.push(`${counts.removed} removed`);
  if (counts.changed + counts.type_changed > 0)
    parts.push(`${counts.changed + counts.type_changed} changed`);
  const summary = `⚠️ **${diffs.length} difference(s)** found${parts.length ? ": " + parts.join(", ") : ""}.`;

  // ─── table ──────────────────────────────────────────────────────────────────
  const rows = diffs.slice(0, maxRows);
  let table = `| Path | Change | ${srcLabel} | ${tgtLabel} |\n`;
  table    += `| --- | --- | --- | --- |\n`;
  for (const r of rows) {
    const label = BADGE_LABEL[r.op] || r.op;
    const from  = escCell(cellStr(sideVal(r, "from")));
    const to    = escCell(cellStr(sideVal(r, "to")));
    table += `| ${escCell(r.path)} | ${label} | ${from} | ${to} |\n`;
  }

  const truncNote = diffs.length > maxRows
    ? `\n> ℹ️ Showing first ${maxRows} of ${diffs.length} differences.\n`
    : "";

  return `## ${title}\n\n${summary}\n\n${table}${truncNote}`;
}
