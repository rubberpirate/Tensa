import os
import sys
import time
from collections import deque
from pathlib import Path
from typing import Tuple, Literal

import numpy as np
import soundfile as sf
import torch
from scipy import signal
from transformers import AutoModelForAudioClassification, AutoFeatureExtractor

try:
    import onnxruntime as ort
except ImportError:
    ort = None

StatusType = Literal["ai", "human", "unknown"]

HF_REPO_ID = "garystafford/wav2vec2-deepfake-voice-detector"
LOCAL_DIR = Path(__file__).resolve().parent
LOCAL_WEIGHTS = LOCAL_DIR / "model.safetensors"
LOCAL_ONNX = LOCAL_DIR / "model.onnx"
LOCAL_ONNX_INT8 = LOCAL_DIR / "model_int8.onnx"

AUDIO_SAMPLE_RATE = 16000
WINDOW_SECONDS = 3.0
STRIDE_SECONDS = 1.0
WINDOW_SAMPLES = int(AUDIO_SAMPLE_RATE * WINDOW_SECONDS)  # 48000
STRIDE_SAMPLES = int(AUDIO_SAMPLE_RATE * STRIDE_SECONDS)  # 16000

# Aggregation and Hysteresis Thresholds
AI_THRESHOLD = 0.65
HUMAN_THRESHOLD = 0.35
EMA_ALPHA = 0.4
AI_CONFIRMATIONS = 2
HUMAN_CONFIRMATIONS = 2


class AudioResampler:
    """Resamples input audio array to 16kHz float32 mono."""

    def __init__(self, target_sample_rate: int = AUDIO_SAMPLE_RATE):
        self.target_sample_rate = target_sample_rate

    def resample(self, audio_array: np.ndarray, source_sample_rate: int) -> np.ndarray:
        if len(audio_array) == 0:
            return np.array([], dtype=np.float32)

        if audio_array.ndim > 1:
            audio_array = np.mean(audio_array, axis=1)

        audio_array = audio_array.astype(np.float32)
        if source_sample_rate == self.target_sample_rate:
            return audio_array

        gcd = np.gcd(source_sample_rate, self.target_sample_rate)
        up = self.target_sample_rate // gcd
        down = source_sample_rate // gcd
        resampled = signal.resample_poly(audio_array, up, down)
        return resampled.astype(np.float32)


class DecisionEngine:
    """Rolling EMA probability aggregator and hysteresis state machine."""

    def __init__(
        self,
        ema_alpha: float = EMA_ALPHA,
        ai_threshold: float = AI_THRESHOLD,
        human_threshold: float = HUMAN_THRESHOLD,
        ai_confirmations: int = AI_CONFIRMATIONS,
        human_confirmations: int = HUMAN_CONFIRMATIONS,
    ):
        self.ema_alpha = ema_alpha
        self.ai_threshold = ai_threshold
        self.human_threshold = human_threshold
        self.ai_confirmations = ai_confirmations
        self.human_confirmations = human_confirmations

        self.ema_score: float = 0.5
        self.history: deque = deque(maxlen=10)
        self.current_status: StatusType = "unknown"
        self.consecutive_ai_count: int = 0
        self.consecutive_human_count: int = 0
        self.total_predictions: int = 0

    def update(self, raw_ai_score: float) -> Tuple[StatusType, float]:
        self.total_predictions += 1
        self.history.append(raw_ai_score)

        if self.total_predictions == 1:
            self.ema_score = raw_ai_score
        else:
            self.ema_score = self.ema_alpha * raw_ai_score + (1.0 - self.ema_alpha) * self.ema_score

        if self.ema_score >= self.ai_threshold:
            self.consecutive_ai_count += 1
            self.consecutive_human_count = 0
        elif self.ema_score <= self.human_threshold:
            self.consecutive_human_count += 1
            self.consecutive_ai_count = 0
        else:
            self.consecutive_ai_count = 0
            self.consecutive_human_count = 0

        if self.consecutive_ai_count >= self.ai_confirmations:
            self.current_status = "ai"
        elif self.consecutive_human_count >= self.human_confirmations:
            self.current_status = "human"
        else:
            if self.consecutive_ai_count == 0 and self.consecutive_human_count == 0:
                self.current_status = "unknown"

        return self.current_status, round(self.ema_score, 4)


class PyTorchInferenceEngine:
    """PyTorch backend: loads from local directory or Hugging Face Hub."""

    def __init__(self):
        source = str(LOCAL_DIR) if LOCAL_WEIGHTS.exists() else HF_REPO_ID
        local_only = LOCAL_WEIGHTS.exists()

        print(f"Loading PyTorch model from: {source} (local_only={local_only})")
        self.model = AutoModelForAudioClassification.from_pretrained(
            source,
            local_files_only=local_only,
        )
        self.feature_extractor = AutoFeatureExtractor.from_pretrained(
            source,
            local_files_only=local_only,
        )
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = self.model.to(self.device)
        self.model.eval()

    def predict(self, audio_chunk: np.ndarray) -> Tuple[float, float]:
        start = time.perf_counter()
        inputs = self.feature_extractor(
            audio_chunk,
            sampling_rate=AUDIO_SAMPLE_RATE,
            return_tensors="pt",
            padding=True,
        )
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        with torch.no_grad():
            outputs = self.model(**inputs)
            probs = torch.softmax(outputs.logits, dim=-1)[0]

        ai_probability = float(probs[1].item())
        latency_ms = (time.perf_counter() - start) * 1000.0
        return ai_probability, latency_ms


