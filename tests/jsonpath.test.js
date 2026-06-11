// tests/jsonpath.test.js — F-2: JSONPath query bar
//
// Unit tests for the hand-rolled JSONPath evaluator in src/jsonpath.js.
// Every supported operator has at least one pass test and one boundary test.
//
// A parity guard at the bottom asserts the inline copy in json_compare.html
// (between JSONPATH:START / JSONPATH:END) is byte-identical to src/jsonpath.js.

import { describe, it, expect } from "vitest";
import { readFileSync }          from "node:fs";
import { fileURLToPath }         from "node:url";
import { dirname, join }         from "node:path";
import { jsonpathQuery }         from "../src/jsonpath.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── Helpers ───────────────────────────────────────────────────────────────────
const vals  = results => results.map(r => r.value);
const paths = results => results.map(r => r.path);

// Sample document used by most tests
const DOC = {
  store: {
    book: [
      { category: "reference", author: "Nigel Rees",   title: "Sayings of the Century",    price: 8.95 },
      { category: "fiction",   author: "Evelyn Waugh", title: "Sword of Honour",            price: 12.99 },
      { category: "fiction",   author: "Herman Melville", title: "Moby Dick",               price: 8.99, isbn: "0-553-21311-3" },
      { category: "fiction",   author: "J. R. R. Tolkien", title: "The Lord of the Rings", price: 22.99, isbn: "0-395-19395-8" },
    ],
    bicycle: { color: "red", price: 19.95 },
  },
  expensive: 10,
};

// ── Root ──────────────────────────────────────────────────────────────────────
describe("root ($)", () => {
  it("bare $ returns the whole document", () => {
    expect(vals(jsonpathQuery(DOC, "$"))).toEqual([DOC]);
    expect(paths(jsonpathQuery(DOC, "$"))).toEqual([[]]);
  });
  it("empty expression returns root", () => {
    expect(vals(jsonpathQuery(42, ""))).toEqual([42]);
  });
  it("root with only whitespace returns root", () => {
    expect(vals(jsonpathQuery("hello", "  $  "))).toEqual(["hello"]);
  });
});

// ── Child access ─────────────────────────────────────────────────────────────
describe("child (.key, ['key'])", () => {
  it("dot notation: $.store", () => {
    const r = jsonpathQuery(DOC, "$.store");
    expect(r.length).toBe(1);
    expect(r[0].value).toBe(DOC.store);
    expect(r[0].path).toEqual(["store"]);
  });
  it("bracket notation: $['store']", () => {
    expect(vals(jsonpathQuery(DOC, "$['store']"))).toEqual([DOC.store]);
  });
  it("bracket with double quotes: $[\"store\"]", () => {
    expect(vals(jsonpathQuery(DOC, '$["store"]'))).toEqual([DOC.store]);
  });
  it("nested child: $.store.bicycle.color", () => {
    expect(vals(jsonpathQuery(DOC, "$.store.bicycle.color"))).toEqual(["red"]);
    expect(paths(jsonpathQuery(DOC, "$.store.bicycle.color"))).toEqual([["store", "bicycle", "color"]]);
  });
  it("missing key returns empty", () => {
    expect(jsonpathQuery(DOC, "$.missing")).toEqual([]);
  });
  it("child on a non-object returns empty", () => {
    expect(jsonpathQuery(DOC, "$.expensive.nope")).toEqual([]);
  });
  it("keys with hyphens", () => {
    const d = { "content-type": "application/json" };
    expect(vals(jsonpathQuery(d, "$['content-type']"))).toEqual(["application/json"]);
  });
});

// ── Array index ───────────────────────────────────────────────────────────────
describe("array index ([n])", () => {
  it("first element: $.store.book[0].title", () => {
    expect(vals(jsonpathQuery(DOC, "$.store.book[0].title"))).toEqual(["Sayings of the Century"]);
  });
  it("last element via negative index: [-1]", () => {
    const r = jsonpathQuery(DOC, "$.store.book[-1].title");
    expect(r[0].value).toBe("The Lord of the Rings");
  });
  it("out-of-bounds index returns empty", () => {
    expect(jsonpathQuery(DOC, "$.store.book[99]")).toEqual([]);
  });
  it("index on non-array returns empty", () => {
    expect(jsonpathQuery(DOC, "$.store.bicycle[0]")).toEqual([]);
  });
  it("path includes numeric index", () => {
    const r = jsonpathQuery(DOC, "$.store.book[2]");
    expect(r[0].path).toEqual(["store", "book", 2]);
  });
});

