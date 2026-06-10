"""T5 — CLI unordered comparison uses multiset (count) semantics.

Regression test for B1: plain set difference dropped duplicate multiplicity, so
[1, 1, 2] vs [1, 2] reported nothing. It must report exactly one removed `1`.
Parity with the JS core over the full fixture corpus is covered by
tests/parity.test.js.
"""

import json_compare


def test_duplicate_removed_is_reported():
    changes = json_compare.diff([1, 1, 2], [1, 2], unordered=True)
    assert changes == [{"type": "removed", "path": "$[*]", "from": 1}]


def test_duplicate_added_is_reported():
    changes = json_compare.diff([1, 2], [1, 1, 2], unordered=True)
    assert changes == [{"type": "added", "path": "$[*]", "to": 1}]


def test_same_multiset_different_order_is_equal():
    assert json_compare.diff([3, 1, 2], [1, 2, 3], unordered=True) == []


def test_counts_beyond_one_extra():
    # three 1s vs one 1: still a single reported removal of the value `1`
    # (mirrors the web core, which emits one entry per distinct value).
    changes = json_compare.diff([1, 1, 1], [1], unordered=True)
    assert changes == [{"type": "removed", "path": "$[*]", "from": 1}]


def test_nested_unordered_array():
    changes = json_compare.diff(
        {"tags": [1, 1, 2]}, {"tags": [1, 2]}, unordered=True
    )
    assert changes == [{"type": "removed", "path": "$.tags[*]", "from": 1}]
