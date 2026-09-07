# 06. Recommended Frameworks, Models & Datasets

This guide compiles state-of-the-art open-source projects, academic models, signal processing libraries, and datasets that can be leveraged to build and benchmark the solution without reinventing foundational wheels.

---

## 1. Open-Source Pre-Trained Detection Models

| Model Name | Paper / Provenance | Core Architecture | Key Strengths | GitHub / Hub Reference |
|---|---|---|---|---|
| **AASIST / AASIST-L** | Interspeech 2021 (ASVspoof Top Ranker) | Spectro-temporal Graph Attention Network | Models temporal & spectral artifact correlations simultaneously; robust across codecs. | [`clovaai/aasist`](https://github.com/clovaai/aasist) |
| **RawNet3 / RawNet2** | Interspeech 2022 | Learnable Sinc-convolutional filters on 1D raw waveform | Operates directly on raw audio without lossy Fourier transforms; catches vocoder transients. | [`Jungjee/RawNet`](https://github.com/Jungjee/RawNet) |
| **WavLM-Spoof** | Microsoft Research (ASVspoof 2021 LA) | Self-Supervised Transformer (WavLM-Large) + Attention Head | Unmatched out-of-domain generalization across unseen TTS algorithms. | [`microsoft/unilm`](https://github.com/microsoft/unilm/tree/master/wavlm) & HuggingFace |
| **ECAPA-TDNN** | SpeechBrain / Interspeech | Squeeze-and-Excitation Time-Delay Neural Network | State-of-the-art speaker verification; extracts 192-d speaker embeddings to detect timbre drift. | [`speechbrain/speechbrain`](https://github.com/speechbrain/speechbrain) |
| **LCNN (Light-CNN)** | ASVspoof 2019 / 2021 baseline | Max-Feature-Map (MFM) CNN on LFCCs | Extremely lightweight; runs in <10ms on low-end CPUs; ideal for Tier-1 fast filtering. | ASVspoof open baselines |

---

## 2. Digital Signal Processing (DSP) & Acoustic Libraries

| Library | Primary Use in Voice Shield | Why It Is Recommended |
|---|---|---|
| **Parselmouth (Praat Python Engine)** | Extraction of Jitter (local, rap, ppq5), Shimmer (local, apq3, dda), and $F_0$ pitch tracking. | Gold standard in clinical speech pathology; highly optimized C++ backend under Python bindings. |
| **OpenSMILE (audEERING)** | Extraction of standard acoustic feature sets (eGeMAPS: 88 acoustic/prosodic parameters). | Industrial grade; extracts pitch contours, harmonic-to-noise ratio (HNR), and formant frequencies in real-time. |
| **PyTorch Torchaudio** | GPU-accelerated STFT, MelSpectrogram, LFCC, and CQT transforms. | Native GPU batch processing; zero copy between audio buffers and PyTorch tensors. |
| **SciPy Signal & HOSA** | Bispectrum, Bicoherence, and higher-order spectral cumulants. | Computes third-order cross-cumulants to expose the absence of quadratic phase coupling in synthetic voices. |
| **Silero VAD** | Ultra-lightweight Voice Activity Detection (VAD). | Runs in < 1ms on CPU; prevents waste of inference cycles on silent or noisy non-speech telephony frames. |

---

## 3. Streaming Media & Telephony Infrastructure

| Framework | Role in System Architecture | Strengths & Trade-offs |
|---|---|---|
| **LiveKit** | Real-Time WebRTC Media Gateway | Modern Go-based server with client SDKs in React, iOS, and Android; built-in server-side audio taps and data channels. |
| **FreeSWITCH** | Carrier-Grade SIP B2BUA / Media Proxy | Supports `mod_audio_fork` to stream live RTP audio over WebSockets directly into the Python/Node.js detection backend. |
| **Kamailio** | Telecom SIP Router / SBC | World standard for carrier-grade SIP routing (used by tier-1 telecom operators); handles 100,000+ CPS (calls per second). |
| **Drachtio** | Node.js / C++ SIP Application Server | Clean JavaScript / TypeScript orchestration on top of standard SIP signaling; excellent for rapid hackathon telecom POCs. |
| **mediasoup** | Low-level WebRTC SFU library (Node.js/Rust) | Extreme performance; integrates into existing Node backends as a simple npm package. |

---

## 4. High-Performance Inference & Serving Engines

| Runtime Engine | Recommended Use Case | Performance Characteristics |
|---|---|---|
| **ONNX Runtime (with OpenVINO / TensorRT)** | **Recommended for SIH POC & Production** | Hardware-agnostic; quantizes models (INT8/FP16); yields 3x–6x speedup over vanilla PyTorch with deterministic memory. |
| **NVIDIA Triton Inference Server** | High-density enterprise deployment | Supports dynamic batching across thousands of concurrent calls; gRPC streaming audio pipeline. |
| **Ray Serve** | Scalable Python microservices | Seamless scaling of Python worker pools for DSP + Deep Learning across multiple CPU/GPU nodes. |

---

## 5. Benchmark & Training Datasets

### A. Academic Anti-Spoofing Benchmark Datasets
- **ASVspoof 2019 & 2021 (Logical Access & Deepfake tracks)**:
  - Contains over 100,000 genuine and synthetic speech utterances.
  - Covers 10+ legacy and modern neural TTS systems and voice conversion (VC) algorithms.
  - Includes telecom codec simulation tracks (evaluates models under G.711, AMR-NB, and lossy transmission).
- **In-The-Wild Audio Deepfake Dataset (Luc et al.)**:
  - Over 30 hours of real deepfake attacks harvested from politicians, CEOs, and public figures on YouTube and social media.
- **Audio Deepfake Detection (ADD) Challenge 2022 & 2023**:
  - Focuses on real-time conversational deepfakes, low-quality audio, and background noise.

### B. Indian Context & Multilingual Datasets (Crucial for SIH!)
- **AI4Bharat IndicVoices & Shrutilipi**:
  - Over 10,000+ hours of authentic Indian speech spanning 22 official languages with diverse regional accents and acoustic conditions.
  - Essential for calibrating false-positive rates on authentic Indian English and regional vernaculars.
- **IndicTTS (IIT Madras)**:
  - Text-to-speech corpus in 13 Indian languages; can be used to generate synthetic Indian voice attacks for robustness benchmarking.
- **Synthetic Attack Generation Suite for Hackathon Testing**:
  - Use open-source models (**XTTS-v2, F5-TTS, CosyVoice, ChatTTS**) and commercial APIs (**ElevenLabs**) to synthesize Hindi, Tamil, Telugu, and Hinglish cloned voices of prominent Indian figures to demonstrate real-time detection in live jury evaluations.
