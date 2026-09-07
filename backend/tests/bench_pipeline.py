"""
bench_pipeline.py — End-to-End Streaming Latency & RTF Benchmark

Simulates real-time streaming audio ingestion through the complete Tensa pipeline:
  1. Ephemeral Ring Buffer
  2. Voice Activity Detection (VAD)
  3. Tier-1 DSP Heuristics (<40ms CPU)
  4. Bayesian Temporal Filter
  5. Contextual Risk Calculator
  6. Codec Simulation (optional)

Usage:
  .venv/bin/python backend/tests/bench_pipeline.py --duration 10 --target-rtf 0.2
"""

from __future__ import annotations

import argparse
import sys
import time
import numpy as np

from app.core.config import settings
from app.core.ring_buffer import EphemeralRingBuffer
from app.dsp.tier1_engine import Tier1DSPEngine
from app.models.vad import VoiceActivityDetector
from app.risk.risk_engine import RiskEngine
from app.codecs.simulator import TelephonySimulator, CodecType


def run_benchmark(duration_sec: float = 10.0, target_rtf: float = 0.25, codec_name: str = "raw") -> int:
    sr = settings.sample_rate
    hop_sec = settings.hop_seconds  # e.g. 0.250s (250ms)
    hop_samples = int(hop_sec * sr)
    total_chunks = int(duration_sec / hop_sec)

    print("=" * 65)
    print("Project Tensa — Pipeline Streaming Benchmark")
    print(f"  Duration: {duration_sec:.1f}s ({total_chunks} chunks of {hop_sec*1000:.0f}ms)")
    print(f"  Sample rate: {sr} Hz | Target RTF: <{target_rtf}")
    print(f"  Codec profile: {codec_name}")
    print("=" * 65)

    # Initialize components
    ring_buf = EphemeralRingBuffer(sample_rate=sr, max_seconds=settings.ring_buffer_max_seconds)
    vad = VoiceActivityDetector(sample_rate=sr)
    dsp = Tier1DSPEngine(sample_rate=sr)
    risk = RiskEngine(call_id="bench-call-1")

    latencies_ms = []
    dsp_latencies_ms = []

    # Generate synthetic speech-like stream (modulated harmonic carrier)
    t_full = np.linspace(0, duration_sec, int(duration_sec * sr), endpoint=False)
    synthetic_stream = (
        0.3 * np.sin(2 * np.pi * 220 * t_full)
        + 0.2 * np.sin(2 * np.pi * 440 * t_full)
        + 0.1 * np.random.randn(len(t_full))
    ).astype(np.float32)

    # Apply codec simulation if requested
    if codec_name != "raw":
        synthetic_stream = TelephonySimulator.apply_codec(synthetic_stream, codec_name, sr=sr)

    t_start_total = time.perf_counter()

    for chunk_idx in range(total_chunks):
        start_samp = chunk_idx * hop_samples
        end_samp = start_samp + hop_samples
        chunk = synthetic_stream[start_samp:end_samp]

        t0 = time.perf_counter()

        # 1. Ingest into ring buffer
        ring_buf.push(chunk)

        # 2. VAD check
        is_speech = vad.is_speech(chunk)

        # 3. DSP extraction on rolling 500ms window
        window = ring_buf.get_audio(max_samples=int(settings.window_seconds * sr))
        t_dsp_start = time.perf_counter()
        dsp_res = dsp.process(window)
        dsp_time = (time.perf_counter() - t_dsp_start) * 1000.0
        dsp_latencies_ms.append(dsp_time)

        # 4. Integrated Bayesian risk update & dispatch
        risk_event = risk.update_tier1(
            s_fast=dsp_res.s_fast,
            phase_inconsistency=dsp_res.phase_inconsistency,
            bicoherence_deficit=dsp_res.bicoherence_deficit,
            pitch_jitter_anomaly=dsp_res.pitch_jitter_anomaly,
            respiration_cadence_score=dsp_res.respiration_cadence_score,
            spectral_rolloff_anomaly=dsp_res.spectral_rolloff_anomaly,
        )

        t1 = time.perf_counter()
        elapsed_ms = (t1 - t0) * 1000.0
        latencies_ms.append(elapsed_ms)

    total_proc_time = time.perf_counter() - t_start_total
    rtf = total_proc_time / duration_sec

    lats = np.array(latencies_ms)
    dsp_lats = np.array(dsp_latencies_ms)

    print("\nBenchmark Results:")
    print(f"  Processed {total_chunks} frames in {total_proc_time:.3f}s audio real-time equivalent")
    print(f"  Real-Time Factor (RTF): {rtf:.4f}  (lower is faster; 1.0 = real-time)")
    print(f"  Target RTF Status:      {'✓ PASSED' if rtf < target_rtf else '× FAILED'}")
    print(f"  Tier-1 DSP Mean Latency:{dsp_lats.mean():.2f} ms (p95: {np.percentile(dsp_lats, 95):.2f} ms)")
    print(f"  Total Pipeline Mean:    {lats.mean():.2f} ms (p95: {np.percentile(lats, 95):.2f} ms, max: {lats.max():.2f} ms)")
    print(f"  Tier-1 Budget (<40ms):  {'✓ PASSED' if lats.mean() < 40.0 else '× FAILED'}")
    print("=" * 65)

    return 0 if rtf < target_rtf and lats.mean() < 40.0 else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Project Tensa Pipeline Benchmark")
    parser.add_argument("--duration", type=float, default=10.0, help="Benchmark duration in seconds")
    parser.add_argument("--target-rtf", type=float, default=0.25, help="Target Real-Time Factor")
    parser.add_argument("--codec", type=str, default="raw", choices=["raw", "g711_ulaw", "g711_alaw", "amr_nb", "g722", "voip_jitter"])
    args = parser.parse_args()

    sys.exit(run_benchmark(args.duration, args.target_rtf, args.codec))
