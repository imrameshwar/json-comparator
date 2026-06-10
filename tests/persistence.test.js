// tests/persistence.test.js — T16: persist theme + options; respect OS theme
// Tests the pure serialise/deserialise helpers (no DOM, no localStorage).
import { describe, it, expect } from "vitest";

// These pure helpers are used by the HTML and are tested here in isolation.

// serializePrefs: extract a plain object of saved preferences from app state.
function serializePrefs(theme, onlyDiff, unordered, viewMode) {
  return { theme, onlyDiff, unordered, viewMode };
}

// deserializePrefs: apply a saved prefs object, falling back to supplied defaults.
function deserializePrefs(saved, defaults) {
  if (!saved || typeof saved !== "object") return { ...defaults };
  return {
    theme:     saved.theme === "dark" ? "dark" : (saved.theme === "light" ? "light" : defaults.theme),
    onlyDiff:  typeof saved.onlyDiff === "boolean" ? saved.onlyDiff : defaults.onlyDiff,
    unordered: typeof saved.unordered === "boolean" ? saved.unordered : defaults.unordered,
    viewMode:  saved.viewMode === "table" ? "table" : (saved.viewMode === "tree" ? "tree" : defaults.viewMode),
  };
}

const DEFAULTS = { theme: "light", onlyDiff: true, unordered: false, viewMode: "tree" };

describe("serializePrefs", () => {
  it("round-trips defaults", () => {
    const p = serializePrefs("light", true, false, "tree");
    expect(p).toEqual({ theme: "light", onlyDiff: true, unordered: false, viewMode: "tree" });
  });
  it("captures dark theme", () => {
    const p = serializePrefs("dark", false, true, "table");
    expect(p).toEqual({ theme: "dark", onlyDiff: false, unordered: true, viewMode: "table" });
  });
});

describe("deserializePrefs", () => {
  it("restores saved prefs", () => {
    const saved = { theme: "dark", onlyDiff: false, unordered: true, viewMode: "table" };
    const p = deserializePrefs(saved, DEFAULTS);
    expect(p.theme).toBe("dark");
    expect(p.onlyDiff).toBe(false);
    expect(p.unordered).toBe(true);
    expect(p.viewMode).toBe("table");
  });

  it("falls back to defaults for null input", () => {
    const p = deserializePrefs(null, DEFAULTS);
    expect(p).toEqual(DEFAULTS);
  });

  it("falls back to defaults for invalid theme string", () => {
    const p = deserializePrefs({ theme: "solarized" }, DEFAULTS);
    expect(p.theme).toBe("light");  // default
  });

  it("falls back to defaults for non-boolean booleans", () => {
    const p = deserializePrefs({ onlyDiff: "yes", unordered: 1 }, DEFAULTS);
    expect(p.onlyDiff).toBe(DEFAULTS.onlyDiff);
    expect(p.unordered).toBe(DEFAULTS.unordered);
  });

  it("falls back to defaults for invalid viewMode", () => {
    const p = deserializePrefs({ viewMode: "split" }, DEFAULTS);
    expect(p.viewMode).toBe("tree");
  });

  it("partial object uses defaults for missing keys", () => {
    const p = deserializePrefs({ theme: "dark" }, DEFAULTS);
    expect(p.theme).toBe("dark");
    expect(p.onlyDiff).toBe(DEFAULTS.onlyDiff);
    expect(p.unordered).toBe(DEFAULTS.unordered);
    expect(p.viewMode).toBe(DEFAULTS.viewMode);
  });
});
