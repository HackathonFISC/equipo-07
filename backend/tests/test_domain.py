import pytest
from pydantic import ValidationError

from app.contracts import PriorityPolicyConfig
from app.domain import calculate_priority


@pytest.mark.parametrize(
    ("hours", "points"), [(0, 0), (1, 9), (11.9, 9), (12, 18), (24, 26), (48, 35), (2160, 35)]
)
def test_hours_thresholds(hours, points):
    score = calculate_priority(hours, False, 0, 0)
    assert score.score_min == score.score_max == points


def test_unknown_not_penalized_and_critical_alert():
    empty = calculate_priority(None, None, None, None)
    assert (empty.score_min, empty.score_max, empty.confidence_level) == (0, 100, "LOW")
    critical = calculate_priority(None, True, None, None)
    assert critical.immediate_review and critical.score_min == 30 and critical.score_max == 100


def test_max_tie_and_custom_policy():
    assert calculate_priority(100, True, 1, 5000).score_min == 100
    assert calculate_priority(48, True, 1, 99999) == calculate_priority(100, True, 1, 5000)
    policy = PriorityPolicyConfig(
        hours_weight=100, critical_weight=0, vulnerability_weight=0, population_weight=0
    )
    assert calculate_priority(48, False, 0, 0, policy).score_min == 100
    with pytest.raises(ValidationError):
        PriorityPolicyConfig(hours_weight=101)


@pytest.mark.parametrize(
    "args",
    [
        (-1, None, None, None),
        (float("nan"), None, None, None),
        (10, True, 2, 0),
        (10, False, 0, -1),
    ],
)
def test_invalid_priority_data(args):
    with pytest.raises(ValueError):
        calculate_priority(*args)
