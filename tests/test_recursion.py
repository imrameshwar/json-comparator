"""T7/B4 recursion guard tests for the Python CLI."""
import pytest
import sys
import os
import subprocess

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from json_compare import diff, DiffDepthError, MAX_DIFF_DEPTH

_ROOT = os.path.dirname(os.path.dirname(__file__))
_CLI = os.path.join(_ROOT, "json_compare.py")


def make_deep(depth, leaf=42):
    v = leaf
    for _ in range(depth):
        v = {"x": v}
    return v


def make_deep_array(depth):
    v = [42]
    for _ in range(depth):
        v = [v]
    return v


def test_max_diff_depth_is_500():
    assert MAX_DIFF_DEPTH == 500


def test_shallow_object_ok():
    v = make_deep(200)
    result = diff(v, v)
    assert result == []


def test_shallow_array_ok():
    v = make_deep_array(200)
    result = diff(v, v)
    assert result == []


def test_deep_object_raises():
    v = make_deep(5000)
    with pytest.raises(DiffDepthError):
        diff(v, v)


def test_deep_array_raises():
    v = make_deep_array(5000)
    with pytest.raises(DiffDepthError):
        diff(v, v)


def test_error_message_mentions_depth():
    v = make_deep(5000)
    with pytest.raises(DiffDepthError) as exc_info:
        diff(v, v)
    assert "500" in str(exc_info.value)


def test_error_mentions_path():
    v = make_deep(5000)
    with pytest.raises(DiffDepthError) as exc_info:
        diff(v, v)
    # The path should contain "$.x.x.x..." — at minimum a dollar sign
    assert "$" in str(exc_info.value)


# ---------------------------------------------------------------------------
# End-to-end CLI tests: these exercise the *parse* path (json.loads), which the
# in-memory tests above skip. A deeply nested file must never crash the CLI with
# a raw RecursionError traceback — it must fail gracefully (exit code 2).
# ---------------------------------------------------------------------------
def _deep_file(tmp_path, name, depth, leaf):
    # Build the JSON as a raw string so we don't hit Python's own encoder limit.
    text = '{"k":' * depth + str(leaf) + "}" * depth
    p = tmp_path / name
    p.write_text(text, encoding="utf-8")
    return str(p)


def _run_cli(*args):
    return subprocess.run(
        [sys.executable, _CLI, *args],
        capture_output=True, text=True,
    )


def test_cli_deep_file_does_not_crash(tmp_path):
    """A pathologically deep file must fail gracefully, not with a traceback."""
    src = _deep_file(tmp_path, "d1.json", 8000, 1)
    tgt = _deep_file(tmp_path, "d2.json", 8000, 2)
    result = _run_cli(src, tgt)
    assert result.returncode == 2, result.stderr
    assert "Traceback" not in result.stderr
    assert "RecursionError" not in result.stderr
    assert "deeply" in result.stderr.lower() or "depth" in result.stderr.lower()


def test_cli_over_guard_file_fails_gracefully(tmp_path):
    """A file deeper than MAX_DIFF_DEPTH but shallow enough to parse should be
    rejected by the diff guard with a friendly message (exit 2, no traceback)."""
    depth = MAX_DIFF_DEPTH + 100
    src = _deep_file(tmp_path, "g1.json", depth, 1)
    tgt = _deep_file(tmp_path, "g2.json", depth, 2)
    result = _run_cli(src, tgt)
    assert result.returncode == 2, result.stderr
    assert "Traceback" not in result.stderr
    assert str(MAX_DIFF_DEPTH) in result.stderr


def test_cli_shallow_file_still_works(tmp_path):
    """A normal nested file must compare fine end-to-end (exit 1 on difference)."""
    src = _deep_file(tmp_path, "s1.json", 50, 1)
    tgt = _deep_file(tmp_path, "s2.json", 50, 2)
    result = _run_cli(src, tgt)
    assert result.returncode == 1, result.stderr
    assert "Traceback" not in result.stderr
