# AI Voice Detection Model

Wav2Vec2 fine-tuned audio classification with 3.0s sliding windows, polyphase resampling, and exponential moving average (EMA) hysteresis smoothing.

## Quick Start for Contributors

### 1. Setup Environment
```bash
python -m venv venv
source venv/bin/activate  # or activate.fish for Fish shell
pip install torch transformers soundfile scipy onnxruntime
```

### 2. Automated Model Setup (ONNX & INT8 Quantization)
Run the automated setup flag to export the Hugging Face model (`garystafford/wav2vec2-deepfake-voice-detector`) or local weights to ONNX and generate the INT8 quantized model (`model_int8.onnx`):
```bash
python detect.py --setup
```
> This compresses the model from **~1.2 GB to ~300 MB** with negligible accuracy drop and ~2x–3x CPU speedup.

### 3. Run Inference on Audio Files
```bash
# High-speed INT8 / ONNX inference (uses model_int8.onnx if generated):
python detect.py path/to/audio.wav --onnx

# Standard PyTorch inference:
python detect.py path/to/audio.wav
```
