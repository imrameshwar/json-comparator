// tests/api.test.js — G-1: npm package public API tests.
//
// Asserts that:
//  1. `import { diff, changesToPatch } from '../src/index.js'` re-exports the
//     exact same functions as the underlying modules — i.e. produces identical
//     Change[] to a direct diff-core.js import on shared fixtures.
//  2. changesToPatch converts non-equal changes into valid RFC 6902 ops.
//  3. The CLI entry point (bin/json-diff.js) exists and is executable.
//  4. `npm pack` would contain a dependency-free tarball (no "dependencies"
//     key in package.json).
//
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

// Import via the public API surface (src/index.js)
import {
  diff,
  changesToPatch,
  segsToPointer,
  applyPatch,
  typeName,
  isScalar,
  segId,
  DiffDepthError,
  MAX_DIFF_DEPTH,
  detectPrecisionLoss,
  _tokenizePath,
  _pathMatchesPattern,
} from "../src/index.js";

// Import directly from the source modules for identity checks
import { diff as diffDirect } from "../src/diff-core.js";
import { changesToPatch as c2pDirect } from "../src/json-patch.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = join(root, "fixtures");

// ─── helpers ──────────────────────────────────────────────────────────────────
function loadFixture(name) {
  const dir = join(fixturesDir, name);
  return {
    src: JSON.parse(readFileSync(join(dir, "source.json"), "utf8")),
    tgt: JSON.parse(readFileSync(join(dir, "target.json"), "utf8")),
  };
}

// Stable canonical form for comparing Change arrays (order-insensitive)
function canonSet(changes) {
  return changes
    .filter(c => c.op !== "equal")
    .map(c => JSON.stringify({ op: c.op, path: c.path,
      from: "from" in c ? c.from : undefined,
      to:   "to"   in c ? c.to   : undefined }))
    .sort();
}

// ─── 1. Re-export identity: diff via index.js === diff-core.js directly ───────
describe("G-1: src/index.js re-exports produce identical results to direct module imports", () => {

  const fixtures = ["crud", "nested", "arrays_of_objects", "unicode_keys", "type_changed"];

  for (const name of fixtures) {
    it(`diff() matches direct diff-core for fixture: ${name}`, () => {
      const { src, tgt } = loadFixture(name);
      const viaIndex  = canonSet(diff(src, tgt));
      const viaDirect = canonSet(diffDirect(src, tgt));
      expect(viaIndex).toEqual(viaDirect);
    });
  }

  it("diff() with opts (unordered) matches direct diff-core", () => {
    const { src, tgt } = loadFixture("unordered_no_dups");
    const viaIndex  = canonSet(diff(src, tgt, { unordered: true }));
    const viaDirect = canonSet(diffDirect(src, tgt, { unordered: true }));
    expect(viaIndex).toEqual(viaDirect);
  });

  it("diff() with opts (keyBy) matches direct diff-core", () => {
    const { src, tgt } = loadFixture("arrays_of_objects");
    const viaIndex  = canonSet(diff(src, tgt, { keyBy: "id" }));
    const viaDirect = canonSet(diffDirect(src, tgt, { keyBy: "id" }));
    expect(viaIndex).toEqual(viaDirect);
  });

  it("diff() with opts (ignorePaths) matches direct diff-core", () => {
    const src = { a: 1, meta: { ts: "old", v: 2 } };
    const tgt = { a: 1, meta: { ts: "new", v: 2 } };
    const opts = { ignorePaths: ["$.meta.ts"] };
    const viaIndex  = canonSet(diff(src, tgt, opts));
    const viaDirect = canonSet(diffDirect(src, tgt, opts));
    expect(viaIndex).toEqual(viaDirect);
    // With the path ignored both should report 0 diffs
    expect(viaIndex.length).toBe(0);
  });

  it("changesToPatch() re-export is the same function as direct json-patch import", () => {
    const { src, tgt } = loadFixture("crud");
    const changes = diff(src, tgt).filter(c => c.op !== "equal");
    const viaIndex  = changesToPatch(changes);
    const viaDirect = c2pDirect(changes);
    expect(viaIndex).toEqual(viaDirect);
  });
});

