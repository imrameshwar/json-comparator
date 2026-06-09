// src/filter.js
// Pure, DOM-free filter for Change[] arrays produced by diffCore.
// Exported for Vitest unit tests; the function body is also inlined in
// json_compare.html (outside the DIFF-CORE block, without the export keyword).
//
// filterChanges(changes, filter) -> Change[]
//   changes : Change[] from diffCore where op !== "equal"
//   filter  : { pathQ: string, valueQ: string, types: Set<string> }
//             types is a subset of {"added","removed","changed","type_changed"}

export function filterChanges(changes, filter) {
  const { pathQ = "", valueQ = "", types } = filter;
  const pq = pathQ.trim().toLowerCase();
  const vq = valueQ.trim().toLowerCase();
  const ALL_OPS = new Set(["added", "removed", "changed", "type_changed"]);
  const filterTypes = types && types.size < ALL_OPS.size;
  if (!pq && !vq && !filterTypes) return changes;   // nothing active — fast path

  return changes.filter(ch => {
    if (types && !types.has(ch.op)) return false;
    if (pq && !ch.path.toLowerCase().includes(pq)) return false;
    if (vq) {
      const fromS = ch.from !== undefined ? JSON.stringify(ch.from).toLowerCase() : "";
      const toS   = ch.to   !== undefined ? JSON.stringify(ch.to).toLowerCase()   : "";
      if (!fromS.includes(vq) && !toS.includes(vq)) return false;
    }
    return true;
  });
}
