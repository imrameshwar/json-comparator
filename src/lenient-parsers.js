// src/lenient-parsers.js — T22
//
// Optional lenient input parsers.  Each returns a parsed JS value (same type
// as JSON.parse) or throws a SyntaxError with a human-readable message.
// Default parsing stays strict (JSON.parse).  All three modes are behind
// explicit toggles; the strict default is never changed implicitly.
//
// Modes
//   parseJSONC(text)  — JSON with // and /* */ comments stripped before parsing
//   parseJSON5(text)  — JSON5: comments + trailing commas + single-quoted
//                       strings + unquoted identifier keys + numeric literals
//                       (Infinity, NaN, hex, leading-dot)
//   parseNDJSON(text) — Newline-Delimited JSON: each non-empty line is one JSON
//                       document; returns an array of all parsed values.
//                       A single-line file that IS valid JSON is returned as-is
//                       (not wrapped in an array) so it round-trips cleanly.

// ─── JSONC ────────────────────────────────────────────────────────────────────
/**
 * Strip // and /* *\/ comments from a JSON-with-comments string, then parse.
 * Correctly handles comment-like text inside string literals.
 *
 * @param {string} text
 * @returns {*}
 * @throws {SyntaxError}
 */
export function parseJSONC(text) {
  let out = "", i = 0, n = text.length;
  while (i < n) {
    const c = text[i];
    // String literal — copy verbatim (preserve comment-like text inside strings)
    if (c === '"') {
      let j = i + 1;
      while (j < n) {
        if (text[j] === "\\" ) { j += 2; continue; }
        if (text[j] === '"')  { j++;     break;    }
        j++;
      }
      out += text.slice(i, j);
      i = j;
      continue;
    }
    // Line comment
    if (c === "/" && text[i + 1] === "/") {
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    // Block comment
    if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  try { return JSON.parse(out); }
  catch (e) { throw new SyntaxError("JSONC parse error: " + e.message); }
}

// ─── JSON5 ────────────────────────────────────────────────────────────────────
/**
 * Lenient JSON5 parser covering the most common extensions:
 *   - // and /* *\/ comments
 *   - Trailing commas in objects and arrays
 *   - Single-quoted strings (with \\' escape)
 *   - Unquoted identifier keys (ASCII letters, digits, $, _)
 *   - Numeric literals: Infinity, -Infinity, NaN, 0x hex, leading-dot (.5)
 *
 * Not implemented (rare): multi-line strings (\\<newline>), +Infinity.
 *
 * @param {string} text
 * @returns {*}
 * @throws {SyntaxError}
 */
export function parseJSON5(text) {
  let pos = 0;
  const src = text;

  function err(msg) { throw new SyntaxError(`JSON5 parse error at position ${pos}: ${msg}`); }

  function skipWS() {
    while (pos < src.length) {
      const c = src[pos];
      if (c === " " || c === "\t" || c === "\r" || c === "\n") { pos++; continue; }
      if (c === "/" && src[pos + 1] === "/") { while (pos < src.length && src[pos] !== "\n") pos++; continue; }
      if (c === "/" && src[pos + 1] === "*") {
        pos += 2;
        while (pos < src.length && !(src[pos] === "*" && src[pos + 1] === "/")) pos++;
        pos += 2;
        continue;
      }
      break;
    }
  }

  function peek() { skipWS(); return pos < src.length ? src[pos] : ""; }

  function parseValue() {
    skipWS();
    if (pos >= src.length) err("unexpected end of input");
    const c = src[pos];
    if (c === "{") return parseObject();
    if (c === "[") return parseArray();
    if (c === '"') return parseDoubleString();
    if (c === "'") return parseSingleString();
    if (c === "-" || c === "+" || (c >= "0" && c <= "9") || c === ".") return parseNumber();
    // keywords and identifiers
    const rest = src.slice(pos);
    if (rest.startsWith("true"))  { pos += 4; return true; }
    if (rest.startsWith("false")) { pos += 5; return false; }
    if (rest.startsWith("null"))  { pos += 4; return null; }
    if (rest.startsWith("Infinity"))  { pos += 8; return Infinity; }
    if (rest.startsWith("-Infinity")) { pos += 9; return -Infinity; }
    if (rest.startsWith("NaN"))   { pos += 3; return NaN; }
    err(`unexpected character '${c}'`);
  }

  function parseDoubleString() {
    pos++; // skip opening "
    let s = "";
    while (pos < src.length && src[pos] !== '"') {
      if (src[pos] === "\\") { pos++; s += parseEscape(); }
      else { s += src[pos++]; }
    }
    if (src[pos] !== '"') err("unterminated string");
    pos++;
    return s;
  }

  function parseSingleString() {
    pos++; // skip opening '
    let s = "";
    while (pos < src.length && src[pos] !== "'") {
      if (src[pos] === "\\") { pos++; s += parseEscape(); }
      else { s += src[pos++]; }
    }
    if (src[pos] !== "'") err("unterminated single-quoted string");
    pos++;
    return s;
  }

  function parseEscape() {
    const c = src[pos++];
    switch (c) {
      case "n": return "\n"; case "r": return "\r"; case "t": return "\t";
      case "b": return "\b"; case "f": return "\f";
      case "\\": return "\\"; case "/": return "/";
      case '"': return '"';  case "'": return "'";
      case "u": {
        const hex = src.slice(pos, pos + 4); pos += 4;
        return String.fromCharCode(parseInt(hex, 16));
      }
      default: return c;
    }
  }

  function parseNumber() {
    const start = pos;
    if (src[pos] === "+" || src[pos] === "-") pos++;
    // Hex
    if (src[pos] === "0" && (src[pos + 1] === "x" || src[pos + 1] === "X")) {
      pos += 2;
      while (pos < src.length && /[0-9a-fA-F]/.test(src[pos])) pos++;
      return parseInt(src.slice(start, pos), 16);
    }
    // Regular number (including leading dot: .5)
    while (pos < src.length && /[0-9.eE+\-]/.test(src[pos])) pos++;
    const raw = src.slice(start, pos);
    const v = Number(raw);
    if (isNaN(v) && raw !== "NaN") err(`invalid number '${raw}'`);
    return v;
  }

  function parseObject() {
    pos++; // skip {
    const obj = {};
    while (peek() !== "}") {
      if (pos >= src.length) err("unterminated object");
      skipWS();
      // Unquoted key
      let key;
      const c = src[pos];
      if (c === '"') { key = parseDoubleString(); }
      else if (c === "'") { key = parseSingleString(); }
      else if (/[a-zA-Z_$]/.test(c)) {
        const start = pos;
        while (pos < src.length && /[a-zA-Z0-9_$]/.test(src[pos])) pos++;
        key = src.slice(start, pos);
      } else err(`expected key, got '${c}'`);
      skipWS();
      if (src[pos] !== ":") err(`expected ':' after key '${key}', got '${src[pos]}'`);
      pos++;
      obj[key] = parseValue();
      skipWS();
      if (src[pos] === ",") { pos++; skipWS(); }
      // Trailing comma before }
      if (src[pos] === "}") break;
    }
    if (src[pos] !== "}") err("unterminated object");
    pos++;
    return obj;
  }

  function parseArray() {
    pos++; // skip [
    const arr = [];
    while (peek() !== "]") {
      if (pos >= src.length) err("unterminated array");
      // Trailing comma before ]
      skipWS();
      if (src[pos] === "]") break;
      arr.push(parseValue());
      skipWS();
      if (src[pos] === ",") { pos++; }
    }
    if (src[pos] !== "]") err("unterminated array");
    pos++;
    return arr;
  }

  const result = parseValue();
  skipWS();
  if (pos < src.length) {
    // Tolerate trailing whitespace/comments but not extra content
    // (already skipped by skipWS above — anything left is an error)
    err(`unexpected content after value: '${src[pos]}'`);
  }
  return result;
}

// ─── NDJSON ───────────────────────────────────────────────────────────────────
/**
 * Newline-Delimited JSON parser.  Each non-blank line must be a complete JSON
 * document.  Returns an array of all parsed values.
 *
 * Special case: if the entire text (trimmed) is valid standard JSON, it is
 * returned as-is (not wrapped in an array) so that single-document files
 * round-trip cleanly regardless of which mode is active.
 *
 * @param {string} text
 * @returns {*}
 * @throws {SyntaxError}
 */
export function parseNDJSON(text) {
  // Fast path: the whole text is valid standard JSON — return it as-is
  try { return JSON.parse(text); } catch (_) { /* fall through to NDJSON */ }

  const lines = text.split("\n");
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;   // skip blank lines
    try {
      results.push(JSON.parse(line));
    } catch (e) {
      throw new SyntaxError(`NDJSON parse error on line ${i + 1}: ${e.message}`);
    }
  }
  if (results.length === 0) throw new SyntaxError("NDJSON: no records found");
  return results;
}
