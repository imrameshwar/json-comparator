// tests/worker-protocol.test.js — T19
// Unit tests for the worker message-protocol constants and builders.
// No DOM, no actual Worker — pure protocol validation.

import { describe, it, expect } from "vitest";
import {
  MSG_DIFF, MSG_CANCEL, MSG_PROGRESS, MSG_RESULT, MSG_ERROR,
  mkDiffMsg, mkCancelMsg, mkProgressMsg, mkResultMsg, mkErrorMsg,
  WORKER_HANDLER_SRC,
} from "../src/worker-protocol.js";

describe("worker-protocol constants", () => {
  it("MSG_DIFF is the string 'diff'", () => { expect(MSG_DIFF).toBe("diff"); });
  it("MSG_CANCEL is the string 'cancel'", () => { expect(MSG_CANCEL).toBe("cancel"); });
  it("MSG_PROGRESS is the string 'progress'", () => { expect(MSG_PROGRESS).toBe("progress"); });
  it("MSG_RESULT is the string 'result'", () => { expect(MSG_RESULT).toBe("result"); });
  it("MSG_ERROR is the string 'error'", () => { expect(MSG_ERROR).toBe("error"); });
  it("all constants are distinct", () => {
    const all = [MSG_DIFF, MSG_CANCEL, MSG_PROGRESS, MSG_RESULT, MSG_ERROR];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("mkDiffMsg", () => {
  it("sets type, id, srcText, tgtText, opts", () => {
    const opts = { unordered: true };
    const m = mkDiffMsg(7, '{"a":1}', '{"a":2}', opts);
    expect(m).toEqual({ type: MSG_DIFF, id: 7, srcText: '{"a":1}', tgtText: '{"a":2}', opts });
  });
  it("opts can be undefined / null", () => {
    const m = mkDiffMsg(1, "null", "null", undefined);
    expect(m.opts).toBeUndefined();
  });
});

describe("mkCancelMsg", () => {
  it("sets type and id", () => {
    const m = mkCancelMsg(42);
    expect(m).toEqual({ type: MSG_CANCEL, id: 42 });
  });
});

describe("mkProgressMsg", () => {
  it("parse phase", () => {
    const m = mkProgressMsg(3, "parse", 0);
    expect(m).toEqual({ type: MSG_PROGRESS, id: 3, phase: "parse", pct: 0 });
  });
  it("diff phase", () => {
    const m = mkProgressMsg(3, "diff", 50);
    expect(m.phase).toBe("diff");
    expect(m.pct).toBe(50);
  });
});

describe("mkResultMsg", () => {
  it("contains changes and precLost", () => {
    const changes = [{ op: "added", path: "$.x" }];
    const precLost = ["9999999999999999"];
    const m = mkResultMsg(5, changes, precLost);
    expect(m.type).toBe(MSG_RESULT);
    expect(m.id).toBe(5);
    expect(m.changes).toBe(changes);
    expect(m.precLost).toBe(precLost);
  });
});

describe("mkErrorMsg", () => {
  it("sets name and message", () => {
    const m = mkErrorMsg(9, "SyntaxError", "Unexpected token", "source");
    expect(m).toEqual({ type: MSG_ERROR, id: 9, name: "SyntaxError", message: "Unexpected token", parseTarget: "source" });
  });
  it("parseTarget defaults to null when omitted", () => {
    const m = mkErrorMsg(1, "DiffDepthError", "too deep");
    expect(m.parseTarget).toBeNull();
  });
  it("CancelError has no parseTarget", () => {
    const m = mkErrorMsg(2, "CancelError", "Cancelled");
    expect(m.parseTarget).toBeNull();
  });
});

describe("WORKER_HANDLER_SRC", () => {
  it("is a non-empty string", () => {
    expect(typeof WORKER_HANDLER_SRC).toBe("string");
    expect(WORKER_HANDLER_SRC.length).toBeGreaterThan(0);
  });
  it("references diffCore and detectPrecisionLoss", () => {
    expect(WORKER_HANDLER_SRC).toContain("diffCore");
    expect(WORKER_HANDLER_SRC).toContain("detectPrecisionLoss");
  });
  it("handles cancel type", () => {
    expect(WORKER_HANDLER_SRC).toContain('"cancel"');
  });
  it("handles diff type", () => {
    expect(WORKER_HANDLER_SRC).toContain('"diff"');
  });
  it("posts progress, result, and error types", () => {
    expect(WORKER_HANDLER_SRC).toContain('"progress"');
    expect(WORKER_HANDLER_SRC).toContain('"result"');
    expect(WORKER_HANDLER_SRC).toContain('"error"');
  });
  it("handles CancelError", () => {
    expect(WORKER_HANDLER_SRC).toContain("CancelError");
  });
  it("uses self.onmessage (Worker API)", () => {
    expect(WORKER_HANDLER_SRC).toContain("self.onmessage");
  });
});