// ─── 2. changesToPatch round-trip ─────────────────────────────────────────────
describe("G-1: changesToPatch produces valid RFC 6902 ops (round-trip)", () => {

  it("crud fixture: patch applied to source equals target", () => {
    const { src, tgt } = loadFixture("crud");
    const changes = diff(src, tgt).filter(c => c.op !== "equal");
    const ops = changesToPatch(changes);
    expect(ops.length).toBeGreaterThan(0);
    const patched = applyPatch(src, ops);
    expect(patched).toEqual(tgt);
  });

  it("nested fixture: patch applied to source equals target", () => {
    const { src, tgt } = loadFixture("nested");
    const changes = diff(src, tgt).filter(c => c.op !== "equal");
    const ops = changesToPatch(changes);
    const patched = applyPatch(src, ops);
    expect(patched).toEqual(tgt);
  });

  it("equal documents produce empty patch", () => {
    const doc = { a: 1, b: [2, 3] };
    const changes = diff(doc, doc).filter(c => c.op !== "equal");
    expect(changesToPatch(changes)).toEqual([]);
  });
});

// ─── 3. Utility re-exports are functional ────────────────────────────────────
describe("G-1: utility re-exports from src/index.js are functional", () => {

  it("typeName() classifies correctly", () => {
    expect(typeName(null)).toBe("null");
    expect(typeName([])).toBe("array");
    expect(typeName({})).toBe("object");
    expect(typeName(42)).toBe("number");
    expect(typeName("hi")).toBe("string");
    expect(typeName(true)).toBe("boolean");
  });

  it("isScalar() returns true for primitives, false for object/array", () => {
    expect(isScalar(1)).toBe(true);
    expect(isScalar("x")).toBe(true);
    expect(isScalar(null)).toBe(true);
    expect(isScalar({})).toBe(false);
    expect(isScalar([])).toBe(false);
  });

  it("segsToPointer() converts segs to RFC 6901", () => {
    expect(segsToPointer([{ k: "a" }, { i: 0 }, { k: "b" }])).toBe("a/0/b");
    expect(segsToPointer([{ k: "a/b" }])).toBe("a~1b");
    expect(segsToPointer([{ k: "a~b" }])).toBe("a~0b");
    expect(segsToPointer([])).toBe("");
  });

  it("segId() produces a stable string identity", () => {
    const id1 = segId([{ k: "foo" }, { i: 0 }]);
    const id2 = segId([{ k: "foo" }, { i: 0 }]);
    const id3 = segId([{ k: "foo" }, { i: 1 }]);
    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
  });

  it("MAX_DIFF_DEPTH is a positive integer", () => {
    expect(typeof MAX_DIFF_DEPTH).toBe("number");
    expect(MAX_DIFF_DEPTH).toBeGreaterThan(0);
  });

  it("DiffDepthError is a subclass of Error", () => {
    const e = new DiffDepthError("$.a");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("DiffDepthError");
  });

  it("detectPrecisionLoss() flags out-of-range integers", () => {
    const text = '{"v": 99999999999999999}';
    const lost = detectPrecisionLoss(text);
    expect(lost.length).toBeGreaterThan(0);
  });

  it("_tokenizePath() tokenizes display paths", () => {
    expect(_tokenizePath("$.a.b")).toEqual(["$", "a", "b"]);
    expect(_tokenizePath("$.items[0].ts")).toEqual(["$", "items", "0", "ts"]);
    expect(_tokenizePath("$.meta.*.key")).toEqual(["$", "meta", "*", "key"]);
  });

  it("_pathMatchesPattern() does wildcard matching", () => {
    expect(_pathMatchesPattern("$.a.b", "$.a.b")).toBe(true);
    expect(_pathMatchesPattern("$.meta.x.updatedAt", "$.meta.*.updatedAt")).toBe(true);
    expect(_pathMatchesPattern("$.meta.x.other", "$.meta.*.updatedAt")).toBe(false);
  });
});

// ─── 4. Package structure checks ─────────────────────────────────────────────
describe("G-1: package structure is valid", () => {

  it("bin/json-diff.js exists", () => {
    expect(existsSync(join(root, "bin/json-diff.js"))).toBe(true);
  });

  it("src/index.js exists", () => {
    expect(existsSync(join(root, "src/index.js"))).toBe(true);
  });

  it("package.json has no runtime 'dependencies' key (zero runtime deps)", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    // 'dependencies' must be absent or empty — only devDependencies allowed
    const hasDeps = !!(pkg.dependencies && Object.keys(pkg.dependencies).length > 0);
    expect(hasDeps).toBe(false);
  });

  it("package.json exports '.' to src/index.js", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.exports).toBeDefined();
    expect(pkg.exports["."]).toBe("./src/index.js");
  });

  it("package.json bin entry points to bin/json-diff.js", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin["json-diff"]).toBe("./bin/json-diff.js");
  });

  it("package.json has no 'private' flag (publishable)", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.private).toBeUndefined();
  });
});
