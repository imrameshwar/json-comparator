"""Trivial Python smoke test — proves the pytest pipeline runs green.

It also exercises the existing CLI diff() at a basic level (without changing its
behavior). Comprehensive parity/corpus tests arrive with T3.
"""

import json_compare


def test_pipeline_runs():
    assert 1 + 1 == 2


def test_diff_reports_a_changed_scalar():
    changes = json_compare.diff({"a": 1}, {"a": 2})
    assert changes == [{"type": "changed", "path": "$.a", "from": 1, "to": 2}]


def test_identical_inputs_have_no_changes():
    assert json_compare.diff({"a": 1}, {"a": 1}) == []
