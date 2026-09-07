"""
risk_engine.py — Dynamic Composite Risk Calculator

Merges Bayesian acoustic evidence with contextual telemetry:
  R(t) = clip(bayesian_risk_score + C_context, 0.0, 1.0)

Dispatches enforcement actions based on final R(t):
  GREEN  (< 0.35): Normal call flow
  AMBER  (0.35 – 0.70): In-call agent whisper / banner
  RED    (> 0.70): Hard transaction lock + step-up MFA
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

from app.core.config import settings
from app.risk.bayesian_filter import BayesianTemporalFilter, BayesianUpdate
from app.risk.contextual import CallContext, ContextBoosterResult, compute_context_boost


# ---------------------------------------------------------------------------
# Output schemas
# ---------------------------------------------------------------------------

@dataclass
class MetricsBreakdown:
    """Sub-scores surfaced to the dashboard explainability radar chart."""
    s_fast: float = 0.0                    # Tier-1 DSP composite (bicoherence, phase, jitter)
    phase_inconsistency: float = 0.0
    bicoherence_deficit: float = 0.0
    pitch_jitter_anomaly: float = 0.0
    respiration_cadence_score: float = 0.0
    spectral_rolloff_anomaly: float = 0.0
    s_deep: Optional[float] = None         # Tier-2 neural model score (None before first inference)
    context_boost: float = 0.0


@dataclass
class RiskEvent:
    """Full risk update event broadcast to WebSocket clients every 250ms."""
    call_id: str
    timestamp_ms: int                      # ms since call start
    composite_risk_score: float            # ∈ [0.0, 1.0]
    threat_level: str                      # GREEN | AMBER | RED
    action_recommended: str                # NORMAL | ALERT_AGENT | LOCK_TRANSACTION_ESCALATE_MFA
    metrics_breakdown: MetricsBreakdown
    context_reasons: list[str] = field(default_factory=list)
    bayesian_log_odds: float = 0.0
    bayesian_window_count: int = 0


ACTION_MAP = {
    "GREEN": "NORMAL",
    "AMBER": "ALERT_AGENT_REVERIFY",
    "RED": "LOCK_TRANSACTION_ESCALATE_MFA",
}


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

class RiskEngine:
    """
    Orchestrates Bayesian filter + contextual booster into final risk events.
    One instance per live call session.
    """

    def __init__(self, call_id: str, context: Optional[CallContext] = None):
        self.call_id = call_id
        self._context = context or CallContext(call_id=call_id)
        self._filter = BayesianTemporalFilter()
        self._filter.reset()
        self._metrics = MetricsBreakdown()
        self._context_boost_result: Optional[ContextBoosterResult] = None
        self._call_start = time.time()

    # ------------------------------------------------------------------
    # Update from Tier-1 DSP (every 250ms, on CPU thread)
    # ------------------------------------------------------------------

    def update_tier1(
        self,
        s_fast: float,
        phase_inconsistency: float = 0.0,
        bicoherence_deficit: float = 0.0,
        pitch_jitter_anomaly: float = 0.0,
        respiration_cadence_score: float = 0.0,
        spectral_rolloff_anomaly: float = 0.0,
    ) -> RiskEvent:
        """Process Tier-1 DSP scores and return a fresh risk event."""
        # Update stored sub-metrics (used in explainability radar)
        self._metrics.s_fast = s_fast
        self._metrics.phase_inconsistency = phase_inconsistency
        self._metrics.bicoherence_deficit = bicoherence_deficit
        self._metrics.pitch_jitter_anomaly = pitch_jitter_anomaly
        self._metrics.respiration_cadence_score = respiration_cadence_score
        self._metrics.spectral_rolloff_anomaly = spectral_rolloff_anomaly

        bayesian_update = self._filter.update_tier1(s_fast)
        return self._build_event(bayesian_update)

    # ------------------------------------------------------------------
    # Update from Tier-2 Neural (async, every ~1000ms, on GPU thread)
    # ------------------------------------------------------------------

    def update_tier2(self, s_deep: float) -> RiskEvent:
        """Process Tier-2 neural score and return a fresh risk event."""
        self._metrics.s_deep = s_deep
        bayesian_update = self._filter.update_tier2(s_deep)
        return self._build_event(bayesian_update)

    # ------------------------------------------------------------------
    # Build output event
    # ------------------------------------------------------------------

    def _build_event(self, bayesian_update: BayesianUpdate) -> RiskEvent:
        # Compute context boost (cached after first call)
        if self._context_boost_result is None:
            self._context_boost_result = compute_context_boost(self._context)
        boost_result = self._context_boost_result

        # Final composite risk = Bayesian acoustic risk + context boost
        composite = min(bayesian_update.risk_score + boost_result.total_boost, 1.0)
        self._metrics.context_boost = boost_result.total_boost

        # Classify composite (not just bayesian) for threat level
        if composite < settings.risk_green_max:
            threat_level = "GREEN"
        elif composite < settings.risk_amber_max:
            threat_level = "AMBER"
        else:
            threat_level = "RED"

        state = self._filter.state
        return RiskEvent(
            call_id=self.call_id,
            timestamp_ms=bayesian_update.timestamp_ms,
            composite_risk_score=round(composite, 4),
            threat_level=threat_level,
            action_recommended=ACTION_MAP[threat_level],
            metrics_breakdown=MetricsBreakdown(**vars(self._metrics)),
            context_reasons=boost_result.reasons,
            bayesian_log_odds=round(bayesian_update.log_odds, 4),
            bayesian_window_count=state.window_count,
        )

    @property
    def current_risk(self) -> float:
        return self._filter.risk_score

    @property
    def threat_level(self) -> str:
        return self._filter.threat_level

    def current_event(self) -> RiskEvent:
        """Returns current risk snapshot without modifying filter state."""
        if self._context_boost_result is None:
            self._context_boost_result = compute_context_boost(self._context)
        boost_result = self._context_boost_result

        state = self._filter.state
        composite = min(state.risk_score + boost_result.total_boost, 1.0)

        if composite < settings.risk_green_max:
            threat_level = "GREEN"
        elif composite < settings.risk_amber_max:
            threat_level = "AMBER"
        else:
            threat_level = "RED"

        return RiskEvent(
            call_id=self.call_id,
            timestamp_ms=int((time.time() - self._call_start) * 1000),
            composite_risk_score=round(composite, 4),
            threat_level=threat_level,
            action_recommended=ACTION_MAP[threat_level],
            metrics_breakdown=MetricsBreakdown(**vars(self._metrics)),
            context_reasons=boost_result.reasons,
            bayesian_log_odds=round(state.log_odds, 4),
            bayesian_window_count=state.window_count,
        )
