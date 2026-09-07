"""
endpoints — API route handlers for health, config, detection, and streaming
"""

from app.api.v1.endpoints.config import router as config_router
from app.api.v1.endpoints.detection import router as detection_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.stream import router as stream_router

__all__ = [
    "config_router",
    "detection_router",
    "health_router",
    "stream_router",
]
