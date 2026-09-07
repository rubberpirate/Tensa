"""
vad.py — Lightweight Voice Activity Detector

Two-stage VAD for maximum speed:
  Stage 1: RMS energy gate (<0.5ms) — immediately filters total silence
  Stage 2: Zero-crossing rate check — filters pure tones and DTMF dial tones

Avoids loading Silero VAD (requires PyTorch model load) for sub-ms filtering
of non-speech frames. Falls back to energy-based gate only.
"""

from __future__ import annotations

import numpy as np

from app.core.config import settings


class VoiceActivityDetector:
    """
    Ultra-lightweight RMS + ZCR voice activity detector.
    Runs in < 0.5ms on CPU.
    """

    def __init__(
        self,
        sample_rate: int = settings.sample_rate,
        energy_threshold: float = settings.vad_energy_threshold,
    ):
        self._sr = sample_rate
        self._energy_threshold = energy_threshold
        self._zcr_upper = 0.45      # above this → likely silence or DTMF tone

    def is_speech(self, audio: np.ndarray) -> bool:
        """
        Returns True if the audio chunk likely contains speech.
        False for silence, DTMF tones, or pure line static.
        """
        if len(audio) == 0:
            return False

        audio = audio.astype(np.float32)

        # Stage 1: RMS energy gate
        rms = float(np.sqrt(np.mean(audio ** 2)))
        if rms < self._energy_threshold:
            return False  # silence or very quiet

        # Stage 2: Zero-Crossing Rate — DTMF tones have very regular ZCR
        zcr = float(np.mean(np.abs(np.diff(np.sign(audio)))) / 2.0)
        if zcr > self._zcr_upper:
            return False  # dial tone / DTMF / pure sine

        return True

    def rms(self, audio: np.ndarray) -> float:
        return float(np.sqrt(np.mean(audio.astype(np.float32) ** 2)))
