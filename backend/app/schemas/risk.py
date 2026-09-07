"""
risk.py — Pydantic Schemas for Threat & Risk Telemetry
"""

from __future__ import annotations

from enum import Enum
from typing import Literal, Optional
from pydantic import BaseModel, Field


class ThreatLevel(str, Enum):
    GREEN = "GREEN"
    AMBER = "AMBER"
    RED = "RED"


class ActionRecommended(str, Enum):
    NORMAL = "NORMAL"
    ALERT_AGENT_REVERIFY = "ALERT_AGENT_REVERIFY"
    LOCK_TRANSACTION_ESCALATE_MFA = "LOCK_TRANSACTION_ESCALATE_MFA"


class MetricsBreakdown(BaseModel):
    """Fine-grained sub-scores surfaced to explainability radar / gauge."""
    s_fast: float = Field(0.0, description="Tier-1 DSP composite score [0, 1]")
    phase_inconsistency: float = Field(0.0, description="Instantaneous phase variance [0, 1]")
    bicoherence_deficit: float = Field(0.0, description="Higher-order spectral bicoherence deficit [0, 1]")
    pitch_jitter_anomaly: float = Field(0.0, description="Micro-pitch jitter/shimmer anomaly [0, 1]")
    respiration_cadence_score: float = Field(0.0, description="Respiration/inhalation cadence score [0, 1]")
    spectral_rolloff_anomaly: float = Field(0.0, description="High-frequency spectral rolloff anomaly [0, 1]")
    s_deep: Optional[float] = Field(None, description="Tier-2 Wav2Vec2 neural inference score [0, 1]")
    context_boost: float = Field(0.0, description="Contextual telemetry risk booster [0, 1]")


class RiskEventData(BaseModel):
    """Payload data for risk updates."""
    call_id: str
    timestamp_ms: int = Field(..., description="Timestamp in ms since session inception")
    composite_risk_score: float = Field(..., description="Composite risk score [0, 1]")
    threat_level: ThreatLevel
    action_recommended: str
    metrics_breakdown: MetricsBreakdown
    context_reasons: list[str] = Field(default_factory=list)
    bayesian_log_odds: float = Field(0.0, description="Cumulative Bayesian log-likelihood ratio")
    window_count: int = Field(0, description="Total sliding audio windows evaluated")
    tier1_latency_ms: float = Field(0.0, description="Latest Tier-1 CPU DSP processing latency (ms)")
    tier2_latency_ms: Optional[float] = Field(None, description="Latest Tier-2 GPU neural latency (ms)")


class RiskUpdateEvent(BaseModel):
    """WebSocket risk update envelope broadcast to clients."""
    event: Literal["risk_update"] = "risk_update"
    data: RiskEventData