// ── Wildcard ──────────────────────────────────────────────────────────────────
describe("wildcard (.* / [*])", () => {
  it("[*] on array: all books", () => {
    expect(vals(jsonpathQuery(DOC, "$.store.book[*]")).length).toBe(4);
  });
  it(".* on object: all top-level keys", () => {
    const r = jsonpathQuery(DOC, "$.*");
    expect(r.length).toBe(2); // store + expensive
    expect(r.map(x => x.path[0]).sort()).toEqual(["expensive", "store"]);
  });
  it("wildcard then child: $.store.book[*].price", () => {
    const prices = vals(jsonpathQuery(DOC, "$.store.book[*].price"));
    expect(prices).toEqual([8.95, 12.99, 8.99, 22.99]);
  });
  it("wildcard on scalar returns empty", () => {
    expect(jsonpathQuery(DOC, "$.expensive.*")).toEqual([]);
  });
  it("[*].author: returns all 4 authors", () => {
    expect(jsonpathQuery(DOC, "$.store.book[*].author").length).toBe(4);
  });
});

// ── Slice ─────────────────────────────────────────────────────────────────────
describe("slice ([n:m], [n:m:s])", () => {
  it("[1:3] selects indices 1 and 2", () => {
    const r = jsonpathQuery(DOC, "$.store.book[1:3]");
    expect(r.length).toBe(2);
    expect(r[0].value.title).toBe("Sword of Honour");
    expect(r[1].value.title).toBe("Moby Dick");
  });
  it("[:2] selects first two", () => {
    expect(jsonpathQuery(DOC, "$.store.book[:2]").length).toBe(2);
  });
  it("[2:] selects from index 2 to end", () => {
    expect(jsonpathQuery(DOC, "$.store.book[2:]").length).toBe(2);
  });
  it("[::2] selects every other element", () => {
    const r = jsonpathQuery(DOC, "$.store.book[::2]");
    expect(r.length).toBe(2);
    expect(r[0].value.title).toBe("Sayings of the Century");
    expect(r[1].value.title).toBe("Moby Dick");
  });
  it("[::-1] reverses", () => {
    const r = jsonpathQuery(DOC, "$.store.book[::-1]");
    expect(r.length).toBe(4);
    expect(r[0].value.title).toBe("The Lord of the Rings");
    expect(r[3].value.title).toBe("Sayings of the Century");
  });
  it("[-2:] selects last two", () => {
    const r = jsonpathQuery(DOC, "$.store.book[-2:]");
    expect(r.length).toBe(2);
    expect(r[0].value.title).toBe("Moby Dick");
  });
  it("empty slice range returns no results", () => {
    expect(jsonpathQuery(DOC, "$.store.book[5:10]")).toEqual([]);
  });
  it("step=0 is silently skipped (no results, no throw)", () => {
    expect(() => jsonpathQuery(DOC, "$.store.book[::0]")).not.toThrow();
    expect(jsonpathQuery(DOC, "$.store.book[::0]")).toEqual([]);
  });
});

// ── Recursive descent ─────────────────────────────────────────────────────────
describe("recursive descent (..key, ..*)", () => {
  it("$..author returns all 4 authors", () => {
    const r = jsonpathQuery(DOC, "$..author");
    expect(r.length).toBe(4);
    expect(vals(r)).toContain("Nigel Rees");
  });
  it("$..price returns all prices (books + bicycle)", () => {
    const r = jsonpathQuery(DOC, "$..price");
    expect(r.length).toBe(5); // 4 books + bicycle
    expect(vals(r)).toContain(8.95);
    expect(vals(r)).toContain(19.95);
  });
  it("$.store..price returns same 5 prices", () => {
    expect(jsonpathQuery(DOC, "$.store..price").length).toBe(5);
  });
  it("$..*  returns all leaf and container nodes", () => {
    const r = jsonpathQuery(DOC, "$..*");
    expect(r.length).toBeGreaterThan(10);
  });
  it("$..isbn returns only 2 books that have isbn", () => {
    expect(jsonpathQuery(DOC, "$..isbn").length).toBe(2);
  });
  it("recursive with bracket wildcard $..[*]", () => {
    const r = jsonpathQuery(DOC, "$.store.book..[*]");
    // All elements under book array and their children
    expect(r.length).toBeGreaterThan(4);
  });
});

