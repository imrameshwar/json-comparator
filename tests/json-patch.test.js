// tests/json-patch.test.js — T17: RFC 6902 JSON Patch export
import { describe, it, expect } from "vitest";
import { diff } from "../src/diff-core.js";
import { segsToPointer, changesToPatch, applyPatch } from "../src/json-patch.js";

// Property test helper: apply patch from diff(src,tgt) to src and assert === tgt
function roundTrip(src, tgt, opts) {
  const changes = diff(src, tgt, opts);
  const ops = changesToPatch(changes);
  return applyPatch(src, ops);
}

// ── segsToPointer ─────────────────────────────────────────────────────────────
describe("segsToPointer", () => {
  it("empty segs → empty pointer", () => {
    expect(segsToPointer([])).toBe("");
  });
  it("single object key", () => {
    expect(segsToPointer([{ k: "name" }])).toBe("name");
  });
  it("nested keys", () => {
    expect(segsToPointer([{ k: "a" }, { k: "b" }])).toBe("a/b");
  });
  it("array index", () => {
    expect(segsToPointer([{ i: 2 }])).toBe("2");
  });
  it("key with slash escaped per RFC 6901", () => {
    expect(segsToPointer([{ k: "a/b" }])).toBe("a~1b");
  });
  it("key with tilde escaped per RFC 6901", () => {
    expect(segsToPointer([{ k: "a~b" }])).toBe("a~0b");
  });
  it("star → end-of-array marker", () => {
    expect(segsToPointer([{ star: true }])).toBe("-");
  });
});

// ── changesToPatch ────────────────────────────────────────────────────────────
describe("changesToPatch — operation types", () => {
  it("added key → add op", () => {
    const ops = changesToPatch(diff({}, { x: 1 }));
    expect(ops).toContainEqual({ op: "add", path: "/x", value: 1 });
  });

  it("removed key → remove op", () => {
    const ops = changesToPatch(diff({ x: 1 }, {}));
    expect(ops).toContainEqual({ op: "remove", path: "/x" });
  });

  it("changed scalar → replace op", () => {
    const ops = changesToPatch(diff({ x: 1 }, { x: 2 }));
    expect(ops).toContainEqual({ op: "replace", path: "/x", value: 2 });
  });

  it("type_changed → replace op", () => {
    const ops = changesToPatch(diff({ x: 1 }, { x: "1" }));
    expect(ops).toContainEqual({ op: "replace", path: "/x", value: "1" });
  });

  it("equal entries produce no ops", () => {
    const ops = changesToPatch(diff({ x: 1 }, { x: 1 }));
    expect(ops).toHaveLength(0);
  });

  it("star-segs entries (unordered) are skipped", () => {
    const ch = [{ op: "removed", path: "$[*]", segs: [{ star: true }], from: 1 }];
    expect(changesToPatch(ch)).toHaveLength(0);
  });

  it("nested path", () => {
    const ops = changesToPatch(diff({ a: { b: 1 } }, { a: { b: 2 } }));
    expect(ops).toContainEqual({ op: "replace", path: "/a/b", value: 2 });
  });

  it("array add (LCS scalar)", () => {
    const ops = changesToPatch(diff(["a", "b"], ["a", "b", "c"]));
    expect(ops.some(o => o.op === "add" && o.value === "c")).toBe(true);
  });
});

// ── applyPatch ────────────────────────────────────────────────────────────────
describe("applyPatch", () => {
  it("add property", () => {
    expect(applyPatch({}, [{ op: "add", path: "/x", value: 42 }])).toEqual({ x: 42 });
  });
  it("remove property", () => {
    expect(applyPatch({ x: 1, y: 2 }, [{ op: "remove", path: "/x" }])).toEqual({ y: 2 });
  });
  it("replace property", () => {
    expect(applyPatch({ x: 1 }, [{ op: "replace", path: "/x", value: 99 }])).toEqual({ x: 99 });
  });
  it("add to array by index", () => {
    expect(applyPatch([1, 3], [{ op: "add", path: "/1", value: 2 }])).toEqual([1, 2, 3]);
  });
  it("remove from array", () => {
    expect(applyPatch([1, 2, 3], [{ op: "remove", path: "/1" }])).toEqual([1, 3]);
  });
  it("nested replace", () => {
    expect(applyPatch({ a: { b: 1 } }, [{ op: "replace", path: "/a/b", value: 2 }]))
      .toEqual({ a: { b: 2 } });
  });
  it("does not mutate the original", () => {
    const src = { x: 1 };
    applyPatch(src, [{ op: "replace", path: "/x", value: 99 }]);
    expect(src.x).toBe(1);  // original unchanged
  });
});

// ── property tests: patch(src, diff(src,tgt)) === tgt ─────────────────────────
describe("round-trip property test: applyPatch(src, patch) === tgt", () => {
  const cases = [
    ["empty→populated", {}, { a: 1, b: [1, 2] }],
    ["scalar change",   { x: 1 }, { x: 2 }],
    ["nested change",   { a: { b: { c: 1 } } }, { a: { b: { c: 2 } } }],
    ["key added",       { a: 1 }, { a: 1, b: 2 }],
    ["key removed",     { a: 1, b: 2 }, { a: 1 }],
    ["type change",     { x: 1 }, { x: "1" }],
    ["array scalar lcs",["a","b","c"], ["a","c"]],
    ["array lcs insert",["a","c"], ["a","b","c"]],
    ["object array",    [{ id: 1, v: 1 }], [{ id: 1, v: 2 }]],
    ["mixed nested",    { u: { name: "a", age: 1 }, tags: ["x"] },
                        { u: { name: "b", age: 1 }, tags: ["x", "y"] }],
  ];

  for (const [label, src, tgt] of cases) {
    it(label, () => {
      const result = roundTrip(src, tgt);
      expect(result).toEqual(tgt);
    });
  }
});
