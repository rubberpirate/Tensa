# Tensa Dialer Backend — Gemini Live Audio & AI Call Defense

Node.js backend service for Project Tensa's phone dialer simulator. Handles real-time speech-to-text transcription via **Gemini 3.5 Transcribe Live** and generates ultra-crisp, to-the-point post-call forensic summaries using **Gemini 3.5 Flash Lite**.

---

## 🌟 Key Features

1. **Gemini 3.5 Transcribe Live WebSocket Engine**:
   - WebSocket streaming endpoint: `/ws/dialer-live`
   - Accepts real-time 16kHz 16-bit mono PCM chunks from the frontend dialer.
   - Forwards audio stream directly to Google Gemini Multimodal Live API (`BidiGenerateContent`).
   - Streams incremental transcript turns (`transcript_delta`) back to the frontend in real time.
   - Built-in simulation fallback mode when `GEMINI_API_KEY` is not present, allowing friction-free testing.

2. **Gemini 3.5 Flash Lite Summarization**:
   - REST endpoint: `POST /api/dialer/summarize`
   - Analyzes accumulated call transcripts and caller forensic telemetry.
   - Returns concise, to-the-point security briefing:
     - **Headline**: Short 3-6 word summary.
     - **Caller Persona**: Claimed identity (e.g. Bank Security Officer).
     - **Scam Tactics**: Exploitation technique detected.
     - **Info Solicited**: Specific credentials requested (e.g. 6-digit OTP code).
     - **Threat Verdict**: Threat severity score and classification.
     - **Action Directive**: Immediate recommendation for the user.

3. **Dual Decision UI Flow**:
   - When synthetic AI voice clone is detected (`threat_level === 'RED'`), the user receives two options in the dialer UI:
     - **"Handle Call to AI"**: Hands the call over to Tensa's AI defense agent. Uploads audio chunks to this Node.js backend, renders live speech-to-text transcript feed, and generates Gemini 3.5 Flash Lite summary upon hangup.
     - **"Listen to Call"**: Keeps the user as a passive monitor on the line without AI agent intervention.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd dailer-backend
bun install
```

### 2. Configure Environment Variables
Create a `.env` file or copy from `.env.example`:
```env
PORT=8001
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_LIVE_MODEL=gemini-3.5-transcribe-live
GEMINI_SUMMARY_MODEL=gemini-3.5-flash-lite
```

> **Note**: If `GEMINI_API_KEY` is left blank, the backend automatically operates in simulated fallback mode with high-fidelity realistic dialogue.

### 3. Start the Backend
```bash
bun run src/server.js
# Or with dev hot reload:
bun run dev
```

---

## 📡 API & WebSocket Specification

### WebSocket: `/ws/dialer-live`
- **Client to Server**:
  - Binary messages: Raw 16kHz 16-bit PCM little-endian audio buffers (`ArrayBuffer` / `Buffer`).
  - JSON Control:
    ```json
    { "type": "init", "callId": "call-123456" }
    ```
- **Server to Client**:
  - Live transcript updates:
    ```json
    {
      "type": "transcript_delta",
      "delta": "We detected an unauthorized wire transfer...",
      "fullTranscript": "Hello? ...",
      "timestamp": 1788820000000
    }
    ```

### REST: `POST /api/dialer/summarize`
- **Request Body**:
  ```json
  {
    "transcript": "Caller claimed to be Agent Miller from fraud dept asking for OTP...",
    "callMetadata": {
      "callerName": "Suspected Bank Impersonator",
      "phoneNumber": "+1 (800) 555-0199",
      "aiScore": 0.94
    }
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "modelUsed": "gemini-3.5-flash-lite",
    "summary": {
      "headline": "Impersonation Scam Attempt Blocked",
      "callerPersona": "Fake Bank Fraud Investigator (Agent Miller)",
      "scamTactics": "Urgent wire transfer threat ($4,850 unauthorized withdrawal scare)",
      "infoSolicited": "6-digit mobile OTP verification code",
      "threatVerdict": "CRITICAL SYNTHETIC AI IMPERSONATION",
      "bulletPoints": [
        "Caller impersonated bank security citing fake $4,850 debit.",
        "Aggressively pressured victim to read 6-digit OTP verification code.",
        "Synthetic AI voice cloning signatures detected during transmission."
      ],
      "actionRecommended": "Do NOT share OTP. Number blocked. Report incident to bank fraud desk."
    }
  }
  ```

### Health Check: `GET /health`
```json
{
  "status": "ok",
  "service": "tensa-dialer-backend",
  "port": 8001,
  "models": {
    "transcription": "gemini-3.5-transcribe-live",
    "summary": "gemini-3.5-flash-lite"
  },
  "hasApiKey": true,
  "activeSessions": 1,
  "timestamp": "2026-09-08T04:00:00.000Z"
}
```