class ONNXInferenceEngine:
    """High-performance ONNX Runtime backend."""

    def __init__(self, onnx_path: Path = LOCAL_ONNX):
        if ort is None:
            raise ImportError("onnxruntime is not installed. Install via: pip install onnxruntime")
        if not onnx_path.exists():
            raise FileNotFoundError(f"ONNX model file not found at: {onnx_path}")

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 4
        opts.inter_op_num_threads = 1
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        available = ort.get_available_providers()
        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"] if "CUDAExecutionProvider" in available else ["CPUExecutionProvider"]
        print(f"Loading ONNX model from: {onnx_path} with providers: {providers}")
        self.session = ort.InferenceSession(str(onnx_path), opts, providers=providers)
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name

        source = str(LOCAL_DIR) if (LOCAL_DIR / "preprocessor_config.json").exists() else HF_REPO_ID
        try:
            self.feature_extractor = AutoFeatureExtractor.from_pretrained(source)
        except Exception:
            self.feature_extractor = None

    def predict(self, audio_chunk: np.ndarray) -> Tuple[float, float]:
        start = time.perf_counter()
        audio_flat = audio_chunk.flatten().astype(np.float32)

        if self.feature_extractor is not None:
            processed = self.feature_extractor(
                audio_flat,
                sampling_rate=AUDIO_SAMPLE_RATE,
                return_tensors="np",
            )
            input_tensor = processed.input_values.astype(np.float32)
        else:
            mean = np.mean(audio_flat)
            std = np.std(audio_flat)
            normalized = (audio_flat - mean) / (std + 1e-7)
            input_tensor = np.expand_dims(normalized, axis=0).astype(np.float32)

        outputs = self.session.run([self.output_name], {self.input_name: input_tensor})
        latency_ms = (time.perf_counter() - start) * 1000.0

        logits = outputs[0][0]
        exp_logits = np.exp(logits - np.max(logits))
        probs = exp_logits / np.sum(exp_logits)
        ai_probability = float(probs[1]) if len(probs) >= 2 else float(1.0 / (1.0 + np.exp(-logits[0])))
        return ai_probability, latency_ms


def detect(audio_path: str, use_onnx: bool = False):
    """
    Performs sliding-window audio detection (3s window, 1s stride)
    with Exponential Moving Average (EMA) smoothing and hysteresis.
    """
    if not os.path.exists(audio_path):
        print(f"Error: Audio file not found: {audio_path}")
        sys.exit(1)

    print(f"--> Reading audio: {audio_path}")
    audio_data, sr = sf.read(audio_path, dtype="float32")

    # Resample audio to 16kHz mono float32
    resampler = AudioResampler(target_sample_rate=AUDIO_SAMPLE_RATE)
    audio_16khz = resampler.resample(audio_data, source_sample_rate=sr)
    duration_sec = len(audio_16khz) / AUDIO_SAMPLE_RATE
    print(f"--> Duration: {duration_sec:.2f}s | Sample Rate: {sr} Hz -> {AUDIO_SAMPLE_RATE} Hz")

    # Initialize Engine (prefer ONNX if requested or available)
    if use_onnx:
        # Check for INT8 quantized model first, then standard ONNX
        if LOCAL_ONNX_INT8.exists():
            onnx_path = LOCAL_ONNX_INT8
        elif LOCAL_ONNX.exists():
            onnx_path = LOCAL_ONNX
        else:
            print(f"Error: Neither {LOCAL_ONNX_INT8.name} nor {LOCAL_ONNX.name} found in {LOCAL_DIR}")
            print("Tip: Run 'python setup_model.py' to generate ONNX / INT8 quantized models.")
            sys.exit(1)
        engine = ONNXInferenceEngine(onnx_path=onnx_path)
    else:
        engine = PyTorchInferenceEngine()

    decision_engine = DecisionEngine()

    # If audio is shorter than 3s, pad to 3s
    if len(audio_16khz) < WINDOW_SAMPLES:
        padded = np.zeros(WINDOW_SAMPLES, dtype=np.float32)
        padded[: len(audio_16khz)] = audio_16khz
        audio_16khz = padded

    start_idx = 0
    print("\n" + "-" * 75)
    print(f"{'Time Window':<16} | {'Raw AI Score':<14} | {'EMA Score':<12} | {'Latency':<10} | {'Status':<8}")
    print("-" * 75)

    while start_idx + WINDOW_SAMPLES <= len(audio_16khz):
        chunk_3s = audio_16khz[start_idx : start_idx + WINDOW_SAMPLES]
        raw_ai_score, latency_ms = engine.predict(chunk_3s)
        status, ema_score = decision_engine.update(raw_ai_score)

        t_start = start_idx / AUDIO_SAMPLE_RATE
        t_end = (start_idx + WINDOW_SAMPLES) / AUDIO_SAMPLE_RATE
        window_str = f"{t_start:.1f}s - {t_end:.1f}s"

        print(f"{window_str:<16} | {raw_ai_score:<14.2%} | {ema_score:<12.2%} | {latency_ms:<8.1f}ms | {status.upper():<8}")
        start_idx += STRIDE_SAMPLES

    print("-" * 75 + "\n")
    status_label = decision_engine.current_status.upper()
    if status_label == "UNKNOWN":
        status_label = "AI" if decision_engine.ema_score >= AI_THRESHOLD else ("HUMAN" if decision_engine.ema_score <= HUMAN_THRESHOLD else "UNCERTAIN")

    print(f"File:                      {audio_path}")
    print(f"Final Call Status:         {status_label}")
    print(f"Final Smoothed AI Score:   {decision_engine.ema_score:.2%}")
    print(f"Final Human/Real Score:    {(1.0 - decision_engine.ema_score):.2%}")


