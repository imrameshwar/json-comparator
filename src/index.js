// src/index.js — G-1: public npm API surface for the json-comparator package.
//
// Re-exports the core diff engine and patch utilities as a documented,
// dependency-free ES module.  No new logic lives here — we simply surface the
// already-tested internals.
//
// API
// ───
//   diff(a, b, opts?)  → Change[]
//     Compare two JSON values.  `a` and `b` must be plain JS values (as returned
//     by JSON.parse).
//
//     opts: {
//       unordered?:        boolean  — treat scalar arrays as unordered multisets
//       keyBy?:            string   — match array objects by this key field
//       ignoreKeys?:       string[] — skip these object keys globally
//       ignorePaths?:      string[] — skip paths matching these glob patterns
//       numericTolerance?: number   — treat close numbers as equal
//       ignoreCase?:       boolean  — compare strings case-insensitively
//     }
//
//     Change = { op, path, segs, from?, to?, fromType?, toType? }
//     op ∈ "added" | "removed" | "changed" | "type_changed" | "equal"
//     "equal" entries are emitted for matched scalars so callers that want the
//     full structure can render it; filter with `c.op !== "equal"` for diffs only.
//
//   changesToPatch(changes) → RFC 6902 Operation[]
//     Convert a Change[] (non-equal entries) into a standard JSON Patch document.
//
//   segsToPointer(segs) → string
//     Convert a segs array into an RFC 6901 JSON Pointer string.
//
//   applyPatch(doc, ops) → doc'
//     Apply RFC 6902 ops to a deep clone of `doc` and return the patched result.
//     Useful for round-trip verification.
//
// Utility re-exports (for callers building custom renderers):
//   typeName(v), isScalar(v), segLabel(s), segKey(s), segId(segs),
//   segsStartWith(segs, prefix), entriesUnderSegs(entries, prefix),
//   MAX_DIFF_DEPTH, DiffDepthError, detectPrecisionLoss

export {
  // Core diff
  diff,
  typeName,
  isScalar,
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
} from "./diff-core.js";

export {
  // JSON Patch (RFC 6902)
  changesToPatch,
  segsToPointer,
  applyPatch,
} from "./json-patch.js";
