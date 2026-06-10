// tests/filter.test.js — T11: search/filter in results
import { describe, it, expect } from "vitest";
import { filterChanges } from "../src/filter.js";

const ALL_TYPES = new Set(["added", "removed", "changed", "type_changed"]);
const noFilter  = { pathQ: "", valueQ: "", types: ALL_TYPES };
function ch(op, path, from, to) { return { op, path, segs: [], from, to }; }

// ── path filter ──────────────────────────────────────────────────────────────
describe("filterChanges — path filter", () => {
  const entries = [
    ch("added",   "$.name",         undefined, "alice"),
    ch("removed", "$.age",          30,        undefined),
    ch("changed", "$.address.city", "NYC",     "LA"),
    ch("changed", "$.address.zip",  "10001",   "90001"),
  ];

  it("returns all when filter is empty", () => {
    expect(filterChanges(entries, noFilter)).toHaveLength(4);
  });

  it("filters by path substring", () => {
    const r = filterChanges(entries, { ...noFilter, pathQ: "address" });
    expect(r).toHaveLength(2);
    expect(r.map(e => e.path)).toEqual(["$.address.city", "$.address.zip"]);
  });

  it("path filter is case-insensitive", () => {
    const r = filterChanges(entries, { ...noFilter, pathQ: "ADDRESS" });
    expect(r).toHaveLength(2);
  });

  it("returns empty when path matches nothing", () => {
    const r = filterChanges(entries, { ...noFilter, pathQ: "nonexistent" });
    expect(r).toHaveLength(0);
  });

  it("exact root path match", () => {
    const r = filterChanges(entries, { ...noFilter, pathQ: "$.name" });
    expect(r).toHaveLength(1);
    expect(r[0].op).toBe("added");
  });
});

// ── value filter ─────────────────────────────────────────────────────────────
describe("filterChanges — value filter", () => {
  const entries = [
    ch("added",   "$.name",  undefined, "alice"),
    ch("removed", "$.name2", "bob",     undefined),
    ch("changed", "$.age",   30,        31),
    ch("changed", "$.score", 1.5,       2.5),
  ];

  it("matches to-value for added entries", () => {
    const r = filterChanges(entries, { ...noFilter, valueQ: "alice" });
    expect(r).toHaveLength(1);
    expect(r[0].op).toBe("added");
  });

  it("matches from-value for removed entries", () => {
    const r = filterChanges(entries, { ...noFilter, valueQ: "bob" });
    expect(r).toHaveLength(1);
    expect(r[0].op).toBe("removed");
  });

  it("matches numeric value substring", () => {
    const r = filterChanges(entries, { ...noFilter, valueQ: "30" });
    expect(r).toHaveLength(1);
    expect(r[0].path).toBe("$.age");
  });

  it("matches both sides of a changed entry", () => {
    // valueQ "31" matches the `to` side of $.age
    const r = filterChanges(entries, { ...noFilter, valueQ: "31" });
    expect(r).toHaveLength(1);
  });

  it("value filter is case-insensitive", () => {
    const r = filterChanges(entries, { ...noFilter, valueQ: "ALICE" });
    expect(r).toHaveLength(1);
  });
});

// ── type filter ───────────────────────────────────────────────────────────────
describe("filterChanges — type filter", () => {
  const entries = [
    ch("added",        "$.a", undefined, 1),
    ch("removed",      "$.b", 2,         undefined),
    ch("changed",      "$.c", 3,         4),
    ch("type_changed", "$.d", 5,         "5"),
  ];

  it("added only", () => {
    const r = filterChanges(entries, { ...noFilter, types: new Set(["added"]) });
    expect(r).toHaveLength(1);
    expect(r[0].op).toBe("added");
  });

  it("removed only", () => {
    const r = filterChanges(entries, { ...noFilter, types: new Set(["removed"]) });
    expect(r).toHaveLength(1);
    expect(r[0].op).toBe("removed");
  });

  it("changed + type_changed", () => {
    const r = filterChanges(entries, { ...noFilter, types: new Set(["changed", "type_changed"]) });
    expect(r).toHaveLength(2);
  });

  it("empty types set returns empty array", () => {
    const r = filterChanges(entries, { ...noFilter, types: new Set() });
    expect(r).toHaveLength(0);
  });

  it("all four types returns all entries", () => {
    expect(filterChanges(entries, noFilter)).toHaveLength(4);
  });
});

// ── combined filters ──────────────────────────────────────────────────────────
describe("filterChanges — combined", () => {
  const entries = [
    ch("added",   "$.user.name", undefined, "alice"),
    ch("changed", "$.user.age",  30,        31),
    ch("removed", "$.meta.tags", ["x"],     undefined),
  ];

  it("path + type", () => {
    const r = filterChanges(entries, { ...noFilter, pathQ: "user", types: new Set(["added"]) });
    expect(r).toHaveLength(1);
    expect(r[0].op).toBe("added");
  });

  it("all three combined", () => {
    const r = filterChanges(entries, { pathQ: "user", valueQ: "31", types: new Set(["changed"]) });
    expect(r).toHaveLength(1);
    expect(r[0].path).toBe("$.user.age");
  });

  it("path filter with no type match → empty", () => {
    const r = filterChanges(entries, { pathQ: "meta", valueQ: "", types: new Set(["added"]) });
    expect(r).toHaveLength(0);
  });
});

// ── edge cases ────────────────────────────────────────────────────────────────
describe("filterChanges — edge cases", () => {
  it("empty input returns empty array", () => {
    expect(filterChanges([], noFilter)).toEqual([]);
  });

  it("undefined pathQ/valueQ treated as empty string", () => {
    const entries = [ch("added", "$.x", undefined, 1)];
    expect(filterChanges(entries, { types: ALL_TYPES })).toHaveLength(1);
  });

  it("entries with object values matched by JSON stringification", () => {
    const entries = [ch("removed", "$.obj", { key: "hello" }, undefined)];
    const r = filterChanges(entries, { ...noFilter, valueQ: "hello" });
    expect(r).toHaveLength(1);
  });
});
