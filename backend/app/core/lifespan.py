"""
lifespan.py — FastAPI Async Lifespan Management (Startup & Shutdown)
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import settings
from app.models.tier2_engine import get_tier2_engine
from app.services.session_manager import get_session_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application Lifespan:
      • Startup: Asynchronously warm up the Tier-2 neural engine on GPU/CPU.
      • Shutdown: Cancel in-flight tasks, wipe ephemeral buffers (DPDP compliance),
                  and shut down thread pools.
    """
    print(f"[Tensa] Starting up on {settings.host}:{settings.port}...", flush=True)

    tier2 = get_tier2_engine()
    # Non-blocking warm up on background thread
    asyncio.create_task(tier2.load())

    yield

    print("[Tensa] Graceful shutdown initiated...", flush=True)

    # 1. DPDP Compliance: zero-scrub all in-flight session buffers
    session_manager = get_session_manager()
    session_manager.cleanup_all()

    # 2. Shut down GPU and inference workers
    tier2.shutdown()

    print("[Tensa] Shutdown complete. All memory zero-scrubbed.", flush=True)
