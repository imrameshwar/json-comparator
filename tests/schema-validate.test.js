// tests/schema-validate.test.js — F-1: JSON Schema validation
//
// Unit tests for the hand-rolled draft-07 subset validator in
// src/schema-validate.js.  Each supported keyword has at least one
// pass test (no violations) and one fail test (violation produced).
//
// A parity guard at the bottom asserts the inline copy in json_compare.html
// is byte-identical to src/schema-validate.js.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateSchema } from "../src/schema-validate.js";

// Convenience: extract only paths from a violation list for assertion clarity.
const paths = vs => vs.map(v => v.path);
// Convenience: all violations without a specific path.
const msgs  = vs => vs.map(v => v.message);

// ── Parity guard ──────────────────────────────────────────────────────────────
// Ensures the inline SCHEMA-VALIDATE block in json_compare.html matches
// src/schema-validate.js character-for-character.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function extractSchemaValidate(text, label) {
  const lines = text.split("\n");
  const s = lines.findIndex(l => l === "/* SCHEMA-VALIDATE:START */");
  const e = lines.findIndex(l => l === "/* SCHEMA-VALIDATE:END */");
  if (s === -1 || e === -1 || e <= s) {
    throw new Error(`SCHEMA-VALIDATE markers not found (or malformed) in ${label}`);
  }
  return lines.slice(s + 1, e).join("\n").trim();
}

describe("schema-validate parity (module vs inlined HTML copy)", () => {
  it("the inlined copy in json_compare.html matches src/schema-validate.js", () => {
    const moduleSrc = readFileSync(join(root, "src/schema-validate.js"), "utf8");
    const htmlSrc   = readFileSync(join(root, "json_compare.html"),      "utf8");
    const a = extractSchemaValidate(moduleSrc, "src/schema-validate.js");
    const b = extractSchemaValidate(htmlSrc,   "json_compare.html");
    expect(b).toBe(a);
  });
});

// ── null / undefined schema ───────────────────────────────────────────────────
describe("validateSchema — null/undefined schema", () => {
  it("returns [] for null schema", () => expect(validateSchema(null, {})).toEqual([]));
  it("returns [] for undefined schema", () => expect(validateSchema(undefined, {})).toEqual([]));
});

// ── boolean schemas ───────────────────────────────────────────────────────────
describe("boolean schemas", () => {
  it("true schema → always valid", () => expect(validateSchema(true, "anything")).toEqual([]));
  it("false schema → always invalid", () => expect(validateSchema(false, "anything")).toHaveLength(1));
  it("false schema message mentions 'disallows'", () => {
    expect(msgs(validateSchema(false, 42))[0]).toMatch(/disallow/i);
  });
});

// ── type ──────────────────────────────────────────────────────────────────────
describe("type keyword", () => {
  it("string — pass", () => expect(validateSchema({ type: "string" }, "hi")).toEqual([]));
  it("string — fail (number given)", () => {
    const vs = validateSchema({ type: "string" }, 42);
    expect(vs).toHaveLength(1);
    expect(vs[0].path).toBe("");
    expect(vs[0].message).toMatch(/Expected type string, got number/);
  });
  it("number — pass", () => expect(validateSchema({ type: "number" }, 3.14)).toEqual([]));
  it("number — fail (string given)", () => expect(validateSchema({ type: "number" }, "3.14")).toHaveLength(1));
  it("integer — pass for whole number", () => expect(validateSchema({ type: "integer" }, 7)).toEqual([]));
  it("integer — fail for float", () => {
    const vs = validateSchema({ type: "integer" }, 7.5);
    expect(vs[0].message).toMatch(/integer/);
  });
  it("boolean — pass", () => expect(validateSchema({ type: "boolean" }, true)).toEqual([]));
  it("boolean — fail", () => expect(validateSchema({ type: "boolean" }, 0)).toHaveLength(1));
  it("null — pass", () => expect(validateSchema({ type: "null" }, null)).toEqual([]));
  it("null — fail (undefined not null)", () => expect(validateSchema({ type: "null" }, "null")).toHaveLength(1));
  it("array — pass", () => expect(validateSchema({ type: "array" }, [])).toEqual([]));
  it("object — pass", () => expect(validateSchema({ type: "object" }, {})).toEqual([]));
  it("type array — pass if one matches", () => {
    expect(validateSchema({ type: ["string", "null"] }, null)).toEqual([]);
    expect(validateSchema({ type: ["string", "null"] }, "hi")).toEqual([]);
  });
  it("type array — fail if none match", () => {
    expect(validateSchema({ type: ["string", "null"] }, 42)).toHaveLength(1);
  });
});

