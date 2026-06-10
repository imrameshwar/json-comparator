// Generates the shared fixture corpus used by the CLI<->core parity test (T3).
//
// Run with:  node fixtures/build_corpus.mjs
// It (re)writes one directory per case under fixtures/ containing source.json
// and target.json, plus fixtures/manifest.json describing each case. The
// generated files are committed; the parity test reads the files, not this
// script (so there is no build step required to run tests or use the app).
//
// `knownDivergence` marks cases where the JS core and the Python CLI
// intentionally disagree TODAY because of a tracked bug. The parity test
// asserts the disagreement for these (keeping the suite green and honest);
// when the bug is fixed, drop the flag and parity becomes required.
import { mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = [];

function write(name, srcText, tgtText, { unordered = false, knownDivergence = null, description = "" } = {}) {
  const dir = join(here, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "source.json"), srcText + "\n");
  writeFileSync(join(dir, "target.json"), tgtText + "\n");
  manifest.push({ name, options: { unordered }, knownDivergence, description });
}
const j = (v) => JSON.stringify(v, null, 2);

// Clean previously-generated case dirs (keep manifest.json, this script, .gitkeep).
for (const entry of readdirSync(here)) {
  const p = join(here, entry);
  if (statSync(p).isDirectory()) rmSync(p, { recursive: true, force: true });
}

// ---- empty / null / {} semantics ----
write("empty_object_equal", j({}), j({}), { description: "{} vs {} — no differences" });
write("null_vs_object", j(null), j({}), { description: "null vs {} — type change" });
write("null_vs_number", j(null), j(5), { description: "null vs 5 — type change" });
write("array_vs_object", j([]), j({}), { description: "[] vs {} — type change" });

// ---- added / removed / changed ----
write("crud", j({ a: 1, b: 2, c: 3 }), j({ a: 1, b: 20, d: 4 }),
  { description: "changed b, removed c, added d" });

// ---- type changes ----
write("type_changed", j({ port: 8080, flag: true }), j({ port: "8080", flag: 1 }),
  { description: "number->string and boolean->number" });

// ---- nested ----
write("nested", j({ a: { b: { c: { d: 1 } } }, k: 2 }), j({ a: { b: { c: { d: 2 } } }, k: 2 }),
  { description: "deeply nested scalar change" });

// ---- unicode + dotted keys ----
write("unicode_keys",
  j({ "café": 1, "naïve": "x", "emoji😀": true, "key.with.dots": 1 }),
  j({ "café": 2, "naïve": "x", "emoji😀": false, "key.with.dots": 1 }),
  { description: "unicode/emoji keys and a literal dotted key" });

// ---- arrays (positional) ----
write("arrays_positional", j(["a", "b", "c"]), j(["a", "x", "c", "d"]),
  { description: "positional change + trailing add" });
write("array_length_shrink", j([1, 2, 3, 4]), j([1, 2]),
  { description: "trailing elements removed" });
write("arrays_of_objects",
  j({ items: [{ id: 1, v: 1 }, { id: 2, v: 2 }] }),
  j({ items: [{ id: 1, v: 9 }, { id: 2, v: 2 }] }),
  { description: "array of objects, one nested value changed" });

// ---- unordered scalar arrays ----
write("unordered_no_dups", j({ tags: [1, 2, 3] }), j({ tags: [3, 1, 4] }),
  { unordered: true, description: "unordered, distinct values: removed 2, added 4" });
write("unordered_dups", j({ tags: [1, 1, 2] }), j({ tags: [1, 2] }),
  { unordered: true, knownDivergence: "B1",
    description: "unordered with duplicate multiplicity — CLI drops the count (B1); core reports one removed 1" });

// ---- big numbers (precision) ----
write("big_number", `{ "n": 9007199254740993 }`, `{ "n": 9007199254740992 }`,
  { knownDivergence: "B6",
    description: "integer > 2^53 — JS JSON.parse rounds (no diff); Python keeps precision (reports changed)" });

// ---- wide (many keys) ----
{
  const src = {}, tgt = {};
  for (let i = 0; i < 500; i++) { src["k" + i] = i; tgt["k" + i] = i; }
  tgt.k100 = 1000;        // changed
  tgt.k250 = "two-fifty"; // type changed
  delete tgt.k499;        // removed
  tgt.k500 = 5;           // added
  write("wide", j(src), j(tgt), { description: "500 keys; a few changed/added/removed/type-changed" });
}

// ---- deep (nesting; kept under Python's recursion limit, B4 is a separate task) ----
{
  const deep = (n, leaf) => { let o = leaf; for (let i = 0; i < n; i++) o = { child: o }; return o; };
  write("deep", j(deep(150, { leaf: 1 })), j(deep(150, { leaf: 2 })),
    { description: "150-level nested object, deepest leaf changed" });
}

writeFileSync(join(here, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${manifest.length} fixture cases + manifest.json`);
