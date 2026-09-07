"""
optimize.py — ONNX Export + TensorRT Benchmark Pipeline

Steps:
  1. Baseline FP32 PyTorch benchmark
  2. FP16 benchmark (Tensor Core acceleration)
  3. torch.compile() benchmark
  4. ONNX export with dynamic axes
  5. ONNX Runtime (GPU) inference benchmark
  6. Print latency comparison table

Run: python detection-model/optimize.py
"""

from __future__ import annotations

import os
import sys
import time
import json
import argparse

import numpy as np
import torch
import librosa

# Add detection-model to path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from transformers import AutoModelForAudioClassification, AutoFeatureExtractor

HF_REPO_ID = "garystafford/wav2vec2-deepfake-voice-detector"
OPTIMIZED_DIR = os.path.join(SCRIPT_DIR, "optimized")
os.makedirs(OPTIMIZED_DIR, exist_ok=True)

LOCAL_WEIGHTS = os.path.join(SCRIPT_DIR, "model.safetensors")
MODEL_SOURCE = SCRIPT_DIR if os.path.exists(LOCAL_WEIGHTS) else HF_REPO_ID
LOCAL_ONLY = os.path.exists(LOCAL_WEIGHTS)

# Test audio — use samples from detection-model/
SAMPLE_PATHS = [
    os.path.join(SCRIPT_DIR, "output.wav"),
    os.path.join(SCRIPT_DIR, "samp.mp3"),
]


def load_audio(path: str, target_sr: int = 16000) -> np.ndarray:
    audio, _ = librosa.load(path, sr=target_sr, mono=True)
    peak = np.abs(audio).max()
    return audio / peak if peak > 0 else audio


def benchmark(model, feature_extractor, audio_array: np.ndarray, device: str,
              dtype: torch.dtype, label: str, n_runs: int = 20) -> dict:
    """Run N inference passes and return latency statistics."""
    inputs = feature_extractor(
        audio_array, sampling_rate=16000, return_tensors="pt", padding=True
    )
    inputs = {k: v.to(device, dtype=dtype) for k, v in inputs.items()}

    # Warmup
    for _ in range(3):
        with torch.no_grad():
            _ = model(**inputs)

    # Timed runs
    if device == "cuda":
        torch.cuda.synchronize()

    latencies = []
    for _ in range(n_runs):
        t0 = time.perf_counter()
        with torch.no_grad():
            _ = model(**inputs)
        if device == "cuda":
            torch.cuda.synchronize()
        latencies.append((time.perf_counter() - t0) * 1000)

    lats = np.array(latencies)
    return {
        "label": label,
        "mean_ms": float(np.mean(lats)),
        "p50_ms": float(np.median(lats)),
        "p95_ms": float(np.percentile(lats, 95)),
        "min_ms": float(np.min(lats)),
    }


def export_onnx(model, feature_extractor, audio_array: np.ndarray, device: str) -> str:
    """Export model to ONNX with dynamic axes for variable audio lengths."""
    onnx_path = os.path.join(OPTIMIZED_DIR, "wav2vec2_deepfake.onnx")
    if os.path.exists(onnx_path):
        print(f"[ONNX] Already exported: {onnx_path}")
        return onnx_path

    print("[ONNX] Exporting model to ONNX (this takes ~30s)...")

    inputs = feature_extractor(
        audio_array, sampling_rate=16000, return_tensors="pt", padding=True
    )
    input_values = inputs["input_values"].to(device)

    # Get the raw (non-compiled) model
    raw_model = getattr(model, "_orig_mod", model)
    raw_model = raw_model.float()  # ONNX export requires FP32

    torch.onnx.export(
        raw_model,
        (input_values,),
        onnx_path,
        input_names=["input_values"],
        output_names=["logits"],
        dynamic_axes={
            "input_values": {0: "batch", 1: "sequence"},
            "logits": {0: "batch"},
        },
        opset_version=17,
        do_constant_folding=True,
    )
    print(f"[ONNX] Exported to: {onnx_path}")
    return onnx_path


def benchmark_onnx(onnx_path: str, audio_array: np.ndarray,
                   feature_extractor, n_runs: int = 20) -> dict:
    """Benchmark ONNX Runtime GPU session."""
    try:
        import onnxruntime as ort
    except ImportError:
        return {"label": "ONNX Runtime (GPU)", "mean_ms": -1, "error": "onnxruntime not installed"}

    # Prefer CUDA EP, fallback to CPU
    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    sess = ort.InferenceSession(onnx_path, providers=providers)
    active_provider = sess.get_providers()[0]

    inputs = feature_extractor(
        audio_array, sampling_rate=16000, return_tensors="np", padding=True
    )
    feed = {"input_values": inputs["input_values"].astype(np.float32)}

    # Warmup
    for _ in range(3):
        _ = sess.run(None, feed)

    latencies = []
    for _ in range(n_runs):
        t0 = time.perf_counter()
        _ = sess.run(None, feed)
        latencies.append((time.perf_counter() - t0) * 1000)

    lats = np.array(latencies)
    return {
        "label": f"ONNX Runtime ({active_provider.replace('ExecutionProvider', '')})",
        "mean_ms": float(np.mean(lats)),
        "p50_ms": float(np.median(lats)),
        "p95_ms": float(np.percentile(lats, 95)),
        "min_ms": float(np.min(lats)),
    }


