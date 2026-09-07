"""
config.py — Tensa Backend Configuration

All thresholds, latency budgets, and DPDP compliance settings
are centralised here for easy tuning.
"""

from __future__ import annotations
from pydantic_settings import BaseSettings
from pydantic import Field


class TensaConfig(BaseSettings):
    # ── Risk thresholds ──────────────────────────────────────────────
    risk_green_max: float = Field(0.35, description="Below this → GREEN (call normal)")
    risk_amber_max: float = Field(0.70, description="Below this → AMBER (agent prompt)")
    # Above risk_amber_max → RED (hard lock + step-up MFA)

    # ── Bayesian filter ──────────────────────────────────────────────
    bayesian_decay_lambda: float = Field(0.90, description="Temporal evidence decay factor")
    bayesian_initial_log_odds: float = Field(0.0, description="Start at 50/50 prior")

    # ── Tier-1 gate thresholds (DSP fast path) ────────────────────────
    tier1_skip_threshold: float = Field(0.20, description="S_fast < this → skip Tier-2 entirely")
    tier1_priority_threshold: float = Field(0.45, description="S_fast > this → priority Tier-2")

    # ── Audio / streaming ────────────────────────────────────────────
    sample_rate: int = Field(16_000, description="Target sample rate (Hz)")
    window_ms: int = Field(1000, description="Neural inference window in ms (1.0s = 100 tokens)")
    hop_ms: int = Field(250, description="Streaming hop size in ms")
    vad_energy_threshold: float = Field(0.015, description="RMS energy gate for VAD")

    # ── Ring buffer / DPDP ───────────────────────────────────────────
    ring_buffer_max_seconds: float = Field(3.0, description="Max volatile RAM retention (seconds)")

    # ── Contextual risk boosters ──────────────────────────────────────
    context_high_value_threshold_inr: float = Field(100_000.0, description="₹1 Lakh threshold")
    context_very_high_value_threshold_inr: float = Field(1_000_000.0, description="₹10 Lakh threshold")
    context_booster_unregistered_voip: float = Field(0.15)
    context_booster_off_hours: float = Field(0.10)
    context_booster_financial_keyword: float = Field(0.20)
    context_booster_high_value: float = Field(0.10)
    context_booster_very_high_value: float = Field(0.20)

    # ── Latency budgets (ms) ──────────────────────────────────────────
    budget_total_ms: int = Field(400)
    budget_tier1_ms: int = Field(40)
    budget_tier2_ms: int = Field(160)

    # ── Server ────────────────────────────────────────────────────────
    host: str = Field("0.0.0.0")
    port: int = Field(8000)
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173", "http://localhost:3000"])

    @property
    def hop_seconds(self) -> float:
        return self.hop_ms / 1000.0

    @property
    def window_seconds(self) -> float:
        return self.window_ms / 1000.0

    model_config = {"env_prefix": "TENSA_"}


# Module-level singleton
settings = TensaConfig()
