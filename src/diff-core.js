// src/diff-core.js
//
// THE single, pure JSON diff core. No DOM access, no globals, no I/O.
//
// This is the source of truth shared by:
//   - the Vitest unit tests (which `import` this module), and
//   - the web app (json_compare.html), which inlines a byte-identical copy of
//     the block between the DIFF-CORE:START / DIFF-CORE:END markers because ES
//     module `import` is blocked over file://. tests/diff-core-parity.test.js
//     asserts the two copies are identical, so CI fails on any drift.
//
// Everything between the markers below must stay character-for-character
// identical to the matching block in json_compare.html. Keep it dependency-free
// and free of `export`/`import` so it is valid both as a classic inline script
// and (with the export line at the bottom of this file) as an ES module.
//
// Return shape:
//   diff(a, b, opts?) -> Change[]
//   Change = { op, path, segs, from?, to?, fromType?, toType? }
//   `path` is a human display string and is intentionally ambiguous; `segs` is
//   the canonical, collision-free identity (see segId/segsStartWith below).
//   op ∈ "added" | "removed" | "changed" | "type_changed" | "equal"
// "equal" entries are emitted for matched scalar leaves so the table/tree can
// render the full structure when "Differences only" is off; callers that only
// want differences filter them out (op !== "equal").
//
// opts:
//   unordered  {boolean} — treat scalar arrays as unordered multisets
//   keyBy      {string}  — match array objects by this key (e.g. "id") [T6]

/* ===== DIFF-CORE:START — single source of truth; mirrored in json_compare.html ===== */

// --- T7/B4: recursion guard ---
// _walk throws DiffDepthError when nesting exceeds MAX_DIFF_DEPTH. The web
// app's render() and the Python CLI's main() catch it and show a friendly
// message instead of a stack overflow.
const MAX_DIFF_DEPTH = 500;
class DiffDepthError extends Error {
  constructor(path) {
    super("JSON structure exceeds maximum diff depth (" + MAX_DIFF_DEPTH + ") at " + path + ". Ensure input is not circularly or extremely deeply nested.");
    this.name = "DiffDepthError";
    this.diffPath = path;
  }
}

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
function isScalar(v) { const t = typeName(v); return t !== "object" && t !== "array"; }
function _hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

// --- path segments: an unambiguous identity for each Change (T4/B3) ---
// A segment is one of: { k: <objectKey> } | { i: <arrayIndex> } | { star: true }.
// The string `path` is for display only and is ambiguous (a literal key "a.b"
// and nested a->b both render "$.a.b"); `segs` is the canonical identity.
// segKey  -> collision-free token for ONE segment (safe map/equality key).
// segId   -> collision-free id for a whole segment path (selection-set member).
// segsStartWith -> structural prefix match (selection roll-up / tree grouping).
function segLabel(s) { return s.k !== undefined ? s.k : (s.star ? "[*]" : "[" + s.i + "]"); }
function segKey(s) { return s.k !== undefined ? "k:" + s.k : (s.star ? "*" : "i:" + s.i); }
function segId(segs) { return JSON.stringify(segs); }
function segsStartWith(segs, prefix) {
  if (prefix.length > segs.length) return false;
  for (let i = 0; i < prefix.length; i++) { if (segKey(segs[i]) !== segKey(prefix[i])) return false; }
  return true;
}
function entriesUnderSegs(entries, prefix) { return entries.filter(e => segsStartWith(e.segs, prefix)); }

// --- T6/B2: deep equality (for LCS matching) ---
function _deepEqual(a, b) {
  if (typeName(a) !== typeName(b)) return false;
  if (isScalar(a)) return a === b;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => _deepEqual(v, b[i]));
  }
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  if (!ka.every((k, i) => k === kb[i])) return false;
  return ka.every(k => _deepEqual(a[k], b[k]));
}

