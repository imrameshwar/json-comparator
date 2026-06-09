// src/virtualizer.js — T20
//
// Pure virtual-scroll utilities.  No DOM, no globals — importable by both
// the web app (via inline copy) and Vitest tests.
//
// Design:
//   - visibleSlice: given total row count, row height, viewport height, and
//     scrollTop, returns the [start, end) indices to render plus the top/bottom
//     padding spacer heights needed to maintain the correct total scroll height.
//   - assignTreeId: stamps a stable collision-free `id` onto every node in a
//     diff tree using JSON.stringify(segs). Required before flattenNodes.
//   - flattenNodes: flattens a diff-tree children array into a linear array of
//     { node, depth } pairs, respecting an `expandedIds` Set for open/close state.
//   - defaultExpandedIds: returns the initial expanded Set for a diff tree root
//     (expand every container that hasDiff — mirrors the previous CSS behaviour).

// ─── Constants ───────────────────────────────────────────────────────────────
export const VIRT_ROW_H_TABLE = 40;   // px — must match CSS .row height in virt mode
export const VIRT_ROW_H_TREE  = 34;   // px — must match CSS .trow height in virt mode
export const VIRT_THRESHOLD   = 1000; // rows above which virtual scroll activates
export const VIRT_BUFFER      = 10;   // extra rows above/below the viewport

// ─── visibleSlice ─────────────────────────────────────────────────────────────
/**
 * Compute the range of rows to render for a virtual scroll list.
 *
 * @param {number} total     - total number of items in the list
 * @param {number} rowH      - fixed row height in px
 * @param {number} viewH     - visible viewport height in px
 * @param {number} scrollTop - current scroll position in px
 * @param {number} buf       - buffer rows to render above/below viewport
 * @returns {{ start: number, end: number, padTop: number, padBot: number }}
 */
export function visibleSlice(total, rowH, viewH, scrollTop, buf = VIRT_BUFFER) {
  if (total === 0) return { start: 0, end: 0, padTop: 0, padBot: 0 };
  const start  = Math.max(0, Math.floor(scrollTop / rowH) - buf);
  const end    = Math.min(total, Math.ceil((scrollTop + viewH) / rowH) + buf);
  const padTop = start * rowH;
  const padBot = Math.max(0, (total - end) * rowH);
  return { start, end, padTop, padBot };
}

// ─── assignTreeId ─────────────────────────────────────────────────────────────
/**
 * Stamp a stable `id` on every node of a diff tree (depth-first, in place).
 * Uses JSON.stringify(node.segs) — guaranteed unique since segs is the
 * collision-free canonical identity from T4.
 *
 * @param {object} node - a tree node produced by buildTree()
 */
export function assignTreeId(node) {
  node.id = JSON.stringify(node.segs || []);
  if (node.children) node.children.forEach(assignTreeId);
}

// ─── flattenNodes ─────────────────────────────────────────────────────────────
/**
 * Flatten the *children* of a tree root into a linear array suitable for
 * virtual-scroll rendering.  Only nodes that are visible (not inside a
 * collapsed ancestor) are included.
 *
 * @param {object[]} children  - top-level children of the tree root
 * @param {Set}      expandedIds - Set of node.id strings that are open
 * @param {boolean}  onlyDiff  - if true, skip nodes with !hasDiff
 * @returns {{ node: object, depth: number }[]}
 */
export function flattenNodes(children, expandedIds, onlyDiff = false) {
  const rows = [];
  function walk(nodes, depth) {
    for (const node of nodes) {
      if (onlyDiff && !node.hasDiff) continue;
      rows.push({ node, depth });
      if (node.container && expandedIds.has(node.id)) {
        const kids = onlyDiff
          ? node.children.filter(c => c.hasDiff)
          : node.children;
        walk(kids, depth + 1);
      }
    }
  }
  const topKids = onlyDiff ? children.filter(c => c.hasDiff) : children;
  walk(topKids, 0);
  return rows;
}

// ─── defaultExpandedIds ───────────────────────────────────────────────────────
/**
 * Build the initial Set of expanded node IDs for a tree root.
 * Expands every container whose hasDiff is true — the same behaviour as the
 * previous CSS-only approach (collapsed class not added when hasDiff=true).
 *
 * @param {object} root - the root node returned by buildTree()
 * @returns {Set<string>}
 */
export function defaultExpandedIds(root) {
  const ids = new Set();
  function walk(node) {
    if (node.container && node.hasDiff) {
      ids.add(node.id);
      if (node.children) node.children.forEach(walk);
    }
  }
  if (root.children) root.children.forEach(walk);
  return ids;
}
