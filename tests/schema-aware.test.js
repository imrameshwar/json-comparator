// tests/schema-aware.test.js — G-3: schema-aware diff tests.
//
// Covers:
//   1. _collectVolatilePaths  — volatile path extraction from schema
//   2. _schemaAtPath          — schema navigation by tokenized path
//   3. _schemaTypeViolation   — type mismatch detection
//   4. diffCore with opts.schema — suppress volatile, annotate violations
//   5. Combined: explicit ignorePaths + schema volatile paths
//   6. No schema → unchanged behaviour (backward compat)
//   7. Edge cases: null values, nested, array items, type arrays

import { describe, it, expect } from "vitest";
import {
  diff,
  _collectVolatilePaths,
  _schemaAtPath,
  _schemaTypeViolation,
  _tokenizePath,
} from "../src/index.js";

// ─── 1. _collectVolatilePaths ────────────────────────────────────────────────
describe("G-3: _collectVolatilePaths", () => {

  it("collects a single top-level volatile property", () => {
    const schema = { properties: { ts: { "x-volatile": true } } };
    const out = [];
    _collectVolatilePaths(schema, "$", out);
    expect(out).toEqual(["$.ts"]);
  });

  it("collects multiple volatile properties", () => {
    const schema = {
      properties: {
        ts:        { "x-volatile": true },
        updatedAt: { "x-volatile": true },
        name:      { type: "string" },
      },
    };
    const out = [];
    _collectVolatilePaths(schema, "$", out);
    expect(out).toContain("$.ts");
    expect(out).toContain("$.updatedAt");
    expect(out).not.toContain("$.name");
  });

  it("recurses into nested objects", () => {
    const schema = {
      properties: {
        meta: {
          properties: {
            updatedAt: { "x-volatile": true },
            version:   { type: "number" },
          },
        },
      },
    };
    const out = [];
    _collectVolatilePaths(schema, "$", out);
    expect(out).toEqual(["$.meta.updatedAt"]);
  });

  it("recurses into array items", () => {
    const schema = {
      properties: {
        items: {
          items: { properties: { ts: { "x-volatile": true } } },
        },
      },
    };
    const out = [];
    _collectVolatilePaths(schema, "$", out);
    expect(out).toEqual(["$.items[*].ts"]);
  });

  it("does not push '$' itself even if marked volatile", () => {
    const schema = { "x-volatile": true };
    const out = [];
    _collectVolatilePaths(schema, "$", out);
    expect(out).toHaveLength(0);
  });

  it("returns empty array for schema with no volatile properties", () => {
    const schema = { properties: { a: { type: "string" }, b: { type: "number" } } };
    const out = [];
    _collectVolatilePaths(schema, "$", out);
    expect(out).toHaveLength(0);
  });

  it("handles non-object schema gracefully", () => {
    const out = [];
    _collectVolatilePaths(null, "$", out);
    _collectVolatilePaths("string", "$", out);
    expect(out).toHaveLength(0);
  });
});

// ─── 2. _schemaAtPath ────────────────────────────────────────────────────────
describe("G-3: _schemaAtPath", () => {

  const schema = {
    type: "object",
    properties: {
      name:  { type: "string" },
      age:   { type: "integer" },
      addr:  { properties: { zip: { type: "string" } } },
      tags:  { items: { type: "string" } },
    },
  };

  it("returns root schema for path '$'", () => {
    const node = _schemaAtPath(schema, _tokenizePath("$"));
    expect(node).toBe(schema);
  });

  it("resolves a top-level property", () => {
    const node = _schemaAtPath(schema, _tokenizePath("$.name"));
    expect(node).toEqual({ type: "string" });
  });

  it("resolves a nested property", () => {
    const node = _schemaAtPath(schema, _tokenizePath("$.addr.zip"));
    expect(node).toEqual({ type: "string" });
  });

  it("resolves an array element via wildcard", () => {
    const node = _schemaAtPath(schema, _tokenizePath("$.tags[*]"));
    expect(node).toEqual({ type: "string" });
  });

  it("resolves an array element via numeric index", () => {
    const node = _schemaAtPath(schema, _tokenizePath("$.tags[0]"));
    expect(node).toEqual({ type: "string" });
  });

  it("returns null for unknown property", () => {
    const node = _schemaAtPath(schema, _tokenizePath("$.unknown"));
    expect(node).toBeNull();
  });

  it("returns null for path through non-object", () => {
    const node = _schemaAtPath(schema, _tokenizePath("$.name.deep"));
    expect(node).toBeNull();
  });
});

