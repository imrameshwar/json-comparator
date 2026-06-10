// Recursion guard tests (T7/B4).
//
// Verifies that _walk throws DiffDepthError instead of blowing the call stack
// when given pathologically deep input, and that moderate depth still works.
import { describe, it, expect } from "vitest";
import { diff, DiffDepthError, MAX_DIFF_DEPTH } from "../src/diff-core.js";

function makeDeep(depth, leaf = 42) {
  let v = leaf;
  for (let i = 0; i < depth; i++) v = { x: v };
  return v;
}
function makeDeepArray(depth) {
  let v = [42];
  for (let i = 0; i < depth; i++) v = [v];
  return v;
}

describe("recursion guard (T7/B4)", () => {
  it("MAX_DIFF_DEPTH is 500", () => {
    expect(MAX_DIFF_DEPTH).toBe(500);
  });

  it("diffs moderately deep objects without error (depth 200)", () => {
    const v = makeDeep(200);
    expect(() => diff(v, v)).not.toThrow();
  });

  it("diffs moderately deep arrays without error (depth 200)", () => {
    const v = makeDeepArray(200);
    expect(() => diff(v, v)).not.toThrow();
  });

  it("throws DiffDepthError for a 5 000-deep object", () => {
    const v = makeDeep(5000);
    expect(() => diff(v, v)).toThrow(DiffDepthError);
  });

  it("thrown error has name 'DiffDepthError'", () => {
    const v = makeDeep(5000);
    let caught = null;
    try { diff(v, v); } catch (e) { caught = e; }
    expect(caught).not.toBeNull();
    expect(caught.name).toBe("DiffDepthError");
  });

  it("thrown error message mentions max depth", () => {
    const v = makeDeep(5000);
    let caught = null;
    try { diff(v, v); } catch (e) { caught = e; }
    expect(caught.message).toMatch(/500/);
  });

  it("thrown error carries diffPath with the problematic path", () => {
    const v = makeDeep(5000);
    let caught = null;
    try { diff(v, v); } catch (e) { caught = e; }
    expect(typeof caught.diffPath).toBe("string");
    expect(caught.diffPath.length).toBeGreaterThan(0);
  });

  it("throws DiffDepthError for a 5 000-deep array", () => {
    const v = makeDeepArray(5000);
    expect(() => diff(v, v)).toThrow(DiffDepthError);
  });
});
