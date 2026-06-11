// tests/find.test.js — E-1: Find-in-document search helpers
//
// Tests the pure findMatchOffsets helper (mirrored from json_compare.html)
// and the wraparound nav logic.  No DOM required.
import { describe, it, expect } from "vitest";

// ---- Pure helper — copy of the function in json_compare.html ----
// Returns an array of {start, end} pairs for every occurrence of `query` in
// `text`, advancing by 1 per match so overlapping starts are found.
function findMatchOffsets(text, query, caseSensitive) {
  if (!query) return [];
  const src = caseSensitive ? text  : text.toLowerCase();
  const q   = caseSensitive ? query : query.toLowerCase();
  const res = [];
  let i = 0;
  while (i <= src.length - q.length) {
    const idx = src.indexOf(q, i);
    if (idx === -1) break;
    res.push({ start: idx, end: idx + query.length });
    i = idx + 1;
  }
  return res;
}

// Wraparound nav helpers (mirror of findStep logic in json_compare.html).
function nextMatchIdx(currentIdx, total) {
  if (total === 0) return -1;
  if (currentIdx < 0) return 0;
  return (currentIdx + 1) % total;
}
function prevMatchIdx(currentIdx, total) {
  if (total === 0) return -1;
  if (currentIdx < 0) return total - 1;
  return (currentIdx - 1 + total) % total;
}

// ---- findMatchOffsets ----

describe("findMatchOffsets — basic", () => {
  it("returns [] for empty query", () => {
    expect(findMatchOffsets("hello world", "")).toEqual([]);
  });
  it("returns [] for empty text", () => {
    expect(findMatchOffsets("", "foo")).toEqual([]);
  });
  it("returns [] when query not present", () => {
    expect(findMatchOffsets("hello", "xyz")).toEqual([]);
  });
  it("finds a single match at position 0", () => {
    expect(findMatchOffsets("abc", "abc")).toEqual([{ start: 0, end: 3 }]);
  });
  it("finds a single match in the middle", () => {
    expect(findMatchOffsets("hello", "ell")).toEqual([{ start: 1, end: 4 }]);
  });
  it("finds a single match at the very end", () => {
    expect(findMatchOffsets("abc", "c")).toEqual([{ start: 2, end: 3 }]);
  });
});

describe("findMatchOffsets — multiple matches", () => {
  it("finds two non-overlapping matches", () => {
    const r = findMatchOffsets("abcabc", "abc");
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ start: 0, end: 3 });
    expect(r[1]).toEqual({ start: 3, end: 6 });
  });
  it("finds overlapping starts (i += 1 semantics)", () => {
    // "aaa" with query "aa" → matches at 0–2 and 1–3
    const r = findMatchOffsets("aaa", "aa");
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ start: 0, end: 2 });
    expect(r[1]).toEqual({ start: 1, end: 3 });
  });
  it("counts all occurrences in a JSON string", () => {
    const json = JSON.stringify({ name: "Alice", friend: "Alice" }, null, 2);
    const r = findMatchOffsets(json, "Alice");
    expect(r.length).toBe(2);
  });
});

describe("findMatchOffsets — case sensitivity", () => {
  it("is case-insensitive by default (caseSensitive=false)", () => {
    const r = findMatchOffsets("Hello World", "hello");
    expect(r).toHaveLength(1);
    expect(r[0].start).toBe(0);
  });
  it("finds nothing when case doesn't match (caseSensitive=true)", () => {
    expect(findMatchOffsets("Hello", "hello", true)).toEqual([]);
  });
  it("finds match with exact case (caseSensitive=true)", () => {
    const r = findMatchOffsets("Hello", "Hello", true);
    expect(r).toHaveLength(1);
  });
  it("case-insensitive finds mixed-case content", () => {
    // JSON keys like "Name", "NAME" should both match "name"
    const text = '{"Name":"Alice","NAME":"Bob"}';
    expect(findMatchOffsets(text, "name", false).length).toBe(2);
    expect(findMatchOffsets(text, "name", true).length).toBe(0);
  });
});

