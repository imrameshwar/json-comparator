// src/three-way.js — T24
//
// Three-way merge diff: given Base, Left (ours), and Right (theirs), computes
// the union of changes and classifies each as:
//   "left-only"  — changed only in Left  vs Base
//   "right-only" — changed only in Right vs Base
//   "both-same"  — changed identically in both (safe auto-merge)
//   "conflict"   — changed differently in both (needs manual resolution)
//   "base"       — unchanged in both (equals base value)
//
// Also supports schema-keyed array matching: when an opts.keyBy field is
// provided, array-of-objects elements are matched by that key rather than
// by position.  This integrates with the existing diffCore `keyBy` option.
//
// Return type:
//   ThreeWayChange = {
//     path     : string,           // display path
//     segs     : Segment[],        // canonical identity (T4)
//     kind     : "left-only" | "right-only" | "both-same" | "conflict" | "base",
//     base     : any,              // value in Base  (undefined if added)
//     left     : any,              // value in Left  (undefined if removed in Left)
//     right    : any,              // value in Right (undefined if removed in Right)
//   }

/**
 * Compute a three-way diff of base / left / right JSON values.
 *
 * @param {*}      base   - the common ancestor value
 * @param {*}      left   - "ours" — the value we changed
 * @param {*}      right  - "theirs" — the value they changed
 * @param {object} [opts] - same opts as diffCore: { keyBy?, unordered? }
 * @param {function} diffFn - the diffCore function to use for two-way diffs
 * @returns {ThreeWayChange[]}
 */
export function threeWayDiff(base, left, right, opts, diffFn) {
  const o = opts || {};

  // Two-way diffs: base→left and base→right
  const leftChanges  = diffFn(base, left,  o).filter(c => c.op !== "equal");
  const rightChanges = diffFn(base, right, o).filter(c => c.op !== "equal");

  // Index right changes by canonical path id (left is iterated directly below).
  const rightMap = new Map(rightChanges.map(c => [_id(c),  c]));

  const result = [];
  const seen   = new Set();

  // For every change on the left, compare with the right change at the same path
  for (const lc of leftChanges) {
    const id = _id(lc);
    seen.add(id);
    const rc = rightMap.get(id);
    if (!rc) {
      // Only left changed
      result.push({ path: lc.path, segs: lc.segs, kind: "left-only",
                    base: lc.from, left: lc.to, right: lc.from });
    } else {
      // Both changed at this path — same or conflict?
      const kind = _deepEq(lc.to, rc.to) ? "both-same" : "conflict";
      result.push({ path: lc.path, segs: lc.segs, kind,
                    base: lc.from, left: lc.to, right: rc.to });
    }
  }

  // Right-only changes (not seen on the left)
  for (const rc of rightChanges) {
    const id = _id(rc);
    if (seen.has(id)) continue;
    result.push({ path: rc.path, segs: rc.segs, kind: "right-only",
                  base: rc.from, left: rc.from, right: rc.to });
  }

  // Sort by path for stable output
  result.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return result;
}

// ─── Summary statistics ───────────────────────────────────────────────────────
/**
 * Count changes by kind.
 * @param {ThreeWayChange[]} changes
 * @returns {{ leftOnly: number, rightOnly: number, bothSame: number, conflict: number }}
 */
export function threeWaySummary(changes) {
  const out = { leftOnly: 0, rightOnly: 0, bothSame: 0, conflict: 0 };
  for (const c of changes) {
    if      (c.kind === "left-only")  out.leftOnly++;
    else if (c.kind === "right-only") out.rightOnly++;
    else if (c.kind === "both-same")  out.bothSame++;
    else if (c.kind === "conflict")   out.conflict++;
  }
  return out;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function _id(change) { return JSON.stringify(change.segs); }

function _deepEq(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => _deepEq(v, b[i]));
  }
  if (typeof a === "object") {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    if (ka.length !== kb.length) return false;
    if (!ka.every((k, i) => k === kb[i])) return false;
    return ka.every(k => _deepEq(a[k], b[k]));
  }
  return false;
}

// ─── Merge resolution ─────────────────────────────────────────────────────────

/**
 * Deep-clone a JSON-serialisable value.
 * @param {*} v
 * @returns {*}
 */
function _deepClone(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(_deepClone);
  return Object.fromEntries(Object.entries(v).map(([k, vv]) => [k, _deepClone(vv)]));
}

/**
 * Set (or delete) a value at the location described by `segs` in a mutable
 * clone of the document root.  Handles object keys and array indices; star
 * segments are skipped (no-op).
 *
 * @param {*}        root   - mutable clone to modify in place
 * @param {Segment[]} segs  - path from threeWayDiff
 * @param {*}        value  - value to write (undefined → delete / splice)
 */
function _setAtSegs(root, segs, value) {
  if (!segs || segs.length === 0) return;
  let cur = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    if (s.k !== undefined) {
      if (typeof cur[s.k] !== "object" || cur[s.k] === null) cur[s.k] = {};
      cur = cur[s.k];
    } else if (s.i !== undefined) {
      if (!Array.isArray(cur) || s.i < 0 || s.i >= cur.length) return;
      cur = cur[s.i];
    } else {
      return; // star segment — unsupported path, skip
    }
  }
  const last = segs[segs.length - 1];
  if (last.k !== undefined) {
    if (value === undefined) delete cur[last.k];
    else cur[last.k] = value;
  } else if (last.i !== undefined) {
    if (Array.isArray(cur)) {
      if (value === undefined) cur.splice(last.i, 1);
      else cur[last.i] = value;
    }
  }
  // star segment as final step: skip
}

/**
 * Produce a merged JSON value from a three-way diff with per-conflict
 * user resolutions.
 *
 * Auto-merge rule (documented in Help):
 *   "left-only"  → accept left value  (right was unchanged from base)
 *   "right-only" → accept right value (left was unchanged from base)
 *   "both-same"  → accept left value  (both sides made the same change)
 *   "conflict"   → use resolutions.get(segId) ∈ "left"|"right"|"base";
 *                  defaults to "left" when unresolved
 *
 * @param {*}                  base        - common ancestor value
 * @param {ThreeWayChange[]}   changes     - output of threeWayDiff()
 * @param {Map<string,string>} resolutions - Map of segId → "left"|"right"|"base"
 * @returns {*} merged value
 */
export function resolveMerge(base, changes, resolutions) {
  const res = resolutions || new Map();
  const clone = _deepClone(base);
  for (const c of changes) {
    const id = JSON.stringify(c.segs);
    let val;
    if      (c.kind === "left-only")  val = c.left;
    else if (c.kind === "right-only") val = c.right;
    else if (c.kind === "both-same")  val = c.left;
    else { // conflict
      const choice = res.get(id) || "left";
      val = choice === "right" ? c.right : choice === "base" ? c.base : c.left;
    }
    // Only apply if the resolved value differs from base (clone starts as base)
    if (!_deepEq(val, c.base)) _setAtSegs(clone, c.segs, val);
  }
  return clone;
}
