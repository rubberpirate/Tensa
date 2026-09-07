"""
main.py — Tensa FastAPI Application Entry Point
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.endpoints import router as api_router
from app.api.websocket import stream_audio_ws
from app.models.tier2_engine import get_tier2_engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: pre-load the Tier-2 neural model into GPU memory.
    Shutdown: clean up executor threads.
    """
    print("[Tensa] Starting up — warming GPU model...", flush=True)
    tier2 = get_tier2_engine()
    asyncio.create_task(tier2.load())  # non-blocking warm-up
    yield
    print("[Tensa] Shutting down.", flush=True)


app = FastAPI(
    title="Tensa Voice Integrity API",
    description="Real-Time AI-Powered Voice Cloning Detection Engine — SIH 2026",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow frontend dev server and production origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST routes
app.include_router(api_router)

# WebSocket routes
app.add_api_websocket_route("/v1/stream/detect", stream_audio_ws)
app.add_api_websocket_route("/api/v1/stream", stream_audio_ws)


@app.get("/")
async def root():
    return {
        "service": "Tensa Voice Integrity Engine",
        "version": "0.1.0",
        "docs": "/docs",
        "websocket": "wss://<host>/v1/stream/detect",
    }
