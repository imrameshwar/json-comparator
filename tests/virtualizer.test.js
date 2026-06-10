// tests/virtualizer.test.js — T20
import { describe, it, expect } from "vitest";
import {
  visibleSlice, assignTreeId, flattenNodes, defaultExpandedIds,
  VIRT_ROW_H_TABLE, VIRT_ROW_H_TREE, VIRT_THRESHOLD, VIRT_BUFFER,
} from "../src/virtualizer.js";

// ─── visibleSlice ─────────────────────────────────────────────────────────────
describe("visibleSlice", () => {
  it("returns zeros for empty list", () => {
    expect(visibleSlice(0, 40, 600, 0)).toEqual({ start:0, end:0, padTop:0, padBot:0 });
  });

  it("renders all rows when total fits in viewport", () => {
    const r = visibleSlice(10, 40, 600, 0, 0);  // buf=0
    expect(r.start).toBe(0);
    expect(r.end).toBe(10);
    expect(r.padTop).toBe(0);
    expect(r.padBot).toBe(0);
  });

  it("correct slice when scrolled into the middle", () => {
    // 1000 rows, 40px each = 40000px total. Viewport 600px. Scrolled to row 100.
    const r = visibleSlice(1000, 40, 600, 4000, 0);  // scrollTop=4000 → row 100
    expect(r.start).toBe(100);
    expect(r.end).toBe(115);   // 100 + ceil(600/40)=15
    expect(r.padTop).toBe(4000);
    expect(r.padBot).toBe((1000 - 115) * 40);
  });

  it("start clamps at 0 when near top", () => {
    const r = visibleSlice(1000, 40, 600, 10, 8);   // buffer=8, scrollTop near top
    expect(r.start).toBe(0);
  });

  it("end clamps at total", () => {
    const r = visibleSlice(100, 40, 600, 3500, 0);  // near bottom
    expect(r.end).toBeLessThanOrEqual(100);
  });

  it("padTop + rendered rows + padBot = total height", () => {
    const total = 500, rowH = 40;
    const r = visibleSlice(total, rowH, 600, 2000, 0);
    const renderedH = (r.end - r.start) * rowH;
    expect(r.padTop + renderedH + r.padBot).toBe(total * rowH);
  });

  it("buffer adds extra rows above and below viewport", () => {
    const r = visibleSlice(1000, 40, 400, 2000, 5);
    const rendered = r.end - r.start;
    const viewRows = Math.ceil(400 / 40);   // 10
    expect(rendered).toBeGreaterThan(viewRows);   // includes buffer
    expect(rendered).toBeLessThanOrEqual(viewRows + 10 + 5); // reasonable upper bound
  });

  it("handles scrollTop beyond total (over-scroll)", () => {
    const r = visibleSlice(10, 40, 600, 99999, 0);
    expect(r.start).toBeGreaterThanOrEqual(0);
    expect(r.end).toBeLessThanOrEqual(10);
  });
});

// ─── assignTreeId ─────────────────────────────────────────────────────────────
describe("assignTreeId", () => {
  it("stamps an id on a leaf node", () => {
    const node = { segs: [{ k: "a" }] };
    assignTreeId(node);
    expect(node.id).toBe(JSON.stringify([{ k: "a" }]));
  });

  it("stamps ids recursively on children", () => {
    const root = {
      segs: [], children: [
        { segs: [{ k: "x" }], children: [{ segs: [{ k: "x" }, { k: "y" }] }] },
        { segs: [{ k: "z" }] },
      ]
    };
    assignTreeId(root);
    expect(root.id).toBe("[]");
    expect(root.children[0].id).toBe(JSON.stringify([{ k: "x" }]));
    expect(root.children[0].children[0].id).toBe(JSON.stringify([{ k: "x" }, { k: "y" }]));
    expect(root.children[1].id).toBe(JSON.stringify([{ k: "z" }]));
  });

  it("uses empty string segs for root-like nodes", () => {
    const node = { segs: [] };
    assignTreeId(node);
    expect(node.id).toBe("[]");
  });

  it("handles missing segs gracefully", () => {
    const node = {};
    assignTreeId(node);
    expect(node.id).toBe("[]");
  });
});

