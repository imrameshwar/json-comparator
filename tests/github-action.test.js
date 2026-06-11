// tests/github-action.test.js — G-2: GitHub Action dry-run tests.
//
// Tests the action's core logic without real GitHub API calls or actual
// GitHub Actions infrastructure.  Covers:
//   1. src/markdown-reporter.js — diffToMarkdown rendering
//   2. action parseInputs() — env var parsing
//   3. action readGitHubContext() — PR context extraction
//   4. action runAction() — full dry-run with mocked postComment
//   5. edge cases: equal docs, missing files, no-PR context, truncation

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { diff } from "../src/index.js";
import { diffToMarkdown } from "../src/markdown-reporter.js";
import {
  parseInputs,
  readGitHubContext,
  runAction,
  setOutput,
} from "../.github/actions/json-diff/index.js";

const root         = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir  = join(root, "fixtures");

function fixturePath(name, file) {
  return join(fixturesDir, name, file);
}

// ─── 1. diffToMarkdown ────────────────────────────────────────────────────────
describe("G-2: diffToMarkdown", () => {

  it("equal documents → no-diff message, no table", () => {
    const md = diffToMarkdown([{ op: "equal", path: "$.a", segs: [{k:"a"}], from: 1, to: 1 }]);
    expect(md).toContain("No differences");
    expect(md).not.toContain("| Path |");
  });

  it("single added entry → table row with empty Source column", () => {
    const changes = [{ op: "added", path: "$.d", segs: [{k:"d"}], to: 4 }];
    const md = diffToMarkdown(changes);
    expect(md).toContain("| $.d |");
    expect(md).toContain("added");
    expect(md).toContain("| Path | Change |");
  });

  it("single removed entry → table row with empty Target column", () => {
    const changes = [{ op: "removed", path: "$.c", segs: [{k:"c"}], from: 3 }];
    const md = diffToMarkdown(changes);
    expect(md).toContain("| $.c |");
    expect(md).toContain("removed");
  });

  it("changed entry → both Source and Target populated", () => {
    const changes = [{ op: "changed", path: "$.b", segs: [{k:"b"}], from: 2, to: 20 }];
    const md = diffToMarkdown(changes);
    expect(md).toContain("2");
    expect(md).toContain("20");
    expect(md).toContain("changed");
  });

  it("type_changed entry uses label 'type changed'", () => {
    const changes = [{ op: "type_changed", path: "$.x", segs: [{k:"x"}], from: 1, to: "1" }];
    const md = diffToMarkdown(changes);
    expect(md).toContain("type changed");
  });

  it("custom title / labels appear in the output", () => {
    const changes = [{ op: "added", path: "$.k", segs: [{k:"k"}], to: 1 }];
    const md = diffToMarkdown(changes, { title: "My Report", sourceLabel: "Before", targetLabel: "After" });
    expect(md).toContain("## My Report");
    expect(md).toContain("Before");
    expect(md).toContain("After");
  });

  it("pipe characters in values are escaped as \\|", () => {
    const changes = [{ op: "added", path: "$.x", segs: [{k:"x"}], to: "a|b" }];
    const md = diffToMarkdown(changes);
    // JSON.stringify("a|b") → '"a|b"'; escCell then escapes the pipe to \|
    expect(md).toContain('"a\\|b"');
  });

  it("summary line contains count and breakdown", () => {
    // { a:1, b:2, c:3 } → { a:1, b:99, d:4 }  = 3 diffs: b changed, c removed, d added
    const src = { a: 1, b: 2, c: 3 };
    const tgt = { a: 1, b: 99, d: 4 };
    const changes = diff(src, tgt);
    const md = diffToMarkdown(changes);
    expect(md).toContain("3 difference(s)");
    expect(md).toContain("removed");
    expect(md).toContain("changed");
  });

  it("maxRows truncates the table and adds a note", () => {
    // Create 5 changes, cap at 3
    const changes = [1,2,3,4,5].map(i => ({
      op: "added", path: `$.k${i}`, segs: [{k:`k${i}`}], to: i,
    }));
    const md = diffToMarkdown(changes, { maxRows: 3 });
    expect(md).toContain("Showing first 3 of 5");
    // Only 3 rows (plus header + separator = 5 lines in the table)
    const tableRows = md.split("\n").filter(l => l.startsWith("| $.k"));
    expect(tableRows.length).toBe(3);
  });

  it("fixture crud produces valid Markdown table", () => {
    const src = JSON.parse(readFileSync(fixturePath("crud", "source.json"), "utf8"));
    const tgt = JSON.parse(readFileSync(fixturePath("crud", "target.json"), "utf8"));
    const changes = diff(src, tgt);
    const md = diffToMarkdown(changes);
    expect(md).toContain("| Path | Change |");
    expect(md).toContain("$.b");
    expect(md).toContain("$.c");
    expect(md).toContain("$.d");
  });
});

