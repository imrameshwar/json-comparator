// tests/format-tools.test.js — E-2: Sort-keys + Minify helpers
//
// Tests the pure sortKeys helper (mirrored verbatim from json_compare.html).
// No DOM required.
import { describe, it, expect } from "vitest";

// ---- Pure helper — copy of the function in json_compare.html ----
// Recursively alphabetises object keys. Arrays are left untouched (element
// order is semantically significant in JSON arrays). All other primitives
// are returned as-is.
function sortKeys(val) {
  if (Array.isArray(val)) return val.map(sortKeys);
  if (val !== null && typeof val === "object") {
    return Object.fromEntries(Object.keys(val).sort().map(k => [k, sortKeys(val[k])]));
  }
  return val;
}

// ---- flat object --------------------------------------------------------

describe("sortKeys — flat object", () => {
  it("sorts two keys in reverse order", () => {
    const out = sortKeys({ b: 2, a: 1 });
    expect(Object.keys(out)).toEqual(["a", "b"]);
  });

  it("sorts multiple keys alphabetically", () => {
    const out = sortKeys({ z: 1, m: 2, a: 3 });
    expect(Object.keys(out)).toEqual(["a", "m", "z"]);
  });

  it("preserves values after sorting", () => {
    const out = sortKeys({ b: 99, a: 42 });
    expect(out.a).toBe(42);
    expect(out.b).toBe(99);
  });

  it("already-sorted object is unchanged structurally", () => {
    const out = sortKeys({ a: 1, b: 2, c: 3 });
    expect(Object.keys(out)).toEqual(["a", "b", "c"]);
  });

  it("single-key object is a no-op", () => {
    const out = sortKeys({ x: 7 });
    expect(Object.keys(out)).toEqual(["x"]);
    expect(out.x).toBe(7);
  });

  it("empty object returns empty object", () => {
    expect(sortKeys({})).toEqual({});
  });
});

// ---- nested object ------------------------------------------------------

describe("sortKeys — nested objects", () => {
  it("sorts keys at every level of nesting", () => {
    const input = { z: { y: 1, x: 2 }, a: { d: 3, b: 4 } };
    const out = sortKeys(input);
    expect(Object.keys(out)).toEqual(["a", "z"]);
    expect(Object.keys(out.a)).toEqual(["b", "d"]);
    expect(Object.keys(out.z)).toEqual(["x", "y"]);
  });

  it("values are preserved through nested sort", () => {
    const input = { b: { d: 10, c: 20 }, a: 5 };
    const out = sortKeys(input);
    expect(out.a).toBe(5);
    expect(out.b.c).toBe(20);
    expect(out.b.d).toBe(10);
  });

  it("deeply nested keys are sorted", () => {
    const input = { c: { b: { z: 1, a: 2 } } };
    const out = sortKeys(input);
    expect(Object.keys(out.c.b)).toEqual(["a", "z"]);
  });

  it("deterministic: running sortKeys twice gives the same result", () => {
    const input = { z: { y: 1, a: 2 }, b: 3, a: { q: 4, p: 5 } };
    const once  = sortKeys(input);
    const twice = sortKeys(once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});

// ---- arrays untouched ---------------------------------------------------

describe("sortKeys — arrays", () => {
  it("does not reorder array elements", () => {
    const input = [3, 1, 2];
    expect(sortKeys(input)).toEqual([3, 1, 2]);
  });

  it("array of objects: object keys are sorted but array order is preserved", () => {
    const input = [{ z: 1, a: 2 }, { y: 3, b: 4 }];
    const out = sortKeys(input);
    // Array order intact
    expect(Object.keys(out[0])).toEqual(["a", "z"]);
    expect(Object.keys(out[1])).toEqual(["b", "y"]);
  });

  it("nested array inside object: array order preserved", () => {
    const input = { b: [3, 2, 1], a: 0 };
    const out = sortKeys(input);
    expect(out.b).toEqual([3, 2, 1]);
  });
});

// ---- primitives & edge cases -------------------------------------------

describe("sortKeys — primitives and edge cases", () => {
  it("passes through null unchanged", () => {
    expect(sortKeys(null)).toBeNull();
  });

  it("passes through numbers unchanged", () => {
    expect(sortKeys(42)).toBe(42);
  });

  it("passes through strings unchanged", () => {
    expect(sortKeys("hello")).toBe("hello");
  });

  it("passes through booleans unchanged", () => {
    expect(sortKeys(true)).toBe(true);
    expect(sortKeys(false)).toBe(false);
  });

  it("non-integer string keys sort lexicographically", () => {
    // Use keys that are not pure integer indices so V8's numeric-index fast
    // path doesn't override the sort order we apply.
    const out = sortKeys({ "z10": "a", "z2": "b", "z1": "c" });
    expect(Object.keys(out)).toEqual(["z1", "z10", "z2"]);
  });
});

// ---- round-trip through JSON.stringify ----------------------------------

describe("sortKeys — JSON round-trip", () => {
  it("sorted output serialises to deterministic JSON", () => {
    const input = { z: 3, a: 1, m: 2 };
    const json = JSON.stringify(sortKeys(input));
    expect(json).toBe('{"a":1,"m":2,"z":3}');
  });

  it("nested fixture produces expected key order when serialised", () => {
    const input = {
      name: "Acme",
      meta: { updated: "2024", created: "2023" },
      id: 1
    };
    const json = JSON.stringify(sortKeys(input));
    // Top-level: id, meta, name; nested meta: created, updated
    expect(json).toBe('{"id":1,"meta":{"created":"2023","updated":"2024"},"name":"Acme"}');
  });
});
