// tests/tree-view.test.js — collapsible JSON tree viewer (renderJSONTree)
//
// Inline copies of _jvNode / renderJSONTree from json_compare.html (the rich
// editor "Tree" view). Pure string output, no DOM — we assert the structural
// HTML so the folding markup, syntax classes, and "proper-JSON" punctuation
// (commas, brackets) stay correct.
import { describe, it, expect } from "vitest";

function typeName(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  switch (typeof v) {
    case "boolean": return "boolean";
    case "number": return "number";
    case "string": return "string";
    case "object": return "object";
    default: return typeof v;
  }
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

function _jvNode(value, keyHtml, isLast) {
  const comma = isLast ? "" : '<span class="jv-comma">,</span>';
  const t = typeName(value);
  if (t === "object" || t === "array") {
    const isArr = t === "array";
    const open = isArr ? "[" : "{";
    const close = isArr ? "]" : "}";
    const entries = isArr
      ? value.map(v => ["", v])
      : Object.keys(value).map(k => [`<span class="jv-key">${escapeHtml(JSON.stringify(k))}</span><span class="jv-colon">:</span>`, value[k]]);
    if (entries.length === 0) {
      return `<div class="jv-node"><div class="jv-row jv-leaf"><span class="jv-toggle"></span>${keyHtml}<span class="jv-bracket">${open}${close}</span>${comma}</div></div>`;
    }
    const count = entries.length;
    const label = isArr ? `${count} item${count !== 1 ? "s" : ""}` : `${count} key${count !== 1 ? "s" : ""}`;
    let kids = "";
    for (let i = 0; i < entries.length; i++) {
      kids += _jvNode(entries[i][1], entries[i][0], i === entries.length - 1);
    }
    return `<div class="jv-node jv-container">` +
      `<div class="jv-row jv-head">` +
        `<span class="jv-toggle" aria-hidden="true"></span>${keyHtml}` +
        `<span class="jv-bracket">${open}</span>` +
        `<span class="jv-fold">…<span class="jv-bracket">${close}</span>${comma}</span>` +
        `<span class="jv-meta">${label}</span>` +
      `</div>` +
      `<div class="jv-children">${kids}</div>` +
      `<div class="jv-row jv-close-row"><span class="jv-toggle"></span><span class="jv-bracket">${close}</span>${comma}</div>` +
    `</div>`;
  }
  const disp = t === "string" ? JSON.stringify(value) : String(value);
  return `<div class="jv-node"><div class="jv-row jv-leaf"><span class="jv-toggle"></span>${keyHtml}<span class="jv-val t-${t}">${escapeHtml(disp)}</span>${comma}</div></div>`;
}
function renderJSONTree(value) { return _jvNode(value, "", true); }

// count occurrences of a needle
const count = (hay, needle) => hay.split(needle).length - 1;

describe("renderJSONTree — leaf scalars", () => {
  it("colours strings, numbers, booleans, null with t-* classes", () => {
    expect(renderJSONTree("hi")).toContain('<span class="jv-val t-string">&quot;hi&quot;</span>');
    expect(renderJSONTree(42)).toContain('<span class="jv-val t-number">42</span>');
    expect(renderJSONTree(true)).toContain('<span class="jv-val t-boolean">true</span>');
    expect(renderJSONTree(null)).toContain('<span class="jv-val t-null">null</span>');
  });
  it("quotes strings as proper JSON and escapes HTML", () => {
    expect(renderJSONTree("<b>&\"x")).toContain('t-string">&quot;&lt;b&gt;&amp;\\&quot;x&quot;</span>');
  });
});

describe("renderJSONTree — containers", () => {
  it("renders an object as a foldable container with key/value rows", () => {
    const html = renderJSONTree({ a: 1, b: "two" });
    expect(html).toContain("jv-container");
    expect(html).toContain('<span class="jv-key">&quot;a&quot;</span><span class="jv-colon">:</span>');
    expect(html).toContain('<span class="jv-meta">2 keys</span>');
    // opening + closing brackets present
    expect(html).toContain('<span class="jv-bracket">{</span>');
    expect(html).toContain("jv-close-row");
  });

  it("renders an array with item count and no keys on elements", () => {
    const html = renderJSONTree([1, 2, 3]);
    expect(html).toContain('<span class="jv-bracket">[</span>');
    expect(html).toContain('<span class="jv-meta">3 items</span>');
    expect(html).not.toContain('jv-key'); // array elements carry no key label
  });

  it("collapsed-preview markup (jv-fold) is present for folding", () => {
    const html = renderJSONTree({ a: 1 });
    expect(html).toContain('<span class="jv-fold">…<span class="jv-bracket">}</span></span>');
  });

  it("empty object / array render inline with no toggle", () => {
    expect(renderJSONTree({})).toBe('<div class="jv-node"><div class="jv-row jv-leaf"><span class="jv-toggle"></span><span class="jv-bracket">{}</span></div></div>');
    expect(renderJSONTree([])).toContain('<span class="jv-bracket">[]</span>');
    expect(renderJSONTree({})).not.toContain("jv-container");
  });
});

describe("renderJSONTree — proper-JSON commas", () => {
  it("adds a comma after every entry except the last", () => {
    const html = renderJSONTree({ a: 1, b: 2, c: 3 });
    // 3 entries → 2 trailing commas in the expanded close-rows / leaf rows
    // (the collapsed jv-fold previews also carry commas, so count head commas):
    expect(count(html, '<span class="jv-comma">,</span>')).toBeGreaterThanOrEqual(2);
    // the root object itself is last → its close-row has no comma
    expect(html.endsWith('<span class="jv-bracket">}</span></div></div>')).toBe(true);
  });

  it("nests containers and keeps inner commas", () => {
    const html = renderJSONTree({ outer: { inner: [1, 2] }, tail: 9 });
    expect(count(html, "jv-container")).toBe(3); // outer obj, nested obj, nested array
    expect(html).toContain('<span class="jv-meta">2 items</span>');
    // "tail" is the last key of the root → its leaf row has no comma
    expect(html).toContain('<span class="jv-key">&quot;tail&quot;</span><span class="jv-colon">:</span><span class="jv-val t-number">9</span></div></div>');
  });
});