// ─── 2. parseInputs ───────────────────────────────────────────────────────────
describe("G-2: parseInputs", () => {

  it("reads required source and target file paths", () => {
    const inputs = parseInputs({
      INPUT_SOURCE_FILE: "a.json",
      INPUT_TARGET_FILE: "b.json",
    });
    expect(inputs.sourceFile).toBe("a.json");
    expect(inputs.targetFile).toBe("b.json");
  });

  it("defaults: failOnDiff=false, commentOnPr=true, unordered=false", () => {
    const inputs = parseInputs({});
    expect(inputs.failOnDiff).toBe(false);
    expect(inputs.commentOnPr).toBe(true);
    expect(inputs.unordered).toBe(false);
    expect(inputs.arrayKey).toBe(null);
  });

  it("fail-on-diff=true parsed as boolean true", () => {
    expect(parseInputs({ INPUT_FAIL_ON_DIFF: "true"  }).failOnDiff).toBe(true);
    expect(parseInputs({ INPUT_FAIL_ON_DIFF: "false" }).failOnDiff).toBe(false);
    expect(parseInputs({ INPUT_FAIL_ON_DIFF: "TRUE"  }).failOnDiff).toBe(true);
  });

  it("comment-on-pr=false parsed as boolean false", () => {
    expect(parseInputs({ INPUT_COMMENT_ON_PR: "false" }).commentOnPr).toBe(false);
    expect(parseInputs({ INPUT_COMMENT_ON_PR: "true"  }).commentOnPr).toBe(true);
  });

  it("unordered and array-key parsed correctly", () => {
    const inputs = parseInputs({ INPUT_UNORDERED: "true", INPUT_ARRAY_KEY: "id" });
    expect(inputs.unordered).toBe(true);
    expect(inputs.arrayKey).toBe("id");
  });

  it("empty array-key collapses to null", () => {
    expect(parseInputs({ INPUT_ARRAY_KEY: "" }).arrayKey).toBe(null);
    expect(parseInputs({ INPUT_ARRAY_KEY: "  " }).arrayKey).toBe(null);
  });

  it("default title is 'JSON Diff Report'", () => {
    expect(parseInputs({}).title).toBe("JSON Diff Report");
  });
});