// ─── 3. _schemaTypeViolation ──────────────────────────────────────────────────
describe("G-3: _schemaTypeViolation", () => {

  it("returns null when value matches declared type", () => {
    expect(_schemaTypeViolation("hello",   { type: "string"  })).toBeNull();
    expect(_schemaTypeViolation(42,        { type: "number"  })).toBeNull();
    expect(_schemaTypeViolation(42,        { type: "integer" })).toBeNull();
    expect(_schemaTypeViolation(true,      { type: "boolean" })).toBeNull();
    expect(_schemaTypeViolation([],        { type: "array"   })).toBeNull();
    expect(_schemaTypeViolation({},        { type: "object"  })).toBeNull();
  });

  it("returns violation when value does not match type", () => {
    const v = _schemaTypeViolation(42, { type: "string" });
    expect(v).not.toBeNull();
    expect(v.expected).toBe("string");
    expect(v.got).toBe("number");
  });

  it("handles type arrays — returns null if any type matches", () => {
    expect(_schemaTypeViolation(null, { type: ["string", "null"] })).toBeNull();
    expect(_schemaTypeViolation("x",  { type: ["string", "null"] })).toBeNull();
  });

  it("handles type arrays — returns violation when none match", () => {
    const v = _schemaTypeViolation(42, { type: ["string", "boolean"] });
    expect(v).not.toBeNull();
    expect(v.expected).toBe("string|boolean");
  });

  it("returns null when value is null (null handled by schema validator, not here)", () => {
    expect(_schemaTypeViolation(null, { type: "string" })).toBeNull();
  });

  it("returns null when schemaNode is null", () => {
    expect(_schemaTypeViolation("x", null)).toBeNull();
  });

  it("returns null when schemaNode has no type field", () => {
    expect(_schemaTypeViolation("x", { description: "no type" })).toBeNull();
  });
});

