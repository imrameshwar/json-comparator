// tests/line-diff.test.js — T13: line-level diff for raw-text view
import { describe, it, expect } from "vitest";
import { splitLines, lineDiff } from "../src/line-diff.js";

// ── splitLines ────────────────────────────────────────────────────────────────
describe("splitLines", () => {
  it("empty string returns empty array", () => {
    expect(splitLines("")).toEqual([]);
  });
  it("single line without newline", () => {
    expect(splitLines("hello")).toEqual(["hello"]);
  });
  it("lines with newlines attached", () => {
    const result = splitLines("a\nb\nc");
    expect(result).toEqual(["a\n", "b\n", "c"]);
  });
  it("trailing newline does not produce empty last element", () => {
    const result = splitLines("a\nb\n");
    expect(result).toEqual(["a\n", "b\n"]);
  });
  it("single newline", () => {
    expect(splitLines("\n")).toEqual(["\n"]);
  });
});

// ── lineDiff ─────────────────────────────────────────────────────────────────
function diffs(src, tgt) {
  return lineDiff(splitLines(src), splitLines(tgt));
}
function totalOp(hunks, op) {
  return hunks.filter(h => h.op === op).reduce((n, h) => n + h.lines.length, 0);
}
function reconstruct(hunks, side) {
  // side: "src" uses removed+equal; "tgt" uses added+equal
  return hunks
    .filter(h => side === "src" ? h.op !== "added" : h.op !== "removed")
    .flatMap(h => h.lines).join("");
}

describe("lineDiff — basic", () => {
  it("identical inputs → all equal", () => {
    const h = diffs("a\nb\n", "a\nb\n");
    expect(totalOp(h, "equal")).toBe(2);
    expect(totalOp(h, "added")).toBe(0);
    expect(totalOp(h, "removed")).toBe(0);
  });

  it("empty src → all added", () => {
    const h = diffs("", "a\nb\n");
    expect(totalOp(h, "added")).toBe(2);
    expect(totalOp(h, "removed")).toBe(0);
  });

  it("empty tgt → all removed", () => {
    const h = diffs("a\nb\n", "");
    expect(totalOp(h, "removed")).toBe(2);
    expect(totalOp(h, "added")).toBe(0);
  });

  it("single line change", () => {
    const h = diffs("a\nb\nc\n", "a\nX\nc\n");
    expect(totalOp(h, "removed")).toBe(1);
    expect(totalOp(h, "added")).toBe(1);
    expect(totalOp(h, "equal")).toBe(2);
  });

  it("insertion at start", () => {
    const h = diffs("b\nc\n", "a\nb\nc\n");
    expect(totalOp(h, "added")).toBe(1);
    expect(totalOp(h, "equal")).toBe(2);
  });

  it("deletion from middle", () => {
    const h = diffs("a\nb\nc\n", "a\nc\n");
    expect(totalOp(h, "removed")).toBe(1);
    expect(totalOp(h, "equal")).toBe(2);
  });
});

describe("lineDiff — reconstruction", () => {
  it("src can be reconstructed from removed+equal hunks", () => {
    const src = "a\nb\nc\n";
    const tgt = "a\nX\nc\n";
    const h = diffs(src, tgt);
    expect(reconstruct(h, "src")).toBe(src);
  });

  it("tgt can be reconstructed from added+equal hunks", () => {
    const src = "a\nb\nc\n";
    const tgt = "a\nX\nc\n";
    const h = diffs(src, tgt);
    expect(reconstruct(h, "tgt")).toBe(tgt);
  });

  it("round-trips a realistic JSON diff", () => {
    const src = JSON.stringify({ a: 1, b: 2, c: [1, 2] }, null, 2);
    const tgt = JSON.stringify({ a: 1, b: 3, d: "new" }, null, 2);
    const h = diffs(src, tgt);
    expect(reconstruct(h, "src")).toBe(src);
    expect(reconstruct(h, "tgt")).toBe(tgt);
  });
});

describe("lineDiff — hunk shapes", () => {
  it("only equal hunks when files are identical", () => {
    const h = diffs("x\n", "x\n");
    expect(h.every(hk => hk.op === "equal")).toBe(true);
  });

  it("consecutive changes are merged into single hunk", () => {
    const h = diffs("a\nb\n", "c\nd\n");
    const removed = h.filter(hk => hk.op === "removed");
    expect(removed).toHaveLength(1);
    expect(removed[0].lines).toHaveLength(2);
  });
});
