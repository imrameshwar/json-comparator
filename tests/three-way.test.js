// tests/three-way.test.js — T24
import { describe, it, expect } from "vitest";
import { threeWayDiff, threeWaySummary } from "../src/three-way.js";
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
