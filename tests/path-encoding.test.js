// T4 — unambiguous path encoding (B3).
//
// Keys containing "." "[" "]" must not collide with structural nesting/indexing.
// The core carries a structured `segs` array on every Change; selection and
// tree grouping key off those segments (not the lossy display-string path).
import { describe, it, expect } from "vitest";
import {
  diff,
  segLabel,
  segKey,
  segId,
  segsStartWith,
  entriesUnderSegs,
} from "../src/diff-core.js";

const diffs = (a, b, opts) => diff(a, b, opts).filter((c) => c.op !== "equal");

describe("Change carries structured segments", () => {
  it("object key -> single key segment", () => {
    const [c] = diffs({ a: 1 }, { a: 2 });
    expect(c.segs).toEqual([{ k: "a" }]);
  });

  it("nested object -> chained key segments", () => {
    const [c] = diffs({ a: { b: 1 } }, { a: { b: 2 } });
    expect(c.segs).toEqual([{ k: "a" }, { k: "b" }]);
  });

  it("array element -> index segment", () => {
    const [c] = diffs(["a", "b"], ["a", "x"]);
    expect(c.segs).toEqual([{ i: 1 }]);
  });

  it("unordered multiset -> star segment", () => {
    const [c] = diffs([1, 1, 2], [1, 2], { unordered: true });
    expect(c.segs).toEqual([{ star: true }]);
  });
});

describe("dotted / bracket keys are distinguishable from nesting", () => {
  it('literal "a.b" key differs from nested a -> b', () => {
    const literal = diffs({ "a.b": 1 }, { "a.b": 2 });
    const nested = diffs({ a: { b: 1 } }, { a: { b: 2 } });
    // Both render the SAME display path today...
    expect(literal[0].path).toBe(nested[0].path);
    // ...but their unambiguous identity differs.
    expect(literal[0].segs).toEqual([{ k: "a.b" }]);
    expect(nested[0].segs).toEqual([{ k: "a" }, { k: "b" }]);
    expect(segId(literal[0].segs)).not.toBe(segId(nested[0].segs));
  });

  it('literal "x[0]" key differs from array index x[0]', () => {
    const literal = diffs({ "x[0]": 1 }, { "x[0]": 2 });
    const indexed = diffs({ x: [1] }, { x: [2] });
    expect(literal[0].path).toBe(indexed[0].path);
    expect(segId(literal[0].segs)).not.toBe(segId(indexed[0].segs));
  });
});

describe("segment helpers", () => {
  it("segLabel renders human labels", () => {
    expect(segLabel({ k: "a.b" })).toBe("a.b");
    expect(segLabel({ i: 3 })).toBe("[3]");
    expect(segLabel({ star: true })).toBe("[*]");
  });

  it("segKey/segId are unambiguous across types", () => {
    expect(segKey({ k: "0" })).not.toBe(segKey({ i: 0 }));
    // The classic join-ambiguity: ["a","b"] must not equal ["a|k:b"]-style keys.
    expect(segId([{ k: "a" }, { k: "b" }])).not.toBe(segId([{ k: "a|k:b" }]));
  });

  it("segsStartWith does element-wise prefix matching", () => {
    expect(segsStartWith([{ k: "a" }, { k: "b" }], [{ k: "a" }])).toBe(true);
    expect(segsStartWith([{ k: "a.b" }], [{ k: "a" }])).toBe(false);
    expect(segsStartWith([{ k: "a" }], [{ k: "a" }, { k: "b" }])).toBe(false);
  });
});

describe("selection roll-up over keys with . [ ]", () => {
  const src = { a: { b: 1, c: 2 }, "a.b": 10, x: [5], "x[0]": 100 };
  // x gains an element (append) rather than a same-index replace. A scalar
  // replace is intentionally emitted as remove+add at the SAME index (see the
  // diff-core "element replacement shows as remove+add" test), which would put
  // two changes at x[0] — orthogonal to what this block checks (container
  // roll-up vs. a like-named literal key). An append gives x exactly one
  // descendant change, keeping these assertions about path encoding, not LCS.
  const tgt = { a: { b: 9, c: 9 }, "a.b": 11, x: [5, 6], "x[0]": 101 };
  const entries = diffs(src, tgt);

  it("a container rolls up only its true descendants", () => {
    const under = entriesUnderSegs(entries, [{ k: "a" }]).map((e) => segId(e.segs));
    expect(under.sort()).toEqual(
      [segId([{ k: "a" }, { k: "b" }]), segId([{ k: "a" }, { k: "c" }])].sort()
    );
    // the literal "a.b" key must NOT be swept up by the "a" container
    expect(under).not.toContain(segId([{ k: "a.b" }]));
  });

  it("an array container does not capture a like-named literal key", () => {
    const under = entriesUnderSegs(entries, [{ k: "x" }]).map((e) => segId(e.segs));
    expect(under).toEqual([segId([{ k: "x" }, { i: 1 }])]);
    expect(under).not.toContain(segId([{ k: "x[0]" }]));
  });

  it("every change has a unique id (no collisions)", () => {
    const ids = entries.map((e) => segId(e.segs));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
