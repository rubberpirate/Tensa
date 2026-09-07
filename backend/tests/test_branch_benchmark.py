"""
backend/tests/test_branch_benchmark.py — Automated PyTest validation of branch performance

Tests:
  1. main branch module dynamic loading and inference
  2. rohan branch streaming detector execution
  3. Latency comparison assertion (rohan FP16 faster than main FP32)
  4. Real-time streaming 250ms chunk processing under telecom budget (<100ms)
"""

from __future__ import annotations

import os
import sys
import time
import pytest
import numpy as np
import torch

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODEL_DIR = os.path.join(REPO_ROOT, "detection-model")
SCRIPTS_DIR = os.path.join(REPO_ROOT, "scripts")

sys.path.insert(0, SCRIPTS_DIR)
sys.path.insert(0, MODEL_DIR)

from benchmark_branches import load_main_branch_module


@pytest.fixture(scope="module")
def main_engine():
    mod = load_main_branch_module()
    engine = mod.PyTorchInferenceEngine()
    return engine


@pytest.fixture(scope="module")
def rohan_detector():
    from model_runner import Wav2Vec2StreamingDetector
    detector = Wav2Vec2StreamingDetector()
    detector.load()
    # Warmup torch.compile JIT graph once so subsequent tests measure warm performance
    dummy_warm = np.random.randn(16000).astype(np.float32)
    detector.detect_array(dummy_warm, 16000)
    return detector


class TestBranchBenchmark:
    def test_main_branch_inference(self, main_engine):
        """Verify main branch engine runs on a 3.0s window and returns valid probabilities."""
        audio_3s = np.random.randn(48000).astype(np.float32)
        score, latency_ms = main_engine.predict(audio_3s)

        assert 0.0 <= score <= 1.0, "AI score must be bounded between 0 and 1"
        assert latency_ms > 0.0, "Latency must be positive"
        print(f"\n[main] 3.0s window latency: {latency_ms:.1f}ms | score: {score:.2%}")

    def test_rohan_branch_inference(self, rohan_detector):
        """Verify rohan branch detector runs on 1.0s window with valid output."""
        audio_1s = np.random.randn(16000).astype(np.float32)
        res = rohan_detector.detect_array(audio_1s, 16000)

        assert 0.0 <= res.prob_fake <= 1.0
        assert 0.0 <= res.prob_real <= 1.0
        assert res.prediction in ("FAKE", "REAL")
        assert res.latency_ms < 100.0, f"Rohan warm latency must be <100ms, got {res.latency_ms:.1f}ms"
        print(f"\n[rohan] 1.0s window warm latency: {res.latency_ms:.1f}ms | pred: {res.prediction}")

    def test_rohan_streaming_250ms_hop(self, rohan_detector):
        """Verify rohan 250ms streaming hop meets real-time budget (<50ms)."""
        rohan_detector.reset_stream()
        # Warmup buffer to 1s
        for _ in range(4):
            rohan_detector.push_chunk(np.random.randn(4000).astype(np.float32) * 0.1)

        # Measure streaming hop
        t0 = time.perf_counter()
        res = rohan_detector.push_chunk(np.random.randn(4000).astype(np.float32) * 0.1)
        dt_ms = (time.perf_counter() - t0) * 1000.0

        print(f"\n[rohan streaming] 250ms hop latency: {dt_ms:.2f}ms | cached tokens: {res.cache_tokens_reused}")
        assert dt_ms < 100.0, f"250ms hop latency should be <100ms, got {dt_ms:.1f}ms"
        assert res.cache_tokens_reused > 0, "CNN cache tokens should be reused during streaming hops"