def print_table(results: list[dict]) -> None:
    print()
    print("╔══════════════════════════════════════════════╦═════════╦═════════╦═════════╦═════════╗")
    print("║ Configuration                                ║  Mean   ║  P50    ║  P95    ║  Min    ║")
    print("╠══════════════════════════════════════════════╬═════════╬═════════╬═════════╬═════════╣")
    for r in results:
        label = r["label"][:44].ljust(44)
        if r.get("error") or r["mean_ms"] < 0:
            print(f"║ {label} ║  ERROR  ║    -    ║    -    ║    -    ║")
        else:
            print(f"║ {label} ║ {r['mean_ms']:6.1f}ms ║ {r['p50_ms']:6.1f}ms ║ {r['p95_ms']:6.1f}ms ║ {r['min_ms']:6.1f}ms ║")
    print("╚══════════════════════════════════════════════╩═════════╩═════════╩═════════╩═════════╝")
    print()


def main():
    parser = argparse.ArgumentParser(description="Tensa Model Optimization Benchmark")
    parser.add_argument("--benchmark", action="store_true", help="Run benchmark only")
    parser.add_argument("--export-onnx", action="store_true", help="Export ONNX model")
    parser.add_argument("--audio", type=str, help="Audio file path for benchmarking")
    args = parser.parse_args()

    # Load test audio
    audio_path = args.audio if args.audio else next(
        (p for p in SAMPLE_PATHS if os.path.exists(p)), None
    )
    if not audio_path:
        print("[Error] No test audio found. Provide --audio <path> or add output.wav / samp.mp3")
        sys.exit(1)

    print(f"[Optimize] Test audio: {audio_path}")
    audio = load_audio(audio_path)
    print(f"[Optimize] Duration: {len(audio)/16000:.2f}s ({len(audio):,} samples)")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[Optimize] Device: {device}")
    if device == "cuda":
        print(f"[Optimize] GPU: {torch.cuda.get_device_name(0)}")

    results = []

    # ── Step 1: FP32 Baseline ──────────────────────────────────────────
    print("\n[1/4] Loading FP32 baseline model...")
    fe = AutoFeatureExtractor.from_pretrained(MODEL_SOURCE, local_files_only=LOCAL_ONLY)
    model_fp32 = AutoModelForAudioClassification.from_pretrained(
        MODEL_SOURCE, local_files_only=LOCAL_ONLY, torch_dtype=torch.float32
    ).to(device).eval()

    r = benchmark(model_fp32, fe, audio, device, torch.float32, "PyTorch FP32")
    results.append(r)
    print(f"    → FP32 mean latency: {r['mean_ms']:.1f}ms")

    # ── Step 2: FP16 ──────────────────────────────────────────────────
    if device == "cuda":
        print("\n[2/4] FP16 half-precision (Tensor Cores)...")
        model_fp16 = AutoModelForAudioClassification.from_pretrained(
            MODEL_SOURCE, local_files_only=LOCAL_ONLY, torch_dtype=torch.float16
        ).to(device).eval()
        r = benchmark(model_fp16, fe, audio, device, torch.float16, "PyTorch FP16 (Tensor Cores)")
        results.append(r)
        print(f"    → FP16 mean latency: {r['mean_ms']:.1f}ms | Speedup: {results[0]['mean_ms']/r['mean_ms']:.1f}x")

        # ── Step 3: torch.compile() ────────────────────────────────────
        print("\n[3/4] torch.compile() (kernel fusion, Triton)...")
        try:
            model_compiled = torch.compile(model_fp16, mode="reduce-overhead", dynamic=False)
            # First pass triggers compilation
            with torch.no_grad():
                inputs = fe(audio, sampling_rate=16000, return_tensors="pt", padding=True)
                inputs = {k: v.to(device, dtype=torch.float16) for k, v in inputs.items()}
                _ = model_compiled(**inputs)
            r = benchmark(model_compiled, fe, audio, device, torch.float16, "FP16 + torch.compile()")
            results.append(r)
            print(f"    → Compiled mean latency: {r['mean_ms']:.1f}ms | Speedup: {results[0]['mean_ms']/r['mean_ms']:.1f}x")
        except Exception as e:
            print(f"    torch.compile() failed: {e}")
    else:
        print("\n[2-3/4] Skipping FP16 and compile (CUDA not available)")

    # ── Step 4: ONNX Export + ORT Benchmark ───────────────────────────
    if args.export_onnx or not args.benchmark:
        print("\n[4/4] ONNX export + ONNX Runtime benchmark...")
        try:
            onnx_path = export_onnx(model_fp32, fe, audio, device)
            r = benchmark_onnx(onnx_path, audio, fe)
            results.append(r)
            if r["mean_ms"] > 0:
                print(f"    → ORT mean latency: {r['mean_ms']:.1f}ms")
        except Exception as e:
            print(f"    ONNX export failed: {e}")
    else:
        print("\n[4/4] Skipping ONNX export (use --export-onnx to enable)")

    # ── Results ───────────────────────────────────────────────────────
    print("\n" + "═" * 70)
    print(" TENSA MODEL LATENCY BENCHMARK RESULTS")
    print("═" * 70)
    print_table(results)

    # Save results
    results_path = os.path.join(OPTIMIZED_DIR, "benchmark_results.json")
    with open(results_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Results saved to: {results_path}")

    # Print recommendation
    best = min((r for r in results if r["mean_ms"] > 0), key=lambda r: r["mean_ms"])
    print(f"\n✓ Best configuration: [{best['label']}] at {best['mean_ms']:.1f}ms mean latency")
    print(f"  Target (<160ms Tier-2 budget): {'✓ ACHIEVED' if best['mean_ms'] < 160 else '✗ NOT MET'}")
    best_ms = best["mean_ms"]
    stretch_status = "✓ ACHIEVED" if best_ms < 40 else f"× Best = {best_ms:.1f}ms"
    print(f"  Stretch goal (<40ms): {stretch_status}")


if __name__ == "__main__":
    main()
