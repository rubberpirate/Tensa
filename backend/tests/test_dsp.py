"""
test_dsp.py — Verification tests for Tier-1 DSP heuristics, codecs, and ring buffer
"""

from __future__ import annotations

import time
import numpy as np
import pytest

from app.dsp.tier1_engine import Tier1DSPEngine, Tier1Result
from app.codecs.simulator import TelephonySimulator, CodecType
from app.core.ring_buffer import EphemeralRingBuffer
from app.risk.bayesian_filter import BayesianTemporalFilter
from app.risk.risk_engine import RiskEngine


class TestTier1DSP:
    def test_dsp_execution_and_speed(self):
        engine = Tier1DSPEngine(sample_rate=16000)
        # Create a 500ms test audio window (8000 samples)
        t = np.linspace(0, 0.5, 8000, endpoint=False)
        # 440 Hz fundamental with some harmonics and slight noise
        audio = 0.5 * np.sin(2 * np.pi * 440 * t) + 0.2 * np.sin(2 * np.pi * 880 * t)
        audio += 0.01 * np.random.randn(len(t))

        result = engine.process(audio)

        assert isinstance(result, Tier1Result)
        assert 0.0 <= result.s_fast <= 1.0
        assert 0.0 <= result.bicoherence_deficit <= 1.0
        assert 0.0 <= result.phase_inconsistency <= 1.0
        assert 0.0 <= result.pitch_jitter_anomaly <= 1.0
        assert 0.0 <= result.respiration_cadence_score <= 1.0
        assert 0.0 <= result.spectral_rolloff_anomaly <= 1.0

        # Tier-1 must run in < 40ms on CPU
        assert result.latency_ms < 40.0, f"Tier-1 latency {result.latency_ms:.1f}ms exceeds 40ms budget"

    def test_silence_handling(self):
        engine = Tier1DSPEngine(sample_rate=16000)
        silence = np.zeros(8000, dtype=np.float32)
        result = engine.process(silence)
        assert 0.0 <= result.s_fast <= 1.0


class TestTelephonySimulator:
    def test_all_codecs(self):
        sr = 16000
        t = np.linspace(0, 0.25, 4000, endpoint=False)
        audio = (0.5 * np.sin(2 * np.pi * 300 * t)).astype(np.float32)

        for codec in [CodecType.RAW, CodecType.G711_ULAW, CodecType.G711_ALAW, CodecType.AMR_NB, CodecType.G722, CodecType.VOIP_JITTER]:
            out = TelephonySimulator.apply_codec(audio, codec, sr=sr)
            assert isinstance(out, np.ndarray)
            assert out.dtype == np.float32
            assert len(out) == len(audio)
            assert np.all(np.isfinite(out))


class TestEphemeralRingBuffer:
    def test_ring_buffer_push_and_scrub(self):
        buf = EphemeralRingBuffer(sample_rate=16000, max_seconds=1.0)
        chunk = np.ones(4000, dtype=np.float32) * 0.5
        buf.push(chunk)

        assert buf.num_samples == 4000
        assert buf.duration_seconds == 0.25

        window = buf.get_audio(max_samples=4000)
        assert len(window) == 4000
        np.testing.assert_allclose(window, chunk, atol=1e-5)

        # Clear and verify memory wipe
        buf.clear()
        assert buf.num_samples == 0


class TestBayesianFilter:
    def test_risk_escalation_and_decay(self):
        bf = BayesianTemporalFilter(decay_lambda=0.90)

        # Initially low
        initial_score = bf._state.risk_score
        assert 0.0 <= initial_score <= 1.0

        # Feed strong synthetic evidence (s_deep = 0.95)
        for _ in range(5):
            up = bf.update_tier2(s_deep=0.95)

        assert up.risk_score > initial_score, "Synthetic evidence should increase risk score"
        assert up.risk_score > 0.60

        # Feed genuine evidence (s_fast = 0.05)
        for _ in range(15):
            up = bf.update_tier2(s_deep=0.05)

        assert up.risk_score < 0.35, "Genuine evidence should decay risk score back to green"
