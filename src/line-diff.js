// src/line-diff.js — T13: line-level diff for raw-text view
//
// lineDiff(srcLines, tgtLines) -> Hunk[]
//   Hunk = { op: "equal"|"removed"|"added", lines: string[] }
//   Uses Myers O(ND) greedy algorithm with a cap at n*m > 500 000 that falls
//   back to a block delete+add so very large inputs stay responsive.
//
// splitLines(text) -> string[]
//   Splits on \n; each line keeps its trailing \n except possibly the last.

export function splitLines(text) {
  if (!text) return [];
  const lines = text.split("\n");
  // Re-attach the newline to every line except the last
  for (let i = 0; i < lines.length - 1; i++) lines[i] += "\n";
  // Drop a trailing empty string produced by text that ends with \n
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

// Myers shortest-edit-script.
// Returns an array of Hunks (consecutive equal/removed/added runs).
export function lineDiff(src, tgt) {
  const n = src.length, m = tgt.length;
  if (n === 0 && m === 0) return [];
  if (n === 0) return [{ op: "added",   lines: [...tgt] }];
  if (m === 0) return [{ op: "removed", lines: [...src] }];

  // Greedy fallback for very large inputs
  if (n * m > 500_000) {
    const hunks = [];
    if (n) hunks.push({ op: "removed", lines: [...src] });
    if (m) hunks.push({ op: "added",   lines: [...tgt] });
    return hunks;
  }

  // Myers forward greedy pass
  const MAX = n + m;
  const V = new Array(2 * MAX + 2).fill(0);
  // trace[d] = snapshot of V *before* exploring depth d
  // (= state after depth d-1; used by backtracking as Vprev for depth d)
  const trace = [];

  outer: for (let d = 0; d <= MAX; d++) {
    trace.push([...V]);             // record V before exploring depth d
    for (let k = -d; k <= d; k += 2) {
      const offset = k + MAX;
      let x;
      if (k === -d || (k !== d && V[offset - 1] < V[offset + 1])) {
        x = V[offset + 1];          // down move (insert tgt line)
      } else {
        x = V[offset - 1] + 1;     // right move (remove src line)
      }
      let y = x - k;
      while (x < n && y < m && src[x] === tgt[y]) { x++; y++; }
      V[offset] = x;
      if (x >= n && y >= m) break outer;
    }
  }

  // Backtrack: start at (n, m) and trace the edit path
  // trace[d] is the V snapshot taken before depth d was explored,
  // which equals the state after depth d-1 → correct Vprev for depth d.
  let x = n, y = m;
  const edits = [];   // built in reverse; reversed at the end

  for (let d = trace.length - 1; d > 0; d--) {
    const Vprev = trace[d];         // state after depth d-1 (= before depth d)
    const k = x - y;
    const offset = k + MAX;

    // Mirror the forward choice: prevK = k+1 (insert) or k-1 (remove)
    let prevK;
    if (k === -d || (k !== d && Vprev[offset - 1] < Vprev[offset + 1])) {
      prevK = k + 1;  // forward move was DOWN (insert)
    } else {
      prevK = k - 1;  // forward move was RIGHT (remove)
    }
    const isInsert = (prevK === k + 1);
    const prevX = Vprev[prevK + MAX];
    const prevY = prevX - prevK;

    // Walk the snake backwards (equal elements on the current diagonal)
    while (x > prevX && y > prevY) {
      x--; y--;
      edits.push({ op: "equal", xi: x, yi: y });
    }
    // Record the single edit step
    if (isInsert) {
      y--;
      edits.push({ op: "insert", xi: x, yi: y });
    } else {
      x--;
      edits.push({ op: "remove", xi: x, yi: y });
    }
    x = prevX; y = prevY;
  }
  // Walk any remaining snake to (0,0) — this is the opening equal run
  while (x > 0 && y > 0) {
    x--; y--;
    edits.push({ op: "equal", xi: x, yi: y });
  }
  edits.reverse();

  // Collapse into hunks (consecutive equal/removed/added)
  const hunks = [];
  for (const e of edits) {
    const op   = e.op === "insert" ? "added" : e.op === "remove" ? "removed" : "equal";
    const line = op === "added" ? tgt[e.yi] : src[e.xi];
    if (hunks.length > 0 && hunks[hunks.length - 1].op === op) {
      hunks[hunks.length - 1].lines.push(line);
    } else {
      hunks.push({ op, lines: [line] });
    }
  }
  return hunks;
}
