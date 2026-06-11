// tests/ignore-paths.test.js — F-4: ignore-paths glob option
//
// Covers _tokenizePath, _pathMatchesPattern, and the ignorePaths option wired
// into diffCore via the post-filter in diffCore().
import { describe, it, expect } from "vitest";
import { diff, _tokenizePath, _pathMatchesPattern } from "../src/diff-core.js";

const diffs = (a, b, opts) =>
  diff(a, b, opts).filter(c => c.op !== "equal").map(({ segs, ...c }) => c);

// ── _tokenizePath ─────────────────────────────────────────────────────────────
describe("_tokenizePath", () => {
  it("root only", () => {
    expect(_tokenizePath("$")).toEqual(["$"]);
  });

  it("simple object path", () => {
    expect(_tokenizePath("$.a.b.c")).toEqual(["$", "a", "b", "c"]);
  });

  it("array index path", () => {
    expect(_tokenizePath("$.items[0].ts")).toEqual(["$", "items", "0", "ts"]);
  });

  it("[*] normalises to '*'", () => {
    expect(_tokenizePath("$.items[*].ts")).toEqual(["$", "items", "*", "ts"]);
  });

  it(".* normalises to '*'", () => {
    expect(_tokenizePath("$.meta.*.updatedAt")).toEqual(["$", "meta", "*", "updatedAt"]);
  });

  it("multi-level array indices", () => {
    expect(_tokenizePath("$.a[1][2].b")).toEqual(["$", "a", "1", "2", "b"]);
  });
});

// ── _pathMatchesPattern ───────────────────────────────────────────────────────
describe("_pathMatchesPattern", () => {
  it("exact match succeeds", () => {
    expect(_pathMatchesPattern("$.a.b", "$.a.b")).toBe(true);
  });

  it("exact mismatch fails", () => {
    expect(_pathMatchesPattern("$.a.b", "$.a.c")).toBe(false);
  });

  it("length mismatch fails", () => {
    expect(_pathMatchesPattern("$.a", "$.a.b")).toBe(false);
    expect(_pathMatchesPattern("$.a.b", "$.a")).toBe(false);
  });

  it(".* wildcard matches any single key segment", () => {
    expect(_pathMatchesPattern("$.meta.foo.updatedAt", "$.meta.*.updatedAt")).toBe(true);
    expect(_pathMatchesPattern("$.meta.bar.updatedAt", "$.meta.*.updatedAt")).toBe(true);
    expect(_pathMatchesPattern("$.meta.foo.createdAt", "$.meta.*.updatedAt")).toBe(false);
  });

  it("[*] wildcard matches any single index segment", () => {
    expect(_pathMatchesPattern("$.items[0].ts", "$.items[*].ts")).toBe(true);
    expect(_pathMatchesPattern("$.items[99].ts", "$.items[*].ts")).toBe(true);
    expect(_pathMatchesPattern("$.items[0].id", "$.items[*].ts")).toBe(false);
  });

  it("wildcard does not cross segment boundaries", () => {
    // "$.a.b.c" should NOT match "$.*.c" because * can only match one token
    expect(_pathMatchesPattern("$.a.b.c", "$.*.c")).toBe(false);
  });

  it("root-level wildcard works", () => {
    expect(_pathMatchesPattern("$.a", "$.*")).toBe(true);
    expect(_pathMatchesPattern("$.b", "$.*")).toBe(true);
  });
});

// ── ignorePaths option in diffCore ────────────────────────────────────────────
describe("ignorePaths option", () => {
  it("suppresses a single exact path", () => {
    const src = { a: 1, ts: "old" };
    const tgt = { a: 1, ts: "new" };
    expect(diffs(src, tgt, { ignorePaths: ["$.ts"] })).toHaveLength(0);
  });

  it("still reports non-ignored paths", () => {
    const src = { a: 1, ts: "old" };
    const tgt = { a: 2, ts: "new" };
    const out = diffs(src, tgt, { ignorePaths: ["$.ts"] });
    expect(out).toHaveLength(1);
    expect(out[0].path).toBe("$.a");
  });

  it("wildcard key segment: $.meta.*.updatedAt", () => {
    const src = { meta: { x: { updatedAt: "2024-01-01" }, y: { updatedAt: "2024-01-01" } }, value: 1 };
    const tgt = { meta: { x: { updatedAt: "2024-12-31" }, y: { updatedAt: "2024-12-31" } }, value: 1 };
    const out = diffs(src, tgt, { ignorePaths: ["$.meta.*.updatedAt"] });
    expect(out).toHaveLength(0);
  });

  it("wildcard key segment only suppresses the matched key, not siblings", () => {
    const src = { meta: { x: { updatedAt: "old", name: "alice" } } };
    const tgt = { meta: { x: { updatedAt: "new", name: "bob"  } } };
    const out = diffs(src, tgt, { ignorePaths: ["$.meta.*.updatedAt"] });
    expect(out).toHaveLength(1);
    expect(out[0].path).toBe("$.meta.x.name");
  });

  it("wildcard index segment: $.items[*].ts", () => {
    const src = { items: [{ id: 1, ts: "old" }, { id: 2, ts: "old" }] };
    const tgt = { items: [{ id: 1, ts: "new" }, { id: 2, ts: "new" }] };
    const out = diffs(src, tgt, { ignorePaths: ["$.items[*].ts"] });
    expect(out).toHaveLength(0);
  });

  it("wildcard index segment leaves non-matching fields visible", () => {
    const src = { items: [{ id: 1, ts: "old" }] };
    const tgt = { items: [{ id: 2, ts: "new" }] };
    const out = diffs(src, tgt, { ignorePaths: ["$.items[*].ts"] });
    expect(out).toHaveLength(1);
    expect(out[0].path).toBe("$.items[0].id");
  });

  it("multiple patterns, each suppresses its own path", () => {
    const src = { a: 1, b: 2, c: 3 };
    const tgt = { a: 9, b: 9, c: 9 };
    const out = diffs(src, tgt, { ignorePaths: ["$.a", "$.b"] });
    expect(out).toHaveLength(1);
    expect(out[0].path).toBe("$.c");
  });

  it("empty ignorePaths array has no effect", () => {
    const out = diffs({ a: 1 }, { a: 2 }, { ignorePaths: [] });
    expect(out).toHaveLength(1);
  });

  it("undefined ignorePaths has no effect", () => {
    const out = diffs({ a: 1 }, { a: 2 });
    expect(out).toHaveLength(1);
  });

  it("suppresses an added leaf at a wildcard path", () => {
    const src = { items: [{ id: 1 }] };
    const tgt = { items: [{ id: 1, ts: "new" }] };
    const out = diffs(src, tgt, { ignorePaths: ["$.items[*].ts"] });
    expect(out).toHaveLength(0);
  });

  it("suppresses a removed leaf at a wildcard path", () => {
    const src = { items: [{ id: 1, ts: "old" }] };
    const tgt = { items: [{ id: 1 }] };
    const out = diffs(src, tgt, { ignorePaths: ["$.items[*].ts"] });
    expect(out).toHaveLength(0);
  });

  it("combined with ignoreKeys: both are applied", () => {
    const src = { name: "alice", ts: "old", v: 1 };
    const tgt = { name: "alice", ts: "new", v: 2 };
    // ignoreKeys suppresses "ts" everywhere; ignorePaths also suppresses "$.v"
    const out = diffs(src, tgt, { ignoreKeys: ["ts"], ignorePaths: ["$.v"] });
    expect(out).toHaveLength(0);
  });
});
