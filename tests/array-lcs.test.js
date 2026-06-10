// LCS array-matching tests (T6/B2).
//
// Verifies that scalar arrays use LCS (so a single insert/delete doesn't
// cascade), that the key-based opt-in mode matches objects by a field, and
// that mixed/object arrays fall back to positional comparison.
import { describe, it, expect } from "vitest";
import { diff } from "../src/diff-core.js";

const diffs = (a, b, opts) =>
  diff(a, b, opts).filter(c => c.op !== "equal").map(({ segs, ...c }) => c);

describe("LCS ordered-array diff (T6/B2)", () => {
  it("single insert at front → 1 added (the B2 regression)", () => {
    const out = diffs(["a", "b", "c"], ["x", "a", "b", "c"]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ op: "added", path: "$[0]", to: "x" });
  });

  it("single delete from middle → 1 removed", () => {
    const out = diffs(["a", "b", "c"], ["a", "c"]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ op: "removed", path: "$[1]", from: "b" });
  });

  it("single insert at end → 1 added", () => {
    const out = diffs(["a", "b"], ["a", "b", "c"]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ op: "added", path: "$[2]", to: "c" });
  });

  it("prefix insert doesn't cascade to unchanged tail", () => {
    const out = diffs([1, 2, 3], [0, 1, 2, 3]);
    // LCS=[1,2,3], only 0 is added
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ op: "added", path: "$[0]", to: 0 });
  });

  it("empty source → all elements added", () => {
    const out = diffs([], ["a", "b"]);
    expect(out).toEqual([
      { op: "added", path: "$[0]", to: "a" },
      { op: "added", path: "$[1]", to: "b" },
    ]);
  });

  it("empty target → all elements removed", () => {
    const out = diffs(["a", "b"], []);
    expect(out).toEqual([
      { op: "removed", path: "$[0]", from: "a" },
      { op: "removed", path: "$[1]", from: "b" },
    ]);
  });

  it("completely different arrays → all removed then all added", () => {
    const out = diffs(["a", "b"], ["x", "y"]);
    expect(out.filter(c => c.op === "removed")).toHaveLength(2);
    expect(out.filter(c => c.op === "added")).toHaveLength(2);
  });

  it("identical scalar arrays → no diffs", () => {
    expect(diffs([1, 2, 3], [1, 2, 3])).toEqual([]);
  });

  it("numeric scalars matched by value, not position", () => {
    // [10,20,30] → [5,10,30]: LCS=[10,30], 20 removed, 5 added
    const out = diffs([10, 20, 30], [5, 10, 30]);
    expect(out).toContainEqual({ op: "removed", path: "$[1]", from: 20 });
    expect(out).toContainEqual({ op: "added", path: "$[0]", to: 5 });
    expect(out).not.toContainEqual(expect.objectContaining({ op: "changed" }));
  });
});

describe("object-array positional fallback (T6/B2)", () => {
  it("object arrays without keyBy use positional comparison", () => {
    const out = diffs([{ a: 1 }], [{ a: 2 }]);
    // Positional: walk src[0] vs tgt[0], field 'a' changed
    expect(out).toEqual([{ op: "changed", path: "$[0].a", from: 1, to: 2 }]);
  });

  it("mixed array (object + scalar) uses positional fallback", () => {
    const out = diffs([1, { a: 1 }], [1, { a: 2 }]);
    expect(out).toEqual([{ op: "changed", path: "$[1].a", from: 1, to: 2 }]);
  });
});

describe("keyBy array matching (T6/B2)", () => {
  it("matched items are recursively diffed by field", () => {
    const src = [{ id: 1, v: "old" }, { id: 2, v: "same" }];
    const tgt = [{ id: 1, v: "new" }, { id: 2, v: "same" }];
    const out = diffs(src, tgt, { keyBy: "id" });
    expect(out).toEqual([{ op: "changed", path: "$[0].v", from: "old", to: "new" }]);
  });

  it("reordered items matched by key — no spurious diffs", () => {
    const src = [{ id: 1, v: "a" }, { id: 2, v: "b" }];
    const tgt = [{ id: 2, v: "b" }, { id: 1, v: "a" }];
    expect(diffs(src, tgt, { keyBy: "id" })).toEqual([]);
  });

  it("item only in source → removed", () => {
    const src = [{ id: 1, v: 1 }, { id: 2, v: 2 }];
    const tgt = [{ id: 2, v: 2 }];
    const out = diffs(src, tgt, { keyBy: "id" });
    expect(out).toHaveLength(1);
    expect(out[0].op).toBe("removed");
    expect(out[0].from).toEqual({ id: 1, v: 1 });
  });

  it("item only in target → added", () => {
    const src = [{ id: 1, v: 1 }];
    const tgt = [{ id: 1, v: 1 }, { id: 2, v: 2 }];
    const out = diffs(src, tgt, { keyBy: "id" });
    expect(out).toHaveLength(1);
    expect(out[0].op).toBe("added");
    expect(out[0].to).toEqual({ id: 2, v: 2 });
  });

  it("all items replaced → all removed + all added", () => {
    const src = [{ id: 1 }];
    const tgt = [{ id: 2 }];
    const out = diffs(src, tgt, { keyBy: "id" });
    expect(out.some(c => c.op === "removed")).toBe(true);
    expect(out.some(c => c.op === "added")).toBe(true);
  });

  it("nested diffs surfaced through key match", () => {
    const src = [{ id: "x", data: { count: 1 } }];
    const tgt = [{ id: "x", data: { count: 99 } }];
    const out = diffs(src, tgt, { keyBy: "id" });
    expect(out).toEqual([{ op: "changed", path: "$[0].data.count", from: 1, to: 99 }]);
  });
});
