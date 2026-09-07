"""
health.py — Health Check & System Status Endpoint
"""

from __future__ import annotations

import time
import torch
from fastapi import APIRouter

from app.dependencies import Tier2EngineDep
from app.schemas.system import HealthResponse

router = APIRouter()


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service Health Check",
    description="Returns current operational status, GPU availability, and server timestamp.",
)
async def health(tier2: Tier2EngineDep) -> HealthResponse:
    return HealthResponse(
        status="ok",
        version="0.1.0",
        service="Tensa Voice Integrity Engine",
        timestamp=int(time.time()),
        cuda_available=torch.cuda.is_available(),
        device=tier2.device,
    )