// --- T6/B2: LCS for ordered array diff ---
// Returns [{si, ti}] pairs of matching element indices (in ascending order).
// Caps at m*n > 250 000 to protect against O(m·n) blowup on huge arrays.
function _lcs(src, tgt) {
  const m = src.length, n = tgt.length;
  if (m === 0 || n === 0) return [];
  if (m * n > 250000) {
    // Greedy fallback: find matching elements left-to-right
    const pairs = [];
    let j = 0;
    for (let i = 0; i < m && j < n; i++) {
      for (let jj = j; jj < n; jj++) {
        if (_deepEqual(src[i], tgt[jj])) { pairs.push({ si: i, ti: jj }); j = jj + 1; break; }
      }
    }
    return pairs;
  }
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = _deepEqual(src[i - 1], tgt[j - 1])
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const pairs = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (_deepEqual(src[i - 1], tgt[j - 1])) { pairs.unshift({ si: i - 1, ti: j - 1 }); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return pairs;
}

// LCS-based diff for all-scalar ordered arrays (T6/B2).
// Emits added/removed for non-matching elements; recursively walks matches.
// Removed elements use their source index; added elements use their target index.
function _diffArrayLCS(src, tgt, path, segs, unordered, keyBy, out, depth, opts) {
  const pairs = _lcs(src, tgt);
  let si = 0, ti = 0, pi = 0;
  while (si < src.length || ti < tgt.length) {
    const next = pi < pairs.length ? pairs[pi] : null;
    const nextSi = next ? next.si : src.length;
    const nextTi = next ? next.ti : tgt.length;
    while (si < nextSi) {
      out.push({ op: "removed", path: `${path}[${si}]`, segs: segs.concat([{ i: si }]), from: src[si] });
      si++;
    }
    while (ti < nextTi) {
      out.push({ op: "added", path: `${path}[${ti}]`, segs: segs.concat([{ i: ti }]), to: tgt[ti] });
      ti++;
    }
    if (next) {
      _walk(src[si], tgt[ti], `${path}[${si}]`, segs.concat([{ i: si }]), unordered, keyBy, out, depth + 1, opts);
      si++; ti++; pi++;
    }
  }
}

// Key-based diff for arrays of objects when keyBy is set (T6/B2).
// Items sharing the same keyBy value are recursively diffed; unmatched
// source items → removed; unmatched target items → added.
function _diffArrayKeyed(src, tgt, path, segs, unordered, keyBy, out, depth, opts) {
  const srcMap = new Map(), tgtMap = new Map();
  src.forEach((item, si) => {
    if (item && typeof item === "object" && !Array.isArray(item) && _hasOwn(item, keyBy)) {
      const k = JSON.stringify(item[keyBy]);
      if (!srcMap.has(k)) srcMap.set(k, { si, item });
    }
  });
  tgt.forEach((item, ti) => {
    if (item && typeof item === "object" && !Array.isArray(item) && _hasOwn(item, keyBy)) {
      const k = JSON.stringify(item[keyBy]);
      if (!tgtMap.has(k)) tgtMap.set(k, { ti, item });
    }
  });
  // Matched pairs → recurse (in source order)
  srcMap.forEach(({ si, item: srcItem }, k) => {
    if (tgtMap.has(k)) {
      const { item: tgtItem } = tgtMap.get(k);
      _walk(srcItem, tgtItem, `${path}[${si}]`, segs.concat([{ i: si }]), unordered, keyBy, out, depth + 1, opts);
    }
  });
  // Only in source → removed
  srcMap.forEach(({ si, item }, k) => {
    if (!tgtMap.has(k)) out.push({ op: "removed", path: `${path}[${si}]`, segs: segs.concat([{ i: si }]), from: item });
  });
  // Only in target → added
  tgtMap.forEach(({ ti, item }, k) => {
    if (!srcMap.has(k)) out.push({ op: "added", path: `${path}[${ti}]`, segs: segs.concat([{ i: ti }]), to: item });
  });
}

// --- T9/B6: big-number precision detection ---
// Returns the set of raw integer strings in `text` that would lose precision
// when read through JSON.parse (i.e. integers outside ±2^53-1).
// This is a text-level heuristic: it may trigger on numbers inside JSON string
// values, but false positives are acceptable — we warn, not error.
function detectPrecisionLoss(text) {
  const found = [];
  const re = /-?\d{16,}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    if (String(Number(raw)) !== raw && !found.includes(raw)) found.push(raw);
  }
  return found;
}

