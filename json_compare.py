#!/usr/bin/env python3
"""
json_compare.py — a small, dependency-free JSON comparator.

Deep-compares two JSON files and reports, by path:
  - keys/items only in source (removed)
  - keys/items only in target (added)
  - values that changed (with both old and new values)
  - type changes (e.g. number -> string)

Lists can be compared positionally (default) or order-insensitively for lists
of scalars (--unordered). For arrays of objects, use --array-key=<field> to
match items by a shared key (e.g. "id") rather than by position.

Usage:
    python3 json_compare.py source.json target.json
    python3 json_compare.py source.json target.json --unordered
    python3 json_compare.py source.json target.json --array-key id
    python3 json_compare.py source.json target.json --json   # machine-readable

Exit codes:
    0  files are equal
    1  differences found
    2  usage / parse / depth error
"""

import argparse
import json
import sys

# ---------------------------------------------------------------------------
# T7/B4: recursion guard
# ---------------------------------------------------------------------------
MAX_DIFF_DEPTH = 500

# Raise the interpreter recursion ceiling so that json.loads() and diff() can
# both handle structures up to MAX_DIFF_DEPTH levels deep. The default limit
# (~1000) lets the C JSON scanner fail on inputs the diff guard would happily
# accept. We pick a value with comfortable headroom over MAX_DIFF_DEPTH but
# stay well inside catchable territory — anything deeper raises a *catchable*
# RecursionError (handled in load()) rather than segfaulting.
_REQUIRED_RECURSION_LIMIT = MAX_DIFF_DEPTH * 12  # 6000
if sys.getrecursionlimit() < _REQUIRED_RECURSION_LIMIT:
    sys.setrecursionlimit(_REQUIRED_RECURSION_LIMIT)


class DiffDepthError(Exception):
    """Raised when the JSON structure exceeds MAX_DIFF_DEPTH nesting levels."""
    pass


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------
def _fail(message):
    """Print an error to stderr and exit with code 2 (usage/parse/depth error)."""
    sys.stderr.write(message.rstrip("\n") + "\n")
    sys.exit(2)


