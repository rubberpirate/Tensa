"""
simulator.py — Telephony Codec Simulation Engine

Simulates telecom degradation environments to test and ensure robustness of:
  - Tier-1 DSP heuristics
  - Tier-2 neural deepfake detector

Supported profiles:
  • G.711 μ-law / A-law (8 kHz, companded PCM)
  • G.722 Wideband Audio (16 kHz, bandpass 50Hz - 7000Hz)
  • AMR-NB (8 kHz, aggressive telephone bandpass 300Hz - 3400Hz + non-linear distortion)
  • VoIP Jitter / Packet Loss simulator (random frame drops & zero-fill / interpolation)
"""

from __future__ import annotations

from enum import Enum
import numpy as np
import scipy.signal as sig


class CodecType(str, Enum):
    RAW = "raw"                 # Unaltered 16kHz audio
    G711_ULAW = "g711_ulaw"     # 8kHz telephony μ-law
    G711_ALAW = "g711_alaw"     # 8kHz telephony A-law
    AMR_NB = "amr_nb"           # Narrowband cellular (300Hz - 3.4kHz)
    G722 = "g722"               # Wideband HD Voice (50Hz - 7.0kHz)
    VOIP_JITTER = "voip_jitter" # 5% random packet loss & jitter


def mu_law_compand(x: np.ndarray, mu: float = 255.0) -> np.ndarray:
    """ITU-T Recommendation G.711 μ-law compression followed by expansion."""
    x = np.clip(x, -1.0, 1.0)
    # Compression: sign(x) * ln(1 + mu*|x|) / ln(1 + mu)
    compressed = np.sign(x) * np.log1p(mu * np.abs(x)) / np.log1p(mu)
    # Quantize to 8-bit (256 discrete levels)
    quantized = np.round((compressed + 1.0) * 127.5) / 127.5 - 1.0
    # Expansion: sign(y) * (1/mu) * ((1 + mu)^|y| - 1)
    expanded = np.sign(quantized) * (1.0 / mu) * (np.expm1(np.abs(quantized) * np.log1p(mu)))
    return expanded.astype(np.float32)


def a_law_compand(x: np.ndarray, A: float = 87.6) -> np.ndarray:
    """ITU-T Recommendation G.711 A-law compression followed by expansion."""
    x = np.clip(x, -1.0, 1.0)
    abs_x = np.abs(x)
    sign_x = np.sign(x)
    inv_factor = 1.0 / (1.0 + np.log(A))

    # Compression
    compressed = np.zeros_like(x)
    mask = abs_x < (1.0 / A)
    compressed[mask] = (A * abs_x[mask]) * inv_factor
    compressed[~mask] = (1.0 + np.log(A * abs_x[~mask])) * inv_factor
    compressed = sign_x * compressed

    # 8-bit quantization
    quantized = np.round((compressed + 1.0) * 127.5) / 127.5 - 1.0
    abs_q = np.abs(quantized)
    sign_q = np.sign(quantized)

    # Expansion
    expanded = np.zeros_like(quantized)
    mask_q = abs_q < (1.0 / (1.0 + np.log(A)))
    expanded[mask_q] = (abs_q[mask_q] * (1.0 + np.log(A)) / A)
    expanded[~mask_q] = (np.exp(abs_q[~mask_q] * (1.0 + np.log(A)) - 1.0) / A)
    return (sign_q * expanded).astype(np.float32)


class TelephonySimulator:
    """
    Simulates telecom degradation on 16 kHz mono float32 audio.
    Outputs simulated 16 kHz audio (resampled back if downsampled)
    so downstream models receive consistent 16kHz buffers.
    """

    @staticmethod
    def apply_codec(audio: np.ndarray, codec: CodecType | str, sr: int = 16000) -> np.ndarray:
        if isinstance(codec, str):
            try:
                codec = CodecType(codec.lower())
            except ValueError:
                codec = CodecType.RAW

        if codec == CodecType.RAW or len(audio) == 0:
            return audio.copy().astype(np.float32)

        if codec == CodecType.G711_ULAW:
            # Downsample to 8kHz -> apply mu-law -> upsample back to 16kHz
            num_8k = int(len(audio) * (8000 / sr))
            audio_8k = sig.resample(audio, num_8k)
            companded = mu_law_compand(audio_8k)
            return sig.resample(companded, len(audio)).astype(np.float32)

        elif codec == CodecType.G711_ALAW:
            num_8k = int(len(audio) * (8000 / sr))
            audio_8k = sig.resample(audio, num_8k)
            companded = a_law_compand(audio_8k)
            return sig.resample(companded, len(audio)).astype(np.float32)

        elif codec == CodecType.AMR_NB:
            # Bandpass filter 300Hz - 3400Hz (4th order Butterworth)
            nyq = 0.5 * sr
            low = 300.0 / nyq
            high = 3400.0 / nyq
            b, a = sig.butter(4, [low, high], btype='band')
            filtered = sig.lfilter(b, a, audio)
            # Add light harmonic distortion common in cellular speech coders
            distorted = filtered + 0.05 * (filtered ** 2)
            return np.clip(distorted, -1.0, 1.0).astype(np.float32)

        elif codec == CodecType.G722:
            # Wideband filter: 50Hz - 7000Hz
            nyq = 0.5 * sr
            low = 50.0 / nyq
            high = min(7000.0 / nyq, 0.95)
            b, a = sig.butter(4, [low, high], btype='band')
            filtered = sig.lfilter(b, a, audio)
            return np.clip(filtered, -1.0, 1.0).astype(np.float32)

        elif codec == CodecType.VOIP_JITTER:
            # Random frame loss (drop 20ms frames with 5% probability)
            out = audio.copy()
            frame_len = int(0.02 * sr)  # 20ms frames
            num_frames = len(out) // frame_len
            rng = np.random.default_rng(42)
            for i in range(num_frames):
                if rng.random() < 0.05:  # 5% packet drop
                    start = i * frame_len
                    end = start + frame_len
                    out[start:end] = 0.0
            return out.astype(np.float32)

        return audio.copy().astype(np.float32)
