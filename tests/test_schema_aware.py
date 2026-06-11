# tests/test_schema_aware.py — G-3: schema-aware diff tests (Python).
#
# Mirrors the JS tests in tests/schema-aware.test.js and adds CLI integration tests.

import json
import os
import subprocess
import sys
import tempfile

import pytest

# Import the helpers directly from the CLI module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from json_compare import (
    diff,
    _collect_volatile_paths,
    _schema_at_path,
    _schema_type_violation,
    _tokenize_path,
    _apply_schema_aware,
)

# ---------------------------------------------------------------------------
# 1. _collect_volatile_paths
# ---------------------------------------------------------------------------

def test_collect_single_volatile():
    schema = {"properties": {"ts": {"x-volatile": True}}}
    out = []
    _collect_volatile_paths(schema, "$", out)
    assert out == ["$.ts"]


def test_collect_multiple_volatile():
    schema = {
        "properties": {
            "ts":        {"x-volatile": True},
            "updatedAt": {"x-volatile": True},
            "name":      {"type": "string"},
        }
    }
    out = []
    _collect_volatile_paths(schema, "$", out)
    assert "$.ts" in out
    assert "$.updatedAt" in out
    assert "$.name" not in out


def test_collect_nested_object():
    schema = {
        "properties": {
            "meta": {
                "properties": {
                    "updatedAt": {"x-volatile": True},
                    "version":   {"type": "number"},
                }
            }
        }
    }
    out = []
    _collect_volatile_paths(schema, "$", out)
    assert out == ["$.meta.updatedAt"]


def test_collect_array_items():
    schema = {
        "properties": {
            "items": {
                "items": {"properties": {"ts": {"x-volatile": True}}}
            }
        }
    }
    out = []
    _collect_volatile_paths(schema, "$", out)
    assert out == ["$.items[*].ts"]


def test_collect_root_itself_not_pushed():
    schema = {"x-volatile": True}
    out = []
    _collect_volatile_paths(schema, "$", out)
    assert len(out) == 0


def test_collect_empty_schema():
    out = []
    _collect_volatile_paths({}, "$", out)
    assert out == []


def test_collect_non_dict_schema():
    out = []
    _collect_volatile_paths(None, "$", out)
    _collect_volatile_paths("bad", "$", out)
    assert out == []


# ---------------------------------------------------------------------------
# 2. _schema_at_path
# ---------------------------------------------------------------------------

SCHEMA = {
    "type": "object",
    "properties": {
        "name":  {"type": "string"},
        "age":   {"type": "integer"},
        "addr":  {"properties": {"zip": {"type": "string"}}},
        "tags":  {"items": {"type": "string"}},
    },
}


def test_schema_at_root():
    node = _schema_at_path(SCHEMA, _tokenize_path("$"))
    assert node is SCHEMA


def test_schema_at_top_level_property():
    node = _schema_at_path(SCHEMA, _tokenize_path("$.name"))
    assert node == {"type": "string"}


def test_schema_at_nested_property():
    node = _schema_at_path(SCHEMA, _tokenize_path("$.addr.zip"))
    assert node == {"type": "string"}


def test_schema_at_array_wildcard():
    node = _schema_at_path(SCHEMA, _tokenize_path("$.tags[*]"))
    assert node == {"type": "string"}


def test_schema_at_array_index():
    node = _schema_at_path(SCHEMA, _tokenize_path("$.tags[0]"))
    assert node == {"type": "string"}


def test_schema_at_unknown_property():
    node = _schema_at_path(SCHEMA, _tokenize_path("$.unknown"))
    assert node is None


def test_schema_at_path_through_scalar():
    node = _schema_at_path(SCHEMA, _tokenize_path("$.name.deep"))
    assert node is None


# ---------------------------------------------------------------------------
# 3. _schema_type_violation
# ---------------------------------------------------------------------------

def test_no_violation_matching_types():
    assert _schema_type_violation("hi",   {"type": "string"})  is None
    assert _schema_type_violation(42,     {"type": "integer"}) is None
    assert _schema_type_violation(3.14,   {"type": "number"})  is None
    assert _schema_type_violation(True,   {"type": "boolean"}) is None
    assert _schema_type_violation([],     {"type": "array"})   is None
    assert _schema_type_violation({},     {"type": "object"})  is None


def test_violation_type_mismatch():
    v = _schema_type_violation(42, {"type": "string"})
    assert v is not None
    assert v["expected"] == "string"
    assert v["got"] == "integer"


def test_type_array_no_violation():
    assert _schema_type_violation(None, {"type": ["string", "null"]}) is None
    assert _schema_type_violation("x",  {"type": ["string", "null"]}) is None


def test_type_array_violation():
    v = _schema_type_violation(42, {"type": ["string", "boolean"]})
    assert v is not None
    assert "string" in v["expected"]


def test_null_value_no_violation():
    assert _schema_type_violation(None, {"type": "string"}) is None


def test_no_schema_node():
    assert _schema_type_violation("x", None) is None


def test_schema_node_no_type():
    assert _schema_type_violation("x", {"description": "no type"}) is None


# ---------------------------------------------------------------------------
# 4. diff() + _apply_schema_aware
# ---------------------------------------------------------------------------

def make_schema():
    return {
        "type": "object",
        "properties": {
            "name":      {"type": "string"},
            "score":     {"type": "number"},
            "updatedAt": {"x-volatile": True},
        },
    }


