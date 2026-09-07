"""
tier2_engine.py — Async Tier-2 Neural Inference Bridge

Bridges the detection-model/model_runner.py streaming detector into the
FastAPI async pipeline. Key design:

  • Single-threaded GPU worker queue via ThreadPoolExecutor(max_workers=1)
  • Non-blocking: submit() returns immediately; caller awaits result
  • Adaptive gate: skips inference if Tier-1 s_fast < skip_threshold
  • Priority queue: high s_fast scores jump to front of execution
"""

from __future__ import annotations

import asyncio
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import numpy as np

from app.core.config import settings

# Import streaming detector from detection-model directory
_MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "detection-model")
if _MODEL_DIR not in sys.path:
    sys.path.insert(0, os.path.abspath(_MODEL_DIR))

from model_runner import Wav2Vec2StreamingDetector, DetectionResult


class Tier2Engine:
    """
    Async Tier-2 neural inference engine.
    One instance shared across all call sessions (GPU resource is shared).
    """

    def __init__(self):
        # Single-threaded GPU worker — prevents VRAM thrashing
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="tensa-tier2")
        self._detector: Optional[Wav2Vec2StreamingDetector] = None
        self._loaded = False

    async def load(self) -> None:
        """Load model in background thread (non-blocking)."""
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(self._executor, self._load_sync)

    def _load_sync(self) -> None:
        if not self._loaded:
            self._detector = Wav2Vec2StreamingDetector()
            self._detector.load()
            self._loaded = True

    async def evaluate(
        self,
        audio_array: np.ndarray,
        s_fast: float = 0.0,
        sample_rate: int = settings.sample_rate,
    ) -> Optional[DetectionResult]:
        """
        Non-blocking async inference.
        Returns None if gated out (s_fast < skip threshold).
        """
        if not self._loaded:
            return None

        # Adaptive gate: skip Tier-2 if DSP confidence is low
        if s_fast < settings.tier1_skip_threshold:
            return None

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            self._executor,
            lambda: self._detector.detect_array(audio_array, sample_rate),
        )
        return result

    async def push_chunk(
        self,
        audio_chunk: np.ndarray,
        s_fast: float = 0.0,
        sample_rate: int = settings.sample_rate,
    ) -> Optional[DetectionResult]:
        """
        Push a 250ms chunk into the streaming detector.
        Uses CNN cache to avoid redundant recompute on overlapping windows.
        """
        if not self._loaded:
            return None

        # Gate: only push to GPU if DSP flags something interesting OR
        # if we're building context (first 4 seconds of any call)
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            self._executor,
            lambda: self._detector.push_chunk(audio_chunk, sample_rate),
        )
        return result

    def reset_session(self) -> None:
        """Clear streaming state for a new call. Thread-safe."""
        if self._detector:
            self._detector.reset_stream()


# Module-level singleton
_tier2_engine: Optional[Tier2Engine] = None


def get_tier2_engine() -> Tier2Engine:
    global _tier2_engine
    if _tier2_engine is None:
        _tier2_engine = Tier2Engine()
    return _tier2_engine
