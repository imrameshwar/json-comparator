// tests/highlight.test.js — T15: JSON syntax highlighting tokenizer
// Tests the pure tokenizeJSON function (no DOM).
import { describe, it, expect } from "vitest";

// Inline of the tokenizer used in json_compare.html
// Returns an HTML string with <span class="t-*"> wrappers.
function tokenizeJSON(text) {
  // Fast path: empty / whitespace-only
  if (!text.trim()) return escHtml(text);
  let out = "";
  let i = 0;
  const n = text.length;

  function escHtml(s) {
    return s.replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  }
  function advance(cls, raw) {
    out += cls ? `<span class="${cls}">${escHtml(raw)}</span>` : escHtml(raw);
  }

  while (i < n) {
    const c = text[i];
    // String
    if (c === '"') {
      let j = i + 1;
      while (j < n) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === '"') { j++; break; }
        j++;
      }
      advance("t-string", text.slice(i, j));
      i = j; continue;
    }
    // Number
    if (c === '-' || (c >= '0' && c <= '9')) {
      let j = i;
      if (text[j] === '-') j++;
      while (j < n && text[j] >= '0' && text[j] <= '9') j++;
      if (j < n && text[j] === '.') { j++; while (j < n && text[j] >= '0' && text[j] <= '9') j++; }
      if (j < n && (text[j] === 'e' || text[j] === 'E')) { j++; if (text[j] === '+' || text[j] === '-') j++; while (j < n && text[j] >= '0' && text[j] <= '9') j++; }
      advance("t-number", text.slice(i, j));
      i = j; continue;
    }
    // true / false / null
    if (text.startsWith("true", i))  { advance("t-boolean", "true");  i += 4; continue; }
    if (text.startsWith("false", i)) { advance("t-boolean", "false"); i += 5; continue; }
    if (text.startsWith("null", i))  { advance("t-null",    "null");  i += 4; continue; }
    // Everything else (punctuation, whitespace)
    out += escHtml(c);
    i++;
  }
  return out;
}

// Minimal helpers for assertions
function hasSpan(html, cls, content) {
  return html.includes(`<span class="${cls}">${content}</span>`);
}

describe("tokenizeJSON — strings", () => {
  it("wraps a string value", () => {
    const h = tokenizeJSON('"hello"');
    expect(hasSpan(h, "t-string", "&quot;hello&quot;")).toBe(true);
  });
  it("handles escaped quote inside string", () => {
    const h = tokenizeJSON('"say \\"hi\\""');
    expect(h).toContain("t-string");
  });
});

describe("tokenizeJSON — numbers", () => {
  it("integer", () => {
    const h = tokenizeJSON("42");
    expect(hasSpan(h, "t-number", "42")).toBe(true);
  });
  it("negative float", () => {
    const h = tokenizeJSON("-3.14");
    expect(hasSpan(h, "t-number", "-3.14")).toBe(true);
  });
  it("scientific notation", () => {
    const h = tokenizeJSON("1e10");
    expect(h).toContain("t-number");
  });
});

describe("tokenizeJSON — keywords", () => {
  it("true", () => {
    const h = tokenizeJSON("true");
    expect(hasSpan(h, "t-boolean", "true")).toBe(true);
  });
  it("false", () => {
    const h = tokenizeJSON("false");
    expect(hasSpan(h, "t-boolean", "false")).toBe(true);
  });
  it("null", () => {
    const h = tokenizeJSON("null");
    expect(hasSpan(h, "t-null", "null")).toBe(true);
  });
});

describe("tokenizeJSON — HTML escaping", () => {
  it("escapes < and > in strings", () => {
    const h = tokenizeJSON('"<tag>"');
    expect(h).toContain("&lt;tag&gt;");
    expect(h).not.toContain("<tag>");
  });
  it("escapes & in strings", () => {
    const h = tokenizeJSON('"a&b"');
    expect(h).toContain("&amp;");
  });
});

describe("tokenizeJSON — empty/whitespace", () => {
  it("empty string returns empty", () => {
    expect(tokenizeJSON("")).toBe("");
  });
  it("whitespace-only returns escaped whitespace", () => {
    expect(tokenizeJSON("   ")).toBe("   ");
  });
});

describe("tokenizeJSON — minify helpers (pure logic)", () => {
  it("JSON.stringify with no spacing removes whitespace", () => {
    const pretty = '{\n  "a": 1\n}';
    const mini = JSON.stringify(JSON.parse(pretty));
    expect(mini).toBe('{"a":1}');
  });
  it("minify round-trips correctly", () => {
    const obj = { x: [1, null, true, "hi"], y: { z: -2.5 } };
    const pretty = JSON.stringify(obj, null, 2);
    const mini = JSON.stringify(JSON.parse(pretty));
    expect(JSON.parse(mini)).toEqual(obj);
  });
});

// E-5: highlight gating logic — mirrors the guard in refreshHighlight / refreshLineNums.
// The production code uses: `ta.value.length > MAX_HIGHLIGHT && !forceHighlight`
const MAX_HIGHLIGHT = 80_000;

function shouldHighlight(len, force) {
  return !(len > MAX_HIGHLIGHT && !force);
}

describe("E-5 highlight gating logic", () => {
  it("highlights when length is under cutoff (force off)", () => {
    expect(shouldHighlight(79_999, false)).toBe(true);
  });
  it("highlights exactly at cutoff boundary (force off)", () => {
    expect(shouldHighlight(80_000, false)).toBe(true);
  });
  it("skips when length exceeds cutoff and force is off", () => {
    expect(shouldHighlight(80_001, false)).toBe(false);
  });
  it("forces highlight when length exceeds cutoff and force is on", () => {
    expect(shouldHighlight(80_001, true)).toBe(true);
  });
  it("forces highlight on a very large input when force is on", () => {
    expect(shouldHighlight(500_000, true)).toBe(true);
  });
});
