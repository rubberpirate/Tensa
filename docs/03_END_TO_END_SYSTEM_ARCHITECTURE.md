# 03. End-to-End System Architecture & Data Flow

## 1. High-Level Architectural Blueprint

The framework implements a **Hierarchical, Dual-Tier Asynchronous Streaming Pipeline** designed to deliver instantaneous protection without introducing perceptible call latency or degrading voice quality.

```
                  ┌────────────────────────────────────────────────────────┐
                  │                 TELEPHONY & MEDIA INGEST               │
                  │  • SIP Trunk (SIPREC / Asterisk / FreeSWITCH)          │
                  │  • WebRTC Gateway (LiveKit / mediasoup)                │
                  │  • Enterprise Audio Virtual Driver (Teams / Zoom)      │
                  │  • Mobile SDK (Android In-Call Audio Tap)              │
                  └───────────────────────────┬────────────────────────────┘
                                              │ Real-Time RTP / WebSocket Stream
                                              ▼
                  ┌────────────────────────────────────────────────────────┐
                  │          INGESTION & BUFFER NORMALIZATION              │
                  │  • Opus/AMR/G.711 Decode -> Raw 16kHz PCM Float32      │
                  │  • Voice Activity Detector (Silero VAD / WebRTC VAD)   │
                  │  • 500ms Sliding Window Ring Buffer (250ms Overlap)    │
                  └─────────────┬────────────────────────────┬─────────────┘
                                │ Speech Frames Only         │
           ┌────────────────────┴────────┐                   │
           ▼                             ▼                   │
┌─────────────────────────────┐ ┌──────────────────────────┐ │
│   TIER-1: ULTRA-FAST DSP    │ │ TIER-2: DEEP NEURAL      │ │
│   HEURISTICS ENGINE         │ │ SENSING CLUSTER          │ │
│   (< 40ms Latency on CPU)   │ │ (< 160ms on GPU / NPU)   │ │
│                             │ │                          │ │
│ • Instantaneous Phase Var   │ │ • AASIST Graph Attention │ │
│ • Bicoherence / Bispectrum  │ │ • RawNet3 Sinc-Conv      │ │
│ • Pitch Jitter & Shimmer    │ │ • WavLM Multi-Layer SSL  │ │
│ • Spectral Rolloff/Nyquist  │ │ • Neural Vocoder Finger- │ │
│ • Respiration Detector      │ │   print Classifier       │ │
└──────────────┬──────────────┘ └────────────┬─────────────┘ │
               │ Fast Anomaly Vector         │ Deep Latent   │
               └──────────────┬──────────────┘ Probability   │
                              ▼                              │
┌────────────────────────────────────────────────────────┐   │
│         DYNAMIC CONTEXTUAL RISK SCORING ENGINE         │   │
│ • Sequential Bayesian Temporal Filter (Rolling updates)│   │
│ • Speaker Verification Delta (ECAPA-TDNN vs Enrollee)  │   │
│ • Acoustic Room Environment Mismatch Score             │   │
│ • Transaction Context Enricher (Amount, Sender, Urgency│◄──┘
└─────────────────────────────┬──────────────────────────┘
                              │ Dynamic Composite Risk: R(t) ∈ [0.00, 1.00]
                              ▼
┌────────────────────────────────────────────────────────┐
│           ACTIONABLE ALERTING & ENFORCEMENT            │
│ • Low (<0.35): Green - Normal Call Flow                │
│ • Medium (0.35 - 0.70): Amber - In-call Agent Prompt   │
│ • High (>0.70): Red - Transaction Block & Step-up MFA  │
└────────────────────────────────────────────────────────┘
```

---

## 2. Granular Data Flow & Processing Stages

### Stage 1: Ingestion & Buffer Normalization
1. **Audio Tap**: The audio is ingested as a dual-channel (stereo) RTP stream, where:
   - Channel 0: Remote caller (the entity being analyzed for impersonation).
   - Channel 1: Local agent or user (used for echo cancellation reference).
2. **Audio Decoding & Normalization**:
   - Ingested packets (AMR, G.711, Opus, AAC) are decoded in memory into raw 16-bit linear PCM.
   - Resampled to a standardized **16,000 Hz Float32 format** with peak normalization to $[-1.0, 1.0]$.
3. **Voice Activity Detection (VAD)**:
   - Evaluated using a low-footprint VAD (e.g., Silero VAD or WebRTC VAD).
   - Non-speech frames (silence, dial tones, line static) are bypassed from neural computation, saving ~40% server CPU cycles.
4. **Sliding Window Ring Buffer**:
   - Audio chunks are accumulated in a ring buffer with a window size of **500 ms** (8,000 samples) and a hop size of **250 ms** (4,000 samples).
   - This provides **4 dynamic evaluations per second**.

---

### Stage 2: Dual-Tier Asynchronous Detection

To achieve maximum throughput and minimal operational cost, analysis is split into two complementary tiers:

```
Incoming Window (500ms)
       │
       ├──────────────────────────────────────────┐
       ▼                                          ▼
[Tier-1: Fast DSP Engine]                 [Tier-2: Deep Neural Engine]
• Runs every 250ms on CPU.                • Runs on GPU/NPU worker queue.
• Computes: Phase variance,               • Computes: RawNet3/AASIST embeddings,
  Jitter/Shimmer, Bispectrum,               WavLM latent representations.
  High-frequency rolloff.                 • Produces calibrated synthetic
• Computes Fast Threat Indicator (FTI).     probability score P_deep(t).
       │                                          │
       └───────────────────┬──────────────────────┘
                           ▼
              [Bayesian Temporal Fusion]
```

