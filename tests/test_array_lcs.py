"""T6/B2 LCS array-matching tests for the Python CLI."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from json_compare import diff


def diffs(src, tgt, **kwargs):
    return [c for c in diff(src, tgt, **kwargs)]


# ---------------------------------------------------------------------------
# LCS scalar-array tests
# ---------------------------------------------------------------------------

def test_lcs_single_insert_at_front():
    """B2 regression: inserting at front should be 1 add, not N changes."""
    out = diffs(["a", "b", "c"], ["x", "a", "b", "c"])
    assert len(out) == 1
    assert out[0]["type"] == "added"
    assert out[0]["to"] == "x"


def test_lcs_single_delete_from_middle():
    out = diffs(["a", "b", "c"], ["a", "c"])
    assert len(out) == 1
    assert out[0]["type"] == "removed"
    assert out[0]["from"] == "b"


def test_lcs_trailing_add():
    out = diffs(["a", "b"], ["a", "b", "c"])
    assert out == [{"type": "added", "path": "$[2]", "to": "c"}]


def test_lcs_identical_arrays():
    assert diffs([1, 2, 3], [1, 2, 3]) == []


def test_lcs_empty_source():
    out = diffs([], ["a", "b"])
    assert len(out) == 2
    assert all(c["type"] == "added" for c in out)


def test_lcs_empty_target():
    out = diffs(["a", "b"], [])
    assert len(out) == 2
    assert all(c["type"] == "removed" for c in out)


def test_lcs_numeric_prefix_insert():
    out = diffs([1, 2, 3], [0, 1, 2, 3])
    assert len(out) == 1
    assert out[0]["type"] == "added"
    assert out[0]["to"] == 0


# ---------------------------------------------------------------------------
# Object-array positional fallback
# ---------------------------------------------------------------------------

def test_object_array_uses_positional_without_key():
    out = diffs([{"a": 1}], [{"a": 2}])
    assert out == [{"type": "changed", "path": "$[0].a", "from": 1, "to": 2}]


# ---------------------------------------------------------------------------
# Key-based matching
# ---------------------------------------------------------------------------

def test_keyed_matched_item_recursively_diffed():
    src = [{"id": 1, "v": "old"}, {"id": 2, "v": "same"}]
    tgt = [{"id": 1, "v": "new"}, {"id": 2, "v": "same"}]
    out = diffs(src, tgt, key_by="id")
    assert len(out) == 1
    assert out[0]["type"] == "changed"
    assert out[0]["path"] == "$[0].v"
    assert out[0]["from"] == "old"
    assert out[0]["to"] == "new"


def test_keyed_reorder_no_diffs():
    src = [{"id": 1, "v": "a"}, {"id": 2, "v": "b"}]
    tgt = [{"id": 2, "v": "b"}, {"id": 1, "v": "a"}]
    assert diffs(src, tgt, key_by="id") == []


def test_keyed_item_only_in_source():
    src = [{"id": 1}, {"id": 2}]
    tgt = [{"id": 2}]
    out = diffs(src, tgt, key_by="id")
    removed = [c for c in out if c["type"] == "removed"]
    assert len(removed) == 1
    assert removed[0]["from"] == {"id": 1}


def test_keyed_item_only_in_target():
    src = [{"id": 1}]
    tgt = [{"id": 1}, {"id": 2}]
    out = diffs(src, tgt, key_by="id")
    added = [c for c in out if c["type"] == "added"]
    assert len(added) == 1
    assert added[0]["to"] == {"id": 2}
