// tests/navigation.test.js — T12: next/previous diff navigation
// Tests the pure navigation-index logic (no DOM).
import { describe, it, expect } from "vitest";

// Pure helper: given the current index and total count, return the next index (wraps).
function navNext(currentIdx, total) {
  if (total === 0) return -1;
  if (currentIdx < 0) return 0;
  return (currentIdx + 1) % total;
}

// Pure helper: prev index (wraps).
function navPrev(currentIdx, total) {
  if (total === 0) return -1;
  if (currentIdx < 0) return total - 1;
  return (currentIdx - 1 + total) % total;
}

describe("navNext", () => {
  it("starts at 0 from unset (-1)", () => {
    expect(navNext(-1, 5)).toBe(0);
  });
  it("advances normally", () => {
    expect(navNext(0, 5)).toBe(1);
    expect(navNext(3, 5)).toBe(4);
  });
  it("wraps around at end", () => {
    expect(navNext(4, 5)).toBe(0);
  });
  it("returns -1 when total is 0", () => {
    expect(navNext(-1, 0)).toBe(-1);
    expect(navNext(0, 0)).toBe(-1);
  });
  it("single entry stays at 0", () => {
    expect(navNext(0, 1)).toBe(0);
  });
});

describe("navPrev", () => {
  it("starts at last from unset (-1)", () => {
    expect(navPrev(-1, 5)).toBe(4);
  });
  it("goes back normally", () => {
    expect(navPrev(3, 5)).toBe(2);
    expect(navPrev(1, 5)).toBe(0);
  });
  it("wraps around at start", () => {
    expect(navPrev(0, 5)).toBe(4);
  });
  it("returns -1 when total is 0", () => {
    expect(navPrev(-1, 0)).toBe(-1);
    expect(navPrev(0, 0)).toBe(-1);
  });
  it("single entry stays at 0", () => {
    expect(navPrev(0, 1)).toBe(0);
  });
});