// Recursively collect differences into `out`. Pure: no DOM, no globals.
// `segs` is the structured path to the current node (see helpers above).
// `keyBy` is the optional key field for array-of-objects matching (T6).
// `depth` is incremented on every recursive call; throws DiffDepthError at
// MAX_DIFF_DEPTH to prevent stack overflows on pathological inputs (T7/B4).
// `opts` carries comparison options (T14): ignoreKeys, numericTolerance, ignoreCase.
function _walk(src, tgt, path, segs, unordered, keyBy, out, depth, opts) {
  if (depth > MAX_DIFF_DEPTH) throw new DiffDepthError(path);
  if (typeName(src) !== typeName(tgt)) {
    out.push({ op: "type_changed", path, segs, from: src, to: tgt, fromType: typeName(src), toType: typeName(tgt) });
    return out;
  }
  const t = typeName(src);
  if (t === "object") {
    // T14: ignoreKeys — skip listed keys from both sides.
    const ignoreKeys = (opts && Array.isArray(opts.ignoreKeys) && opts.ignoreKeys.length) ? opts.ignoreKeys : null;
    const keys = [...new Set([...Object.keys(src), ...Object.keys(tgt)])].sort();
    const visibleKeys = ignoreKeys ? keys.filter(k => !ignoreKeys.includes(k)) : keys;
    visibleKeys.forEach(k => {
      const p = `${path}.${k}`, sg = segs.concat([{ k }]), inS = _hasOwn(src, k), inT = _hasOwn(tgt, k);
      if (inS && !inT) out.push({ op: "removed", path: p, segs: sg, from: src[k] });
      else if (!inS && inT) out.push({ op: "added", path: p, segs: sg, to: tgt[k] });
      else _walk(src[k], tgt[k], p, sg, unordered, keyBy, out, depth + 1, opts);
    });
    return out;
  }
  if (t === "array") {
    // Unordered multiset branch (existing behaviour, unchanged).
    if (unordered && src.every(isScalar) && tgt.every(isScalar)) {
      const key = x => typeName(x) + ":" + JSON.stringify(x);
      const sC = {}, tC = {}, ref = {};
      src.forEach(x => { const k = key(x); sC[k] = (sC[k] || 0) + 1; ref[k] = x; });
      tgt.forEach(x => { const k = key(x); tC[k] = (tC[k] || 0) + 1; ref[k] = x; });
      [...new Set([...Object.keys(sC), ...Object.keys(tC)])].forEach(k => {
        const s = sC[k] || 0, tt = tC[k] || 0, sg = segs.concat([{ star: true }]);
        if (s > tt) out.push({ op: "removed", path: `${path}[*]`, segs: sg, from: ref[k] });
        else if (tt > s) out.push({ op: "added", path: `${path}[*]`, segs: sg, to: ref[k] });
        else out.push({ op: "equal", path: `${path}[*]`, segs: sg, from: ref[k], to: ref[k] });
      });
      return out;
    }
    // T6/B2: ordered-array matching strategy selection.
    if (keyBy) {
      // Opt-in key-based matching for arrays of objects.
      _diffArrayKeyed(src, tgt, path, segs, unordered, keyBy, out, depth, opts);
    } else if (src.every(isScalar) && tgt.every(isScalar)) {
      // All-scalar arrays: use LCS so a single insert/delete doesn't cascade.
      _diffArrayLCS(src, tgt, path, segs, unordered, keyBy, out, depth, opts);
    } else {
      // Mixed / object arrays without a keyBy: positional (safe fallback).
      const max = Math.max(src.length, tgt.length);
      for (let i = 0; i < max; i++) {
        const p = `${path}[${i}]`, sg = segs.concat([{ i }]);
        if (i >= tgt.length) out.push({ op: "removed", path: p, segs: sg, from: src[i] });
        else if (i >= src.length) out.push({ op: "added", path: p, segs: sg, to: tgt[i] });
        else _walk(src[i], tgt[i], p, sg, unordered, keyBy, out, depth + 1, opts);
      }
    }
    return out;
  }
  // T14: numeric tolerance — treat close numbers as equal.
  if (t === "number" && opts && typeof opts.numericTolerance === "number" && isFinite(opts.numericTolerance) && opts.numericTolerance >= 0) {
    const eq = Math.abs(src - tgt) <= opts.numericTolerance;
    out.push({ op: eq ? "equal" : "changed", path, segs, from: src, to: tgt });
    return out;
  }
  // T14: ignore-case — treat strings equal if they match case-insensitively.
  if (t === "string" && opts && opts.ignoreCase) {
    const eq = src.toLowerCase() === tgt.toLowerCase();
    out.push({ op: eq ? "equal" : "changed", path, segs, from: src, to: tgt });
    return out;
  }
  if (src === tgt) out.push({ op: "equal", path, segs, from: src, to: tgt });
  else out.push({ op: "changed", path, segs, from: src, to: tgt });
  return out;
}