def setup_and_quantize():
    """
    Automated script to export Hugging Face / local weights to ONNX
    and generate the INT8 quantized model (model_int8.onnx).
    """
    print("=" * 65)
    print(" TENSA AI VOICE DETECTOR - ONNX EXPORT & QUANTIZATION SETUP")
    print("=" * 65)

    try:
        from onnxruntime.quantization import quantize_dynamic, QuantType
    except ImportError:
        print("\nError: 'onnxruntime' is not installed.")
        print("Run: pip install onnx onnxruntime optimum")
        return False

    model_source = str(LOCAL_DIR) if LOCAL_WEIGHTS.exists() else HF_REPO_ID
    print(f"\n[1/3] Loading base model from: {model_source}")
    extractor = AutoFeatureExtractor.from_pretrained(model_source)
    model = AutoModelForAudioClassification.from_pretrained(model_source)
    model.eval()

    print(f"[2/3] Exporting to ONNX FP32: {LOCAL_ONNX.name}...")
    dummy_input = torch.randn(1, WINDOW_SAMPLES, dtype=torch.float32)
    torch.onnx.export(
        model,
        dummy_input,
        str(LOCAL_ONNX),
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=["input_values"],
        output_names=["logits"],
        dynamic_axes={
            "input_values": {0: "batch_size", 1: "sequence_length"},
            "logits": {0: "batch_size"},
        },
    )
    extractor.save_pretrained(str(LOCAL_DIR))
    print(f"      Successfully exported FP32 model: {LOCAL_ONNX.name}")

    print(f"[3/3] Performing INT8 Dynamic Quantization: {LOCAL_ONNX_INT8.name}...")
    import onnx
    import onnxruntime.quantization.quant_utils as ort_quant_utils

    # Save original shape inference function
    original_infer_shapes_path = onnx.shape_inference.infer_shapes_path

    def safe_infer_shapes_path(in_path, out_path, *args, **kwargs):
        try:
            return original_infer_shapes_path(in_path, out_path, *args, **kwargs)
        except Exception:
            # Fallback: copy without shape inference if ONNX graph contains projection head dimension mismatch
            import shutil
            shutil.copyfile(in_path, out_path)

    onnx.shape_inference.infer_shapes_path = safe_infer_shapes_path

    try:
        quantize_dynamic(
            model_input=str(LOCAL_ONNX),
            model_output=str(LOCAL_ONNX_INT8),
            op_types_to_quantize=["MatMul"],
            weight_type=QuantType.QUInt8,
            extra_options={
                "MatMulConstBOnly": True,
                "DefaultTensorType": onnx.TensorProto.FLOAT,
            },
        )
    finally:
        onnx.shape_inference.infer_shapes_path = original_infer_shapes_path

    print(f"      Successfully generated INT8 quantized model: {LOCAL_ONNX_INT8.name}")

    fp32_size = LOCAL_ONNX.stat().st_size / (1024 * 1024)
    int8_size = LOCAL_ONNX_INT8.stat().st_size / (1024 * 1024)
    print("\n" + "=" * 65)
    print(f"Model Compression Summary:")
    print(f" - FP32 ONNX Size:  {fp32_size:.1f} MB")
    print(f" - INT8 ONNX Size:  {int8_size:.1f} MB  ({(1.0 - int8_size/fp32_size):.1%} reduction)")
    print("=" * 65)
    print("Done! You can now run inference with: python detect.py <audio_file> --onnx\n")
    return True


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python detect.py <audio_file.wav|mp3|flac> [--onnx]")
        print("  python detect.py --setup   (Exports ONNX and builds INT8 quantized model)")
        sys.exit(1)

    if "--setup" in sys.argv:
        setup_and_quantize()
    else:
        audio_file = sys.argv[1]
        onnx_flag = "--onnx" in sys.argv
        detect(audio_file, use_onnx=onnx_flag)

