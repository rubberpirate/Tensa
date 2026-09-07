"""
system.py — Pydantic Schemas for Health, Telemetry & Configuration Endpoints
"""

from __future__ import annotations

from typing import Dict, List
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Payload returned by /v1/health."""
    status: str = Field("ok", description="Service health status")
    version: str = Field("0.1.0", description="API version")
    service: str = Field("Tensa Voice Integrity Engine", description="Service identifier")
    timestamp: int = Field(..., description="Current UNIX epoch timestamp (seconds)")
    cuda_available: bool = Field(False, description="Whether CUDA GPU acceleration is active")
    device: str = Field("cpu", description="Primary inference device")


class RiskThresholdsConfig(BaseModel):
    green_max: float
    amber_max: float


class LatencyBudgetsConfig(BaseModel):
    tier1_dsp: int
    tier2_neural: int
    total: int


class ConfigResponse(BaseModel):
    """Payload returned by /v1/config."""
    risk_thresholds: RiskThresholdsConfig
    window_ms: int
    hop_ms: int
    sample_rate: int
    bayesian_decay_lambda: float
    latency_budgets_ms: LatencyBudgetsConfig
