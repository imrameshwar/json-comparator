// Parity guard: the diff core is maintained in ONE place (src/diff-core.js) but
// must be inlined verbatim in json_compare.html so the web app stays a single
// file openable over file:// with no build step. This test extracts the block
// between the DIFF-CORE:START / DIFF-CORE:END markers from both files and
// asserts they are byte-identical. If they ever drift, CI fails here.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Anchor on the full marker comment ("===== DIFF-CORE:START") rather than the
// bare token, because prose mentions of the token (e.g. this module's header
// comment) also contain "DIFF-CORE:START".
function extractCore(text, label) {
  const lines = text.split("\n");
  const s = lines.findIndex(l => l.includes("===== DIFF-CORE:START"));
  const e = lines.findIndex(l => l.includes("===== DIFF-CORE:END"));
  if (s === -1 || e === -1 || e <= s) {
    throw new Error(`DIFF-CORE markers not found (or malformed) in ${label}`);
  }
  // Everything strictly between the two marker lines, trimmed.
  return lines.slice(s + 1, e).join("\n").trim();
}

describe("diff-core parity (module vs inlined HTML copy)", () => {
  it("the inlined core in json_compare.html matches src/diff-core.js", () => {
    const moduleSrc = readFileSync(join(root, "src/diff-core.js"), "utf8");
    const htmlSrc = readFileSync(join(root, "json_compare.html"), "utf8");
    const a = extractCore(moduleSrc, "src/diff-core.js");
    const b = extractCore(htmlSrc, "json_compare.html");
    expect(b).toBe(a);
  });
});
