"""
websocket.py — Real-Time Audio Streaming WebSocket Handler

Protocol:
  Client → Server: Binary PCM frames (16-bit signed, 16kHz mono)
                   + JSON control messages (session_init, session_end)

  Server → Client: JSON risk_update events every 250ms

Architecture:
  • Audio chunk arrives → VAD gate → Ring buffer push
  • Tier-1 DSP runs every 250ms on asyncio.ThreadPoolExecutor (CPU)
  • Tier-2 neural runs async on GPU worker (non-blocking, every ~1000ms)
  • Bayesian filter updated from both tiers independently
  • risk_update broadcast to WebSocket client every 250ms
"""

from __future__ import annotations

import asyncio
import json
import struct
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import numpy as np
from fastapi import WebSocket, WebSocketDisconnect

from app.codecs.simulator import TelephonySimulator
from app.core.config import settings
from app.core.ring_buffer import EphemeralRingBuffer
from app.dsp.tier1_engine import Tier1DSPEngine
from app.models.vad import VoiceActivityDetector
from app.models.tier2_engine import get_tier2_engine
from app.risk.contextual import CallContext, CallerChannelType
from app.risk.risk_engine import RiskEngine


# One CPU thread per DSP engine (non-blocking for asyncio event loop)
_dsp_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="tensa-dsp")

# Per-call session state
_sessions: dict[str, "CallSession"] = {}


# ---------------------------------------------------------------------------
# Session State
# ---------------------------------------------------------------------------

class CallSession:
    def __init__(self, call_id: str, context: CallContext, codec: str = "raw"):
        self.call_id = call_id
        self.context = context
        self.codec = codec
        self.ring_buffer = EphemeralRingBuffer()
        self.dsp_engine = Tier1DSPEngine()
        self.vad = VoiceActivityDetector()
        self.risk_engine = RiskEngine(call_id, context)
        self.tier2_engine = get_tier2_engine()
        self.hop_samples = int(settings.hop_ms * settings.sample_rate / 1000)
        self.pending_samples: np.ndarray = np.empty(0, dtype=np.float32)
        self._tier2_task: Optional[asyncio.Task] = None
        self._tier2_tick_counter: int = 0
        self._tier2_interval_ticks: int = 4  # run Tier-2 every 4 × 250ms = 1000ms
        self.latest_tier1_latency_ms: float = 0.0
        self.latest_tier2_latency_ms: Optional[float] = None

    def cleanup(self) -> None:
        """Zero-scrub all buffers on call end (DPDP compliance)."""
        self.ring_buffer.clear()
        self.tier2_engine.reset_session()


# ---------------------------------------------------------------------------
# WebSocket Handler
# ---------------------------------------------------------------------------

