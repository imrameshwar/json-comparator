// src/jsonpath.js
//
// Hand-rolled JSONPath evaluator.
// Zero dependencies, no DOM access, no I/O.
//
// Source of truth for the inline copy in json_compare.html (between
// JSONPATH:START / JSONPATH:END markers).  tests/jsonpath.test.js asserts
// both copies are byte-identical.
//
// API
//   jsonpathQuery(doc, expr) → { path: (string|number)[], value: any }[]
//   Throws Error with a user-friendly message on invalid expression.
//
// Supported JSONPath subset (v1)
//   $              root (returns [{path:[], value:doc}])
//   .key ['key']   child access — dot notation or bracket notation
//   [n]            array index  (negative = from end, e.g. [-1] = last)
//   [n:m] [n:m:s]  slice — Python semantics; omit start/end/step freely
//   .* [*]         wildcard — all children of object or array
//   ..key ..*      recursive descent — applies to the whole subtree
//   [?(@.key)]     filter — existence: selects items where @.key is present
//   [?(@.key OP v)] filter — comparison; OP: == != < > <= >=
//                   v: unquoted number, 'string', "string", true, false, null
//   ['a','b']      union of quoted keys (bracket notation)
//
// Not supported (follow-up): JMESPath / jq, script expressions $(…),
//   standalone @ without a key path, nested / boolean filter expressions,
//   @ on the right-hand side of a filter comparison.

/* JSONPATH:START */
/**
 * Evaluate a JSONPath expression against an already-parsed JSON value.
 *
 * @param {any}    doc  — JS value (object, array, string, number, bool, null)
 * @param {string} expr — JSONPath expression string, e.g. "$.store.book[*].price"
 * @returns {{ path: Array<string|number>, value: any }[]}
 * @throws {Error} on invalid expression — message is user-friendly
 */
function jsonpathQuery(doc, expr) {
  if (typeof expr !== "string") throw new Error("JSONPath expression must be a string.");
  const e = expr.trim();
  if (e === "" || e === "$") return [{ path: [], value: doc }];
  if (e[0] !== "$") throw new Error("JSONPath expression must start with '$'. Got: " + JSON.stringify(e[0]));
  const steps = _jpParse(e);
  const results = [];
  _jpEval([{ path: [], value: doc }], steps, 1, results);
  return results;
}

// ─── Parser ──────────────────────────────────────────────────────────────────
// Returns an array of step objects. steps[0] is always {type:'root'}.

function _jpParse(e) {
  const steps = [{ type: "root" }];
  let i = 1; // skip leading '$'
  const n = e.length;

  while (i < n) {
    if (e[i] === ".") {
      i++;
      if (i >= n) break;                         // trailing '.' — tolerate
      if (e[i] === ".") {                        // recursive descent: '..'
        i++;
        if (i < n && e[i] === "[") {
          const { step, end } = _jpSubscript(e, i);
          steps.push({ type: "recursive", inner: step });
          i = end;
        } else {
          const key = _jpIdent(e, i);
          if (key === null) throw new Error("Expected key or '[' after '..' at position " + i);
          steps.push({ type: "recursive",
            inner: key === "*" ? { type: "wildcard" } : { type: "child", key } });
          i += key.length;
        }
      } else if (e[i] === "*") {                 // wildcard: '.*'
        steps.push({ type: "wildcard" });
        i++;
      } else {                                   // named child: '.key'
        const key = _jpIdent(e, i);
        if (key === null) throw new Error("Expected key after '.' at position " + i);
        steps.push({ type: "child", key });
        i += key.length;
      }
    } else if (e[i] === "[") {                   // subscript: '[…]'
      const { step, end } = _jpSubscript(e, i);
      steps.push(step);
      i = end;
    } else {
      throw new Error("Unexpected character '" + e[i] + "' at position " + i + ".");
    }
  }
  return steps;
}

/** Read a bare identifier (object key or '*') at pos. Returns string or null. */
function _jpIdent(e, pos) {
  const m = e.slice(pos).match(/^[^.[\](),\s]+/);
  return m ? m[0] : null;
}

/** Find the matching ']' for '[' at i, handling nested brackets + quoted strings. */
function _jpClose(e, i) {
  let depth = 0, inStr = false, q = "";
  for (let j = i; j < e.length; j++) {
    if (inStr) {
      if (e[j] === "\\") { j++; continue; }
      if (e[j] === q) inStr = false;
    } else if (e[j] === "'" || e[j] === '"') { inStr = true; q = e[j]; }
    else if (e[j] === "[") depth++;
    else if (e[j] === "]") { if (--depth === 0) return j; }
  }
  throw new Error("Unmatched '[' at position " + i + ".");
}

