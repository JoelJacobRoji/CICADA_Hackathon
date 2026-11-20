"""Robust rolling baselines per (tenant, source, metric): median/MAD z-score + trend slope."""

from __future__ import annotations

import statistics
from collections import deque
from dataclasses import dataclass
from datetime import datetime

from .config import AiopsConfig

Z_K = 0.6745  # makes MAD consistent with sigma for normal data


@dataclass(frozen=True)
class Score:
    value: float
    history_n: int
    learning: bool  # fewer than min_history windows: no anomaly verdict possible
    median: float | None
    mad: float | None  # raw MAD (before floor)
    mad_used: float | None  # max(MAD, floor)
    z: float | None
    anomalous: bool  # |z| >= threshold in THIS window
    consecutive: int  # consecutive anomalous windows (same direction), incl. this one
    direction: str | None  # "up" | "down"
    trend_rise: float | None  # fitted rise over the trend span (units of the metric)
    rising: bool
    rising_consecutive: int


def mad(values: list[float], med: float) -> float:
    return statistics.median(abs(v - med) for v in values)


def slope(ys: list[float]) -> float:
    n = len(ys)
    xm = (n - 1) / 2
    ym = sum(ys) / n
    den = sum((i - xm) ** 2 for i in range(n))
    return sum((i - xm) * (y - ym) for i, y in enumerate(ys)) / den if den else 0.0


class _Series:
    __slots__ = ("hist", "last_end", "streak", "streak_dir", "rise_streak")

    def __init__(self, maxlen: int):
        self.hist: deque[float] = deque(maxlen=maxlen)
        self.last_end: datetime | None = None
        self.streak = 0
        self.streak_dir: str | None = None
        self.rise_streak = 0


class Baselines:
    def __init__(self, cfg: AiopsConfig):
        self.cfg = cfg
        self.series: dict[tuple, _Series] = {}

    def seed(self, key: tuple, values: list[float], last_end: datetime | None) -> None:
        """Warm start from persisted history (no scoring)."""
        s = self.series.setdefault(key, _Series(self.cfg.history_windows))
        s.hist.extend(values[-self.cfg.history_windows :])
        s.last_end = last_end

    def update(self, key: tuple, metric: str, window_end: datetime, value: float) -> Score | None:
        """Score `value` against the history BEFORE it, then add it. Late/out-of-order -> None."""
        cfg = self.cfg
        s = self.series.setdefault(key, _Series(cfg.history_windows))
        if s.last_end is not None and window_end <= s.last_end:
            return None  # late or duplicate window: never scored, never changes the baseline
        s.last_end = window_end
        hist = list(s.hist)
        n = len(hist)
        med = m = mu = z = None
        anomalous, direction = False, None
        if n >= cfg.min_history:
            med = statistics.median(hist)
            m = mad(hist, med)
            mu = max(m, cfg.mad_floor.get(metric, 0.5))
            z = Z_K * (value - med) / mu
            anomalous = abs(z) >= cfg.z_threshold
            direction = "up" if z > 0 else "down"
        if anomalous and direction == s.streak_dir:
            s.streak += 1
        elif anomalous:
            s.streak, s.streak_dir = 1, direction
        else:
            s.streak, s.streak_dir = 0, None

        rise, rising = None, False
        if metric in cfg.trend_metrics and n + 1 >= cfg.trend_windows and med is not None:
            ys = [*hist[-(cfg.trend_windows - 1) :], value]
            rise = slope(ys) * (cfg.trend_windows - 1)
            rising = rise > cfg.trend_min_relative_rise * max(
                abs(med), cfg.mad_floor.get(metric, 0.5)
            ) and rise >= cfg.trend_min_absolute_rise.get(metric, 0.0)
        s.rise_streak = s.rise_streak + 1 if rising else 0
        s.hist.append(value)
        return Score(
            value,
            n,
            n < cfg.min_history,
            med,
            m,
            mu,
            z,
            anomalous,
            s.streak,
            direction if anomalous else None,
            rise,
            rising,
            s.rise_streak,
        )
