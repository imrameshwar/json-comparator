// tests/options.test.js — T14: comparison options (ignoreKeys, numericTolerance, ignoreCase)
import { describe, it, expect } from "vitest";
import { diff } from "../src/diff-core.js";

const diffs = (a, b, opts) => diff(a, b, opts).filter(c => c.op !== "equal").map(({ segs, ...c }) => c);
const equals = (a, b, opts) => diff(a, b, opts).filter(c => c.op === "equal").map(({ segs, ...c }) => c);

// ── ignoreKeys ────────────────────────────────────────────────────────────────
describe("ignoreKeys option", () => {
  it("ignores a single key", () => {
    const src = { a: 1, ts: "2024-01-01" };
    const tgt = { a: 1, ts: "2024-12-31" };
    expect(diffs(src, tgt, { ignoreKeys: ["ts"] })).toHaveLength(0);
  });

  it("ignores multiple keys", () => {
    const src = { a: 1, createdAt: "x", updatedAt: "y" };
    const tgt = { a: 2, createdAt: "changed", updatedAt: "changed" };
    const out = diffs(src, tgt, { ignoreKeys: ["createdAt", "updatedAt"] });
    expect(out).toHaveLength(1);
    expect(out[0].path).toBe("$.a");
  });

  it("still reports non-ignored key changes", () => {
    const out = diffs({ a: 1, b: 2 }, { a: 99, b: 2 }, { ignoreKeys: ["b"] });
    expect(out).toHaveLength(1);
    expect(out[0].op).toBe("changed");
    expect(out[0].path).toBe("$.a");
  });

  it("ignored keys in nested objects are also skipped", () => {
    const src = { user: { name: "alice", ts: "old" } };
    const tgt = { user: { name: "alice", ts: "new" } };
    expect(diffs(src, tgt, { ignoreKeys: ["ts"] })).toHaveLength(0);
  });

  it("empty ignoreKeys array has no effect", () => {
    const out = diffs({ a: 1 }, { a: 2 }, { ignoreKeys: [] });
    expect(out).toHaveLength(1);
  });

  it("ignoreKeys with no match has no effect", () => {
    const out = diffs({ a: 1 }, { a: 2 }, { ignoreKeys: ["x"] });
    expect(out).toHaveLength(1);
  });
});

// ── numericTolerance ─────────────────────────────────────────────────────────
describe("numericTolerance option", () => {
  it("treats numbers within tolerance as equal", () => {
    const out = diffs({ v: 1.0 }, { v: 1.001 }, { numericTolerance: 0.01 });
    expect(out).toHaveLength(0);
  });

  it("reports numbers outside tolerance as changed", () => {
    const out = diffs({ v: 1.0 }, { v: 1.1 }, { numericTolerance: 0.01 });
    expect(out).toHaveLength(1);
    expect(out[0].op).toBe("changed");
  });

  it("tolerance of 0 behaves like strict equality", () => {
    const out = diffs({ v: 1.0 }, { v: 1.0 }, { numericTolerance: 0 });
    expect(out).toHaveLength(0);
    const out2 = diffs({ v: 1.0 }, { v: 1.1 }, { numericTolerance: 0 });
    expect(out2).toHaveLength(1);
  });

  it("handles negative numbers and negative differences", () => {
    const out = diffs({ v: -1.0 }, { v: -1.005 }, { numericTolerance: 0.01 });
    expect(out).toHaveLength(0);
  });

  it("clearly within tolerance → equal", () => {
    // |1.0 - 1.005| = 0.005 <= 0.01 → equal (safe from FP rounding)
    const out = diffs({ v: 1.0 }, { v: 1.005 }, { numericTolerance: 0.01 });
    expect(out).toHaveLength(0);
  });

  it("clearly outside tolerance → changed", () => {
    // |1.0 - 1.02| = 0.02 > 0.01 → changed
    const out = diffs({ v: 1.0 }, { v: 1.02 }, { numericTolerance: 0.01 });
    expect(out).toHaveLength(1);
  });

  it("non-numeric values are not affected by numericTolerance", () => {
    const out = diffs({ s: "a" }, { s: "b" }, { numericTolerance: 999 });
    expect(out).toHaveLength(1);
    expect(out[0].op).toBe("changed");
  });
});

// ── ignoreCase ───────────────────────────────────────────────────────────────
describe("ignoreCase option", () => {
  it("treats same-case-insensitive strings as equal", () => {
    const out = diffs({ s: "Hello" }, { s: "hello" }, { ignoreCase: true });
    expect(out).toHaveLength(0);
  });

  it("still reports truly different strings as changed", () => {
    const out = diffs({ s: "hello" }, { s: "world" }, { ignoreCase: true });
    expect(out).toHaveLength(1);
    expect(out[0].op).toBe("changed");
  });

  it("case-insensitive match emits equal entry", () => {
    const all = diff({ s: "ABC" }, { s: "abc" }, { ignoreCase: true });
    const eq = all.filter(c => c.op === "equal");
    expect(eq).toHaveLength(1);
    expect(eq[0].from).toBe("ABC");
    expect(eq[0].to).toBe("abc");
  });

  it("numbers are not affected by ignoreCase", () => {
    const out = diffs({ n: 1 }, { n: 2 }, { ignoreCase: true });
    expect(out).toHaveLength(1);
  });

  it("nested strings are affected", () => {
    const out = diffs({ a: { b: "X" } }, { a: { b: "x" } }, { ignoreCase: true });
    expect(out).toHaveLength(0);
  });

  it("without ignoreCase, case-different strings are changed", () => {
    const out = diffs({ s: "Hello" }, { s: "hello" });
    expect(out).toHaveLength(1);
    expect(out[0].op).toBe("changed");
  });
});

// ── combined options ──────────────────────────────────────────────────────────
describe("combined options", () => {
  it("ignoreKeys + ignoreCase together", () => {
    const src = { name: "Alice", ts: "old" };
    const tgt = { name: "alice", ts: "new" };
    const out = diffs(src, tgt, { ignoreKeys: ["ts"], ignoreCase: true });
    expect(out).toHaveLength(0);
  });

  it("numericTolerance + ignoreCase together", () => {
    const src = { label: "Hello", score: 1.0 };
    const tgt = { label: "hello", score: 1.001 };
    const out = diffs(src, tgt, { ignoreCase: true, numericTolerance: 0.01 });
    expect(out).toHaveLength(0);
  });
});
