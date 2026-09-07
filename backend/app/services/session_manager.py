"""
session_manager.py — Call Session Registry & Memory Scrubbing Service

Manages active telephony/VoIP call sessions and guarantees DPDP Act §8
privacy compliance by zero-scrubbing audio memory buffers when sessions end.
"""

from __future__ import annotations

import asyncio
import threading
from typing import Dict, Optional

import numpy as np

from app.core.config import settings
from app.core.ring_buffer import EphemeralRingBuffer
from app.dsp.tier1_engine import Tier1DSPEngine
from app.models.tier2_engine import Tier2Engine, get_tier2_engine
from app.models.vad import VoiceActivityDetector
from app.risk.contextual import CallContext
from app.risk.risk_engine import RiskEngine


class CallSession:
    """Represents a single live telephone or VoIP streaming session."""

    def __init__(self, call_id: str, context: CallContext, codec: str = "raw"):
        self.call_id = call_id
        self.context = context
        self.codec = codec.lower()
        self.ring_buffer = EphemeralRingBuffer()
        self.dsp_engine = Tier1DSPEngine()
        self.vad = VoiceActivityDetector()
        self.risk_engine = RiskEngine(call_id, context)
        self.tier2_engine = get_tier2_engine()
        self.hop_samples = int(settings.hop_ms * settings.sample_rate / 1000)
        self.pending_samples: np.ndarray = np.empty(0, dtype=np.float32)

        # Background neural worker task tracking (prevents queuing backpressure)
        self.tier2_task: Optional[asyncio.Task] = None
        self.tier2_tick_counter: int = 0
        self.tier2_interval_ticks: int = 4  # run Tier-2 every 4 × 250ms = 1000ms

        self.latest_tier1_latency_ms: float = 0.0
        self.latest_tier2_latency_ms: Optional[float] = None

    def cleanup(self) -> None:
        """
        DPDP Act 2023 §8: Zero-scrub volatile memory buffers upon session termination.
        Cancels any pending GPU evaluation tasks.
        """
        if self.tier2_task and not self.tier2_task.done():
            self.tier2_task.cancel()
            self.tier2_task = None

        self.ring_buffer.clear()
        if len(self.pending_samples) > 0:
            self.pending_samples.fill(0)
            self.pending_samples = np.empty(0, dtype=np.float32)

        self.tier2_engine.reset_session()


class SessionManager:
    """Thread-safe registry of live call sessions with lifecycle and cleanup hooks."""

    def __init__(self):
        self._sessions: Dict[str, CallSession] = {}
        self._lock = threading.Lock()

    def get_session(self, call_id: str) -> Optional[CallSession]:
        with self._lock:
            return self._sessions.get(call_id)

    def create_session(self, call_id: str, context: CallContext, codec: str = "raw") -> CallSession:
        with self._lock:
            if call_id in self._sessions:
                self._sessions[call_id].cleanup()
            session = CallSession(call_id=call_id, context=context, codec=codec)
            self._sessions[call_id] = session
            return session

    def remove_session(self, call_id: str) -> None:
        with self._lock:
            session = self._sessions.pop(call_id, None)
            if session:
                session.cleanup()

    def cleanup_all(self) -> None:
        """Scrub all sessions across the system on server shutdown."""
        with self._lock:
            for session in self._sessions.values():
                session.cleanup()
            self._sessions.clear()

    @property
    def active_count(self) -> int:
        with self._lock:
            return len(self._sessions)


_session_manager = SessionManager()


def get_session_manager() -> SessionManager:
    return _session_manager
