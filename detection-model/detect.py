import os
import sys
import torch
import librosa

from transformers import (
    AutoModelForAudioClassification,
    AutoFeatureExtractor,
)

HF_REPO_ID = "garystafford/wav2vec2-deepfake-voice-detector"
LOCAL_DIR = os.path.dirname(os.path.abspath(__file__))

# If local model weights exist, load locally; otherwise fallback to Hugging Face Hub
local_weights_path = os.path.join(LOCAL_DIR, "model.safetensors")
if os.path.exists(local_weights_path):
    model_source = LOCAL_DIR
    local_only = True
else:
    model_source = HF_REPO_ID
    local_only = False

model = AutoModelForAudioClassification.from_pretrained(
    model_source,
    local_files_only=local_only,
)

feature_extractor = AutoFeatureExtractor.from_pretrained(
    model_source,
    local_files_only=local_only,
)

device = "cuda" if torch.cuda.is_available() else "cpu"

model = model.to(device)
model.eval()


def detect(audio_path):
    # Load audio and convert to the model's expected format
    audio, sr = librosa.load(
        audio_path,
        sr=16000,
        mono=True,
    )

    inputs = feature_extractor(
        audio,
        sampling_rate=16000,
        return_tensors="pt",
        padding=True,
    )

    inputs = {
        key: value.to(device)
        for key, value in inputs.items()
    }

    with torch.no_grad():
        outputs = model(**inputs)
        probabilities = torch.softmax(
            outputs.logits,
            dim=-1,
        )[0]

    real_probability = probabilities[0].item()
    fake_probability = probabilities[1].item()

    prediction = "FAKE" if fake_probability > 0.5 else "REAL"

    print()
    print(f"File:       {audio_path}")
    print(f"Prediction: {prediction}")
    print(f"Real:       {real_probability:.2%}")
    print(f"Fake:       {fake_probability:.2%}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python detect.py audio.wav")
        sys.exit(1)

    detect(sys.argv[1])