def load(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            text = fh.read()
    except FileNotFoundError:
        _fail(f"error: file not found: {path}")

    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        # T8: show line/column and a caret so users see exactly where the break is.
        lines = text.splitlines()
        lineno = exc.lineno
        colno = exc.colno
        line_text = lines[lineno - 1] if 0 < lineno <= len(lines) else ""
        caret = " " * (colno - 1) + "^"
        _fail(
            f"error: invalid JSON in {path}:\n"
            f"  {exc.msg} (line {lineno}, column {colno})\n"
            f"  {line_text}\n"
            f"  {caret}"
        )
    except RecursionError:
        # T7/B4: the JSON itself is nested far deeper than we support. json.loads
        # exhausts the C stack before diff() ever runs, so guard it here too and
        # fail with the same friendly, traceback-free message diff() would give.
        _fail(
            f"error: invalid JSON in {path}:\n"
            f"  structure is nested too deeply to parse safely "
            f"(exceeds {MAX_DIFF_DEPTH} levels).\n"
            f"  Ensure the input is not circularly or extremely deeply nested."
        )


# ---------------------------------------------------------------------------
# Type utilities (mirrors the JS typeName / isScalar)
# ---------------------------------------------------------------------------
def type_name(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def _is_scalar(value):
    return type_name(value) not in ("object", "array")


# ---------------------------------------------------------------------------
# T6/B2: deep equality (used by _lcs)
# ---------------------------------------------------------------------------
def _deep_equal(a, b):
    if type_name(a) != type_name(b):
        return False
    if _is_scalar(a):
        return a == b
    if isinstance(a, list):
        if len(a) != len(b):
            return False
        return all(_deep_equal(x, y) for x, y in zip(a, b))
    # dict
    if set(a.keys()) != set(b.keys()):
        return False
    return all(_deep_equal(a[k], b[k]) for k in a)


# ---------------------------------------------------------------------------
# T6/B2: LCS for ordered scalar arrays
# ---------------------------------------------------------------------------
def _lcs(src, tgt):
    """Return list of (si, ti) index pairs forming the LCS of src and tgt."""
    m, n = len(src), len(tgt)
    if m == 0 or n == 0:
        return []
    if m * n > 250000:
        # Greedy fallback for very large arrays.
        pairs, j = [], 0
        for i in range(m):
            for jj in range(j, n):
                if _deep_equal(src[i], tgt[jj]):
                    pairs.append((i, jj))
                    j = jj + 1
                    break
        return pairs
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if _deep_equal(src[i - 1], tgt[j - 1]):
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    pairs, i, j = [], m, n
    while i > 0 and j > 0:
        if _deep_equal(src[i - 1], tgt[j - 1]):
            pairs.append((i - 1, j - 1))
            i -= 1
            j -= 1
        elif dp[i - 1][j] >= dp[i][j - 1]:
            i -= 1
        else:
            j -= 1
    pairs.reverse()
    return pairs


def _diff_array_lcs(src, tgt, path, unordered, key_by, changes, _depth):
    """LCS-based diff for all-scalar ordered arrays (T6/B2)."""
    pairs = _lcs(src, tgt)
    si = ti = pi = 0
    while si < len(src) or ti < len(tgt):
        next_pair = pairs[pi] if pi < len(pairs) else None
        next_si = next_pair[0] if next_pair else len(src)
        next_ti = next_pair[1] if next_pair else len(tgt)
        while si < next_si:
            changes.append({"type": "removed", "path": f"{path}[{si}]", "from": src[si]})
            si += 1
        while ti < next_ti:
            changes.append({"type": "added", "path": f"{path}[{ti}]", "to": tgt[ti]})
            ti += 1
        if next_pair:
            diff(src[si], tgt[ti], f"{path}[{si}]", unordered, key_by, changes, _depth + 1)
            si += 1
            ti += 1
            pi += 1


def _diff_array_keyed(src, tgt, path, unordered, key_by, changes, _depth):
    """Key-based diff for arrays of objects when key_by is set (T6/B2)."""
    src_map, tgt_map = {}, {}
    for si, item in enumerate(src):
        if isinstance(item, dict) and key_by in item:
            k = json.dumps(item[key_by], sort_keys=True)
            if k not in src_map:
                src_map[k] = (si, item)
    for ti, item in enumerate(tgt):
        if isinstance(item, dict) and key_by in item:
            k = json.dumps(item[key_by], sort_keys=True)
            if k not in tgt_map:
                tgt_map[k] = (ti, item)
    # Matched pairs → recurse (in source order)
    for k, (si, src_item) in src_map.items():
        if k in tgt_map:
            ti, tgt_item = tgt_map[k]
            diff(src_item, tgt_item, f"{path}[{si}]", unordered, key_by, changes, _depth + 1)
    # Only in source → removed
    for k, (si, item) in src_map.items():
        if k not in tgt_map:
            changes.append({"type": "removed", "path": f"{path}[{si}]", "from": item})
    # Only in target → added
    for k, (ti, item) in tgt_map.items():
        if k not in src_map:
            changes.append({"type": "added", "path": f"{path}[{ti}]", "to": item})


# ---------------------------------------------------------------------------
# F-4: ignore-paths helpers
# ---------------------------------------------------------------------------
def _tokenize_path(p):
    """Tokenize a display-format path string into tokens.
    "$.a[0].b"       -> ["$", "a", "0", "b"]
    "$.items[*].ts"  -> ["$", "items", "*", "ts"]
    "$.meta.*.key"   -> ["$", "meta", "*", "key"]
    """
    toks = []
    i = 0
    while i < len(p):
        if p[i] == "$":
            toks.append("$")
            i += 1
        elif p[i] == ".":
            i += 1
            j = i
            while j < len(p) and p[j] not in (".", "["):
                j += 1
            if j > i:
                toks.append(p[i:j])
            i = j
        elif p[i] == "[":
            i += 1
            j = i
            while j < len(p) and p[j] != "]":
                j += 1
            toks.append(p[i:j])
            i = j + 1
        else:
            i += 1
    return toks


def _path_matches_pattern(path, pattern):
    """Return True if path matches pattern token-for-token.
    Lengths must be equal; '*' in the pattern matches any single token.
    """
    pt = _tokenize_path(path)
    pp = _tokenize_path(pattern)
    if len(pt) != len(pp):
        return False
    return all(pp[i] == "*" or pp[i] == pt[i] for i in range(len(pp)))


def _should_ignore(path, ignore_paths):
    """Return True if this path should be excluded by any ignore-path pattern."""
    if not ignore_paths:
        return False
    return any(_path_matches_pattern(path, pat) for pat in ignore_paths)


# ---------------------------------------------------------------------------
# G-3: schema-aware diff helpers
# ---------------------------------------------------------------------------
def _collect_volatile_paths(schema, path, out):
    """Walk a JSON Schema and append JSONPath-like patterns for every property
    node that carries "x-volatile": True into `out`.  Recurses into
    `properties` and single-schema `items`.
    E.g. {"properties": {"ts": {"x-volatile": True}}} -> out = ["$.ts"]
    """
    if not isinstance(schema, dict):
        return
    if schema.get("x-volatile") is True and path != "$":
        out.append(path)
    props = schema.get("properties")
    if isinstance(props, dict):
        for k, v in props.items():
            _collect_volatile_paths(v, path + "." + k, out)
    items = schema.get("items")
    if isinstance(items, dict):
        _collect_volatile_paths(items, path + "[*]", out)


def _schema_at_path(schema, tokens):
    """Navigate a JSON Schema tree to the sub-schema node at `tokens` (from
    _tokenize_path).  Returns None when the path cannot be resolved.
    Supports: root "$", object properties, array items (single schema).
    """
    cur = schema
    for tok in tokens[1:]:  # skip "$"
        if not isinstance(cur, dict):
            return None
        if tok == "*" or tok.isdigit():
            items = cur.get("items")
            cur = items if isinstance(items, dict) else None
        else:
            props = cur.get("properties")
            cur = props.get(tok) if isinstance(props, dict) else None
    return cur


def _type_name_py(value):
    """Return the JSON Schema type name for a Python value."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def _schema_type_violation(value, schema_node):
    """Check whether `value` satisfies the `type` declared in `schema_node`.
    Returns {"expected": ..., "got": ...} if there is a violation, None otherwise.
    Handles type arrays and the "integer" refinement.
    """
    if not isinstance(schema_node, dict):
        return None
    declared = schema_node.get("type")
    if not declared:
        return None
    if value is None:
        return None
    got = _type_name_py(value)
    types = declared if isinstance(declared, list) else [declared]
    for t in types:
        if t == got:
            return None
        if t == "integer" and got == "integer":
            return None
        if t == "number" and got in ("number", "integer"):
            return None
    return {"expected": "|".join(types), "got": got}


def _apply_schema_aware(changes, schema):
    """Post-process a change list: annotate type violations using schema.
    Volatile-path suppression is handled before diff via ignore_paths.
    """
    if not isinstance(schema, dict):
        return changes
    result = []
    for c in changes:
        if c.get("type") in ("equal", "removed"):
            result.append(c)
            continue
        value = c.get("to")
        tokens = _tokenize_path(c["path"])
        node = _schema_at_path(schema, tokens)
        violation = _schema_type_violation(value, node)
        if violation:
            c = dict(c)
            c["schema_violation"] = violation
        result.append(c)
    return result


# ---------------------------------------------------------------------------
# Core diff function
# ---------------------------------------------------------------------------
def diff(src, tgt, path="$", unordered=False, key_by=None, changes=None, _depth=0, ignore_paths=None):
    """Recursively collect differences into `changes`.

    ignore_paths is only consumed at the top-level call (when changes is None);
    the filter is applied after all recursion completes.
    """
    _is_top = changes is None
    if changes is None:
        changes = []

    # T7/B4: depth guard — raise instead of letting Python hit its recursion limit.
    if _depth > MAX_DIFF_DEPTH:
        raise DiffDepthError(
            f"JSON structure exceeds maximum diff depth ({MAX_DIFF_DEPTH}) at {path}. "
            "Ensure input is not circularly or extremely deeply nested."
        )

    # Different fundamental types → report a type change and stop recursing.
    if type_name(src) != type_name(tgt):
        changes.append({
            "type": "type_changed",
            "path": path,
            "from": src,
            "to": tgt,
            "from_type": type_name(src),
            "to_type": type_name(tgt),
        })
        if _is_top and ignore_paths:
            return [c for c in changes if not _should_ignore(c["path"], ignore_paths)]
        return changes

    if isinstance(src, dict):
        for key in sorted(src.keys() - tgt.keys()):
            changes.append({"type": "removed", "path": f"{path}.{key}", "from": src[key]})
        for key in sorted(tgt.keys() - src.keys()):
            changes.append({"type": "added", "path": f"{path}.{key}", "to": tgt[key]})
        for key in sorted(src.keys() & tgt.keys()):
            diff(src[key], tgt[key], f"{path}.{key}", unordered, key_by, changes, _depth + 1)
        if _is_top and ignore_paths:
            return [c for c in changes if not _should_ignore(c["path"], ignore_paths)]
        return changes

    if isinstance(src, list):
        if unordered and _all_scalar(src) and _all_scalar(tgt):
            # Multiset (count) comparison (T5/B1).
            src_counts = _counter(src)
            tgt_counts = _counter(tgt)
            for item in sorted(src_counts.keys() | tgt_counts.keys()):
                s = src_counts.get(item, 0)
                t = tgt_counts.get(item, 0)
                if s > t:
                    changes.append({"type": "removed", "path": f"{path}[*]", "from": _unwrap(item)})
                elif t > s:
                    changes.append({"type": "added", "path": f"{path}[*]", "to": _unwrap(item)})
            if _is_top and ignore_paths:
                return [c for c in changes if not _should_ignore(c["path"], ignore_paths)]
            return changes

        # T6/B2: ordered-array matching strategy selection.
        if key_by:
            # Opt-in key-based matching for arrays of objects.
            _diff_array_keyed(src, tgt, path, unordered, key_by, changes, _depth)
        elif _all_scalar(src) and _all_scalar(tgt):
            # All-scalar ordered arrays: use LCS.
            _diff_array_lcs(src, tgt, path, unordered, key_by, changes, _depth)
        else:
            # Mixed / object arrays without a key: positional fallback.
            for i in range(min(len(src), len(tgt))):
                diff(src[i], tgt[i], f"{path}[{i}]", unordered, key_by, changes, _depth + 1)
            for i in range(len(tgt), len(src)):
                changes.append({"type": "removed", "path": f"{path}[{i}]", "from": src[i]})
            for i in range(len(src), len(tgt)):
                changes.append({"type": "added", "path": f"{path}[{i}]", "to": tgt[i]})
        if _is_top and ignore_paths:
            return [c for c in changes if not _should_ignore(c["path"], ignore_paths)]
        return changes

    # scalars
    if src != tgt:
        changes.append({"type": "changed", "path": path, "from": src, "to": tgt})
    if _is_top and ignore_paths:
        return [c for c in changes if not _should_ignore(c["path"], ignore_paths)]
    return changes


# ---------------------------------------------------------------------------
# Helpers for unordered / multiset comparison
# ---------------------------------------------------------------------------
def _all_scalar(seq):
    return all(not isinstance(x, (list, dict)) for x in seq)


def _wrap(x):
    # hashable, type-aware key so 1 and True don't collide
    return (type_name(x), json.dumps(x, sort_keys=True))


def _unwrap(key):
    return json.loads(key[1])


def _counter(seq):
    counts = {}
    for x in seq:
        counts[_wrap(x)] = counts.get(_wrap(x), 0) + 1
    return counts


# ---------------------------------------------------------------------------
# Output formatting
# ---------------------------------------------------------------------------
def fmt(value):
    return json.dumps(value, ensure_ascii=False)


def print_human(changes, src_path, tgt_path):
    if not changes:
        print(f"No differences. {src_path} and {tgt_path} are equal.")
        return

    order = {"added": 0, "removed": 1, "changed": 2, "type_changed": 3}
    changes = sorted(changes, key=lambda c: (c["path"], order.get(c["type"], 9)))

    added = [c for c in changes if c["type"] == "added"]
    removed = [c for c in changes if c["type"] == "removed"]
    changed = [c for c in changes if c["type"] in ("changed", "type_changed")]

    print(f"Comparing:\n  source: {src_path}\n  target: {tgt_path}\n")
    print(f"{len(changes)} difference(s) found "
          f"({len(added)} added, {len(removed)} removed, {len(changed)} changed)\n")

    for c in changes:
        if c["type"] == "added":
            print(f"  + {c['path']}  =  {fmt(c['to'])}")
        elif c["type"] == "removed":
            print(f"  - {c['path']}  =  {fmt(c['from'])}")
        elif c["type"] == "changed":
            print(f"  ~ {c['path']}  :  {fmt(c['from'])}  ->  {fmt(c['to'])}")
        elif c["type"] == "type_changed":
            print(f"  ~ {c['path']}  :  {fmt(c['from'])} ({c['from_type']})"
                  f"  ->  {fmt(c['to'])} ({c['to_type']})")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Compare two JSON files and report the differences."
    )
    parser.add_argument("source", help="path to the source JSON file")
    parser.add_argument("target", help="path to the target JSON file")
    parser.add_argument(
        "--unordered", action="store_true",
        help="compare lists of scalars without regard to order"
    )
    parser.add_argument(
        "--array-key", dest="array_key", default=None, metavar="KEY",
        help="match array objects by this key field (e.g. id) instead of by position"
    )
    parser.add_argument(
        "--json", dest="as_json", action="store_true",
        help="emit differences as JSON instead of human-readable text"
    )
    parser.add_argument(
        "--ignore-path", dest="ignore_paths", action="append", default=[], metavar="PATTERN",
        help=(
            "exclude paths matching PATTERN from the diff (may be repeated). "
            "Patterns use JSONPath-like syntax: '$' is root, '.key' or '[n]' are "
            "segments, '*' matches any single segment. "
            "Examples: --ignore-path '$.meta.*.updatedAt'  "
            "          --ignore-path '$.items[*].ts'"
        )
    )
    # G-3: schema-aware diff
    parser.add_argument(
        "--schema", dest="schema_file", default=None, metavar="SCHEMA_FILE",
        help=(
            "path to a JSON Schema file. When combined with --schema-aware, "
            "paths marked x-volatile:true in the schema are automatically "
            "suppressed and type violations are annotated in the output."
        )
    )
    parser.add_argument(
        "--schema-aware", dest="schema_aware", action="store_true",
        help=(
            "enable schema-aware diff mode (requires --schema). "
            "Suppresses x-volatile paths and annotates type violations."
        )
    )
    args = parser.parse_args()

    src = load(args.source)
    tgt = load(args.target)

    # G-3: load schema and build volatile-path list
    schema = None
    if args.schema_file:
        try:
            with open(args.schema_file, encoding="utf-8") as fh:
                schema = json.load(fh)
        except (OSError, json.JSONDecodeError) as exc:
            _fail(f"error loading schema: {exc}")

    schema_volatile = []
    if args.schema_aware and schema:
        _collect_volatile_paths(schema, "$", schema_volatile)

    ignore_paths = list(args.ignore_paths) if args.ignore_paths else []
    ignore_paths.extend(schema_volatile)
    ignore_paths = ignore_paths if ignore_paths else None

    try:
        changes = diff(src, tgt, unordered=args.unordered, key_by=args.array_key,
                       ignore_paths=ignore_paths)
    except DiffDepthError as exc:
        _fail(f"error: {exc}")

    # G-3: annotate type violations
    if args.schema_aware and schema:
        changes = _apply_schema_aware(changes, schema)

    if args.as_json:
        print(json.dumps(changes, indent=2, ensure_ascii=False))
    else:
        print_human(changes, args.source, args.target)

    sys.exit(1 if changes else 0)


if __name__ == "__main__":
    main()
