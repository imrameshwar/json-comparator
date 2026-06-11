// tests/three-way.test.js — T24 / F-3
import { describe, it, expect } from "vitest";
import { threeWayDiff, threeWaySummary, resolveMerge } from "../src/three-way.js";
import { diff } from "../src/diff-core.js";

const D = (b, l, r, opts) => threeWayDiff(b, l, r, opts || {}, diff);

describe("threeWayDiff — basic kinds", () => {
  it("left-only change", () => {
    const r = D({a:1,b:2},{a:10,b:2},{a:1,b:2});
    const lc = r.filter(c=>c.kind==="left-only");
    expect(lc.length).toBe(1);
    expect(lc[0].left).toBe(10);
    expect(lc[0].right).toBe(1);
  });

  it("right-only change", () => {
    const r = D({a:1,b:2},{a:1,b:2},{a:1,b:20});
    const rc = r.filter(c=>c.kind==="right-only");
    expect(rc.length).toBe(1);
    expect(rc[0].right).toBe(20);
    expect(rc[0].left).toBe(2);
  });

  it("both-same: same change on both sides is not a conflict", () => {
    const r = D({a:1},{a:99},{a:99});
    const bs = r.filter(c=>c.kind==="both-same");
    expect(bs.length).toBe(1);
    expect(bs[0].left).toBe(99);
    expect(bs[0].right).toBe(99);
  });

  it("conflict: different changes on both sides", () => {
    const r = D({a:1},{a:10},{a:99});
    const con = r.filter(c=>c.kind==="conflict");
    expect(con.length).toBe(1);
    expect(con[0].left).toBe(10);
    expect(con[0].right).toBe(99);
    expect(con[0].base).toBe(1);
  });

  it("no changes → empty", () => {
    expect(D({a:1},{a:1},{a:1})).toEqual([]);
  });

  it("added key left-only", () => {
    const r = D({},{x:1},{});
    const lc = r.filter(c=>c.kind==="left-only");
    expect(lc.length).toBe(1);
    expect(lc[0].left).toBe(1);
  });

  it("removed key right-only", () => {
    const r = D({x:1},{x:1},{});
    const rc = r.filter(c=>c.kind==="right-only");
    expect(rc.length).toBe(1);
    expect(rc[0].base).toBe(1);
  });
});

describe("threeWayDiff — nested and arrays", () => {
  it("nested conflict", () => {
    const r = D({o:{x:1}},{o:{x:10}},{o:{x:99}});
    const con = r.filter(c=>c.kind==="conflict");
    expect(con.length).toBe(1);
  });

  it("independent nested changes are not conflicts", () => {
    const r = D({o:{x:1,y:2}},{o:{x:10,y:2}},{o:{x:1,y:20}});
    const con = r.filter(c=>c.kind==="conflict");
    expect(con.length).toBe(0);
    expect(r.filter(c=>c.kind==="left-only").length).toBe(1);
    expect(r.filter(c=>c.kind==="right-only").length).toBe(1);
  });

  it("keyed array: conflict on matched element", () => {
    const r = D(
      [{id:1,v:1},{id:2,v:2}],
      [{id:1,v:10},{id:2,v:2}],
      [{id:1,v:99},{id:2,v:2}],
      {keyBy:"id"}
    );
    const con = r.filter(c=>c.kind==="conflict");
    expect(con.length).toBe(1);
  });

  it("keyed array: non-conflicting changes on different elements", () => {
    const r = D(
      [{id:1,v:1},{id:2,v:2}],
      [{id:1,v:10},{id:2,v:2}],
      [{id:1,v:1},{id:2,v:20}],
      {keyBy:"id"}
    );
    expect(r.filter(c=>c.kind==="conflict").length).toBe(0);
    expect(r.filter(c=>c.kind==="left-only").length).toBe(1);
    expect(r.filter(c=>c.kind==="right-only").length).toBe(1);
  });
});

describe("threeWaySummary", () => {
  it("counts correctly", () => {
    const r = D({a:1,b:2,c:3,d:4},{a:10,b:99,c:3,d:4},{a:99,b:99,c:30,d:4});
    // a: conflict; b: both-same; c: right-only; d: no change
    const s = threeWaySummary(r);
    expect(s.conflict).toBe(1);   // a
    expect(s.bothSame).toBe(1);   // b
    expect(s.rightOnly).toBe(1);  // c
    expect(s.leftOnly).toBe(0);
  });

  it("all zeros for identical inputs", () => {
    const s = threeWaySummary(D({},{},{}));
    expect(s).toEqual({leftOnly:0,rightOnly:0,bothSame:0,conflict:0});
  });
});

// ─── F-3: resolveMerge ─────────────────────────────────────────────────────────

const M = (base, changes, resolutions) => resolveMerge(base, changes, resolutions);