// F-4: ignore-paths — tokenize a display-format path string into an array of tokens.
// "$.a[0].b"        → ["$", "a", "0", "b"]
// "$.items[*].ts"   → ["$", "items", "*", "ts"]
// "$.meta.*.key"    → ["$", "meta", "*", "key"]
// Wildcard token "*" (from "[*]" or ".*") matches any single token during comparison.
function _tokenizePath(p) {
  const toks = [];
  let i = 0;
  while (i < p.length) {
    if (p[i] === "$") { toks.push("$"); i++; }
    else if (p[i] === ".") {
      i++;
      let j = i;
      while (j < p.length && p[j] !== "." && p[j] !== "[") j++;
      if (j > i) toks.push(p.slice(i, j));
      i = j;
    } else if (p[i] === "[") {
      i++;
      let j = i;
      while (j < p.length && p[j] !== "]") j++;
      toks.push(p.slice(i, j));
      i = j + 1;
    } else {
      i++;
    }
  }
  return toks;
}

// Returns true if `path` (display string) matches `pattern` token-for-token.
// Lengths must be equal; "*" in the pattern matches any single token.
function _pathMatchesPattern(path, pattern) {
  const pt = _tokenizePath(path), pp = _tokenizePath(pattern);
  if (pt.length !== pp.length) return false;
  for (let i = 0; i < pp.length; i++) {
    if (pp[i] !== "*" && pp[i] !== pt[i]) return false;
  }
  return true;
}

// G-3: schema-aware diff helpers.
// These are pure (no DOM, no globals, no I/O) so they live inside DIFF-CORE.
//
// _collectVolatilePaths(schema, path, out)
//   Walk a JSON Schema and push JSONPath-like patterns for every property node
//   that carries "x-volatile": true into `out`. Recurses into `properties` and
//   single-schema `items` (all array elements share one schema).
//   E.g. { properties: { ts: { "x-volatile": true } } } → out = ["$.ts"]
function _collectVolatilePaths(schema, path, out) {
  if (!schema || typeof schema !== "object") return;
  if (schema["x-volatile"] === true && path !== "$") out.push(path);
  if (schema.properties && typeof schema.properties === "object") {
    const keys = Object.keys(schema.properties);
    for (let ki = 0; ki < keys.length; ki++) {
      _collectVolatilePaths(schema.properties[keys[ki]], path + "." + keys[ki], out);
    }
  }
  if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
    _collectVolatilePaths(schema.items, path + "[*]", out);
  }
}