// ── Filter ────────────────────────────────────────────────────────────────────
describe("filter [?()]", () => {
  it("existence: books that have an isbn", () => {
    const r = jsonpathQuery(DOC, "$.store.book[?(@.isbn)]");
    expect(r.length).toBe(2);
  });
  it("== : books with price == 8.95", () => {
    const r = jsonpathQuery(DOC, "$.store.book[?(@.price == 8.95)]");
    expect(r.length).toBe(1);
    expect(r[0].value.title).toBe("Sayings of the Century");
  });
  it("< : cheap books (price < 10)", () => {
    const r = jsonpathQuery(DOC, "$.store.book[?(@.price < 10)]");
    expect(r.length).toBe(2);
  });
  it("> : expensive books (price > 10)", () => {
    const r = jsonpathQuery(DOC, "$.store.book[?(@.price > 10)]");
    expect(r.length).toBe(2);
  });
  it("<= : price <= 8.95", () => {
    const r = jsonpathQuery(DOC, "$.store.book[?(@.price <= 8.95)]");
    expect(r.length).toBe(1);
  });
  it(">= : price >= 22.99", () => {
    const r = jsonpathQuery(DOC, "$.store.book[?(@.price >= 22.99)]");
    expect(r.length).toBe(1);
    expect(r[0].value.title).toBe("The Lord of the Rings");
  });
  it("!= : books not in fiction category", () => {
    const r = jsonpathQuery(DOC, "$.store.book[?(@.category != 'fiction')]");
    expect(r.length).toBe(1);
    expect(r[0].value.category).toBe("reference");
  });
  it("== string literal in double quotes", () => {
    const r = jsonpathQuery(DOC, '$.store.book[?(@.category == "fiction")]');
    expect(r.length).toBe(3);
  });
  it("filter > expensive threshold using root value comparison (literal number)", () => {
    const r = jsonpathQuery(DOC, "$.store.book[?(@.price > 10)]");
    expect(r.length).toBe(2);
  });
  it("filter on array of objects: select matching elements", () => {
    // [?()] iterates children of each current node and tests each child as @.
    // $.items selects ONE node (the array); [?(@.x > 1)] iterates its elements.
    const d = { items: [{ x: 1 }, { x: 2 }, { x: 3 }] };
    const r = jsonpathQuery(d, "$.items[?(@.x > 1)]");
    expect(r.length).toBe(2);
    expect(r.map(m => m.value.x)).toEqual([2, 3]);
  });
  it("filter with no match returns empty", () => {
    expect(jsonpathQuery(DOC, "$.store.book[?(@.price > 100)]")).toEqual([]);
  });
  it("boolean literal: [?(@.active == true)]", () => {
    const d = [{ active: true }, { active: false }, { active: true }];
    expect(jsonpathQuery(d, "$[?(@.active == true)]").length).toBe(2);
  });
  it("null literal: [?(@.tag == null)]", () => {
    const d = [{ tag: null }, { tag: "x" }, {}];
    expect(jsonpathQuery(d, "$[?(@.tag == null)]").length).toBe(1);
  });
  it("non-existent key in accessor → false (no crash)", () => {
    expect(jsonpathQuery(DOC, "$.store.book[?(@.nonexistent == 1)]")).toEqual([]);
  });
});

// ── Union ─────────────────────────────────────────────────────────────────────
describe("union (['a','b'])", () => {
  it("selects two named keys", () => {
    const d = { a: 1, b: 2, c: 3 };
    const r = jsonpathQuery(d, "$['a','b']");
    expect(r.length).toBe(2);
    expect(vals(r).sort()).toEqual([1, 2]);
  });
  it("missing key in union is silently skipped", () => {
    const d = { a: 1, c: 3 };
    const r = jsonpathQuery(d, "$['a','b','c']");
    expect(r.length).toBe(2);
  });
});