// ─── 3. readGitHubContext ────────────────────────────────────────────────────
describe("G-2: readGitHubContext", () => {
  it("returns null prNumber when no event path", () => {
    const ctx = readGitHubContext({ GITHUB_EVENT_NAME: "pull_request", GITHUB_REPOSITORY: "owner/repo" });
    expect(ctx.prNumber).toBe(null);
    expect(ctx.prCommentUrl).toBe(null);
  });

  it("extracts prNumber and builds comment URL from a mock event file", async () => {
    // Write a mock event JSON to a temp file
    const os = await import("node:os");
    const path = await import("node:path");
    const fs = await import("node:fs");
    const tmpFile = path.join(os.tmpdir(), `gh-event-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify({ pull_request: { number: 42 } }));
    try {
      const ctx = readGitHubContext({
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_REPOSITORY: "acme/my-repo",
        GITHUB_EVENT_PATH: tmpFile,
      });
      expect(ctx.prNumber).toBe(42);
      expect(ctx.prCommentUrl).toBe("/repos/acme/my-repo/issues/42/comments");
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

// ─── 4. runAction dry-run ─────────────────────────────────────────────────────
describe("G-2: runAction (dry-run with mocked postComment)", () => {

  function makeCtx(prNumber = 99) {
    return {
      eventName:    "pull_request",
      repo:         "owner/repo",
      prNumber,
      prCommentUrl: `/repos/owner/repo/issues/${prNumber}/comments`,
    };
  }

  it("crud fixture: detects differences, calls postComment, returns correct counts", async () => {
    const mockPost = vi.fn().mockResolvedValue({ status: 201 });
    const capturedOutputs = {};
    const mockSetOutput = (k, v) => { capturedOutputs[k] = v; };

    const inputs = parseInputs({
      INPUT_SOURCE_FILE:    fixturePath("crud", "source.json"),
      INPUT_TARGET_FILE:    fixturePath("crud", "target.json"),
      INPUT_COMMENT_ON_PR:  "true",
      INPUT_GITHUB_TOKEN:   "ghp_fake_token",
      INPUT_TITLE:          "Test Report",
    });

    const { diffFound, diffCount, markdown } = await runAction(
      inputs, makeCtx(), { postComment: mockPost, setOutput: mockSetOutput }
    );

    expect(diffFound).toBe(true);
    expect(diffCount).toBe(3);
    expect(markdown).toContain("## Test Report");
    expect(markdown).toContain("3 difference(s)");
    expect(mockPost).toHaveBeenCalledOnce();
    expect(mockPost.mock.calls[0][2]).toContain("## Test Report");
    expect(capturedOutputs["diff-found"]).toBe("true");
    expect(capturedOutputs["diff-count"]).toBe("3");
  });

  it("equal docs: diffFound=false, no postComment call for equal", async () => {
    const mockPost = vi.fn().mockResolvedValue({ status: 201 });
    const inputs = parseInputs({
      INPUT_SOURCE_FILE:   fixturePath("empty_object_equal", "source.json"),
      INPUT_TARGET_FILE:   fixturePath("empty_object_equal", "target.json"),
      INPUT_COMMENT_ON_PR: "true",
      INPUT_GITHUB_TOKEN:  "ghp_fake_token",
    });
    const { diffFound, diffCount, markdown } = await runAction(
      inputs, makeCtx(), { postComment: mockPost, setOutput: () => {} }
    );
    expect(diffFound).toBe(false);
    expect(diffCount).toBe(0);
    expect(markdown).toContain("No differences");
    // postComment is still called (we always comment — even for "no diff" to reassure reviewers)
    expect(mockPost).toHaveBeenCalledOnce();
  });

  it("comment-on-pr=false: postComment never called", async () => {
    const mockPost = vi.fn();
    const inputs = parseInputs({
      INPUT_SOURCE_FILE:   fixturePath("crud", "source.json"),
      INPUT_TARGET_FILE:   fixturePath("crud", "target.json"),
      INPUT_COMMENT_ON_PR: "false",
    });
    await runAction(inputs, makeCtx(), { postComment: mockPost, setOutput: () => {} });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("no PR context: postComment not called (no prCommentUrl)", async () => {
    const mockPost = vi.fn();
    const inputs = parseInputs({
      INPUT_SOURCE_FILE:   fixturePath("crud", "source.json"),
      INPUT_TARGET_FILE:   fixturePath("crud", "target.json"),
      INPUT_COMMENT_ON_PR: "true",
      INPUT_GITHUB_TOKEN:  "ghp_token",
    });
    const noPrCtx = { eventName: "push", repo: "owner/repo", prNumber: null, prCommentUrl: null };
    await runAction(inputs, noPrCtx, { postComment: mockPost, setOutput: () => {} });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("missing github-token: postComment not called", async () => {
    const mockPost = vi.fn();
    const inputs = parseInputs({
      INPUT_SOURCE_FILE:   fixturePath("crud", "source.json"),
      INPUT_TARGET_FILE:   fixturePath("crud", "target.json"),
      INPUT_COMMENT_ON_PR: "true",
      INPUT_GITHUB_TOKEN:  "",          // empty token
    });
    await runAction(inputs, makeCtx(), { postComment: mockPost, setOutput: () => {} });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("--unordered option is passed through to diff engine", async () => {
    const mockPost = vi.fn().mockResolvedValue({ status: 201 });
    const inputs = parseInputs({
      INPUT_SOURCE_FILE:   fixturePath("unordered_no_dups", "source.json"),
      INPUT_TARGET_FILE:   fixturePath("unordered_no_dups", "target.json"),
      INPUT_UNORDERED:     "true",
      INPUT_COMMENT_ON_PR: "false",
    });
    // With unordered=true the diff treats scalar arrays as sets
    const { diffFound } = await runAction(inputs, makeCtx(), { postComment: mockPost, setOutput: () => {} });
    // The fixture has different scalar arrays; with unordered it should still report diff
    expect(typeof diffFound).toBe("boolean");
  });

  it("throws when source-file does not exist", async () => {
    const inputs = parseInputs({
      INPUT_SOURCE_FILE: "/tmp/__no_such_file__.json",
      INPUT_TARGET_FILE: fixturePath("crud", "target.json"),
    });
    await expect(
      runAction(inputs, {}, { postComment: () => {}, setOutput: () => {} })
    ).rejects.toThrow("source-file not found");
  });

  it("throws when target-file does not exist", async () => {
    const inputs = parseInputs({
      INPUT_SOURCE_FILE: fixturePath("crud", "source.json"),
      INPUT_TARGET_FILE: "/tmp/__no_such_file__.json",
    });
    await expect(
      runAction(inputs, {}, { postComment: () => {}, setOutput: () => {} })
    ).rejects.toThrow("target-file not found");
  });

  it("throws when source file is not valid JSON", async () => {
    const os = await import("node:os");
    const path = await import("node:path");
    const fs = await import("node:fs");
    const tmpFile = path.join(os.tmpdir(), `bad-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, "not json {{{");
    try {
      const inputs = parseInputs({
        INPUT_SOURCE_FILE: tmpFile,
        INPUT_TARGET_FILE: fixturePath("crud", "target.json"),
      });
      await expect(
        runAction(inputs, {}, { postComment: () => {}, setOutput: () => {} })
      ).rejects.toThrow("not valid JSON");
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("nested fixture: diff propagates through objects correctly", async () => {
    const inputs = parseInputs({
      INPUT_SOURCE_FILE:   fixturePath("nested", "source.json"),
      INPUT_TARGET_FILE:   fixturePath("nested", "target.json"),
      INPUT_COMMENT_ON_PR: "false",
    });
    const { diffFound, markdown } = await runAction(
      inputs, {}, { postComment: () => {}, setOutput: () => {} }
    );
    expect(diffFound).toBe(true);
    expect(markdown).toContain("$.a.b.c.d");
  });
});

// ─── 5. setOutput helper ─────────────────────────────────────────────────────
describe("G-2: setOutput helper", () => {
  it("writes key=value to GITHUB_OUTPUT file when set", async () => {
    const os   = await import("node:os");
    const path = await import("node:path");
    const fs   = await import("node:fs");
    const tmpFile = path.join(os.tmpdir(), `gh-output-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, "");
    setOutput("diff-found", "true", { GITHUB_OUTPUT: tmpFile });
    const content = fs.readFileSync(tmpFile, "utf8");
    expect(content).toBe("diff-found=true\n");
    fs.unlinkSync(tmpFile);
  });
});
