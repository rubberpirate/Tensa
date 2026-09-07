"""
tier2_engine.py — Async Tier-2 Neural Inference Bridge

Bridges the detection-model/model_runner.py streaming detector into the
FastAPI async pipeline:
  • Single-threaded GPU worker queue via ThreadPoolExecutor(max_workers=1)
  • Non-blocking: submit() runs on executor thread; caller awaits result
  • Adaptive gate: skips inference if Tier-1 s_fast < skip_threshold
  • Clean shutdown hook for graceful FastAPI lifespan termination
"""

from __future__ import annotations

import asyncio
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

import numpy as np
import torch

from app.core.config import settings

# ── Robust detection-model path auto-resolution ─────────────────────────
_CURRENT_DIR = Path(__file__).resolve()
_CANDIDATE_DIRS = [
    _CURRENT_DIR.parents[3] / "detection-model",       # repo root / detection-model
    _CURRENT_DIR.parents[2] / "detection-model",
    Path.cwd() / "detection-model",
    Path.cwd().parent / "detection-model",
]

for _dir in _CANDIDATE_DIRS:
    if _dir.is_dir() and str(_dir) not in sys.path:
        sys.path.insert(0, str(_dir))
        break

try:
    from model_runner import Wav2Vec2StreamingDetector, DetectionResult
except ImportError:
    # Graceful fallback dummy if running in environments without model_runner
    Wav2Vec2StreamingDetector = None  # type: ignore
    from dataclasses import dataclass

    @dataclass
    class DetectionResult:  # type: ignore
        prob_fake: float = 0.0
        prob_real: float = 1.0
        confidence: float = 1.0
        prediction: str = "REAL"
        latency_ms: float = 0.0
        window_samples: int = 16000
        cache_tokens_reused: int = 0


class Tier2Engine:
    """
    Async Tier-2 neural inference engine.
    Singleton instance shared across all call sessions (GPU resource is shared).
    """

    def __init__(self):
        # Single-threaded GPU worker — prevents VRAM thrashing
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="tensa-tier2")
        self._detector: Optional[Wav2Vec2StreamingDetector] = None
        self._loaded = False
        self._device: str = "cuda" if torch.cuda.is_available() else "cpu"

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def device(self) -> str:
        return self._device

    async def load(self) -> None:
        """Load model in background thread (non-blocking)."""
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(self._executor, self._load_sync)

    def _load_sync(self) -> None:
        if not self._loaded and Wav2Vec2StreamingDetector is not None:
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
        if not self._loaded or self._detector is None:
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
        if not self._loaded or self._detector is None:
            return None

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

    def shutdown(self) -> None:
        """Gracefully shut down GPU worker thread on application exit."""
        self._executor.shutdown(wait=False)


# Module-level singleton
_tier2_engine: Optional[Tier2Engine] = None


def get_tier2_engine() -> Tier2Engine:
    global _tier2_engine
    if _tier2_engine is None:
        _tier2_engine = Tier2Engine()
    return _tier2_engine