describe("resolveMerge — canonical fixture (1 left-only, 1 right-only, 1 conflict)", () => {
  // base  : { a: 1, b: 2, c: 3 }
  // left  : { a: 10, b: 2, c: 3 }   (changed a: left-only)
  // right : { a: 1,  b: 20, c: 99 } (changed b: right-only; changed c vs base — conflict if left also changed c)
  //
  // To get exactly 1 left-only + 1 right-only + 1 conflict we need left AND right to
  // change the same key differently for the conflict.  Use:
  //   base  : { a: 1, b: 2, c: 3 }
  //   left  : { a: 10, b: 2, c: 50 }   a=left-only, c=conflict(left=50)
  //   right : { a: 1,  b: 20, c: 99 }  b=right-only, c=conflict(right=99)
  const base  = { a: 1, b: 2, c: 3 };
  const left  = { a: 10, b: 2, c: 50 };
  const right = { a: 1, b: 20, c: 99 };

  let changes;
  it("produces 1 left-only, 1 right-only, 1 conflict", () => {
    changes = D(base, left, right);
    expect(changes.filter(x => x.kind === "left-only").length).toBe(1);
    expect(changes.filter(x => x.kind === "right-only").length).toBe(1);
    expect(changes.filter(x => x.kind === "conflict").length).toBe(1);
  });

  it("default (no resolutions): conflict → left; left-only → left; right-only → right", () => {
    const ch = D(base, left, right);
    const merged = M(base, ch, new Map());
    // a: left-only → 10; b: right-only → 20; c: conflict default "left" → 50
    expect(merged).toEqual({ a: 10, b: 20, c: 50 });
  });

  it("conflict choose 'left': c = 50", () => {
    const ch = D(base, left, right);
    const conflictId = JSON.stringify(ch.find(x => x.kind === "conflict").segs);
    const merged = M(base, ch, new Map([[conflictId, "left"]]));
    expect(merged).toEqual({ a: 10, b: 20, c: 50 });
  });

  it("conflict choose 'right': c = 99", () => {
    const ch = D(base, left, right);
    const conflictId = JSON.stringify(ch.find(x => x.kind === "conflict").segs);
    const merged = M(base, ch, new Map([[conflictId, "right"]]));
    expect(merged).toEqual({ a: 10, b: 20, c: 99 });
  });

  it("conflict choose 'base': c = 3 (reverts to original)", () => {
    const ch = D(base, left, right);
    const conflictId = JSON.stringify(ch.find(x => x.kind === "conflict").segs);
    const merged = M(base, ch, new Map([[conflictId, "base"]]));
    expect(merged).toEqual({ a: 10, b: 20, c: 3 });
  });
});

describe("resolveMerge — auto-merge rules", () => {
  it("both-same: auto-merges the shared change", () => {
    // base {x:1}, left {x:99}, right {x:99}  → both-same, auto→ left value (99)
    const ch = D({x:1},{x:99},{x:99});
    const merged = M({x:1}, ch, new Map());
    expect(merged).toEqual({x:99});
  });

  it("no changes: returns deep clone of base", () => {
    const base = {a:1,b:[1,2]};
    const ch = D(base, base, base);
    const merged = M(base, ch, new Map());
    expect(merged).toEqual(base);
    expect(merged).not.toBe(base); // deep clone, not same reference
  });

  it("left-only key addition", () => {
    // base {}, left {x:7}, right {} → left-only add → merged has x:7
    const ch = D({},{x:7},{});
    const merged = M({}, ch, new Map());
    expect(merged).toEqual({x:7});
  });

  it("right-only key addition", () => {
    const ch = D({},{},{y:42});
    const merged = M({}, ch, new Map());
    expect(merged).toEqual({y:42});
  });

  it("left-only key removal: base has key, left removes it", () => {
    // base {a:1,b:2}, left {b:2}, right {a:1,b:2}
    const ch = D({a:1,b:2},{b:2},{a:1,b:2});
    const merged = M({a:1,b:2}, ch, new Map());
    // left-only: a removed → merged should not have a
    expect(Object.keys(merged)).not.toContain("a");
    expect(merged.b).toBe(2);
  });

  it("nested conflict resolution", () => {
    const base  = {o:{x:1}};
    const left  = {o:{x:10}};
    const right = {o:{x:99}};
    const ch = D(base, left, right);
    const conflictId = JSON.stringify(ch.find(x => x.kind === "conflict").segs);
    const mergedL = M(base, ch, new Map([[conflictId, "left"]]));
    const mergedR = M(base, ch, new Map([[conflictId, "right"]]));
    const mergedB = M(base, ch, new Map([[conflictId, "base"]]));
    expect(mergedL).toEqual({o:{x:10}});
    expect(mergedR).toEqual({o:{x:99}});
    expect(mergedB).toEqual({o:{x:1}});
  });

  it("does not mutate the base value", () => {
    const base = {a:1};
    const ch = D(base, {a:2}, {a:3});
    M(base, ch, new Map());
    expect(base).toEqual({a:1}); // base unchanged
  });
});