// ── enum ──────────────────────────────────────────────────────────────────────
describe("enum keyword", () => {
  it("pass when value is in enum", () => expect(validateSchema({ enum: [1, 2, 3] }, 2)).toEqual([]));
  it("pass when null is in enum", () => expect(validateSchema({ enum: [null, "x"] }, null)).toEqual([]));
  it("fail when value is not in enum", () => {
    const vs = validateSchema({ enum: ["a", "b"] }, "c");
    expect(vs[0].message).toMatch(/must be one of/);
  });
  it("deep equality for objects in enum", () => {
    expect(validateSchema({ enum: [{ x: 1 }] }, { x: 1 })).toEqual([]);
    expect(validateSchema({ enum: [{ x: 1 }] }, { x: 2 })).toHaveLength(1);
  });
});

// ── const ─────────────────────────────────────────────────────────────────────
describe("const keyword", () => {
  it("pass when value equals const", () => expect(validateSchema({ const: 42 }, 42)).toEqual([]));
  it("fail when value differs", () => {
    const vs = validateSchema({ const: 42 }, 43);
    expect(vs[0].message).toMatch(/must equal/);
  });
  it("const null — pass", () => expect(validateSchema({ const: null }, null)).toEqual([]));
});

// ── minLength / maxLength ─────────────────────────────────────────────────────
describe("minLength / maxLength", () => {
  it("pass within bounds", () => expect(validateSchema({ minLength: 2, maxLength: 5 }, "abc")).toEqual([]));
  it("fail below minLength", () => {
    expect(validateSchema({ minLength: 3 }, "ab")[0].message).toMatch(/minLength/);
  });
  it("fail above maxLength", () => {
    expect(validateSchema({ maxLength: 3 }, "abcd")[0].message).toMatch(/maxLength/);
  });
  it("non-string data — ignored (no false positives)", () => {
    expect(validateSchema({ minLength: 10 }, 5)).toEqual([]);
  });
});

// ── pattern ───────────────────────────────────────────────────────────────────
describe("pattern keyword", () => {
  it("pass when string matches pattern", () => expect(validateSchema({ pattern: "^\\d+$" }, "123")).toEqual([]));
  it("fail when string does not match", () => {
    const vs = validateSchema({ pattern: "^\\d+$" }, "abc");
    expect(vs[0].message).toMatch(/pattern/);
  });
  it("invalid regex — no crash, no violation", () => {
    expect(() => validateSchema({ pattern: "[invalid" }, "abc")).not.toThrow();
  });
  it("non-string — ignored", () => expect(validateSchema({ pattern: "\\d" }, 5)).toEqual([]));
});

// ── minimum / maximum ─────────────────────────────────────────────────────────
describe("minimum / maximum", () => {
  it("pass at boundary", () => {
    expect(validateSchema({ minimum: 0, maximum: 10 }, 5)).toEqual([]);
    expect(validateSchema({ minimum: 5 }, 5)).toEqual([]);
    expect(validateSchema({ maximum: 5 }, 5)).toEqual([]);
  });
  it("fail below minimum", () => {
    expect(validateSchema({ minimum: 1 }, 0)[0].message).toMatch(/minimum/);
  });
  it("fail above maximum", () => {
    expect(validateSchema({ maximum: 10 }, 11)[0].message).toMatch(/maximum/);
  });
  it("non-number — ignored", () => expect(validateSchema({ minimum: 5 }, "3")).toEqual([]));
});