// Navigate a JSON Schema tree to the sub-schema node at `tokens` (from
// _tokenizePath). Returns null when the path cannot be resolved.
// Supports: root "$", object properties, array items (single schema).
function _schemaAtPath(schema, tokens) {
  let cur = schema;
  for (let i = 1; i < tokens.length; i++) {
    if (!cur || typeof cur !== "object") return null;
    const tok = tokens[i];
    if (tok === "*" || /^\d+$/.test(tok)) {
      cur = (cur.items && typeof cur.items === "object" && !Array.isArray(cur.items))
            ? cur.items : null;
    } else {
      cur = (cur.properties && typeof cur.properties[tok] === "object")
            ? cur.properties[tok] : null;
    }
  }
  return cur;
}

// Check whether `value` satisfies the `type` declared in `schemaNode`.
// Returns { expected, got } if there is a type violation, null otherwise.
// Handles type arrays (["string","null"]) and the "integer" refinement.
function _schemaTypeViolation(value, schemaNode) {
  if (!schemaNode || !schemaNode.type) return null;
  if (value === null || value === undefined) return null;
  const got = typeName(value);
  const declared = Array.isArray(schemaNode.type) ? schemaNode.type : [schemaNode.type];
  const ok = declared.some(t =>
    t === got ||
    (t === "integer" && got === "number" && Number.isInteger(value)) ||
    (t === "number"  && got === "number")
  );
  if (!ok) return { expected: declared.join("|"), got };
  return null;
}

// Public entry point. Change = { op, path, segs, from?, to?, fromType?, toType?,
//                                 schemaViolation?: { expected, got } }.
// opts: { unordered?: boolean, keyBy?: string,
//         ignoreKeys?: string[], numericTolerance?: number, ignoreCase?: boolean,
//         ignorePaths?: string[], schema?: object }
function diffCore(src, tgt, opts) {
  const unordered = !!(opts && opts.unordered);
  const keyBy = (opts && typeof opts.keyBy === "string") ? opts.keyBy : null;
  const raw = _walk(src, tgt, "$", [], unordered, keyBy, [], 0, opts || {});

  // Build combined ignorePaths: explicit patterns + schema volatile paths (G-3).
  const explicitIgnore = (opts && Array.isArray(opts.ignorePaths) && opts.ignorePaths.length) ? opts.ignorePaths : [];
  const schemaIgnore = [];
  if (opts && opts.schema && typeof opts.schema === "object") {
    _collectVolatilePaths(opts.schema, "$", schemaIgnore);
  }
  const ignorePaths = (explicitIgnore.length || schemaIgnore.length)
    ? explicitIgnore.concat(schemaIgnore) : null;

  let result = ignorePaths
    ? raw.filter(c => !ignorePaths.some(pat => _pathMatchesPattern(c.path, pat)))
    : raw;

  // G-3: annotate changes that violate the schema's declared type.
  if (opts && opts.schema && typeof opts.schema === "object") {
    result = result.map(c => {
      if (c.op === "equal" || c.op === "removed") return c;
      const tokens = _tokenizePath(c.path);
      const node = _schemaAtPath(opts.schema, tokens);
      const violation = _schemaTypeViolation(c.to, node);
      if (!violation) return c;
      const annotated = { op: c.op, path: c.path, segs: c.segs };
      if ("from" in c) annotated.from = c.from;
      if ("to" in c) annotated.to = c.to;
      if ("fromType" in c) annotated.fromType = c.fromType;
      if ("toType" in c) annotated.toType = c.toType;
      annotated.schemaViolation = violation;
      return annotated;
    });
  }

  return result;
}
/* ===== DIFF-CORE:END ===== */

export {
  typeName,
  isScalar,
  diffCore as diff,
  segLabel,
  segKey,
  segId,
  segsStartWith,
  entriesUnderSegs,
  MAX_DIFF_DEPTH,
  DiffDepthError,
  detectPrecisionLoss,
  _tokenizePath,
  _pathMatchesPattern,
  _collectVolatilePaths,
  _schemaAtPath,
  _schemaTypeViolation,
};