describe("findMatchOffsets — multi-line JSON", () => {
  it("finds matches across multiple lines", () => {
    const text = "foo\nbar\nfoo";
    const r = findMatchOffsets(text, "foo");
    expect(r).toHaveLength(2);
    expect(r[0].start).toBe(0);
    expect(r[1].start).toBe(8);   // "foo\nbar\n" = 8 chars
  });
  it("match positions are correct for multi-line JSON keys", () => {
    const json = '{\n  "id": 1,\n  "id": 2\n}';
    const r = findMatchOffsets(json, '"id"', true);
    expect(r).toHaveLength(2);
    // Verify start positions point to the '"' of the key
    r.forEach(({ start, end }) => {
      expect(json.slice(start, end)).toBe('"id"');
    });
  });
});

describe("findMatchOffsets — edge cases", () => {
  it("query equal to full text matches once", () => {
    expect(findMatchOffsets("abc", "abc")).toHaveLength(1);
  });
  it("query longer than text returns []", () => {
    expect(findMatchOffsets("ab", "abc")).toEqual([]);
  });
  it("single character query finds all occurrences", () => {
    const r = findMatchOffsets("banana", "a");
    expect(r).toHaveLength(3);
    expect(r.map(m => m.start)).toEqual([1, 3, 5]);
  });
  it("Unicode multi-byte characters are handled", () => {
    // Both occurrences of "Üni" (case-insensitive) should be found.
    const text = 'Ünicode Ünicode';
    const r = findMatchOffsets(text, "üni", false);  // case-insensitive
    expect(r).toHaveLength(2);
  });
});

// ---- Wraparound navigation ----

describe("nextMatchIdx wraparound", () => {
  it("starts at 0 from unset (-1)", () => {
    expect(nextMatchIdx(-1, 5)).toBe(0);
  });
  it("advances normally", () => {
    expect(nextMatchIdx(0, 5)).toBe(1);
    expect(nextMatchIdx(3, 5)).toBe(4);
  });
  it("wraps from last to first", () => {
    expect(nextMatchIdx(4, 5)).toBe(0);
  });
  it("returns -1 when total is 0", () => {
    expect(nextMatchIdx(-1, 0)).toBe(-1);
    expect(nextMatchIdx(2, 0)).toBe(-1);
  });
  it("single match stays at 0", () => {
    expect(nextMatchIdx(0, 1)).toBe(0);
  });
});

describe("prevMatchIdx wraparound", () => {
  it("starts at last from unset (-1)", () => {
    expect(prevMatchIdx(-1, 5)).toBe(4);
  });
  it("goes back normally", () => {
    expect(prevMatchIdx(3, 5)).toBe(2);
    expect(prevMatchIdx(1, 5)).toBe(0);
  });
  it("wraps from first to last", () => {
    expect(prevMatchIdx(0, 5)).toBe(4);
  });
  it("returns -1 when total is 0", () => {
    expect(prevMatchIdx(-1, 0)).toBe(-1);
    expect(prevMatchIdx(0, 0)).toBe(-1);
  });
  it("single match stays at 0", () => {
    expect(prevMatchIdx(0, 1)).toBe(0);
  });
});

describe("wraparound full cycle", () => {
  it("next N times wraps back to start", () => {
    let idx = -1;
    const N = 4;
    for (let i = 0; i < N; i++) idx = nextMatchIdx(idx, N);
    // after N next steps from -1 → 0 → 1 → 2 → 3 (back to 3, not 0 because 4%4=0)
    // Actually: -1→0, 0→1, 1→2, 2→3
    expect(idx).toBe(3);
    // one more step wraps back to 0
    expect(nextMatchIdx(idx, N)).toBe(0);
  });
  it("prev from 0 wraps to last", () => {
    expect(prevMatchIdx(0, 3)).toBe(2);
  });
});
