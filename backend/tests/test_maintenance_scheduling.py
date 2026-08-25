"""Unit tests for the pure calculation engine in maintenance_scheduling.py — no DB, no live API.

Covers Feature 2 (multi-trigger "whichever is met first" due-date engine), Feature 6 (automatic
per-trigger independent schedule reset on completion), and the remaining-days/red-flag status model
(time-trigger only — distance/engine-hours stay dormant for color/reminders until a telematics feed
exists, per product decision).
"""
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from maintenance_scheduling import (
    Interval, classify_status, compute_due_state, compute_trigger_state, reminders_to_fire,
    reset_schedule_on_completion,
)


# --- single trigger due-point calculation ---

def test_time_trigger_due_point():
    iv = Interval("time", 6, "months")
    due = compute_due_state([iv], base_date=date(2026, 1, 1), base_odometer=None, base_hours=None,
                             ref_date=date(2026, 2, 1))
    assert due.next_due_date == date(2026, 6, 30)  # 6*30 = 180 days after Jan 1


def test_distance_trigger_due_point():
    iv = Interval("distance", 10000, "km")
    due = compute_due_state([iv], base_date=None, base_odometer=50000, base_hours=None,
                             ref_date=date(2026, 1, 1), ref_odometer=59200)
    assert due.next_due_distance == 60000


def test_distance_trigger_miles_converted_to_km():
    iv = Interval("distance", 100, "mi")  # 160.9344 km
    due = compute_due_state([iv], base_date=None, base_odometer=0, base_hours=None,
                             ref_date=date(2026, 1, 1), ref_odometer=0)
    assert round(due.next_due_distance, 4) == 160.9344


def test_engine_hours_trigger_due_point():
    iv = Interval("engine_hours", 500, "hours")
    due = compute_due_state([iv], base_date=None, base_odometer=None, base_hours=1000,
                             ref_date=date(2026, 1, 1), ref_hours=1100)
    assert due.next_due_hours == 1500


def test_zero_intervals_never_due():
    due = compute_due_state([], base_date=date(2020, 1, 1), base_odometer=0, base_hours=0,
                             ref_date=date(2030, 1, 1), ref_odometer=999999, ref_hours=999999)
    assert due.next_due_date is None
    assert classify_status(due, reminders=[]).status == "awaiting_telematics"


# --- multi-trigger "whichever is met first" (still evaluated across all trigger types — only the
# status/color/reminder layer on top is time-only) ---

def test_dual_trigger_distance_wins_when_further_along():
    time_iv = Interval("time", 6, "months")
    dist_iv = Interval("distance", 10000, "km")
    due = compute_due_state(
        [time_iv, dist_iv], base_date=date(2026, 1, 1), base_odometer=0, base_hours=None,
        ref_date=date(2026, 1, 15), ref_odometer=10500,
    )
    assert due.effective_trigger_type == "distance"


def test_dual_trigger_time_wins_when_further_along():
    time_iv = Interval("time", 1, "months")   # 30 days
    dist_iv = Interval("distance", 100000, "km")  # huge, barely touched
    due = compute_due_state(
        [time_iv, dist_iv], base_date=date(2026, 1, 1), base_odometer=0, base_hours=None,
        ref_date=date(2026, 1, 31), ref_odometer=500,
    )
    assert due.effective_trigger_type == "time"


def test_triple_trigger_engine_hours_wins():
    time_iv = Interval("time", 6, "months")
    dist_iv = Interval("distance", 10000, "km")
    hrs_iv = Interval("engine_hours", 500, "hours")
    due = compute_due_state(
        [time_iv, dist_iv, hrs_iv],
        base_date=date(2026, 1, 1), base_odometer=0, base_hours=0,
        ref_date=date(2026, 1, 5), ref_odometer=100, ref_hours=480,
    )
    assert due.effective_trigger_type == "engine_hours"


# --- Feature 6: automatic reset on completion, independent per trigger ---

def test_reset_rebase_every_trigger_off_same_completion_event():
    time_iv = Interval("time", 6, "months")
    dist_iv = Interval("distance", 10000, "km")
    due = reset_schedule_on_completion(
        [time_iv, dist_iv], completion_date=date(2026, 3, 1),
        completion_odometer=55000, completion_hours=None,
    )
    assert due.next_due_date == date(2026, 8, 28)  # 55000km +180 days from Mar 1
    assert due.next_due_distance == 65000


def test_reset_matches_spec_worked_example():
    # "Service Interval: 10,000 km. Completed at: 55,000 km. Next Due (auto-generated): 65,000 km."
    iv = Interval("distance", 10000, "km")
    due = reset_schedule_on_completion([iv], completion_date=date(2026, 1, 1),
                                        completion_odometer=55000, completion_hours=None)
    assert due.next_due_distance == 65000


