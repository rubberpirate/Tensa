# 02. Comprehensive Voice Cloning Detection Metrics

To detect state-of-the-art neural voice cloning in real-time, the system cannot rely on a single heuristic. Modern synthesis pipelines (Diffusion TTS, VITS, HiFi-GAN, Voicebox, ElevenLabs) leave distinct digital and biomechanical footprints across **six distinct analytical domains**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MULTI-LAYER METRICS TAXONOMY                          │
├──────────────────────┬──────────────────────┬───────────────────────────────┤
│ 1. Spectral &        │ 2. Phase & Temporal  │ 3. Biomechanical & Prosodic   │
│    Frequency Domain  │    Domain            │    Domain                     │
├──────────────────────┼──────────────────────┼───────────────────────────────┤
│ 4. Neural Vocoder    │ 5. Deep Latent SSL   │ 6. Acoustic Environment &     │
│    Fingerprinting    │    Representations   │    Room Impulse Consistency   │
└──────────────────────┴──────────────────────┴───────────────────────────────┘
```

---

## 1. Spectral & Frequency-Domain Metrics

### A. Linear Frequency Cepstral Coefficients (LFCC)
- **Why MFCC fails**: Traditional speech recognition uses Mel-Frequency Cepstral Coefficients (MFCC), which compress higher frequencies based on human auditory perception. However, synthetic audio artifacts reside heavily in the linear high-frequency spectrum.
- **How LFCC works**: Uses a filter bank with linearly spaced triangular filters across the entire bandwidth.
- **Metric Output**: 20–60 dimensional cepstral feature vector + $\Delta$ (velocity) + $\Delta\Delta$ (acceleration).
- **Target Artifact**: Irregular harmonic spacing, unnatural spectral peaks, and synthetic filter bank ripples.

### B. Constant Q Cepstral Coefficients (CQCC)
- **Mechanism**: Utilizes the Constant Q Transform (CQT), where filter bandwidth is geometrically spaced with constant $Q = f / \Delta f$.
- **Target Artifact**: Excels at capturing artifacts across low fundamental frequencies ($F_0$) as well as high-frequency harmonics, exposing vocoder synthesis errors across octave transitions.

### C. Higher-Order Spectral Analysis (HOSA) - Bispectrum & Bicoherence
- **Mechanism**: The Fourier Transform computes power spectrum (second-order statistics), discarding phase relations. Bispectral analysis computes third-order cumulants:
  $$B(f_1, f_2) = E[X(f_1) \cdot X(f_2) \cdot X^*(f_1 + f_2)]$$
- **Target Artifact**:
  - **Human Speech**: Generates quadratic phase coupling (QPC) caused by the non-linear aerodynamic turbulence of vocal cords colliding with the vocal tract walls.
  - **Synthetic Speech**: Neural vocoders generate frequency bands independently or via transposed convolutions, resulting in **zero or collapsed bicoherence**.

### D. Spectral Rolloff & Wiener Entropy (Spectral Flatness)
- **Target Artifact**:
  - **High-frequency brick-wall cutoff**: Many fast TTS pipelines generate audio upsampled from 22.05 kHz or 24 kHz, leaving an abrupt energy drop at exact Nyquist boundaries (e.g. 11.025 kHz or 12 kHz) or aliased mirror energy.
  - **Spectral Flatness**: Ratio of geometric mean to arithmetic mean of power spectrum. Synthetic fricatives (/s/, /sh/, /f/) exhibit unnatural spectral flatness compared to human turbulent airflow.

---

## 2. Phase & Temporal Waveform Metrics

### A. Instantaneous Frequency & Phase Inconsistency
- **Mechanism**: Neural vocoders (such as HiFi-GAN, MelGAN, WaveGlow) synthesize time-domain waveforms from Mel-spectrograms. They estimate magnitude accurately, but phase reconstruction is fundamentally ill-posed.
- **Target Artifact**:
  - Unnatural phase wrapping and phase discontinuities.
  - Group delay distortions across phoneme transitions (e.g., transition from voiced vowel /a/ to unvoiced stop /t/).

### B. Transposed Convolution "Checkerboard" Artifacts
- **Mechanism**: Up-sampling layers in neural vocoders use 1D/2D transposed convolutions with kernel size not evenly divisible by stride.
- **Target Artifact**: High-frequency periodic temporal ripples (sub-millisecond amplitude spikes) visible in the raw waveform derivative, completely absent in human phonation.

### C. Zero-Crossing Rate (ZCR) Variance
- **Target Artifact**: In genuine human speech, ZCR during unvoiced segments exhibits high stochastic variance. Synthetic voices show overly deterministic, repetitive ZCR patterns due to deterministic random noise seed generation in TTS pipelines.

---

## 3. Biomechanical & Prosodic Metrics

### A. Fundamental Frequency ($F_0$) Micro-Dynamics (Jitter & Shimmer)
- **Jitter (Pitch Period Perturbation)**: Cycle-to-cycle variation in fundamental frequency.
  $$\text{Jitter} = \frac{\frac{1}{N-1} \sum_{i=1}^{N-1} |T_i - T_{i+1}|}{\frac{1}{N} \sum_{i=1}^{N} T_i}$$
  - **Natural Humans**: Involuntary neurological 8–12 Hz micro-tremors cause small physiological jitter (typically 0.5% - 1.5%).
  - **Cloned Voices**: Pitch curves are smoothed by neural duration and pitch predictors, producing **unnaturally pristine jitter (<0.1%)** or chaotic mathematical interpolation noise.
- **Shimmer (Amplitude Perturbation)**: Cycle-to-cycle variation in peak sound amplitude. Human lung pressure fluctuates naturally; cloned voices show rigid mathematical consistency.

### B. Physiological Respiration & Inhalation Cadence
- **Biological Constraint**: The human pulmonary system requires an inhalation pause every **3 to 7 seconds** depending on speech rate and lung capacity.
- **Acoustic Signature**: Genuine breathing produces an ingress airflow acoustic signature (sub-audible negative pressure sound) immediately preceding a pitch reset.
- **Target Artifact**:
  - Cloned speech often streams continuous speech for 10–20 seconds without a single physiological inhalation.
  - S2S or TTS systems that insert synthetic "breath" audio often reuse identical breath audio snippets (100% cross-correlation match across different pauses).

### C. Co-Articulation & Phoneme Transition Dynamics
- **Human Mechanism**: When humans transition from one sound to another (e.g., "b" to "a"), the tongue and lips physically travel through space, causing gradual continuous formant shifts ($F_1, F_2, F_3$).
- **Synthetic Flaw**: Cloned voices generated from concatenated phonemes or low-capacity models show discrete "formant jumps" where vocal tract geometry shifts faster than biological limits permit (>50 mm/sec equivalent tongue movement).

---

## 4. Deep Latent & Neural Representation Metrics

### A. Self-Supervised Speech Foundation Models (WavLM / HuBERT / Wav2Vec 2.0)
- **Layer-wise Latent Discrepancy**:
  - WavLM processes raw audio through 12 to 24 transformer layers.
  - **Lower layers (1-4)** encode acoustic and phase properties (microphone, codec, vocoder artifacts).
  - **Higher layers (8-12)** encode phonetic, semantic, and linguistic content.
  - By computing the cosine distance or feeding multi-layer hidden embeddings into a classification head, the model detects when high-level phonetics are human-like but low-level acoustic representations contain synthetic generation footprints.

### B. Spectro-Temporal Graph Attention (AASIST Architecture)
- **Mechanism**: Represents the audio spectrogram as a graph where nodes correspond to spectro-temporal regions and edges represent temporal and spectral dependencies.
- **Target Artifact**: Graph attention networks excel at spotting subtle non-local dependencies—such as a spectral glitch occurring in synchronization with a neural pitch step 200ms earlier.

### C. Raw Waveform Sinc-Filters (RawNet2 / RawNet3)
- **Mechanism**: Replaces standard Fourier STFT with parameter-learnable Sinc-convolutional filter banks directly on raw 1D PCM audio.
- **Target Artifact**: Filters tune automatically to the narrow frequency bands where synthetic neural upsampling produces quantization errors.

---

## 5. Biometric Consistency (Target Enrollee Verification)

When protecting high-value targets (e.g., Company CXO, Director, Authorized Treasury Official):
- **Deep Speaker Embeddings (ECAPA-TDNN / x-vector)**:
  - Extract a 192-dimensional speaker identity vector.
  - Compute Cosine Similarity between live caller stream and enrolled genuine voice sample.
- **The "Uncanny Timbre" Metric**:
  - Cloned voices often score high on coarse speaker similarity (e.g., 0.85 cosine similarity), but show abnormal **intra-utterance drift** (the voice sounds 95% like the CEO on vowels, but drops to 45% similarity on nasal consonants /m/, /n/ and voiced plosives /d/, /g/).

---

## 6. Acoustic Environment & Room Impulse Consistency (RIR)

In real-world fraud scenarios (e.g., attacker claiming to be in an airport lounge, factory, or corporate boardroom):
- **Reverberation Time ($RT_{60}$)**: Time required for sound pressure to drop by 60 dB. Human speech excites the physical room acoustics. Cloned speech from an online API is dry (anechoic) unless artificially reverberated.
- **Acoustic Floor Decoupling**: If an attacker superimposes fake background noise (e.g., looped airport sound), the speech signal and background noise show zero phase-coherence, mismatched room impulse responses, and sudden phase interruptions when the voice begins or ends.

---

## 7. Metrics Evaluation Matrix for Live Telephony

| Metric Domain | Metric Name | Computational Overhead | Robustness to 8kHz / 16kHz Codecs | Noise Resilience | Primary Artifact Detected |
|---|---|---|---|---|---|
| **Spectral** | LFCC + $\Delta\Delta$ | Ultra Low (< 5ms) | ⭐⭐⭐⭐ (High) | ⭐⭐⭐ (Med) | Filter bank & harmonic anomalies |
| **Spectral** | Bispectrum / Bicoherence | Low (10–15ms) | ⭐⭐⭐ (Med) | ⭐⭐⭐⭐ (High) | Lack of non-linear vocal tract coupling |
| **Spectral** | Spectral Rolloff / Nyquist | Ultra Low (< 2ms) | ⭐⭐ (Low - codec strips) | ⭐⭐ (Low) | Model upsampling cutoff frequency |
| **Phase** | Instantaneous Phase Inconsistency | Low (5–10ms) | ⭐⭐⭐ (Med) | ⭐⭐⭐ (Med) | Neural vocoder phase smearing |
| **Biomechanical**| Jitter & Shimmer ($F_0$) | Very Low (8ms) | ⭐⭐⭐⭐ (High) | ⭐⭐⭐ (Med) | Unnatural pitch smoothing / missing tremors |
| **Biomechanical**| Respiration Pause Cadence | Low (10ms on sliding win) | ⭐⭐⭐⭐⭐ (Very High) | ⭐⭐⭐⭐ (High) | Non-biological absence of breath |
| **Deep Neural** | Sinc-Convolutions (RawNet3) | Moderate (25–40ms) | ⭐⭐⭐⭐⭐ (Very High) | ⭐⭐⭐⭐ (High) | Direct raw waveform vocoder glitches |
| **Deep Neural** | Graph Attention (AASIST) | Moderate (35–50ms) | ⭐⭐⭐⭐⭐ (Very High) | ⭐⭐⭐⭐ (High) | Multi-scale spectro-temporal artifacts |
| **Deep SSL** | WavLM Hidden Representations | High (80–140ms on GPU) | ⭐⭐⭐⭐⭐ (Very High) | ⭐⭐⭐⭐⭐ (Very High) | Deep latent synthetic manifold divergence |
| **Biometric** | ECAPA-TDNN Speaker Delta | Low (20ms) | ⭐⭐⭐⭐ (High) | ⭐⭐⭐⭐ (High) | Intra-utterance timbre drift & impersonation |
