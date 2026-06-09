// src/worker-protocol.js — T19
//
// Pure message-type constants and builder helpers for the off-thread diff
// worker.  No DOM, no Worker construction — importable by both the main thread
// and the Vitest test suite.

// ─── Outbound (main → worker) ────────────────────────────────────────────────
export const MSG_DIFF   = "diff";    // { type, id, srcText, tgtText, opts }
export const MSG_CANCEL = "cancel";  // { type, id }

// ─── Inbound (worker → main) ─────────────────────────────────────────────────
export const MSG_PROGRESS = "progress"; // { type, id, phase, pct }  phase ∈ "parse"|"diff"
export const MSG_RESULT   = "result";   // { type, id, changes, precLost }
export const MSG_ERROR    = "error";    // { type, id, name, message, parseTarget? }

// ─── Message builders ────────────────────────────────────────────────────────

/** Create a diff-request message. */
export function mkDiffMsg(id, srcText, tgtText, opts) {
  return { type: MSG_DIFF, id, srcText, tgtText, opts };
}

/** Create a cancel message. */
export function mkCancelMsg(id) {
  return { type: MSG_CANCEL, id };
}

/** Create a progress message (worker → main). */
export function mkProgressMsg(id, phase, pct) {
  return { type: MSG_PROGRESS, id, phase, pct };
}

/** Create a result message (worker → main). */
export function mkResultMsg(id, changes, precLost) {
  return { type: MSG_RESULT, id, changes, precLost };
}

/** Create an error message (worker → main). */
export function mkErrorMsg(id, name, message, parseTarget) {
  return { type: MSG_ERROR, id, name, message, parseTarget: parseTarget || null };
}

// ─── Worker message handler source ──────────────────────────────────────────
//
// This string is appended to the inlined DIFF-CORE block when building the
// worker Blob URL.  The worker receives MSG_DIFF, runs parse + diffCore, and
// posts back MSG_PROGRESS / MSG_RESULT / MSG_ERROR.
//
// Cancel: the main thread posts MSG_CANCEL with the same id before the result
// arrives; the worker checks `_wCancelled` at parse and diff boundaries and
// posts MSG_ERROR { name:"CancelError" } if cancelled.
//
export const WORKER_HANDLER_SRC = `
const _wCancelled = new Set();
self.onmessage = function(evt) {
  const msg = evt.data;
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "cancel") { _wCancelled.add(msg.id); return; }
  if (msg.type !== "diff") return;
  const { id, srcText, tgtText, opts } = msg;
  function done(payload) { self.postMessage(payload); }
  try {
    if (_wCancelled.has(id)) { _wCancelled.delete(id); return; }
    done({ type: "progress", id, phase: "parse", pct: 0 });
    let src, tgt;
    try { src = JSON.parse(srcText || "null"); }
    catch (e) { return done({ type: "error", id, name: e.name || "SyntaxError", message: e.message, parseTarget: "source" }); }
    try { tgt = JSON.parse(tgtText || "null"); }
    catch (e) { return done({ type: "error", id, name: e.name || "SyntaxError", message: e.message, parseTarget: "target" }); }
    if (_wCancelled.has(id)) { _wCancelled.delete(id); return done({ type: "error", id, name: "CancelError", message: "Cancelled" }); }
    done({ type: "progress", id, phase: "diff", pct: 50 });
    const precLost = [...new Set([...detectPrecisionLoss(srcText || "null"), ...detectPrecisionLoss(tgtText || "null")])];
    const changes = diffCore(src, tgt, opts || {});
    if (_wCancelled.has(id)) { _wCancelled.delete(id); return done({ type: "error", id, name: "CancelError", message: "Cancelled" }); }
    done({ type: "result", id, changes, precLost });
  } catch (err) {
    _wCancelled.delete(id);
    done({ type: "error", id, name: err.name || "Error", message: err.message });
  }
};
`;