// ── Edge cases & error handling ───────────────────────────────────────────────
describe("error handling", () => {
  it("throws on expression not starting with $", () => {
    expect(() => jsonpathQuery({}, "store.book")).toThrow(/must start with '\$'/);
  });
  it("throws on unmatched [", () => {
    expect(() => jsonpathQuery({}, "$[0")).toThrow(/Unmatched '\['/);
  });
  it("throws on unexpected character", () => {
    expect(() => jsonpathQuery({}, "$ .x")).toThrow(/Unexpected character/);
  });
  it("throws on non-string expression", () => {
    expect(() => jsonpathQuery({}, 123)).toThrow(/must be a string/);
  });
  it("querying null document returns root", () => {
    expect(vals(jsonpathQuery(null, "$"))).toEqual([null]);
  });
  it("querying a scalar with child step returns empty", () => {
    expect(jsonpathQuery(42, "$.x")).toEqual([]);
  });
  it("deep nesting doesn't throw", () => {
    let obj = {}; let cur = obj;
    for (let i = 0; i < 100; i++) { cur.child = {}; cur = cur.child; }
    cur.leaf = "found";
    const expr = "$" + ".child".repeat(100) + ".leaf";
    expect(vals(jsonpathQuery(obj, expr))).toEqual(["found"]);
  });
});

// ── Complex queries ───────────────────────────────────────────────────────────
describe("complex queries", () => {
  it("filter then child: cheap book titles", () => {
    const titles = vals(jsonpathQuery(DOC, "$.store.book[?(@.price < 10)].title"));
    expect(titles.length).toBe(2);
    expect(titles).toContain("Sayings of the Century");
    expect(titles).toContain("Moby Dick");
  });
  it("recursive + wildcard: all string values", () => {
    const d = { a: "x", b: { c: "y", d: [1, "z"] } };
    const strs = vals(jsonpathQuery(d, "$..*")).filter(v => typeof v === "string");
    expect(strs.sort()).toEqual(["x", "y", "z"]);
  });
  it("slice + child: titles of books 1-2", () => {
    const r = jsonpathQuery(DOC, "$.store.book[1:3].title");
    expect(vals(r)).toEqual(["Sword of Honour", "Moby Dick"]);
  });
  it("recursive descent then filter", () => {
    const r = jsonpathQuery(DOC, "$.store..book[?(@.price > 20)]");
    expect(r.length).toBe(1);
  });
  it("path array has correct types (string for obj key, number for array idx)", () => {
    const r = jsonpathQuery(DOC, "$.store.book[0].author");
    expect(r[0].path).toEqual(["store", "book", 0, "author"]);
    expect(typeof r[0].path[2]).toBe("number");
    expect(typeof r[0].path[3]).toBe("string");
  });
  it("result paths for all prices (recursive)", () => {
    const r = jsonpathQuery(DOC, "$..price");
    r.forEach(({ path }) => {
      expect(path[path.length - 1]).toBe("price");
    });
  });
});

// ── Next/prev wraparound: not applicable (query returns all matches at once) ──

// ── Parity guard ──────────────────────────────────────────────────────────────
// Ensures the inline JSONPATH block in json_compare.html matches
// src/jsonpath.js character-for-character.

function extractJSONPathBlock(text, label) {
  const lines = text.split("\n");
  const s = lines.findIndex(l => l === "/* JSONPATH:START */");
  const e = lines.findIndex(l => l === "/* JSONPATH:END */");
  if (s === -1 || e === -1 || e <= s) {
    throw new Error("JSONPATH markers not found (or malformed) in " + label);
  }
  return lines.slice(s + 1, e).join("\n").trim();
}

describe("jsonpath parity (module vs inlined HTML copy)", () => {
  it("the inlined copy in json_compare.html matches src/jsonpath.js", () => {
    const moduleSrc = readFileSync(join(root, "src/jsonpath.js"),      "utf8");
    const htmlSrc   = readFileSync(join(root, "json_compare.html"),    "utf8");
    const a = extractJSONPathBlock(moduleSrc, "src/jsonpath.js");
    const b = extractJSONPathBlock(htmlSrc,   "json_compare.html");
    expect(b).toBe(a);
  });
});
