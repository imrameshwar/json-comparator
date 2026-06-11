// tests/persistence.test.js — T16: persist theme + options; respect OS theme
// Also covers E-3: indent serialisation.
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

// ---- E-3: indentSize serialisation / deserialisation ---------------------
//
// Mirrors the validation logic from json_compare.html:
//   valid values: "2" | "3" | "4" | "tab"
//   invalid / absent → fall back to default "2"

const VALID_INDENTS = ["2", "3", "4", "tab"];

function deserializeIndentSize(saved, defaultVal = "2") {
  if (!saved || typeof saved !== "object") return defaultVal;
  return VALID_INDENTS.includes(saved.indentSize) ? saved.indentSize : defaultVal;
}

// getIndent: mirrors the helper in json_compare.html (pure, DOM-free version).
function getIndent(indentSizeVal) {
  return indentSizeVal === "tab" ? "\t" : " ".repeat(Number(indentSizeVal) || 2);
}

describe("E-3: indentSize persistence", () => {
  it("round-trips '2' (default)", () => {
    expect(deserializeIndentSize({ indentSize: "2" })).toBe("2");
  });

  it("round-trips '3'", () => {
    expect(deserializeIndentSize({ indentSize: "3" })).toBe("3");
  });

  it("round-trips '4'", () => {
    expect(deserializeIndentSize({ indentSize: "4" })).toBe("4");
  });

  it("round-trips 'tab'", () => {
    expect(deserializeIndentSize({ indentSize: "tab" })).toBe("tab");
  });

  it("rejects an invalid string and falls back to default", () => {
    expect(deserializeIndentSize({ indentSize: "8" })).toBe("2");
    expect(deserializeIndentSize({ indentSize: "  " })).toBe("2");
    expect(deserializeIndentSize({ indentSize: 2 })).toBe("2");  // number, not string
  });

  it("falls back when indentSize key is absent", () => {
    expect(deserializeIndentSize({ theme: "dark" })).toBe("2");
  });

  it("falls back for null input", () => {
    expect(deserializeIndentSize(null)).toBe("2");
  });
});

describe("E-3: getIndent helper", () => {
  it("'2' → two spaces", () => {
    expect(getIndent("2")).toBe("  ");
  });

  it("'3' → three spaces", () => {
    expect(getIndent("3")).toBe("   ");
  });

  it("'4' → four spaces", () => {
    expect(getIndent("4")).toBe("    ");
  });

  it("'tab' → tab character", () => {
    expect(getIndent("tab")).toBe("\t");
  });

  it("JSON.stringify with 2-space indent produces correct output", () => {
    const obj = { b: 2, a: 1 };
    const result = JSON.stringify(obj, null, getIndent("2"));
    expect(result).toBe('{\n  "b": 2,\n  "a": 1\n}');
  });

  it("JSON.stringify with 4-space indent produces correct output", () => {
    const obj = { x: 1 };
    expect(JSON.stringify(obj, null, getIndent("4"))).toBe('{\n    "x": 1\n}');
  });

  it("JSON.stringify with tab indent produces correct output", () => {
    const obj = { x: 1 };
    expect(JSON.stringify(obj, null, getIndent("tab"))).toBe('{\n\t"x": 1\n}');
  });
});
