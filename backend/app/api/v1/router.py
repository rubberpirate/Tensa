"""
router.py — Consolidated v1 API Router
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints.config import router as config_router
from app.api.v1.endpoints.detection import router as detection_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.stream import router as stream_router

api_v1_router = APIRouter(prefix="/v1")

# Mount route modules
api_v1_router.include_router(health_router, tags=["System"])
api_v1_router.include_router(config_router, tags=["Configuration"])
api_v1_router.include_router(detection_router, tags=["Detection"])
api_v1_router.include_router(stream_router, tags=["Streaming"])