// ─── flattenNodes ─────────────────────────────────────────────────────────────
describe("flattenNodes", () => {
  function mkTree() {
    // root.children = [ A{container, children=[A1,A2]}, B{leaf} ]
    const A1 = { id:"[\"A1\"]", segs:[{k:"A1"}], container:false, hasDiff:true };
    const A2 = { id:"[\"A2\"]", segs:[{k:"A2"}], container:false, hasDiff:false };
    const A  = { id:"[\"A\"]",  segs:[{k:"A"}],  container:true,  hasDiff:true, children:[A1,A2] };
    const B  = { id:"[\"B\"]",  segs:[{k:"B"}],  container:false, hasDiff:false };
    return [A, B];
  }

  it("returns all top-level children when root is expanded", () => {
    const children = mkTree();
    const expanded = new Set([children[0].id]);
    const rows = flattenNodes(children, expanded, false);
    // A (expanded) + A1 + A2 + B = 4
    expect(rows.length).toBe(4);
  });

  it("collapses A when not in expandedIds", () => {
    const children = mkTree();
    const rows = flattenNodes(children, new Set(), false);
    // A (collapsed) + B = 2
    expect(rows.length).toBe(2);
    expect(rows.map(r=>r.node.id)).toEqual([children[0].id, children[1].id]);
  });

  it("depth is correct for nested items", () => {
    const children = mkTree();
    const expanded = new Set([children[0].id]);
    const rows = flattenNodes(children, expanded, false);
    expect(rows[0].depth).toBe(0);  // A
    expect(rows[1].depth).toBe(1);  // A1
    expect(rows[2].depth).toBe(1);  // A2
    expect(rows[3].depth).toBe(0);  // B
  });

  it("onlyDiff filters non-diff nodes", () => {
    const children = mkTree();
    const expanded = new Set([children[0].id]);
    const rows = flattenNodes(children, expanded, true);
    // B (no diff) filtered; A2 (no diff) filtered → A + A1 = 2
    expect(rows.length).toBe(2);
    expect(rows[0].node.id).toBe(children[0].id);  // A
    expect(rows[1].node.id).toBe(children[0].children[0].id);  // A1
  });

  it("empty children returns empty array", () => {
    expect(flattenNodes([], new Set(), false)).toEqual([]);
  });
});

// ─── defaultExpandedIds ───────────────────────────────────────────────────────
describe("defaultExpandedIds", () => {
  it("expands containers with hasDiff=true", () => {
    const A1 = { id:"A1", segs:[{k:"A1"}], container:false, hasDiff:true };
    const A  = { id:"A",  segs:[{k:"A"}],  container:true,  hasDiff:true, children:[A1] };
    const B  = { id:"B",  segs:[{k:"B"}],  container:true,  hasDiff:false, children:[] };
    const root = { children:[A,B] };
    const ids = defaultExpandedIds(root);
    expect(ids.has("A")).toBe(true);
    expect(ids.has("B")).toBe(false);
    expect(ids.has("A1")).toBe(false);  // leaf
  });

  it("handles root with no children", () => {
    expect(defaultExpandedIds({}).size).toBe(0);
    expect(defaultExpandedIds({ children:[] }).size).toBe(0);
  });

  it("recurses into nested changed containers", () => {
    const leaf = { id:"leaf", segs:[{k:"l"}], container:false, hasDiff:true };
    const inner = { id:"inner", segs:[{k:"i"}], container:true, hasDiff:true, children:[leaf] };
    const outer = { id:"outer", segs:[{k:"o"}], container:true, hasDiff:true, children:[inner] };
    const root = { children:[outer] };
    const ids = defaultExpandedIds(root);
    expect(ids.has("outer")).toBe(true);
    expect(ids.has("inner")).toBe(true);
    expect(ids.has("leaf")).toBe(false);
  });
});

// ─── Constants ────────────────────────────────────────────────────────────────
describe("constants", () => {
  it("VIRT_ROW_H_TABLE is a positive number", () => { expect(VIRT_ROW_H_TABLE).toBeGreaterThan(0); });
  it("VIRT_ROW_H_TREE  is a positive number", () => { expect(VIRT_ROW_H_TREE).toBeGreaterThan(0); });
  it("VIRT_THRESHOLD   is >= 100",            () => { expect(VIRT_THRESHOLD).toBeGreaterThanOrEqual(100); });
  it("VIRT_BUFFER      is >= 0",              () => { expect(VIRT_BUFFER).toBeGreaterThanOrEqual(0); });
});