// ── exclusiveMinimum / exclusiveMaximum ───────────────────────────────────────
describe("exclusiveMinimum / exclusiveMaximum (draft-07 number form)", () => {
  it("pass when strictly above exMin", () => {
    expect(validateSchema({ exclusiveMinimum: 0 }, 0.001)).toEqual([]);
  });
  it("fail when equal to exMin", () => {
    const vs = validateSchema({ exclusiveMinimum: 5 }, 5);
    expect(vs[0].message).toMatch(/strictly greater/);
  });
  it("pass when strictly below exMax", () => {
    expect(validateSchema({ exclusiveMaximum: 10 }, 9.999)).toEqual([]);
  });
  it("fail when equal to exMax", () => {
    const vs = validateSchema({ exclusiveMaximum: 10 }, 10);
    expect(vs[0].message).toMatch(/strictly less/);
  });
});

describe("exclusiveMinimum / exclusiveMaximum (draft-04 boolean form)", () => {
  it("draft-04 exMin true + minimum — fail at boundary", () => {
    const vs = validateSchema({ minimum: 5, exclusiveMinimum: true }, 5);
    expect(vs[0].message).toMatch(/strictly greater/);
  });
  it("draft-04 exMax true + maximum — fail at boundary", () => {
    const vs = validateSchema({ maximum: 10, exclusiveMaximum: true }, 10);
    expect(vs[0].message).toMatch(/strictly less/);
  });
});

// ── multipleOf ────────────────────────────────────────────────────────────────
describe("multipleOf keyword", () => {
  it("pass — 10 is multiple of 5", () => expect(validateSchema({ multipleOf: 5 }, 10)).toEqual([]));
  it("pass — 0 is multiple of any positive", () => expect(validateSchema({ multipleOf: 3 }, 0)).toEqual([]));
  it("fail — 7 is not multiple of 3", () => {
    expect(validateSchema({ multipleOf: 3 }, 7)[0].message).toMatch(/multiple/);
  });
});

// ── required ─────────────────────────────────────────────────────────────────
describe("required keyword", () => {
  it("pass — all required keys present", () => {
    expect(validateSchema({ required: ["a", "b"] }, { a: 1, b: 2 })).toEqual([]);
  });
  it("fail — missing key", () => {
    const vs = validateSchema({ required: ["a", "b"] }, { a: 1 });
    expect(vs).toHaveLength(1);
    expect(vs[0].message).toMatch(/"b" is missing/);
    expect(vs[0].path).toBe("");
  });
  it("multiple missing → multiple violations", () => {
    expect(validateSchema({ required: ["x", "y", "z"] }, {})).toHaveLength(3);
  });
});

// ── properties ────────────────────────────────────────────────────────────────
describe("properties keyword", () => {
  it("pass — property matches its schema", () => {
    expect(validateSchema({ properties: { age: { type: "number" } } }, { age: 30 })).toEqual([]);
  });
  it("fail — nested property violation has correct path", () => {
    const vs = validateSchema({ properties: { age: { type: "number" } } }, { age: "thirty" });
    expect(vs).toHaveLength(1);
    expect(vs[0].path).toBe("/age");
    expect(vs[0].message).toMatch(/Expected type number/);
  });
  it("extra properties are allowed by default", () => {
    expect(validateSchema({ properties: { a: { type: "string" } } }, { a: "x", b: 99 })).toEqual([]);
  });
  it("property absent from data — not validated", () => {
    expect(validateSchema({ properties: { a: { type: "number" } } }, { b: "x" })).toEqual([]);
  });
});