def schema_diff(src, tgt, schema=None, ignore_paths=None):
    """Run diff() + volatile-path collection + _apply_schema_aware."""
    volatile = []
    if schema:
        _collect_volatile_paths(schema, "$", volatile)
    combined = list(ignore_paths or []) + volatile or None
    changes = diff(src, tgt, ignore_paths=combined)
    if schema:
        changes = _apply_schema_aware(changes, schema)
    return [c for c in changes if c.get("type") != "equal"]


def test_suppress_volatile_path():
    src = {"name": "Alice", "score": 10, "updatedAt": "2024-01-01"}
    tgt = {"name": "Alice", "score": 10, "updatedAt": "2024-12-31"}
    changes = schema_diff(src, tgt, schema=make_schema())
    assert len(changes) == 0


def test_non_volatile_path_not_suppressed():
    src = {"name": "Alice", "score": 10, "updatedAt": "x"}
    tgt = {"name": "Bob",   "score": 10, "updatedAt": "y"}
    changes = schema_diff(src, tgt, schema=make_schema())
    assert len(changes) == 1
    assert changes[0]["path"] == "$.name"


def test_annotate_type_violation_changed():
    src = {"name": "Alice", "score": 10,    "updatedAt": "x"}
    tgt = {"name": "Alice", "score": "ten", "updatedAt": "y"}
    changes = schema_diff(src, tgt, schema=make_schema())
    score = next(c for c in changes if c["path"] == "$.score")
    assert "schema_violation" in score
    assert score["schema_violation"]["expected"] == "number"
    assert score["schema_violation"]["got"] == "string"


def test_annotate_type_violation_added():
    src = {"name": "Alice"}
    tgt = {"name": "Alice", "score": "oops"}
    changes = schema_diff(src, tgt, schema=make_schema())
    score = next(c for c in changes if c["path"] == "$.score")
    assert "schema_violation" in score


def test_removed_not_annotated():
    src = {"name": "Alice", "score": 10}
    tgt = {"name": "Alice"}
    changes = schema_diff(src, tgt, schema=make_schema())
    score = next(c for c in changes if c["path"] == "$.score")
    assert "schema_violation" not in score


def test_type_conforming_change_not_annotated():
    src = {"name": "Alice", "score": 10}
    tgt = {"name": "Bob",   "score": 20}
    changes = schema_diff(src, tgt, schema=make_schema())
    for c in changes:
        assert "schema_violation" not in c


def test_combined_explicit_and_volatile_ignore():
    schema = {"properties": {"ts": {"x-volatile": True}}}
    src = {"a": 1, "ts": "old", "b": 2}
    tgt = {"a": 1, "ts": "new", "b": 99}
    changes = schema_diff(src, tgt, schema=schema, ignore_paths=["$.b"])
    assert len(changes) == 0


def test_no_schema_backward_compat():
    src = {"a": 1, "b": 2, "c": 3}
    tgt = {"a": 1, "b": 9, "d": 4}
    changes = diff(src, tgt)
    changes = [c for c in changes if c.get("type") != "equal"]
    assert len(changes) == 3
    for c in changes:
        assert "schema_violation" not in c


# ---------------------------------------------------------------------------
# 5. CLI integration: --schema / --schema-aware
# ---------------------------------------------------------------------------

CLI = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "json_compare.py")


def run_cli(*extra_args, src=None, tgt=None):
    """Run the CLI and return (returncode, parsed_json_output)."""
    if src is None:
        src = {"name": "Alice", "score": 10, "updatedAt": "old"}
    if tgt is None:
        tgt = {"name": "Alice", "score": 10, "updatedAt": "new"}
    schema = {
        "properties": {
            "score":     {"type": "number"},
            "updatedAt": {"x-volatile": True},
        }
    }
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as sf:
        json.dump(src, sf)
        src_path = sf.name
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as tf:
        json.dump(tgt, tf)
        tgt_path = tf.name
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as schf:
        json.dump(schema, schf)
        schema_path = schf.name
    try:
        args = [sys.executable, CLI, src_path, tgt_path, "--json"] + list(extra_args) + \
               ["--schema", schema_path]
        result = subprocess.run(args, capture_output=True, text=True)
        output = json.loads(result.stdout) if result.stdout.strip() else []
        return result.returncode, output
    finally:
        for p in (src_path, tgt_path, schema_path):
            try:
                os.unlink(p)
            except OSError:
                pass


def test_cli_schema_aware_suppresses_volatile():
    rc, changes = run_cli("--schema-aware")
    # updatedAt is volatile → suppressed → no changes
    assert rc == 0
    assert changes == []


def test_cli_schema_without_schema_aware_does_not_suppress():
    rc, changes = run_cli()  # --schema provided but not --schema-aware
    # updatedAt change should appear
    assert rc == 1
    paths = {c["path"] for c in changes}
    assert "$.updatedAt" in paths


def test_cli_schema_aware_annotates_type_violation():
    src = {"score": 10, "updatedAt": "x"}
    tgt = {"score": "ten", "updatedAt": "y"}
    rc, changes = run_cli("--schema-aware", src=src, tgt=tgt)
    # updatedAt suppressed; score change should have schema_violation
    score = next((c for c in changes if c["path"] == "$.score"), None)
    assert score is not None
    assert "schema_violation" in score
    assert score["schema_violation"]["expected"] == "number"
