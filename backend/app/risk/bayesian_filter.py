"""
bayesian_filter.py — Sequential Bayesian Log-Likelihood Temporal Filter

Implements incremental evidence accumulation across streaming audio windows:

  L_t = λ * L_{t-1} + ln( P(x_t | Synthetic) / P(x_t | Human) )

where λ ∈ [0.85, 0.95] is a temporal decay factor that:
  • Prevents historical false-alarm "lock-in" from a single noisy frame
  • Allows genuine evidence to rapidly accumulate to a decisive score
  • Automatically de-weights evidence older than ~5-10 seconds

The filter maintains separate update tracks for Tier-1 (DSP, every 250ms)
and Tier-2 (neural, every ~1000ms). Both update the same shared state.
"""

from __future__ import annotations

import math
import threading
import time
from dataclasses import dataclass, field
from typing import Optional

from app.core.config import settings


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

@dataclass
class BayesianState:
    log_odds: float = 0.0          # L_t: current log-likelihood ratio
    risk_score: float = 0.0        # Sigmoid(L_t) → [0.0, 1.0]
    last_tier1_update: float = 0.0 # epoch seconds
    last_tier2_update: float = 0.0
    window_count: int = 0          # total windows processed
    tier1_s_fast: float = 0.0      # latest Tier-1 fast score
    tier2_s_deep: Optional[float] = None  # latest Tier-2 deep score (None until first inference)


@dataclass
class BayesianUpdate:
    """Result of a single Bayesian filter tick."""
    log_odds: float
    risk_score: float         # ∈ [0.0, 1.0]
    threat_level: str         # "GREEN" | "AMBER" | "RED"
    delta: float              # how much risk_score changed this tick
    source: str               # "tier1" | "tier2"
    timestamp_ms: int         # ms since call start


# ---------------------------------------------------------------------------
# Filter
# ---------------------------------------------------------------------------

class BayesianTemporalFilter:
    """
    Thread-safe incremental Bayesian evidence accumulator.

    Usage:
        filt = BayesianTemporalFilter()
        filt.reset()

        # Every 250ms from DSP:
        update = filt.update_tier1(s_fast=0.72)

        # Every ~1000ms from neural model:
        update = filt.update_tier2(s_deep=0.91)
    """

    def __init__(
        self,
        decay_lambda: float = settings.bayesian_decay_lambda,
        green_max: float = settings.risk_green_max,
        amber_max: float = settings.risk_amber_max,
    ):
        self._lambda = decay_lambda
        self._green_max = green_max
        self._amber_max = amber_max
        self._lock = threading.Lock()
        self._state = BayesianState()
        self._call_start_time = time.time()

    def reset(self) -> None:
        """Reset the filter for a new call session."""
        with self._lock:
            self._state = BayesianState()
            self._call_start_time = time.time()

    # ------------------------------------------------------------------
    # Tier-1 update (every 250ms from DSP engine)
    # ------------------------------------------------------------------

    def update_tier1(self, s_fast: float) -> BayesianUpdate:
        """
        Incorporate a Tier-1 DSP fast score s_fast ∈ [0, 1].
        Uses a softer weight multiplier vs Tier-2 (DSP is less precise).
        """
        # Tier-1 likelihood ratio: softer than Tier-2 to avoid false positives
        # We use a dampened LLR: weight 0.4 of full signal
        tier1_weight = 0.4
        return self._update(s_fast, source="tier1", weight=tier1_weight)

    # ------------------------------------------------------------------
    # Tier-2 update (every ~1000ms from neural model)
    # ------------------------------------------------------------------

    def update_tier2(self, s_deep: float) -> BayesianUpdate:
        """
        Incorporate a Tier-2 deep neural score s_deep ∈ [0, 1].
        Uses full weight — neural model evidence is stronger.
        """
        with self._lock:
            self._state.tier2_s_deep = s_deep
            self._state.last_tier2_update = time.time()
        return self._update(s_deep, source="tier2", weight=1.0)

    # ------------------------------------------------------------------
    # Internal update
    # ------------------------------------------------------------------

    def _update(self, score: float, source: str, weight: float) -> BayesianUpdate:
        """
        Apply one Bayesian update step.
        score: probability that this frame is synthetic ∈ [0, 1]
        """
        # Clamp to avoid log(0) or log(inf)
        eps = 1e-6
        score = max(eps, min(1.0 - eps, score))

        # Log-Likelihood Ratio for this window
        llr = math.log(score / (1.0 - score))

        with self._lock:
            prev_risk = self._state.risk_score
            # Bayesian temporal update with decay
            self._state.log_odds = self._lambda * self._state.log_odds + weight * llr
            # Clamp log-odds to prevent numerical overflow (sigmoid saturates)
            self._state.log_odds = max(-10.0, min(10.0, self._state.log_odds))
            # Convert to probability via sigmoid
            self._state.risk_score = 1.0 / (1.0 + math.exp(-self._state.log_odds))
            self._state.window_count += 1

            if source == "tier1":
                self._state.tier1_s_fast = score
                self._state.last_tier1_update = time.time()

            current_risk = self._state.risk_score
            current_log_odds = self._state.log_odds
            window_count = self._state.window_count

        threat_level = self._classify(current_risk)
        timestamp_ms = int((time.time() - self._call_start_time) * 1000)

        return BayesianUpdate(
            log_odds=current_log_odds,
            risk_score=current_risk,
            threat_level=threat_level,
            delta=current_risk - prev_risk,
            source=source,
            timestamp_ms=timestamp_ms,
        )

    def _classify(self, risk: float) -> str:
        if risk < self._green_max:
            return "GREEN"
        elif risk < self._amber_max:
            return "AMBER"
        return "RED"

    @property
    def state(self) -> BayesianState:
        with self._lock:
            return BayesianState(**vars(self._state))

    @property
    def risk_score(self) -> float:
        with self._lock:
            return self._state.risk_score

    @property
    def threat_level(self) -> str:
        return self._classify(self.risk_score)

    def __repr__(self) -> str:
        s = self.state
        return (
            f"BayesianFilter(risk={s.risk_score:.3f}, "
            f"level={self._classify(s.risk_score)}, "
            f"log_odds={s.log_odds:.2f}, "
            f"windows={s.window_count})"
        )
