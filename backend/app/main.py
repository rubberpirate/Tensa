"""
main.py — Tensa FastAPI Application Entry Point
"""

from __future__ import annotations

import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.endpoints.stream import stream_audio_ws
from app.api.v1.router import api_v1_router
from app.core.config import settings
from app.core.exceptions import TensaException, tensa_exception_handler
from app.core.lifespan import lifespan


def create_app() -> FastAPI:
    """Factory function to build and configure the FastAPI application."""
    application = FastAPI(
        title="Tensa Voice Integrity API",
        description="Real-Time AI-Powered Voice Cloning Detection Engine — SIH 2026",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # ── Middleware ───────────────────────────────────────────────────
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.middleware("http")
    async def add_process_time_header(request: Request, call_next):
        start_time = time.perf_counter()
        response = await call_next(request)
        process_time_ms = (time.perf_counter() - start_time) * 1000.0
        response.headers["X-Process-Time"] = f"{process_time_ms:.2f}ms"
        return response

    # ── Exception Handlers ───────────────────────────────────────────
    application.add_exception_handler(TensaException, tensa_exception_handler)

    # ── Routers ──────────────────────────────────────────────────────
    application.include_router(api_v1_router)

    # Backward-compatibility alias for legacy WebSocket route
    application.add_api_websocket_route("/api/v1/stream", stream_audio_ws)

    # ── Root System Info ─────────────────────────────────────────────
    @application.get("/", tags=["System"], summary="Root Information")
    async def root():
        return {
            "service": "Tensa Voice Integrity Engine",
            "version": "0.1.0",
            "docs": "/docs",
            "websocket": "/v1/stream/detect",
        }

    return application


# Global FastAPI application instance
app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        log_level="info",
    )