// ── additionalProperties ──────────────────────────────────────────────────────
describe("additionalProperties keyword", () => {
  it("false — pass when no extra props", () => {
    const schema = { properties: { a: {} }, additionalProperties: false };
    expect(validateSchema(schema, { a: 1 })).toEqual([]);
  });
  it("false — fail for extra prop, path is child", () => {
    const schema = { properties: { a: {} }, additionalProperties: false };
    const vs = validateSchema(schema, { a: 1, b: 2 });
    expect(vs).toHaveLength(1);
    expect(vs[0].path).toBe("/b");
    expect(vs[0].message).toMatch(/Additional property "b"/);
  });
  it("schema — validate extra props against it", () => {
    const schema = { properties: { a: {} }, additionalProperties: { type: "string" } };
    const vs = validateSchema(schema, { a: 1, extra: 42 });
    expect(vs[0].path).toBe("/extra");
    expect(vs[0].message).toMatch(/Expected type string/);
  });
});

// ── minProperties / maxProperties ────────────────────────────────────────────
describe("minProperties / maxProperties", () => {
  it("minProperties — pass", () => expect(validateSchema({ minProperties: 1 }, { a: 1 })).toEqual([]));
  it("minProperties — fail", () => expect(validateSchema({ minProperties: 2 }, { a: 1 })).toHaveLength(1));
  it("maxProperties — pass", () => expect(validateSchema({ maxProperties: 3 }, { a: 1, b: 2 })).toEqual([]));
  it("maxProperties — fail", () => expect(validateSchema({ maxProperties: 1 }, { a: 1, b: 2 })).toHaveLength(1));
});

// ── items (all-items schema) ──────────────────────────────────────────────────
describe("items — single schema", () => {
  it("pass — all items match", () => {
    expect(validateSchema({ items: { type: "number" } }, [1, 2, 3])).toEqual([]);
  });
  it("fail — one item wrong type, path includes index", () => {
    const vs = validateSchema({ items: { type: "number" } }, [1, "two", 3]);
    expect(vs).toHaveLength(1);
    expect(vs[0].path).toBe("/1");
    expect(vs[0].message).toMatch(/Expected type number/);
  });
  it("empty array — always valid", () => {
    expect(validateSchema({ items: { type: "number" } }, [])).toEqual([]);
  });
});

// ── items tuple + additionalItems ─────────────────────────────────────────────
describe("items (tuple) + additionalItems", () => {
  it("tuple — pass when all tuple positions valid", () => {
    const schema = { items: [{ type: "string" }, { type: "number" }] };
    expect(validateSchema(schema, ["hi", 42])).toEqual([]);
  });
  it("tuple — fail second position", () => {
    const schema = { items: [{ type: "string" }, { type: "number" }] };
    const vs = validateSchema(schema, ["hi", "42"]);
    expect(vs[0].path).toBe("/1");
  });
  it("additionalItems: false — fail for extra items", () => {
    const schema = { items: [{ type: "string" }], additionalItems: false };
    const vs = validateSchema(schema, ["hi", "extra"]);
    expect(vs[0].path).toBe("/1");
    expect(vs[0].message).toMatch(/Additional item/);
  });
});

// ── minItems / maxItems ───────────────────────────────────────────────────────
describe("minItems / maxItems", () => {
  it("minItems — pass", () => expect(validateSchema({ minItems: 2 }, [1, 2])).toEqual([]));
  it("minItems — fail", () => {
    const vs = validateSchema({ minItems: 3 }, [1, 2]);
    expect(vs[0].message).toMatch(/minimum is 3/);
  });
  it("maxItems — pass", () => expect(validateSchema({ maxItems: 5 }, [1, 2, 3])).toEqual([]));
  it("maxItems — fail", () => {
    expect(validateSchema({ maxItems: 2 }, [1, 2, 3])).toHaveLength(1);
  });
});

// ── uniqueItems ───────────────────────────────────────────────────────────────
describe("uniqueItems keyword", () => {
  it("pass — all unique", () => expect(validateSchema({ uniqueItems: true }, [1, 2, 3])).toEqual([]));
  it("fail — duplicate detected", () => {
    const vs = validateSchema({ uniqueItems: true }, [1, 2, 1]);
    expect(vs).toHaveLength(1);
    expect(vs[0].message).toMatch(/Duplicate/);
  });
  it("uniqueItems: false — no check", () => {
    expect(validateSchema({ uniqueItems: false }, [1, 1])).toEqual([]);
  });
});