async def stream_audio_ws(websocket: WebSocket) -> None:
    """
    Main WebSocket handler. Accepts binary PCM and JSON control frames.
    Registered in main.py as: app.add_websocket_route("/v1/stream/detect", ...)
    """
    await websocket.accept()
    session: Optional[CallSession] = None

    channel_map = {
        "enterprise_sip": CallerChannelType.ENTERPRISE_SIP,
        "registered_voip": CallerChannelType.REGISTERED_VOIP,
        "REGISTERED_SIP": CallerChannelType.ENTERPRISE_SIP,
        "unregistered_voip": CallerChannelType.UNREGISTERED_VOIP,
        "UNREGISTERED_VOIP": CallerChannelType.UNREGISTERED_VOIP,
        "pstn_mobile": CallerChannelType.PSTN_MOBILE,
    }

    try:
        while True:
            # Receive next frame (may be bytes or text)
            try:
                data = await asyncio.wait_for(websocket.receive(), timeout=30.0)
            except asyncio.TimeoutError:
                await websocket.send_json({"event": "timeout", "message": "No data for 30s"})
                break

            # ── JSON control message ──────────────────────────────────
            if "text" in data:
                msg = json.loads(data["text"])
                event = msg.get("event") or msg.get("type", "")

                if event == "session_init":
                    session = _handle_session_init(msg)
                    _sessions[session.call_id] = session
                    await get_tier2_engine().load()  # warm up GPU model (non-blocking)
                    await websocket.send_json({
                        "event": "session_ready",
                        "call_id": session.call_id,
                        "message": "Tensa streaming active. Send 250ms PCM chunks.",
                    })

                elif event in ("context_update", "codec_update"):
                    if session:
                        payload = msg.get("data", {}) if isinstance(msg.get("data"), dict) else msg
                        meta = payload.get("metadata", {})
                        if "transaction_value_inr" in meta:
                            session.context.transaction_value_inr = float(meta["transaction_value_inr"])
                        if "is_off_hours" in meta:
                            session.context.is_off_hours = bool(meta["is_off_hours"])
                        if "call_channel" in payload:
                            session.context.caller_channel = channel_map.get(payload["call_channel"], session.context.caller_channel)
                        codec = meta.get("codec") or payload.get("codec")
                        if codec:
                            session.codec = str(codec).lower()

                        await websocket.send_json({
                            "event": "context_updated",
                            "call_id": session.call_id,
                            "codec": session.codec,
                            "status": "ok",
                        })

                elif event == "session_end":
                    if session:
                        session.cleanup()
                        del _sessions[session.call_id]
                    await websocket.send_json({"event": "session_closed"})
                    break

            # ── Binary PCM audio chunk ────────────────────────────────
            elif "bytes" in data:
                if session is None:
                    await websocket.send_json({"event": "error", "message": "Send session_init first"})
                    continue

                raw_bytes = data["bytes"]
                # Decode 16-bit signed PCM → float32 [-1, 1]
                n_samples = len(raw_bytes) // 2
                if n_samples == 0:
                    continue
                pcm_int16 = np.frombuffer(raw_bytes, dtype=np.int16)
                audio_f32 = pcm_int16.astype(np.float32) / 32768.0

                # Process chunk asynchronously
                risk_event = await _process_chunk(session, audio_f32, websocket)

                # Broadcast risk update
                if risk_event:
                    await websocket.send_json(_risk_event_to_dict(risk_event, session))

    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        if session:
            session.cleanup()
            _sessions.pop(session.call_id, None)


# ---------------------------------------------------------------------------
# Chunk Processing Pipeline
# ---------------------------------------------------------------------------

async def _process_chunk(
    session: CallSession,
    audio: np.ndarray,
    websocket: Optional[WebSocket] = None,
):
    """
    Process one audio chunk through the full pipeline:
      Codec degradation simulation → VAD → Ring buffer → Tier-1 DSP (CPU) → Tier-2 Neural (GPU, async) → Risk Engine
    """
    # Apply telecom codec degradation simulation if configured (e.g. PSTN, AMR, G.711)
    if session.codec and session.codec != "raw":
        audio = TelephonySimulator.apply_codec(audio, session.codec, sr=settings.sample_rate)

    # VAD gate — skip silence/DTMF
    if not session.vad.is_speech(audio):
        # Broadcast current risk snapshot even on silence so client stream remains active
        return session.risk_engine.current_event()

    # Accumulate in ring buffer (zero-scrub on eviction)
    session.ring_buffer.push(audio)

    # Accumulate pending samples for the 250ms hop trigger
    session.pending_samples = np.concatenate([session.pending_samples, audio])

    if len(session.pending_samples) < session.hop_samples:
        return session.risk_engine.current_event()

    # Take exactly one hop worth of samples
    hop_audio = session.pending_samples[:session.hop_samples]
    session.pending_samples = session.pending_samples[session.hop_samples:]

    # ── Tier-1 DSP (non-blocking CPU) ────────────────────────────────
    loop = asyncio.get_running_loop()
    tier1_result = await loop.run_in_executor(
        _dsp_executor,
        lambda: session.dsp_engine.process(hop_audio),
    )
    session.latest_tier1_latency_ms = tier1_result.latency_ms

    # ── Tier-2 Neural (non-blocking GPU, every 1000ms) ────────────────
    session._tier2_tick_counter += 1

    if session._tier2_tick_counter >= session._tier2_interval_ticks or \
       tier1_result.should_trigger_tier2:
        session._tier2_tick_counter = 0
        # Get full window audio from ring buffer for neural inference
        window_audio = session.ring_buffer.get_audio(
            max_samples=int(settings.window_ms * settings.sample_rate / 1000)
        )
        if len(window_audio) >= settings.sample_rate:  # at least 1s
            # Fire-and-forget: don't await — update risk engine and push to websocket when done
            asyncio.ensure_future(
                _run_tier2_and_update(session, window_audio, tier1_result.s_fast, websocket)
            )

    # ── Risk Engine: Tier-1 update (immediate) ────────────────────────
    risk_event = session.risk_engine.update_tier1(
        s_fast=tier1_result.s_fast,
        phase_inconsistency=tier1_result.phase_inconsistency,
        bicoherence_deficit=tier1_result.bicoherence_deficit,
        pitch_jitter_anomaly=tier1_result.pitch_jitter_anomaly,
        respiration_cadence_score=tier1_result.respiration_cadence_score,
        spectral_rolloff_anomaly=tier1_result.spectral_rolloff_anomaly,
    )

    return risk_event


