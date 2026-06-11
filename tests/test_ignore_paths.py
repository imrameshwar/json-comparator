"""tests/test_ignore_paths.py — F-4: ignore-paths option for json_compare.py."""
import sys
import os
import subprocess

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from json_compare import diff, _tokenize_path, _path_matches_pattern


# ---------------------------------------------------------------------------
# _tokenize_path
# ---------------------------------------------------------------------------
def test_tokenize_root_only():
    assert _tokenize_path("$") == ["$"]


def test_tokenize_simple_path():
    assert _tokenize_path("$.a.b.c") == ["$", "a", "b", "c"]


def test_tokenize_array_index():
    assert _tokenize_path("$.items[0].ts") == ["$", "items", "0", "ts"]


def test_tokenize_array_wildcard_normalises():
    assert _tokenize_path("$.items[*].ts") == ["$", "items", "*", "ts"]


def test_tokenize_key_wildcard_normalises():
    assert _tokenize_path("$.meta.*.updatedAt") == ["$", "meta", "*", "updatedAt"]


# ---------------------------------------------------------------------------
# _path_matches_pattern
# ---------------------------------------------------------------------------
def test_exact_match():
    assert _path_matches_pattern("$.a.b", "$.a.b") is True


def test_exact_mismatch():
    assert _path_matches_pattern("$.a.b", "$.a.c") is False


def test_length_mismatch():
    assert _path_matches_pattern("$.a", "$.a.b") is False
    assert _path_matches_pattern("$.a.b", "$.a") is False


def test_key_wildcard():
    assert _path_matches_pattern("$.meta.foo.updatedAt", "$.meta.*.updatedAt") is True
    assert _path_matches_pattern("$.meta.bar.updatedAt", "$.meta.*.updatedAt") is True
    assert _path_matches_pattern("$.meta.foo.createdAt", "$.meta.*.updatedAt") is False


def test_index_wildcard():
    assert _path_matches_pattern("$.items[0].ts", "$.items[*].ts") is True
    assert _path_matches_pattern("$.items[99].ts", "$.items[*].ts") is True
    assert _path_matches_pattern("$.items[0].id", "$.items[*].ts") is False


# ---------------------------------------------------------------------------
# diff() with ignore_paths
# ---------------------------------------------------------------------------
def _diffs(src, tgt, **kwargs):
    return [c for c in diff(src, tgt, **kwargs) if c.get("type") != "equal"]


def test_suppress_exact_path():
    src = {"a": 1, "ts": "old"}
    tgt = {"a": 1, "ts": "new"}
    out = _diffs(src, tgt, ignore_paths=["$.ts"])
    assert out == [], out


def test_still_reports_non_ignored():
    src = {"a": 1, "ts": "old"}
    tgt = {"a": 2, "ts": "new"}
    out = _diffs(src, tgt, ignore_paths=["$.ts"])
    assert len(out) == 1
    assert out[0]["path"] == "$.a"


def test_wildcard_key_segment():
    src = {"meta": {"x": {"updatedAt": "2024-01-01"}, "y": {"updatedAt": "2024-01-01"}}, "v": 1}
    tgt = {"meta": {"x": {"updatedAt": "2024-12-31"}, "y": {"updatedAt": "2024-12-31"}}, "v": 1}
    out = _diffs(src, tgt, ignore_paths=["$.meta.*.updatedAt"])
    assert out == [], out


def test_wildcard_key_leaves_siblings_visible():
    src = {"meta": {"x": {"updatedAt": "old", "name": "alice"}}}
    tgt = {"meta": {"x": {"updatedAt": "new", "name": "bob"}}}
    out = _diffs(src, tgt, ignore_paths=["$.meta.*.updatedAt"])
    assert len(out) == 1
    assert out[0]["path"] == "$.meta.x.name"


def test_wildcard_index_segment():
    src = {"items": [{"id": 1, "ts": "old"}, {"id": 2, "ts": "old"}]}
    tgt = {"items": [{"id": 1, "ts": "new"}, {"id": 2, "ts": "new"}]}
    out = _diffs(src, tgt, ignore_paths=["$.items[*].ts"])
    assert out == [], out


def test_wildcard_index_leaves_non_matching_fields():
    src = {"items": [{"id": 1, "ts": "old"}]}
    tgt = {"items": [{"id": 2, "ts": "new"}]}
    out = _diffs(src, tgt, ignore_paths=["$.items[*].ts"])
    assert len(out) == 1
    assert out[0]["path"] == "$.items[0].id"


def test_multiple_patterns():
    src = {"a": 1, "b": 2, "c": 3}
    tgt = {"a": 9, "b": 9, "c": 9}
    out = _diffs(src, tgt, ignore_paths=["$.a", "$.b"])
    assert len(out) == 1
    assert out[0]["path"] == "$.c"


def test_empty_ignore_paths_no_effect():
    out = _diffs({"a": 1}, {"a": 2}, ignore_paths=[])
    assert len(out) == 1


def test_none_ignore_paths_no_effect():
    out = _diffs({"a": 1}, {"a": 2}, ignore_paths=None)
    assert len(out) == 1


def test_suppress_added_leaf():
    src = {"items": [{"id": 1}]}
    tgt = {"items": [{"id": 1, "ts": "new"}]}
    out = _diffs(src, tgt, ignore_paths=["$.items[*].ts"])
    assert out == [], out


def test_suppress_removed_leaf():
    src = {"items": [{"id": 1, "ts": "old"}]}
    tgt = {"items": [{"id": 1}]}
    out = _diffs(src, tgt, ignore_paths=["$.items[*].ts"])
    assert out == [], out


# ---------------------------------------------------------------------------
# CLI --ignore-path flag
# ---------------------------------------------------------------------------
def test_cli_ignore_path(tmp_path):
    import json
    src_file = tmp_path / "src.json"
    tgt_file = tmp_path / "tgt.json"
    src_file.write_text(json.dumps({"a": 1, "ts": "old"}))
    tgt_file.write_text(json.dumps({"a": 1, "ts": "new"}))
    cli = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "json_compare.py")
    result = subprocess.run(
        [sys.executable, cli, str(src_file), str(tgt_file), "--ignore-path", "$.ts", "--json"],
        capture_output=True, text=True
    )
    # exit 0 = equal after ignoring ts
    assert result.returncode == 0, f"stdout={result.stdout!r} stderr={result.stderr!r}"
    changes = json.loads(result.stdout)
    assert changes == [], changes


def test_cli_ignore_path_wildcard(tmp_path):
    import json
    src_file = tmp_path / "src.json"
    tgt_file = tmp_path / "tgt.json"
    src_file.write_text(json.dumps({"meta": {"x": {"updatedAt": "old"}}, "value": 1}))
    tgt_file.write_text(json.dumps({"meta": {"x": {"updatedAt": "new"}}, "value": 1}))
    cli = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "json_compare.py")
    result = subprocess.run(
        [sys.executable, cli, str(src_file), str(tgt_file),
         "--ignore-path", "$.meta.*.updatedAt", "--json"],
        capture_output=True, text=True
    )
    assert result.returncode == 0, f"stdout={result.stdout!r} stderr={result.stderr!r}"
    changes = json.loads(result.stdout)
    assert changes == [], changes
