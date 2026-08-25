"""Pure, DB-free calculation engine for the maintenance scheduling module.

Deliberately has zero dependency on FastAPI/asyncpg/the request cycle so it can be unit tested
directly (see tests/test_maintenance_scheduling.py) without spinning up the live API the rest of
backend/tests/ hits. server.py calls into this module and does the I/O (reading schedule_intervals,
writing schedule_due_state) around it.

Remaining/overdue display: rather than bucketing into "Due This Week / This Month" labels, each
trigger reports a signed `remaining` in its own native unit — positive = still ahead, negative =
past due by that amount. The UI shows "N days remaining" / "+N days overdue" for a time trigger.
Distance/engine-hours triggers report the same signed `remaining` in km/hours, but per product
decision those two trigger types stay dormant for status/color purposes until a telematics feed
supplies live odometer/engine-hour readings — today those meters only get manual/inspection-time
updates, too infrequent for a trustworthy "km remaining" countdown. `classify_status()` below only
ever classifies off a `time` trigger for that reason; see its docstring.
"""
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Literal, Optional

TriggerType = Literal["time", "distance", "engine_hours"]

MI_TO_KM = 1.609344

TIME_UNIT_DAYS = {"days": 1, "weeks": 7, "months": 30, "years": 365}


def _time_unit_to_days(every_n: float, unit: str) -> float:
    if unit not in TIME_UNIT_DAYS:
        raise ValueError(f"Unknown time unit: {unit}")
    return every_n * TIME_UNIT_DAYS[unit]


def _distance_to_km(value: float, unit: str) -> float:
    if unit == "km":
        return value
    if unit == "mi":
        return value * MI_TO_KM
    raise ValueError(f"Unknown distance unit: {unit}")


@dataclass
class Interval:
    trigger_type: TriggerType
    every_n: float
    unit: str


@dataclass
class TriggerState:
    """Where one trigger on a schedule stands for one asset right now."""
    trigger_type: TriggerType
    fraction_consumed: float           # 0.0 = just serviced, 1.0+ = overdue
    next_due_date: Optional[date] = None
    next_due_distance: Optional[float] = None   # km
    next_due_hours: Optional[float] = None
    remaining: Optional[float] = None  # in the trigger's own unit, for reminder comparisons


@dataclass
class DueState:
    triggers: list
    effective_trigger_type: TriggerType    # whichever trigger is furthest along — Feature 2's raw
                                            # "whichever is met first" result, independent of whether
                                            # it's currently allowed to drive status color (see below)
    next_due_date: Optional[date]
    next_due_distance: Optional[float]
    next_due_hours: Optional[float]


@dataclass
class ScheduleStatus:
    status: Literal["overdue", "due_soon", "on_track", "awaiting_telematics"]
    remaining_days: Optional[int]   # signed: positive = days remaining, negative = days overdue


DEFAULT_TIME_DUE_SOON_DAYS = 14


def classify_status(due: DueState, reminders: list) -> ScheduleStatus:
    """Red/Amber/Green classification — time-trigger only. Distance and engine-hours triggers stay
    dormant here by product decision: today's odometer/engine-hour readings are manual or
    inspection-time snapshots, not a live feed, so a "N km remaining" countdown isn't trustworthy
    enough to color-code until a telematics integration supplies continuous readings. A schedule
    with no time trigger configured (distance/engine-hours only) reports "awaiting_telematics"
    rather than a misleading green/on-track. `reminders` is a list of (trigger_type, threshold_n);
    only "time" entries matter here — amber starts at the largest configured time threshold, or a
    14-day default when the schedule has no time reminders configured."""
    time_state = next((s for s in due.triggers if s.trigger_type == "time"), None)
    if time_state is None or time_state.remaining is None:
        return ScheduleStatus("awaiting_telematics", None)
    remaining_days = round(time_state.remaining)
    if remaining_days <= 0:
        return ScheduleStatus("overdue", remaining_days)
    thresholds = [n for (tt, n) in reminders if tt == "time"]
    due_soon_window = max(thresholds) if thresholds else DEFAULT_TIME_DUE_SOON_DAYS
    if remaining_days <= due_soon_window:
        return ScheduleStatus("due_soon", remaining_days)
    return ScheduleStatus("on_track", remaining_days)