// ─── 4. diffCore with opts.schema ────────────────────────────────────────────
describe("G-3: diffCore with opts.schema", () => {

  // Schema with one volatile path and one typed property
  const schema = {
    type: "object",
    properties: {
      name:      { type: "string" },
      score:     { type: "number" },
      updatedAt: { "x-volatile": true },
    },
  };

  it("suppresses volatile path (updatedAt) from diff", () => {
    const src = { name: "Alice", score: 10, updatedAt: "2024-01-01" };
    const tgt = { name: "Alice", score: 10, updatedAt: "2024-12-31" };
    const changes = diff(src, tgt, { schema }).filter(c => c.op !== "equal");
    expect(changes).toHaveLength(0);
  });

  it("does not suppress non-volatile paths", () => {
    const src = { name: "Alice", score: 10, updatedAt: "2024-01-01" };
    const tgt = { name: "Bob",   score: 10, updatedAt: "2024-12-31" };
    const changes = diff(src, tgt, { schema }).filter(c => c.op !== "equal");
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe("$.name");
  });

  it("annotates type violation on changed value", () => {
    const src = { name: "Alice", score: 10,    updatedAt: "x" };
    const tgt = { name: "Alice", score: "ten", updatedAt: "y" };
    const changes = diff(src, tgt, { schema }).filter(c => c.op !== "equal");
    // updatedAt suppressed; score type violation expected
    const scoreDiff = changes.find(c => c.path === "$.score");
    expect(scoreDiff).toBeDefined();
    expect(scoreDiff.schemaViolation).toBeDefined();
    expect(scoreDiff.schemaViolation.expected).toBe("number");
    expect(scoreDiff.schemaViolation.got).toBe("string");
  });

  it("annotates type violation on added value", () => {
    const src = { name: "Alice" };
    const tgt = { name: "Alice", score: "oops" };
    const changes = diff(src, tgt, { schema }).filter(c => c.op !== "equal");
    const scoreDiff = changes.find(c => c.path === "$.score");
    expect(scoreDiff).toBeDefined();
    expect(scoreDiff.schemaViolation).toBeDefined();
    expect(scoreDiff.schemaViolation.expected).toBe("number");
  });

  it("does not annotate removed entries (no 'to' value to check)", () => {
    const src = { name: "Alice", score: 10 };
    const tgt = { name: "Alice" };
    const changes = diff(src, tgt, { schema }).filter(c => c.op !== "equal");
    const scoreDiff = changes.find(c => c.path === "$.score");
    expect(scoreDiff).toBeDefined();
    expect(scoreDiff.schemaViolation).toBeUndefined();
  });

  it("does not annotate type-conforming changes", () => {
    const src = { name: "Alice", score: 10 };
    const tgt = { name: "Bob",   score: 20 };
    const changes = diff(src, tgt, { schema }).filter(c => c.op !== "equal");
    for (const c of changes) {
      expect(c.schemaViolation).toBeUndefined();
    }
  });

  it("type violation on nested property", () => {
    const nestedSchema = {
      properties: {
        user: {
          properties: {
            age: { type: "integer" },
          },
        },
      },
    };
    const src = { user: { age: 30 } };
    const tgt = { user: { age: "thirty" } };
    const changes = diff(src, tgt, { schema: nestedSchema }).filter(c => c.op !== "equal");
    const ageDiff = changes.find(c => c.path === "$.user.age");
    expect(ageDiff.schemaViolation).toBeDefined();
    expect(ageDiff.schemaViolation.got).toBe("string");
  });

  it("type violation on array items", () => {
    const arrSchema = {
      properties: {
        tags: {
          items: { type: "string" },
        },
      },
    };
    const src = { tags: ["a", "b"] };
    const tgt = { tags: ["a", 99]  };
    const changes = diff(src, tgt, { schema: arrSchema }).filter(c => c.op !== "equal");
    const tagDiff = changes.find(c => c.schemaViolation);
    expect(tagDiff).toBeDefined();
    expect(tagDiff.schemaViolation.expected).toBe("string");
    expect(tagDiff.schemaViolation.got).toBe("number");
  });
});

// ─── 5. Combined: explicit ignorePaths + schema volatile ─────────────────────
describe("G-3: combined ignorePaths + schema volatile paths", () => {

  it("both explicit and schema volatile paths are suppressed", () => {
    const schema = { properties: { ts: { "x-volatile": true } } };
    const src = { a: 1, ts: "old", b: 2 };
    const tgt = { a: 1, ts: "new", b: 99 };
    // Explicit: suppress $.b; schema volatile: suppress $.ts
    const changes = diff(src, tgt, { schema, ignorePaths: ["$.b"] }).filter(c => c.op !== "equal");
    expect(changes).toHaveLength(0);
  });

  it("explicit ignorePaths work even without schema", () => {
    const src = { a: 1, b: 2 };
    const tgt = { a: 1, b: 99 };
    const changes = diff(src, tgt, { ignorePaths: ["$.b"] }).filter(c => c.op !== "equal");
    expect(changes).toHaveLength(0);
  });
});

// ─── 6. No schema → backward compatible ──────────────────────────────────────
describe("G-3: no schema → existing behaviour unchanged", () => {

  it("diff without schema returns same result as before G-3", () => {
    const src = { a: 1, b: 2, c: 3 };
    const tgt = { a: 1, b: 9, d: 4 };
    const changes = diff(src, tgt).filter(c => c.op !== "equal");
    expect(changes).toHaveLength(3); // b changed, c removed, d added
    for (const c of changes) expect(c.schemaViolation).toBeUndefined();
  });

  it("undefined schema in opts is ignored", () => {
    const src = { x: 1 };
    const tgt = { x: 2 };
    const changes = diff(src, tgt, { schema: undefined }).filter(c => c.op !== "equal");
    expect(changes).toHaveLength(1);
    expect(changes[0].schemaViolation).toBeUndefined();
  });
});