/** Parse one bracket subscript '[…]'; returns {step, end} where end = index after ']'. */
function _jpSubscript(e, i) {
  const close = _jpClose(e, i);
  const inner = e.slice(i + 1, close).trim();
  const end   = close + 1;

  // Wildcard: [*]
  if (inner === "*") return { step: { type: "wildcard" }, end };

  // Filter: [?(expr)]
  if (inner.startsWith("?(") && inner.endsWith(")")) {
    return { step: { type: "filter", expr: inner.slice(2, -1).trim() }, end };
  }

  // Single quoted key: ['key'] or ["key"] (no comma → single key, not union)
  const quotedSingle = inner.match(/^(['"])((?:[^'"\\]|\\.)*)\1$/);
  if (quotedSingle) {
    return { step: { type: "child", key: quotedSingle[2] }, end };
  }

  // Slice: any form containing ':' that isn't a quoted string
  // Detect by looking for ':' outside of quotes
  if (_jpHasColon(inner)) {
    const parts = inner.split(":").map(s => s.trim());
    const toN   = s => (s === "" || s === undefined) ? undefined : parseInt(s, 10);
    return {
      step: { type: "slice", start: toN(parts[0]), end: toN(parts[1]), step: toN(parts[2]) },
      end
    };
  }

  // Integer index: [0], [-1], [42]
  if (/^-?\d+$/.test(inner)) {
    return { step: { type: "index", idx: parseInt(inner, 10) }, end };
  }

  // Union of quoted keys: ['a','b'] or ["a","b"]
  if (inner.includes(",")) {
    const keys = inner.split(",").map(s => {
      const t = s.trim();
      const m = t.match(/^(['"])((?:[^'"\\]|\\.)*)\1$/);
      return m ? m[2] : t;
    });
    return { step: { type: "union", keys }, end };
  }

  // Bare unquoted key: [key]
  return { step: { type: "child", key: inner }, end };
}

/** Return true if `s` contains a ':' outside of any quoted string. */
function _jpHasColon(s) {
  let inStr = false, q = "";
  for (let i = 0; i < s.length; i++) {
    if (inStr) {
      if (s[i] === "\\" ) { i++; continue; }
      if (s[i] === q) inStr = false;
    } else if (s[i] === "'" || s[i] === '"') { inStr = true; q = s[i]; }
    else if (s[i] === ":") return true;
  }
  return false;
}

// ─── Evaluator ───────────────────────────────────────────────────────────────
// nodes : { path:(string|number)[], value:any }[]
// steps : step[]   (steps[0] = {type:'root'})
// si    : current step index (start at 1 to skip the root step)
// out   : result array (appended to)

function _jpEval(nodes, steps, si, out) {
  if (si >= steps.length) { out.push(...nodes); return; }
  const step = steps[si];
  const next = [];

  for (const { path, value } of nodes) {
    switch (step.type) {
      case "child": {
        if (value !== null && typeof value === "object" &&
            !Array.isArray(value) &&
            Object.prototype.hasOwnProperty.call(value, step.key)) {
          next.push({ path: path.concat(step.key), value: value[step.key] });
        }
        break;
      }
      case "wildcard": {
        if (Array.isArray(value)) {
          value.forEach((v, k) => next.push({ path: path.concat(k), value: v }));
        } else if (value !== null && typeof value === "object") {
          Object.keys(value).forEach(k => next.push({ path: path.concat(k), value: value[k] }));
        }
        break;
      }
      case "index": {
        if (Array.isArray(value)) {
          const k = step.idx < 0 ? value.length + step.idx : step.idx;
          if (k >= 0 && k < value.length) next.push({ path: path.concat(k), value: value[k] });
        }
        break;
      }
      case "slice": {
        if (Array.isArray(value)) {
          const len = value.length;
          const stp = step.step !== undefined ? step.step : 1;
          if (stp === 0) break; // step=0 is an error; skip silently
          const norm = (v, defVal) => {
            if (v === undefined) return defVal;
            const clamped = v < 0 ? len + v : v;
            return stp > 0
              ? Math.max(0, Math.min(clamped, len))
              : Math.max(-1, Math.min(clamped, len - 1));
          };
          const s = norm(step.start, stp > 0 ? 0 : len - 1);
          const e2 = norm(step.end, stp > 0 ? len : -1);
          if (stp > 0) { for (let k = s; k < e2;  k += stp) next.push({ path: path.concat(k), value: value[k] }); }
          else          { for (let k = s; k > e2;  k += stp) next.push({ path: path.concat(k), value: value[k] }); }
        }
        break;
      }
      case "recursive": {
        _jpRecurse(value, path, step.inner, next);
        break;
      }
      case "filter": {
        const items = Array.isArray(value)
          ? value.map((v, k) => ({ path: path.concat(k), value: v }))
          : (value !== null && typeof value === "object")
            ? Object.keys(value).map(k => ({ path: path.concat(k), value: value[k] }))
            : [];
        for (const item of items) {
          if (_jpFilter(item.value, step.expr)) next.push(item);
        }
        break;
      }
      case "union": {
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
          for (const k of step.keys) {
            if (Object.prototype.hasOwnProperty.call(value, k)) {
              next.push({ path: path.concat(k), value: value[k] });
            }
          }
        }
        break;
      }
      default: break; // 'root' and unknown — passthrough
    }
  }
  _jpEval(next, steps, si + 1, out);
}

/**
 * Collect all nodes (the current node and every descendant) that match
 * `inner` (one step), and push them into `out`.
 */
function _jpRecurse(value, path, inner, out) {
  if (value === null || typeof value !== "object") return;
  // Apply inner step at the current level
  _jpEval([{ path, value }], [inner], 0, out);
  // Descend into children
  if (Array.isArray(value)) {
    value.forEach((v, k) => _jpRecurse(v, path.concat(k), inner, out));
  } else {
    Object.keys(value).forEach(k => _jpRecurse(value[k], path.concat(k), inner, out));
  }
}

// ─── Filter expression evaluator ─────────────────────────────────────────────
// Two-char operators must precede single-char versions so indexOf matches correctly.

const _JP_CMP_OPS = ["<=", ">=", "==", "!=", "<", ">"];

function _jpFilter(node, expr) {
  const e = expr.trim();
  for (const op of _JP_CMP_OPS) {
    const idx = e.indexOf(op);
    if (idx === -1) continue;
    const lhsStr = e.slice(0, idx).trim();
    const rhsStr = e.slice(idx + op.length).trim();
    if (!lhsStr.startsWith("@")) continue; // only handle @-accessor on LHS
    const lval = _jpAccess(node, lhsStr);
    const rval = _jpLit(rhsStr);
    if (lval === undefined || rval === undefined) return false;
    if (op === "==") return lval === rval;
    if (op === "!=") return lval !== rval;
    if (op === "<")  return lval <  rval;
    if (op === ">")  return lval >  rval;
    if (op === "<=") return lval <= rval;
    if (op === ">=") return lval >= rval;
  }
  // Existence check: expression is just an accessor (@.key or @['key'])
  return e.startsWith("@") ? _jpAccess(node, e) !== undefined : false;
}

/** Navigate an @ accessor path (e.g. @.a.b, @['key'], @.arr[0]) from `node`. */
function _jpAccess(node, expr) {
  if (!expr.startsWith("@")) return undefined;
  let cur = node, i = 1; // skip '@'
  while (i < expr.length && cur !== undefined && cur !== null) {
    if (expr[i] === ".") {
      i++;
      const m = expr.slice(i).match(/^([^.[\]]+)/);
      if (!m) break;
      cur = (cur !== null && typeof cur === "object") ? cur[m[1]] : undefined;
      i += m[1].length;
    } else if (expr[i] === "[") {
      const close = expr.indexOf("]", i);
      if (close === -1) break;
      let key = expr.slice(i + 1, close).trim();
      const q = key.match(/^(['"])((?:[^'"\\]|\\.)*)\1$/);
      if (q) {
        cur = (cur !== null && typeof cur === "object") ? cur[q[2]] : undefined;
      } else if (/^-?\d+$/.test(key)) {
        const idx = parseInt(key, 10);
        cur = Array.isArray(cur) ? cur[idx < 0 ? cur.length + idx : idx] : undefined;
      } else {
        cur = (cur !== null && typeof cur === "object") ? cur[key] : undefined;
      }
      i = close + 1;
    } else { break; }
  }
  return cur;
}

/** Parse a literal value from a filter RHS: number, 'string', "string", true, false, null. */
function _jpLit(s) {
  if (s === "true")  return true;
  if (s === "false") return false;
  if (s === "null")  return null;
  const q = s.match(/^(['"])((?:[^'"\\]|\\.)*)\1$/);
  if (q) return q[2];
  const n = Number(s);
  return Number.isNaN(n) ? undefined : n;
}
/* JSONPATH:END */

export { jsonpathQuery };