// ── allOf ─────────────────────────────────────────────────────────────────────
describe("allOf keyword", () => {
  it("pass — satisfies all", () => {
    const schema = { allOf: [{ type: "number" }, { minimum: 0 }] };
    expect(validateSchema(schema, 5)).toEqual([]);
  });
  it("fail — violates one branch", () => {
    const schema = { allOf: [{ type: "number" }, { minimum: 10 }] };
    expect(validateSchema(schema, 5)).toHaveLength(1);
  });
  it("fail — violates both branches (required in each)", () => {
    const schema = { allOf: [{ required: ["x"] }, { required: ["y"] }] };
    expect(validateSchema(schema, {})).toHaveLength(2);
  });
});

// ── anyOf ─────────────────────────────────────────────────────────────────────
describe("anyOf keyword", () => {
  it("pass — satisfies one", () => {
    expect(validateSchema({ anyOf: [{ type: "string" }, { type: "number" }] }, 42)).toEqual([]);
  });
  it("fail — satisfies none", () => {
    const vs = validateSchema({ anyOf: [{ type: "string" }, { type: "number" }] }, true);
    expect(vs[0].message).toMatch(/anyOf/);
  });
});

// ── oneOf ─────────────────────────────────────────────────────────────────────
describe("oneOf keyword", () => {
  it("pass — satisfies exactly one", () => {
    const schema = { oneOf: [{ type: "string" }, { type: "number" }] };
    expect(validateSchema(schema, "hi")).toEqual([]);
  });
  it("fail — satisfies zero", () => {
    const schema = { oneOf: [{ type: "string" }, { type: "number" }] };
    const vs = validateSchema(schema, null);
    expect(vs[0].message).toMatch(/oneOf/);
    expect(vs[0].message).toMatch(/matched 0/);
  });
  it("fail — satisfies more than one", () => {
    const schema = { oneOf: [{ type: "number" }, { minimum: 0 }] };
    const vs = validateSchema(schema, 5);
    expect(vs[0].message).toMatch(/matched 2/);
  });
});

// ── not ───────────────────────────────────────────────────────────────────────
describe("not keyword", () => {
  it("pass — sub-schema fails (not negates)", () => {
    expect(validateSchema({ not: { type: "string" } }, 42)).toEqual([]);
  });
  it("fail — sub-schema passes", () => {
    const vs = validateSchema({ not: { type: "number" } }, 42);
    expect(vs[0].message).toMatch(/must not match/);
  });
});

// ── if / then / else ──────────────────────────────────────────────────────────
describe("if / then / else keywords", () => {
  const schema = {
    if:   { type: "string" },
    then: { minLength: 3 },
    else: { minimum: 0 },
  };
  it("if true → then applied — pass", () => expect(validateSchema(schema, "hello")).toEqual([]));
  it("if true → then applied — fail", () => {
    expect(validateSchema(schema, "hi")).toHaveLength(1);
  });
  it("if false → else applied — pass", () => expect(validateSchema(schema, 5)).toEqual([]));
  it("if false → else applied — fail", () => {
    expect(validateSchema(schema, -1)).toHaveLength(1);
  });
});

