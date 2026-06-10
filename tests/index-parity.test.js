// index.html ↔ json_compare.html parity guard.
//
// index.html is the GitHub Pages build: json_compare.html plus a feedback widget
// and a relaxed CSP that allows the FormSubmit relay.  This test asserts that
// those are the ONLY differences — any other drift (accidental edit, incomplete
// regeneration) makes the suite red immediately.
//
// The feedback additions in index.html are fenced by FEEDBACK:START / FEEDBACK:END
// marker comments (/* */ for CSS / JS, <!-- --> for HTML).  After stripping those
// blocks and normalising the one permitted CSP line, the two files must be
// byte-identical.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Strip every /* FEEDBACK:START */ … /* FEEDBACK:END */ block (CSS / JS context)
// and every <!-- FEEDBACK:START --> … <!-- FEEDBACK:END --> block (HTML context).
// Each pattern consumes the terminating newline so that removing a block leaves
// no orphaned empty line that was not present in the base file.
function stripFeedback(text) {
  return text
    .replace(/\/\* FEEDBACK:START \*\/\n[\s\S]*?\/\* FEEDBACK:END \*\/\n/g, "")
    .replace(/<!-- FEEDBACK:START -->\n[\s\S]*?<!-- FEEDBACK:END -->\n/g, "");
}

// Normalise the single CSP connect-src line that index.html relaxes for the
// feedback form relay (FormSubmit.co).  This is the only permitted line-level
// difference outside the FEEDBACK markers.
function normalizeCsp(text) {
  return text.replace(
    /connect-src https:\/\/formsubmit\.co;/g,
    "connect-src 'none';"
  );
}

describe("index.html ↔ json_compare.html parity", () => {
  it("index.html equals json_compare.html outside FEEDBACK markers and the one CSP connect-src line", () => {
    const base  = readFileSync(join(root, "json_compare.html"), "utf8");
    const index = readFileSync(join(root, "index.html"),        "utf8");

    // Sanity: both marker forms must actually be present in index.html so the
    // strip cannot pass vacuously on a file that accidentally lost its markers.
    expect(index, "index.html must contain at least one /* FEEDBACK:START */ marker")
      .toMatch(/\/\* FEEDBACK:START \*\//);
    expect(index, "index.html must contain at least one <!-- FEEDBACK:START --> marker")
      .toMatch(/<!-- FEEDBACK:START -->/);

    const stripped = normalizeCsp(stripFeedback(index));
    expect(stripped).toBe(base);
  });
});
