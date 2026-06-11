#!/usr/bin/env node
// bin/json-diff.js — G-1: Node.js CLI for the json-comparator diff engine.
//
// Mirrors the json_compare.py CLI flags so the two tools are drop-in
// interchangeable in scripts.
//
// Usage:
//   json-diff source.json target.json [options]
//
// Options:
//   --unordered                 Compare scalar arrays without regard to order
//   --array-key KEY             Match array objects by this key field (e.g. id)
//                               instead of by position
//   --json                      Emit differences as JSON (same schema as the
//                               Python CLI: [{type, path, from?, to?}, …])
//   --ignore-path PATTERN       Exclude paths matching PATTERN from the diff
//                               (may be repeated). Uses JSONPath-like syntax:
//                               $ = root, .key / [n] = segments,
//                               * = any single segment.
//                               Examples:
//                                 --ignore-path '$.meta.*.updatedAt'
//                                 --ignore-path '$.items[*].ts'
//   -h, --help                  Show this help
//
// Exit code:
//   0 — documents are equal (no differences)
//   1 — differences found
//   2 — usage error or I/O error

import { readFileSync } from "node:fs";
import { diff } from "../src/index.js";

// ─── arg parser ───────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    source: null,
    target: null,
    unordered: false,
    arrayKey: null,
    json: false,
    ignorePaths: [],
  };
  const positional = [];
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === "-h" || a === "--help") {
      printHelp();
      process.exit(0);
    } else if (a === "--unordered") {
      opts.unordered = true;
    } else if (a === "--json") {
      opts.json = true;
    } else if (a === "--array-key") {
      if (i + 1 >= args.length) die("--array-key requires a KEY argument");
      opts.arrayKey = args[++i];
    } else if (a === "--ignore-path") {
      if (i + 1 >= args.length) die("--ignore-path requires a PATTERN argument");
      opts.ignorePaths.push(args[++i]);
    } else if (a.startsWith("--array-key=")) {
      opts.arrayKey = a.slice("--array-key=".length);
    } else if (a.startsWith("--ignore-path=")) {
      opts.ignorePaths.push(a.slice("--ignore-path=".length));
    } else if (a.startsWith("-")) {
      die(`Unknown option: ${a}`);
    } else {
      positional.push(a);
    }
    i++;
  }
  if (positional.length < 2) {
    die("Usage: json-diff <source> <target> [options]\nRun with --help for full usage.");
  }
  opts.source = positional[0];
  opts.target = positional[1];
  return opts;
}

function die(msg) {
  process.stderr.write("json-diff: " + msg + "\n");
  process.exit(2);
}

function printHelp() {
  process.stdout.write(`\
Usage: json-diff source.json target.json [options]

Compare two JSON files and report the differences.

Options:
  --unordered              Compare scalar arrays without regard to order
  --array-key KEY          Match array objects by this key field (e.g. id)
  --json                   Emit differences as JSON instead of human-readable text
  --ignore-path PATTERN    Exclude paths matching PATTERN (repeatable).
                           Syntax: $ = root, .key / [n] = segments, * = wildcard.
                           Example: --ignore-path '$.meta.*.updatedAt'
  -h, --help               Show this help

Exit codes:
  0  — documents are equal
  1  — differences found
  2  — usage or I/O error
`);
}

// ─── formatting (human-readable, matching Python CLI style) ───────────────────
function opSymbol(op) {
  if (op === "added")        return "+";
  if (op === "removed")      return "-";
  if (op === "changed")      return "~";
  if (op === "type_changed") return "~";
  return " ";
}

function formatHuman(changes, sourcePath, targetPath) {
  const diffs = changes.filter(c => c.op !== "equal");
  const counts = { added: 0, removed: 0, changed: 0, type_changed: 0 };
  for (const c of diffs) {
    if (c.op in counts) counts[c.op]++;
  }
  const total = diffs.length;
  const parts = [];
  if (counts.added)       parts.push(`${counts.added} added`);
  if (counts.removed)     parts.push(`${counts.removed} removed`);
  if (counts.changed + counts.type_changed > 0)
    parts.push(`${counts.changed + counts.type_changed} changed`);

  const lines = [];
  lines.push(`Comparing:\n  source: ${sourcePath}\n  target: ${targetPath}\n`);
  lines.push(`${total} difference(s) found${parts.length ? " (" + parts.join(", ") + ")" : ""}\n`);
  for (const c of diffs) {
    const sym = opSymbol(c.op);
    if (c.op === "added") {
      lines.push(`  ${sym} ${c.path}  =  ${JSON.stringify(c.to)}`);
    } else if (c.op === "removed") {
      lines.push(`  ${sym} ${c.path}  =  ${JSON.stringify(c.from)}`);
    } else {
      lines.push(`  ${sym} ${c.path}  :  ${JSON.stringify(c.from)}  ->  ${JSON.stringify(c.to)}`);
    }
  }
  return lines.join("\n");
}

function formatJson(changes) {
  // Match Python CLI output schema: {type, path, from?, to?}
  const diffs = changes.filter(c => c.op !== "equal");
  const out = diffs.map(c => {
    const entry = { type: c.op, path: c.path };
    if ("from" in c && c.from !== undefined) entry.from = c.from;
    if ("to"   in c && c.to   !== undefined) entry.to   = c.to;
    return entry;
  });
  return JSON.stringify(out, null, 2);
}

// ─── main ─────────────────────────────────────────────────────────────────────
function main() {
  const opts = parseArgs(process.argv);

  // Read + parse inputs
  let srcText, tgtText;
  try { srcText = readFileSync(opts.source, "utf8"); }
  catch (e) { die(`Cannot read source file '${opts.source}': ${e.message}`); }
  try { tgtText = readFileSync(opts.target, "utf8"); }
  catch (e) { die(`Cannot read target file '${opts.target}': ${e.message}`); }

  let src, tgt;
  try { src = JSON.parse(srcText); }
  catch (e) { die(`Source is not valid JSON: ${e.message}`); }
  try { tgt = JSON.parse(tgtText); }
  catch (e) { die(`Target is not valid JSON: ${e.message}`); }

  // Diff
  const diffOpts = {};
  if (opts.unordered) diffOpts.unordered = true;
  if (opts.arrayKey)  diffOpts.keyBy = opts.arrayKey;
  if (opts.ignorePaths.length) diffOpts.ignorePaths = opts.ignorePaths;

  let changes;
  try {
    changes = diff(src, tgt, diffOpts);
  } catch (e) {
    die(`Diff error: ${e.message}`);
  }

  // Output
  const hasDiffs = changes.some(c => c.op !== "equal");
  if (opts.json) {
    process.stdout.write(formatJson(changes) + "\n");
  } else {
    process.stdout.write(formatHuman(changes, opts.source, opts.target) + "\n");
  }

  process.exit(hasDiffs ? 1 : 0);
}

main();