#### Tier-1: Ultra-Fast DSP Heuristics Engine (< 40ms)
- Executes strictly on multi-threaded CPU without requiring GPU acceleration.
- Extracts mathematical indicators of digital synthesis (phase smearing, pitch smoothing, lack of physiological micro-tremors).
- Yields a **Fast Threat Indicator (FTI)**: $S_{\text{fast}} \in [0, 1]$.
- If $S_{\text{fast}} > 0.40$ or if the call has a high-value enterprise tag (e.g. flagged as VIP/C-Suite caller), the system immediately prioritizes Tier-2 neural compute.

#### Tier-2: Deep Neural Inference Engine (< 160ms)
- Batches incoming windows to an optimized inference runtime (e.g., ONNX Runtime with TensorRT or Triton).
- Runs an ensemble of:
  1. **RawNet3 / AASIST**: Direct waveform spectro-temporal graph attention.
  2. **WavLM Multi-Layer Extractor**: Probes intermediate transformer layers for vocoder-induced distribution shifts.
- Yields a **Deep Synthetic Probability**: $S_{\text{deep}} \in [0, 1]$.

---

## 3. Dynamic Contextual Risk Scoring Engine

A static single-window score creates jitter and false alarms. The Risk Engine applies a **Sequential Bayesian Temporal Filter** across time steps $t$:

### A. Bayesian Temporal Accumulation
Let $H_1$ be the hypothesis that the caller is synthetic, and $H_0$ that the caller is authentic. At window $t$:

$$\text{Odds}(H_1 | x_{1:t}) = \text{Odds}(H_1 | x_{1:t-1}) \times \frac{P(x_t | H_1)}{P(x_t | H_0)}$$

Transforming to log-odds (Log-Likelihood Ratio $L_t$):
$$L_t = \lambda L_{t-1} + \ln \left( \frac{P(x_t | H_1)}{P(x_t | H_0)} \right)$$
where $\lambda \in [0.85, 0.95]$ is a temporal decay factor that prevents historical noise from locking the system into a false state.

### B. Dynamic Composite Risk Formula
The final composite risk score $R(t)$ merges acoustic evidence with enterprise contextual telemetry:

$$R(t) = w_{\text{deep}} S_{\text{deep}}(t) + w_{\text{fast}} S_{\text{fast}}(t) + w_{\text{bio}} \Delta_{\text{biometric}}(t) + w_{\text{env}} M_{\text{environment}}(t) + C_{\text{context}}$$

Where:
- $\Delta_{\text{biometric}}(t)$: Speaker identity distance against enrolled CXO voiceprint (if enrollee profile active).
- $M_{\text{environment}}(t)$: Acoustic room impulse response (RIR) mismatch score (e.g., room echo vs reported geolocation).
- $C_{\text{context}}$: Contextual risk booster:
  - Caller ID from unregistered VoIP carrier (+0.15)
  - Off-hours emergency call (+0.10)
  - Keyword spotting indicates financial transaction / RTGS / OTP request (+0.20)

---

## 4. Latency Budget Breakdown (Target: < 400ms Total)

```
┌───────────────────────────────────────────────────────────┬──────────────┐
│ Pipeline Stage                                            │ Time Taken   │
├───────────────────────────────────────────────────────────┼──────────────┤
│ Audio Network Hop & Ingestion Buffer (Jitter Buffer)      │ 40 ms        │
│ Audio Decoding & VAD Pre-check                            │ 15 ms        │
│ Tier-1 DSP Feature Extraction                             │ 35 ms        │
│ Tier-2 Neural Model Inference (TensorRT / ONNX batch)     │ 120 ms       │
│ Bayesian Temporal Scoring & Context Enrichment            │ 10 ms        │
│ Alert Dispatch (WebSocket event / SIP Whisper push)       │ 20 ms        │
├───────────────────────────────────────────────────────────┼──────────────┤
│ TOTAL END-TO-END LATENCY:                                 │ ~ 240 ms     │
└───────────────────────────────────────────────────────────┴──────────────┘
```
*Result*: The system updates the risk score every **250 milliseconds** with an end-to-end evaluation lag of under **240 milliseconds**—well below the threshold of human conversational turn-taking (~500ms).

---

## 5. Security, Privacy & DPDP Act 2023 Compliance Architecture

```
                                  VOLATILE MEMORY ONLY (RAM)
                     ┌──────────────────────────────────────────────────┐
Audio Packets ─────► │ Ring Buffer (Max 2 seconds FIFO)                 │
                     │  • Resampled, analyzed, discarded immediately    │
                     └─────────┬───────────────────────────────┬────────┘
                               │                               │
                               ▼                               ▼
                 Feature Vectors & Metrics           Raw Audio Scrubbing
                 (LFCC, Bicoherence, Embeddings)     (Overwritten with zeros)
                               │
                               ▼
               Encrypted Metadata Audit Trail
               • Call ID: SHA-256(CallUUID + Salt)
               • Timestamp: UTC Epoch
               • Risk Score: 0.892
               • Artifacts Detected: ["PhaseSmear", "JitterDeficit"]
               • Raw Audio Stored: NO (0 bytes retained)
```

1. **Ephemeral RAM Buffering**: Audio frames reside exclusively in volatile memory ring buffers. No temporary `.wav` files are ever written to block storage or local disks.
2. **Zero-Knowledge Feature Logging**: Audit logs record solely mathematical metrics, confidence scores, and time stamps. Under India's DPDP Act 2023, mathematical feature vectors cannot be inverted back into human speech waveforms, guaranteeing end-to-end privacy.
3. **Forensic Quarantine Mode (Opt-in Enterprise Override)**: Only if an enterprise client enables fraud forensics AND risk crosses the critical threshold ($R(t) > 0.92$), the isolated 5-second attack snippet is encrypted with a client-held RSA-4096 public key and stored in an immutable WORM (Write Once, Read Many) vault for CERT-In reporting.
