// Trivial JS smoke test — proves the Vitest pipeline runs green.
// Real diff-core unit tests arrive with T2 (extract a single pure diff core).
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs the test pipeline", () => {
    expect(1 + 1).toBe(2);
  });

  it("can compare plain objects (sanity for future diff-core tests)", () => {
    const a = { x: 1 };
    const b = { x: 1 };
    expect(a).toEqual(b);
  });
});
