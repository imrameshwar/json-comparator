// Unit tests for the single pure diff core (T2).
// Covers the cases required by the plan: added / removed / changed /
// type-changed / nested, plus equal, key-order independence and unordered arrays.
import { describe, it, expect } from "vitest";
import { diff, typeName, isScalar, detectPrecisionLoss } from "../src/diff-core.js";

// Helper: only the differences (drop "equal" bookkeeping entries). `segs` (the
// structured identity added in T4) is stripped here so these tests keep
// asserting op/path/from/to shape; segment encoding is covered in
// tests/path-encoding.test.js.
const diffs = (a, b, opts) => diff(a, b, opts).filter(c => c.op !== "equal").map(({ segs, ...c }) => c);

describe("typeName / isScalar", () => {
  it("classifies JSON types", () => {
    expect(typeName(null)).toBe("null");
    expect(typeName([])).toBe("array");
    expect(typeName({})).toBe("object");
    expect(typeName(true)).toBe("boolean");
    expect(typeName(1)).toBe("number");
    expect(typeName("s")).toBe("string");
    expect(isScalar(1)).toBe(true);
    expect(isScalar([])).toBe(false);
    expect(isScalar({})).toBe(false);
  });
});

describe("diff — core ops", () => {
  it("changed scalar", () => {
    expect(diffs({ a: 1 }, { a: 2 })).toEqual([
      { op: "changed", path: "$.a", from: 1, to: 2 },
    ]);
  });

  it("added key", () => {
    expect(diffs({}, { a: 1 })).toEqual([
      { op: "added", path: "$.a", to: 1 },
    ]);
  });

  it("removed key", () => {
    expect(diffs({ a: 1 }, {})).toEqual([
      { op: "removed", path: "$.a", from: 1 },
    ]);
  });

  it("type change stops recursion and records both types", () => {
    expect(diffs({ a: 1 }, { a: "1" })).toEqual([
      { op: "type_changed", path: "$.a", from: 1, to: "1", fromType: "number", toType: "string" },
    ]);
  });

  it("nested objects produce dotted paths", () => {
    expect(diffs({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } })).toEqual([
      { op: "changed", path: "$.a.b.c", from: 1, to: 2 },
    ]);
  });

  it("identical inputs yield no differences (diff(a,a) is empty)", () => {
    const v = { a: 1, b: [1, 2, { c: 3 }], d: null };
    expect(diffs(v, structuredClone(v))).toEqual([]);
  });

  it("is key-order independent for objects", () => {
    expect(diffs({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual([]);
  });

  it("emits equal bookkeeping entries for matched scalar leaves", () => {
    const all = diff({ a: 1 }, { a: 1 }).map(({ segs, ...c }) => c);
    expect(all).toEqual([{ op: "equal", path: "$.a", from: 1, to: 1 }]);
  });
});

describe("diff — arrays", () => {
  it("LCS: trailing add (unambiguous — same result as positional)", () => {
    // ["a","b"] -> ["a","b","c"]: LCS=["a","b"], "c" added at [2]
    expect(diffs(["a", "b"], ["a", "b", "c"])).toEqual([
      { op: "added", path: "$[2]", to: "c" },
    ]);
  });

  it("LCS: scalar insertion at front reports single add (B2 fix)", () => {
    // ["a","b","c"] -> ["x","a","b","c"]: LCS=["a","b","c"], only "x" added
    expect(diffs(["a", "b", "c"], ["x", "a", "b", "c"])).toEqual([
      { op: "added", path: "$[0]", to: "x" },
    ]);
  });

  it("LCS: element replacement shows as remove+add (not changed)", () => {
    // ["a","b"] -> ["a","x"]: LCS=["a"], "b" removed, "x" added
    expect(diffs(["a", "b"], ["a", "x"])).toEqual([
      { op: "removed", path: "$[1]", from: "b" },
      { op: "added", path: "$[1]", to: "x" },
    ]);
  });

  it("LCS: deletion from middle", () => {
    // ["a","b","c"] -> ["a","c"]: LCS=["a","c"], "b" removed
    expect(diffs(["a", "b", "c"], ["a", "c"])).toEqual([
      { op: "removed", path: "$[1]", from: "b" },
    ]);
  });

  it("LCS: identical scalar arrays produce no diffs", () => {
    expect(diffs([1, 2, 3], [1, 2, 3])).toEqual([]);
  });

  it("object arrays without keyBy use positional fallback", () => {
    // Objects are not scalars → positional; first item has a field change
    expect(diffs([{ a: 1 }], [{ a: 2 }])).toEqual([
      { op: "changed", path: "$[0].a", from: 1, to: 2 },
    ]);
  });

  it("keyBy: objects matched by key, reorder doesn't confuse", () => {
    const src = [{ id: 1, v: "old" }, { id: 2, v: "same" }];
    const tgt = [{ id: 2, v: "same" }, { id: 1, v: "new" }];
    const out = diffs(src, tgt, { keyBy: "id" });
    // id:2 unchanged, id:1.v changed "old"→"new"
    expect(out).toEqual([
      { op: "changed", path: "$[0].v", from: "old", to: "new" },
    ]);
  });

  it("keyBy: item only in source → removed; only in target → added", () => {
    const src = [{ id: 1, v: 1 }];
    const tgt = [{ id: 2, v: 2 }];
    const out = diffs(src, tgt, { keyBy: "id" });
    expect(out).toContainEqual({ op: "removed", path: "$[0]", from: { id: 1, v: 1 } });
    expect(out).toContainEqual({ op: "added", path: "$[0]", to: { id: 2, v: 2 } });
  });

  it("unordered scalar arrays honor duplicate counts via [*]", () => {
    // [1,1,2] vs [1,2]: one extra 1 removed (multiset behaviour, T5/B1)
    const out = diffs([1, 1, 2], [1, 2], { unordered: true });
    expect(out).toEqual([{ op: "removed", path: "$[*]", from: 1 }]);
  });

  it("unordered ignores order when multisets match", () => {
    expect(diffs([3, 1, 2], [1, 2, 3], { unordered: true })).toEqual([]);
  });
});

describe("detectPrecisionLoss (T9/B6)", () => {
  it("flags integers beyond 2^53-1", () => {
    const hits = detectPrecisionLoss('{"n": 9007199254740993}');
    expect(hits).toContain("9007199254740993");
  });

  it("ignores safe integers", () => {
    expect(detectPrecisionLoss('{"n": 9007199254740991}')).toEqual([]);
  });

  it("returns empty for normal JSON", () => {
    expect(detectPrecisionLoss('{"a": 1, "b": "hello"}')).toEqual([]);
  });
});
