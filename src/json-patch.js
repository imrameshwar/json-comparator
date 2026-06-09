// src/json-patch.js — T17: RFC 6902 JSON Patch generation
//
// changesToPatch(changes) -> RFC6902 Operation[]
//   changes: Change[] from diffCore; the caller may pass only non-equal entries.
//
// applyPatch(doc, ops) -> doc'
//   Pure function for property-test verification: applies the patch to a deep
//   clone of `doc` and returns the patched document.
//
// JSON Pointer paths (RFC 6901) are derived from `segs`:
//   {k: "foo"} → "/foo"   (with ~ and / escaped per RFC 6901)
//   {i: 2}     → "/2"
//   {star:true}→ "-"      (end-of-array append, RFC 6901 convention)
//
// Limitations:
//   - No "move" operations; rearrangements appear as remove+add.
//   - Unordered-array changes ({star:true} segs) are skipped — their patch
//     semantics are undefined.
//   - type_changed emits "replace".
//   - Whole-subtree adds/removes emit a single add/remove at the root seg.

export function segsToPointer(segs) {
  if (!segs || segs.length === 0) return "";
  return segs.map(s => {
    if (s.star) return "-";
    const raw = s.k !== undefined ? String(s.k) : String(s.i);
    return raw.replace(/~/g, "~0").replace(/\//g, "~1");  // RFC 6901 escape
  }).join("/");
}

export function changesToPatch(changes) {
  const ops = [];
  for (const ch of changes) {
    if (ch.op === "equal") continue;
    // Skip unordered-array star entries — patch for those is undefined
    if (ch.segs && ch.segs.some(s => s.star)) continue;
    const path = "/" + segsToPointer(ch.segs);
    if (ch.op === "added") {
      ops.push({ op: "add", path, value: ch.to });
    } else if (ch.op === "removed") {
      ops.push({ op: "remove", path });
    } else if (ch.op === "changed" || ch.op === "type_changed") {
      ops.push({ op: "replace", path, value: ch.to });
    }
  }
  return ops;
}

// applyPatch: pure test/verification helper — applies RFC 6902 ops to a deep
// clone of `doc`. Throws on unknown operations or invalid paths.
export function applyPatch(doc, ops) {
  let root = JSON.parse(JSON.stringify(doc));  // deep clone

  function parseParts(pointer) {
    if (!pointer || pointer === "/") return [];
    return pointer.replace(/^\//, "").split("/")
      .map(p => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  }

  function resolveParent(pointer) {
    const parts = parseParts(pointer);
    if (!parts.length) return { parent: null, key: null };
    const key = parts[parts.length - 1];
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (cur === null || typeof cur !== "object") throw new Error("Non-navigable at " + p);
      cur = Array.isArray(cur) ? cur[Number(p)] : cur[p];
      if (cur === undefined) throw new Error("Path not found at " + p);
    }
    return { parent: cur, key };
  }

  for (const op of ops) {
    if (op.op === "add") {
      if (!op.path || op.path === "/") { root = op.value; continue; }
      const { parent, key } = resolveParent(op.path);
      if (Array.isArray(parent)) {
        const idx = key === "-" ? parent.length : Number(key);
        parent.splice(idx, 0, op.value);
      } else {
        parent[key] = op.value;
      }
    } else if (op.op === "remove") {
      if (!op.path || op.path === "/") throw new Error("Cannot remove root");
      const { parent, key } = resolveParent(op.path);
      if (Array.isArray(parent)) parent.splice(Number(key), 1);
      else delete parent[key];
    } else if (op.op === "replace") {
      if (!op.path || op.path === "/") { root = op.value; continue; }
      const { parent, key } = resolveParent(op.path);
      if (Array.isArray(parent)) parent[Number(key)] = op.value;
      else parent[key] = op.value;
    } else {
      throw new Error("Unknown RFC 6902 op: " + op.op);
    }
  }
  return root;
}
