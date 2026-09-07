"""
config.py — Runtime Configuration & Latency Budgets Endpoint
"""

from __future__ import annotations

from fastapi import APIRouter

from app.dependencies import SettingsDep
from app.schemas.system import ConfigResponse, LatencyBudgetsConfig, RiskThresholdsConfig

router = APIRouter()


@router.get(
    "/config",
    response_model=ConfigResponse,
    summary="Get Configuration & Thresholds",
    description="Returns risk thresholds, sliding window parameters, and latency budgets.",
)
async def get_config(settings: SettingsDep) -> ConfigResponse:
    return ConfigResponse(
        risk_thresholds=RiskThresholdsConfig(
            green_max=settings.risk_green_max,
            amber_max=settings.risk_amber_max,
        ),
        window_ms=settings.window_ms,
        hop_ms=settings.hop_ms,
        sample_rate=settings.sample_rate,
        bayesian_decay_lambda=settings.bayesian_decay_lambda,
        latency_budgets_ms=LatencyBudgetsConfig(
            tier1_dsp=settings.budget_tier1_ms,
            tier2_neural=settings.budget_tier2_ms,
            total=settings.budget_total_ms,
        ),
    )
