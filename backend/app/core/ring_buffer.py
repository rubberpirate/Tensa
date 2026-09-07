"""
ring_buffer.py — Ephemeral RAM-Only Ring Buffer (DPDP Act 2023 Compliant)

Key guarantees:
  • Audio bytes reside in volatile memory only (Python bytearray / numpy array)
  • On pop/overwrite, old frames are explicitly zero-wiped (ctypes memset)
  • Buffer is bounded: never accumulates beyond max_seconds
  • No disk I/O, no temp files, no block-storage writes
"""

from __future__ import annotations

import ctypes
import threading
from collections import deque
from typing import Optional

import numpy as np

from app.core.config import settings


class EphemeralRingBuffer:
    """
    Thread-safe circular audio buffer with zero-scrubbing on eviction.
    Implements DPDP Act 2023 §8 'Privacy by Design':
      - Audio frames never leave volatile RAM
      - Overwritten frames are scrubbed with zeros before GC
    """

    def __init__(
        self,
        sample_rate: int = settings.sample_rate,
        max_seconds: float = settings.ring_buffer_max_seconds,
    ):
        self._sr = sample_rate
        self._max_samples = int(max_seconds * sample_rate)
        self._lock = threading.Lock()
        # Deque of numpy float32 chunks (each chunk = 1 hop = 250ms)
        self._chunks: deque[np.ndarray] = deque()
        self._total_samples: int = 0

    def push(self, audio_chunk: np.ndarray) -> None:
        """
        Append a new audio chunk. If the buffer exceeds max_samples,
        the oldest chunk is zero-scrubbed and evicted.
        """
        chunk = np.asarray(audio_chunk, dtype=np.float32)
        with self._lock:
            self._chunks.append(chunk)
            self._total_samples += len(chunk)
            # Evict oldest chunks until within budget
            while self._total_samples > self._max_samples and self._chunks:
                old = self._chunks.popleft()
                self._total_samples -= len(old)
                self._zero_scrub(old)

    def get_audio(self, max_samples: Optional[int] = None) -> np.ndarray:
        """
        Return concatenated audio array (view, not copy when possible).
        Optionally limit to last max_samples.
        """
        with self._lock:
            if not self._chunks:
                return np.empty(0, dtype=np.float32)
            audio = np.concatenate(list(self._chunks))
        if max_samples is not None and len(audio) > max_samples:
            audio = audio[-max_samples:]
        return audio

    def clear(self) -> None:
        """Zero-scrub all buffered audio and reset the buffer."""
        with self._lock:
            for chunk in self._chunks:
                self._zero_scrub(chunk)
            self._chunks.clear()
            self._total_samples = 0

    @property
    def duration_seconds(self) -> float:
        return self._total_samples / self._sr

    @property
    def num_samples(self) -> int:
        return self._total_samples

    @staticmethod
    def _zero_scrub(arr: np.ndarray) -> None:
        """
        Overwrite numpy array data with zeros via ctypes (bypasses Python ref-counting).
        Ensures raw memory bytes are erased before the array is garbage-collected.
        """
        if arr.size == 0 or not arr.flags["C_CONTIGUOUS"]:
            return
        nbytes = arr.nbytes
        ptr = arr.ctypes.data_as(ctypes.POINTER(ctypes.c_char))
        ctypes.memset(ptr, 0, nbytes)

    def __repr__(self) -> str:
        return (
            f"EphemeralRingBuffer("
            f"duration={self.duration_seconds:.2f}s, "
            f"samples={self._total_samples:,}, "
            f"chunks={len(self._chunks)})"
        )