// ── $ref (internal) ───────────────────────────────────────────────────────────
describe("$ref — internal references", () => {
  it("resolves #/definitions/ ref", () => {
    const schema = {
      $ref: "#/definitions/MyType",
      definitions: { MyType: { type: "string" } },
    };
    expect(validateSchema(schema, "hi")).toEqual([]);
    const vs = validateSchema(schema, 42);
    expect(vs[0].message).toMatch(/Expected type string/);
  });

  it("resolves #/$defs/ ref", () => {
    const schema = {
      $ref: "#/$defs/Address",
      $defs: { Address: { required: ["street"] } },
    };
    const vs = validateSchema(schema, {});
    expect(vs[0].message).toMatch(/"street" is missing/);
  });

  it("unresolvable $ref — no crash, no violation", () => {
    const schema = { $ref: "#/definitions/Missing" };
    expect(() => validateSchema(schema, "anything")).not.toThrow();
    expect(validateSchema(schema, "anything")).toEqual([]);
  });

  it("remote $ref — silently skipped, no network call", () => {
    const schema = { $ref: "https://example.com/schema.json" };
    expect(validateSchema(schema, "anything")).toEqual([]);
  });
});

// ── unsupported keywords (no crash) ───────────────────────────────────────────
describe("unsupported keywords — silently ignored", () => {
  it("format — ignored", () => {
    expect(validateSchema({ type: "string", format: "email" }, "not-an-email")).toEqual([]);
  });
  it("$schema — ignored", () => {
    expect(validateSchema({ $schema: "http://json-schema.org/draft-07/schema#" }, 42)).toEqual([]);
  });
  it("title / description / default — ignored", () => {
    const schema = { title: "Thing", description: "A thing", default: 0 };
    expect(validateSchema(schema, "anything")).toEqual([]);
  });
  it("unevaluatedProperties — ignored", () => {
    expect(validateSchema({ unevaluatedProperties: false }, { extra: 1 })).toEqual([]);
  });
});

// ── deep path encoding ────────────────────────────────────────────────────────
describe("deep path encoding", () => {
  it("nested object path uses / separator", () => {
    const schema = {
      properties: {
        user: {
          properties: {
            age: { type: "number" },
          },
        },
      },
    };
    const vs = validateSchema(schema, { user: { age: "old" } });
    expect(vs[0].path).toBe("/user/age");
  });

  it("array index in path", () => {
    const schema = { items: { type: "number" } };
    const vs = validateSchema(schema, [1, "two"]);
    expect(vs[0].path).toBe("/1");
  });

  it("key with slash is encoded as ~1", () => {
    const schema = { properties: { "a/b": { type: "number" } } };
    const vs = validateSchema(schema, { "a/b": "x" });
    expect(vs[0].path).toBe("/a~1b");
  });

  it("key with tilde is encoded as ~0", () => {
    const schema = { properties: { "a~b": { type: "number" } } };
    const vs = validateSchema(schema, { "a~b": "x" });
    expect(vs[0].path).toBe("/a~0b");
  });
});

// ── depth guard ───────────────────────────────────────────────────────────────
describe("depth guard", () => {
  it("does not crash on a very deeply nested schema (e.g. via allOf chain)", () => {
    // Build a chain: { allOf: [{ allOf: [... 40 deep ...] }] }
    let schema = { type: "number" };
    for (let i = 0; i < 40; i++) schema = { allOf: [schema] };
    expect(() => validateSchema(schema, 5)).not.toThrow();
  });
});

// ── valid complex document ────────────────────────────────────────────────────
describe("complex valid document", () => {
  const schema = {
    type: "object",
    required: ["name", "age", "tags"],
    properties: {
      name: { type: "string", minLength: 1 },
      age:  { type: "integer", minimum: 0, maximum: 150 },
      tags: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true },
      role: { enum: ["admin", "user", "guest"] },
    },
    additionalProperties: false,
  };

  it("valid doc → no violations", () => {
    expect(validateSchema(schema, { name: "Alice", age: 30, tags: ["a", "b"], role: "admin" })).toEqual([]);
  });

  it("multiple violations reported together", () => {
    const vs = validateSchema(schema, { name: "", age: -1, tags: [], role: "superuser" });
    const pathSet = new Set(paths(vs));
    expect(pathSet.has("/name")).toBe(true);   // minLength
    expect(pathSet.has("/age")).toBe(true);    // minimum
    expect(pathSet.has("/tags")).toBe(true);   // minItems
    expect(pathSet.has("/role")).toBe(true);   // enum
  });
});