def compute_trigger_state(
    interval: Interval,
    base_date: Optional[date],
    base_odometer: Optional[float],
    base_hours: Optional[float],
    ref_date: date,
    ref_odometer: Optional[float],
    ref_hours: Optional[float],
) -> TriggerState:
    """base_* is the reading at the last completion (or schedule creation, if never completed);
    ref_* is the current point in time/odometer/hours to evaluate against."""
    # asyncpg decodes Postgres `numeric` columns as decimal.Decimal, not float — callers reading
    # base_odometer/base_hours/ref_odometer/ref_hours straight out of a DB row (schedule_due_state,
    # vehicles.odometer, etc.) pass Decimals through here untouched. Normalize once, centrally,
    # rather than requiring every call site in server.py to remember to cast.
    base_odometer = float(base_odometer) if base_odometer is not None else None
    base_hours = float(base_hours) if base_hours is not None else None
    ref_odometer = float(ref_odometer) if ref_odometer is not None else None
    ref_hours = float(ref_hours) if ref_hours is not None else None
    if interval.trigger_type == "time":
        if base_date is None:
            raise ValueError("time trigger requires a base_date")
        period_days = _time_unit_to_days(interval.every_n, interval.unit)
        due = base_date + timedelta(days=period_days)
        elapsed = (ref_date - base_date).days
        fraction = elapsed / period_days if period_days else 1.0
        return TriggerState("time", fraction, next_due_date=due, remaining=(due - ref_date).days)

    if interval.trigger_type == "distance":
        if base_odometer is None or ref_odometer is None:
            raise ValueError("distance trigger requires base_odometer and ref_odometer")
        every_km = _distance_to_km(interval.every_n, interval.unit)
        due_km = base_odometer + every_km
        traveled = ref_odometer - base_odometer
        fraction = traveled / every_km if every_km else 1.0
        return TriggerState("distance", fraction, next_due_distance=due_km, remaining=due_km - ref_odometer)

    if interval.trigger_type == "engine_hours":
        if base_hours is None or ref_hours is None:
            raise ValueError("engine_hours trigger requires base_hours and ref_hours")
        due_hours = base_hours + interval.every_n
        accrued = ref_hours - base_hours
        fraction = accrued / interval.every_n if interval.every_n else 1.0
        return TriggerState("engine_hours", fraction, next_due_hours=due_hours, remaining=due_hours - ref_hours)

    raise ValueError(f"Unknown trigger type: {interval.trigger_type}")


def compute_due_state(
    intervals: list,
    base_date: Optional[date],
    base_odometer: Optional[float],
    base_hours: Optional[float],
    ref_date: date,
    ref_odometer: Optional[float] = None,
    ref_hours: Optional[float] = None,
) -> DueState:
    """Evaluates every configured trigger and surfaces whichever is furthest along (closest to /
    past due) as the effective one — the "whichever is met first" rule from Feature 2. A schedule
    with zero intervals is treated as never due (fraction 0) rather than erroring, since a schedule
    can legitimately be saved before its first interval is added."""
    if not intervals:
        return DueState([], "time", None, None, None)

    states = [
        compute_trigger_state(iv, base_date, base_odometer, base_hours, ref_date, ref_odometer, ref_hours)
        for iv in intervals
    ]
    effective = max(states, key=lambda s: s.fraction_consumed)
    # Every trigger resets independently (Feature 6) and schedule_due_state stores all three next-due
    # columns on one row, so surface each trigger's own due point here rather than only the effective
    # one — a caller that reads due.next_due_distance must see it even when time is what's overdue.
    return DueState(
        triggers=states,
        effective_trigger_type=effective.trigger_type,
        next_due_date=next((s.next_due_date for s in states if s.next_due_date is not None), None),
        next_due_distance=next((s.next_due_distance for s in states if s.next_due_distance is not None), None),
        next_due_hours=next((s.next_due_hours for s in states if s.next_due_hours is not None), None),
    )


def reset_schedule_on_completion(
    intervals: list,
    completion_date: date,
    completion_odometer: Optional[float],
    completion_hours: Optional[float],
) -> DueState:
    """Feature 6's automatic reset: every trigger on the schedule re-bases off the SAME completion
    event, independently, per the spec ("each trigger's next-due point resets independently off the
    same completion event"). This is just compute_due_state with ref == base (fraction 0 for every
    trigger right after completion) — expressed as its own function since callers shouldn't have to
    know that equivalence."""
    return compute_due_state(
        intervals,
        base_date=completion_date, base_odometer=completion_odometer, base_hours=completion_hours,
        ref_date=completion_date, ref_odometer=completion_odometer, ref_hours=completion_hours,
    )


def reminders_to_fire(
    intervals: list,
    reminders: list,   # list of (trigger_type, threshold_n)
    due: DueState,
    already_fired: list,   # list of (trigger_type, threshold_n) already sent for this due cycle
) -> list:
    """Returns the (trigger_type, threshold_n) reminders that have newly crossed their threshold and
    haven't fired yet this cycle. Time-trigger only, for the same reason classify_status() is
    time-only — distance/engine-hours reminders can be configured (schema-ready for when telematics
    lands) but won't actually fire until then."""
    already = set(already_fired)
    time_state = next((s for s in due.triggers if s.trigger_type == "time"), None)
    if time_state is None or time_state.remaining is None:
        return []
    fired = []
    for trigger_type, threshold_n in reminders:
        if trigger_type != "time":
            continue
        if (trigger_type, threshold_n) in already:
            continue
        if time_state.remaining <= threshold_n:
            fired.append((trigger_type, threshold_n))
    return fired