async def _run_tier2_and_update(
    session: CallSession,
    window_audio: np.ndarray,
    s_fast: float,
    websocket: Optional[WebSocket] = None,
):
    """Fire-and-forget coroutine: runs Tier-2 and injects score into risk engine and notifies socket."""
    try:
        tier2_result = await session.tier2_engine.evaluate(window_audio, s_fast=s_fast)
        if tier2_result is not None:
            session.latest_tier2_latency_ms = tier2_result.latency_ms
            risk_event = session.risk_engine.update_tier2(tier2_result.prob_fake)
            if websocket is not None:
                try:
                    await websocket.send_json(_risk_event_to_dict(risk_event, session))
                except Exception:
                    pass
    except Exception:
        pass  # never crash the main pipeline


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _handle_session_init(msg: dict) -> CallSession:
    data = msg.get("data", {}) if isinstance(msg.get("data"), dict) else msg
    call_id = data.get("call_id") or msg.get("call_id", f"call_{int(time.time())}")
    channel = data.get("call_channel") or msg.get("context", {}).get("caller_channel", "unknown")

    channel_map = {
        "enterprise_sip": CallerChannelType.ENTERPRISE_SIP,
        "registered_voip": CallerChannelType.REGISTERED_VOIP,
        "REGISTERED_SIP": CallerChannelType.ENTERPRISE_SIP,
        "unregistered_voip": CallerChannelType.UNREGISTERED_VOIP,
        "UNREGISTERED_VOIP": CallerChannelType.UNREGISTERED_VOIP,
        "pstn_mobile": CallerChannelType.PSTN_MOBILE,
    }

    meta = data.get("metadata", {}) or msg.get("context", {})
    tx_val = meta.get("transaction_value_inr") or meta.get("transaction_amount_inr", 0)
    codec = meta.get("codec") or data.get("codec") or "raw"

    context = CallContext(
        call_id=call_id,
        caller_number=data.get("caller_number", ""),
        caller_channel=channel_map.get(channel, CallerChannelType.UNKNOWN),
        transaction_value_inr=float(tx_val),
        enrolled_target_id=data.get("enrolled_target_id"),
    )

    return CallSession(call_id=call_id, context=context, codec=str(codec).lower())


def _risk_event_to_dict(event, session: Optional[CallSession] = None) -> dict:
    m = event.metrics_breakdown
    return {
        "event": "risk_update",
        "data": {
            "call_id": event.call_id,
            "timestamp_ms": event.timestamp_ms,
            "composite_risk_score": event.composite_risk_score,
            "threat_level": event.threat_level,
            "action_recommended": event.action_recommended,
            "metrics_breakdown": {
                "s_fast": round(m.s_fast, 4),
                "phase_inconsistency": round(m.phase_inconsistency, 4),
                "bicoherence_deficit": round(m.bicoherence_deficit, 4),
                "pitch_jitter_anomaly": round(m.pitch_jitter_anomaly, 4),
                "respiration_cadence_score": round(m.respiration_cadence_score, 4),
                "spectral_rolloff_anomaly": round(m.spectral_rolloff_anomaly, 4),
                "s_deep": round(m.s_deep, 4) if m.s_deep is not None else None,
                "context_boost": round(m.context_boost, 4),
            },
            "context_reasons": event.context_reasons,
            "bayesian_log_odds": event.bayesian_log_odds,
            "window_count": event.bayesian_window_count,
            "tier1_latency_ms": round(session.latest_tier1_latency_ms, 2) if session else 0.0,
            "tier2_latency_ms": round(session.latest_tier2_latency_ms, 2) if session and session.latest_tier2_latency_ms is not None else None,
        },
    }