def test_reset_engine_hours_independent_of_distance():
    dist_iv = Interval("distance", 10000, "km")
    hrs_iv = Interval("engine_hours", 500, "hours")
    due = reset_schedule_on_completion(
        [dist_iv, hrs_iv], completion_date=date(2026, 1, 1),
        completion_odometer=20000, completion_hours=1200,
    )
    assert due.next_due_distance == 30000
    assert due.next_due_hours == 1700


# --- remaining-days / red-flag status model (time trigger only) ---

def test_status_on_track_far_from_due():
    iv = Interval("time", 6, "months")
    due = compute_due_state([iv], base_date=date(2026, 1, 1), base_odometer=None, base_hours=None,
                             ref_date=date(2026, 2, 1))
    s = classify_status(due, reminders=[])
    assert s.status == "on_track"
    assert s.remaining_days == 149


def test_status_due_soon_within_default_window():
    iv = Interval("time", 1, "months")
    due = compute_due_state([iv], base_date=date(2026, 1, 1), base_odometer=None, base_hours=None,
                             ref_date=date(2026, 1, 20))  # due Jan 31 -> 11 days remaining
    s = classify_status(due, reminders=[])
    assert s.status == "due_soon"  # <= default 14-day window
    assert s.remaining_days == 11


def test_status_due_soon_within_configured_reminder_window():
    iv = Interval("time", 6, "months")
    due = compute_due_state([iv], base_date=date(2026, 1, 1), base_odometer=None, base_hours=None,
                             ref_date=date(2026, 6, 20))  # 10 days remaining
    s = classify_status(due, reminders=[("time", 30), ("time", 7)])
    assert s.status == "due_soon"  # inside the 30-day window even though > 7-day threshold


def test_status_overdue_flags_positive_days_over():
    iv = Interval("time", 1, "months")
    due = compute_due_state([iv], base_date=date(2026, 1, 1), base_odometer=None, base_hours=None,
                             ref_date=date(2026, 2, 5))  # 5 days past the 30-day due point
    s = classify_status(due, reminders=[])
    assert s.status == "overdue"
    assert s.remaining_days == -5   # UI renders this as "+5 days overdue"


def test_status_awaiting_telematics_when_only_distance_configured():
    iv = Interval("distance", 10000, "km")
    due = compute_due_state([iv], base_date=None, base_odometer=50000, base_hours=None,
                             ref_date=date(2026, 1, 1), ref_odometer=59999)  # 99.99% consumed
    s = classify_status(due, reminders=[])
    assert s.status == "awaiting_telematics"
    assert s.remaining_days is None


def test_status_ignores_effective_trigger_when_distance_is_further_along():
    # Distance is essentially at its due point, but time (the only trigger allowed to drive color)
    # is nowhere close — status must stay on_track, not inherit distance's urgency.
    time_iv = Interval("time", 6, "months")
    dist_iv = Interval("distance", 10000, "km")
    due = compute_due_state(
        [time_iv, dist_iv], base_date=date(2026, 1, 1), base_odometer=0, base_hours=None,
        ref_date=date(2026, 1, 10), ref_odometer=9999,
    )
    assert due.effective_trigger_type == "distance"
    s = classify_status(due, reminders=[])
    assert s.status == "on_track"


# --- Feature 3: reminders (time trigger only) ---

def test_time_reminder_fires_when_within_threshold():
    iv = Interval("time", 1, "months")
    due = compute_due_state([iv], base_date=date(2026, 1, 1), base_odometer=None, base_hours=None,
                             ref_date=date(2026, 1, 25))  # 5 days remaining
    fired = reminders_to_fire([iv], reminders=[("time", 7), ("time", 30)], due=due, already_fired=[])
    assert set(fired) == {("time", 7), ("time", 30)}


def test_reminder_does_not_refire_already_sent():
    iv = Interval("time", 1, "months")
    due = compute_due_state([iv], base_date=date(2026, 1, 1), base_odometer=None, base_hours=None,
                             ref_date=date(2026, 1, 25))
    fired = reminders_to_fire([iv], reminders=[("time", 7), ("time", 30)], due=due,
                               already_fired=[("time", 30)])
    assert fired == [("time", 7)]


def test_distance_and_engine_hours_reminders_stay_dormant():
    iv = Interval("distance", 10000, "km")
    due = compute_due_state([iv], base_date=None, base_odometer=0, base_hours=None,
                             ref_date=date(2026, 1, 1), ref_odometer=9999)
    fired = reminders_to_fire([iv], reminders=[("distance", 500)], due=due, already_fired=[])
    assert fired == []


# --- guard rails ---

def test_missing_odometer_raises_for_distance_trigger():
    iv = Interval("distance", 10000, "km")
    try:
        compute_trigger_state(iv, base_date=None, base_odometer=None, base_hours=None,
                               ref_date=date(2026, 1, 1), ref_odometer=None, ref_hours=None)
        assert False, "expected ValueError"
    except ValueError:
        pass
