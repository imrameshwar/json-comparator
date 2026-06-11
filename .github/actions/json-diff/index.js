// .github/actions/json-diff/index.js — G-2: GitHub Action implementation.
//
// Zero runtime dependencies — uses the json-comparator diff engine and Markdown
// renderer from src/ via relative ES module imports.
//
// Run via: node "${{ github.action_path }}/index.js"
// Inputs arrive as environment variables prefixed with INPUT_ (set by action.yml).
//
// Outputs are written to $GITHUB_OUTPUT (the Actions output file).
// A PR comment is posted via the GitHub REST API using the built-in https module.

import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { request as httpsRequest } from "node:https";

// Resolve src/ relative to this file (works whether invoked from the repo root,
// from another repo that uses this action, or from the tests directory).
const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, "../../..");

const { diff }             = await import(join(repoRoot, "src/index.js"));
const { diffToMarkdown }   = await import(join(repoRoot, "src/markdown-reporter.js"));

// ─── input parsing ────────────────────────────────────────────────────────────
export function parseInputs(env = process.env) {
  return {
    sourceFile:   (env.INPUT_SOURCE_FILE  || "").trim(),
    targetFile:   (env.INPUT_TARGET_FILE  || "").trim(),
    failOnDiff:   (env.INPUT_FAIL_ON_DIFF || "false").toLowerCase() === "true",
    commentOnPr:  (env.INPUT_COMMENT_ON_PR ?? "true").toLowerCase() !== "false",
    githubToken:  (env.INPUT_GITHUB_TOKEN || "").trim(),
    title:        (env.INPUT_TITLE        || "JSON Diff Report").trim(),
    sourceLabel:  (env.INPUT_SOURCE_LABEL || "Source").trim(),
    targetLabel:  (env.INPUT_TARGET_LABEL || "Target").trim(),
    unordered:    (env.INPUT_UNORDERED    || "false").toLowerCase() === "true",
    arrayKey:     (env.INPUT_ARRAY_KEY    || "").trim() || null,
  };
}

// ─── GitHub context helpers ───────────────────────────────────────────────────
export function readGitHubContext(env = process.env) {
  const eventName = env.GITHUB_EVENT_NAME || "";
  const repo      = env.GITHUB_REPOSITORY || "";
  const eventPath = env.GITHUB_EVENT_PATH || "";
  let prNumber    = null;
  let prCommentUrl = null;

  if (eventPath && existsSync(eventPath)) {
    try {
      const event = JSON.parse(readFileSync(eventPath, "utf8"));
      const num = event.pull_request?.number ?? event.number ?? null;
      if (num) {
        prNumber = num;
        const [owner, repoName] = repo.split("/");
        prCommentUrl = `/repos/${owner}/${repoName}/issues/${num}/comments`;
      }
    } catch (_) { /* non-fatal — skip comment */ }
  }

  return { eventName, repo, prNumber, prCommentUrl };
}

// ─── GitHub API: post a comment ───────────────────────────────────────────────
export function postComment(token, commentUrl, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ body });
    const options = {
      hostname: "api.github.com",
      path: commentUrl,
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Authorization": `Bearer ${token}`,
        "User-Agent":    "json-comparator-action/1.0",
        "Accept":        "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    };
    const req = httpsRequest(options, res => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body: data });
        } else {
          reject(new Error(`GitHub API returned ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ─── output helpers ───────────────────────────────────────────────────────────
export function setOutput(key, value, env = process.env) {
  const outputFile = env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `${key}=${value}\n`);
  } else {
    // Fallback for local / test runs: just log it
    process.stdout.write(`::set-output name=${key}::${value}\n`);
  }
}

export function logInfo(msg) {
  process.stdout.write(`[json-diff] ${msg}\n`);
}

export function logWarning(msg) {
  process.stdout.write(`::warning::${msg}\n`);
}

// ─── core action logic (exported for testing) ─────────────────────────────────
/**
 * Run the diff action.
 *
 * @param {ReturnType<parseInputs>} inputs
 * @param {ReturnType<readGitHubContext>} ctx
 * @param {{ postComment?: Function, setOutput?: Function }} [overrides] — for testing
 * @returns {Promise<{ diffFound: boolean, diffCount: number, markdown: string }>}
 */
export async function runAction(inputs, ctx, overrides = {}) {
  const _postComment = overrides.postComment ?? postComment;
  const _setOutput   = overrides.setOutput   ?? setOutput;

  // ── validate inputs ──────────────────────────────────────────────────────
  if (!inputs.sourceFile) throw new Error("input source-file is required");
  if (!inputs.targetFile) throw new Error("input target-file is required");
  if (!existsSync(inputs.sourceFile))
    throw new Error(`source-file not found: ${inputs.sourceFile}`);
  if (!existsSync(inputs.targetFile))
    throw new Error(`target-file not found: ${inputs.targetFile}`);

  // ── parse inputs ─────────────────────────────────────────────────────────
  let src, tgt;
  try { src = JSON.parse(readFileSync(inputs.sourceFile, "utf8")); }
  catch (e) { throw new Error(`source-file is not valid JSON: ${e.message}`); }
  try { tgt = JSON.parse(readFileSync(inputs.targetFile, "utf8")); }
  catch (e) { throw new Error(`target-file is not valid JSON: ${e.message}`); }

  // ── diff ──────────────────────────────────────────────────────────────────
  const diffOpts = {};
  if (inputs.unordered) diffOpts.unordered = true;
  if (inputs.arrayKey)  diffOpts.keyBy     = inputs.arrayKey;

  const changes  = diff(src, tgt, diffOpts);
  const diffs    = changes.filter(c => c.op !== "equal");
  const diffFound = diffs.length > 0;
  const diffCount = diffs.length;

  logInfo(`${diffCount} difference(s) found between ${inputs.sourceFile} and ${inputs.targetFile}`);

  // ── render Markdown ───────────────────────────────────────────────────────
  const markdown = diffToMarkdown(changes, {
    title:       inputs.title,
    sourceLabel: inputs.sourceLabel,
    targetLabel: inputs.targetLabel,
  });

  // ── set outputs ───────────────────────────────────────────────────────────
  _setOutput("diff-found", String(diffFound));
  _setOutput("diff-count", String(diffCount));

  // ── PR comment ───────────────────────────────────────────────────────────
  if (inputs.commentOnPr) {
    if (!ctx.prCommentUrl) {
      logWarning("comment-on-pr is true but this workflow was not triggered by a pull_request event — skipping comment.");
    } else if (!inputs.githubToken) {
      logWarning("comment-on-pr is true but github-token is empty — skipping comment.");
    } else {
      logInfo(`Posting diff comment to PR #${ctx.prNumber}…`);
      await _postComment(inputs.githubToken, ctx.prCommentUrl, markdown);
      logInfo("Comment posted.");
    }
  }

  return { diffFound, diffCount, markdown };
}

// ─── entry point ─────────────────────────────────────────────────────────────
// Only executes when this file is the Node.js entry point (not when imported by tests).
if (resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  (async () => {
    try {
      const inputs  = parseInputs(process.env);
      const ctx     = readGitHubContext(process.env);
      const { diffFound } = await runAction(inputs, ctx);
      if (inputs.failOnDiff && diffFound) {
        logInfo("fail-on-diff is true and differences were found — exiting with code 1.");
        process.exit(1);
      }
    } catch (err) {
      process.stderr.write(`\n::error::json-diff action failed: ${err.message}\n`);
      process.exit(2);
    }
  })();
}
