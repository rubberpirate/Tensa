"""
stream.py — Real-Time Streaming Audio WebSocket Endpoint

Handles continuous bidirectional PCM streaming:
  • Client → Server: 16kHz 16-bit signed PCM chunks + JSON control frames
  • Server → Client: 250ms risk_update events with Bayesian evidence & DSP radar breakdown
"""

from __future__ import annotations

import asyncio
import json
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.codecs.simulator import TelephonySimulator
from app.core.config import settings
from app.models.tier2_engine import get_tier2_engine
from app.risk.contextual import CallContext, CallerChannelType
from app.schemas.risk import MetricsBreakdown, RiskEventData, RiskUpdateEvent, ThreatLevel
from app.schemas.session import (
    ContextUpdatedResponse,
    SessionClosedResponse,
    SessionReadyResponse,
    WebSocketErrorResponse,
)
from app.services.session_manager import CallSession, get_session_manager

router = APIRouter()

# CPU worker pool for non-blocking Tier-1 DSP calculations
_dsp_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="tensa-dsp")


def shutdown_dsp_executor() -> None:
    """Cleanly shut down DSP thread executor on server exit."""
    _dsp_executor.shutdown(wait=False)


_CHANNEL_MAP = {
    "enterprise_sip": CallerChannelType.ENTERPRISE_SIP,
    "registered_voip": CallerChannelType.REGISTERED_VOIP,
    "REGISTERED_SIP": CallerChannelType.ENTERPRISE_SIP,
    "unregistered_voip": CallerChannelType.UNREGISTERED_VOIP,
    "UNREGISTERED_VOIP": CallerChannelType.UNREGISTERED_VOIP,
    "pstn_mobile": CallerChannelType.PSTN_MOBILE,
}


@router.websocket("/stream/detect")
@router.websocket("/stream")
async def stream_audio_ws(websocket: WebSocket) -> None:
    """
    Real-Time WebSocket streaming endpoint.
    Accepts 16-bit PCM chunks and outputs 250ms Bayesian threat evaluations.
    """
    await websocket.accept()
    session_manager = get_session_manager()
    session: Optional[CallSession] = None

    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive(), timeout=30.0)
            except asyncio.TimeoutError:
                await websocket.send_json(
                    WebSocketErrorResponse(message="No audio data received for 30s; session timeout").model_dump()
                )
                break

            # ── 1. Text Control Messages (JSON) ──────────────────────────
            if "text" in data:
                try:
                    msg = json.loads(data["text"])
                except json.JSONDecodeError:
                    await websocket.send_json(
                        WebSocketErrorResponse(message="Malformed JSON control message").model_dump()
                    )
                    continue

                event = msg.get("event") or msg.get("type", "")

                if event == "session_init":
                    session = _init_session(msg, session_manager)
                    # Non-blocking model warm up
                    asyncio.create_task(session.tier2_engine.load())
                    resp = SessionReadyResponse(call_id=session.call_id)
                    await websocket.send_json(resp.model_dump())

                elif event in ("context_update", "codec_update"):
                    if session:
                        _update_context(session, msg)
                        resp = ContextUpdatedResponse(call_id=session.call_id, codec=session.codec)
                        await websocket.send_json(resp.model_dump())

                elif event == "session_end":
                    if session:
                        session_manager.remove_session(session.call_id)
                        session = None
                    await websocket.send_json(SessionClosedResponse().model_dump())
                    break

            # ── 2. Binary PCM Audio Frames ───────────────────────────────
            elif "bytes" in data:
                if session is None:
                    await websocket.send_json(
                        WebSocketErrorResponse(message="Must send session_init before streaming audio").model_dump()
                    )
                    continue

                raw_bytes = data["bytes"]
                if len(raw_bytes) < 2:
                    continue

                # Fast zero-copy view of 16-bit PCM -> normalized float32 [-1, 1]
                pcm_int16 = np.frombuffer(raw_bytes, dtype=np.int16)
                audio_f32 = pcm_int16.astype(np.float32) / 32768.0

                # Process chunk through full cascaded pipeline
                risk_event = await _process_audio_chunk(session, audio_f32, websocket)
                if risk_event:
                    await websocket.send_json(_format_risk_event(risk_event, session).model_dump())

    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        if session:
            session_manager.remove_session(session.call_id)


# ── Pipeline Helper Functions ──────────────────────────────────────────

def _init_session(msg: dict, session_manager) -> CallSession:
    data = msg.get("data", {}) if isinstance(msg.get("data"), dict) else msg
    call_id = str(data.get("call_id") or msg.get("call_id") or f"call_{int(time.time())}")
    channel_str = data.get("call_channel") or msg.get("context", {}).get("caller_channel", "unknown")

    meta = data.get("metadata", {}) or msg.get("context", {})
    tx_val = meta.get("transaction_value_inr") or meta.get("transaction_amount_inr", 0)
    codec = meta.get("codec") or data.get("codec") or "raw"

    context = CallContext(
        call_id=call_id,
        caller_number=str(data.get("caller_number", "")),
        caller_channel=_CHANNEL_MAP.get(channel_str, CallerChannelType.UNKNOWN),
        transaction_value_inr=float(tx_val),
        is_off_hours=bool(meta.get("is_off_hours", False)),
        enrolled_target_id=data.get("enrolled_target_id"),
    )

    return session_manager.create_session(call_id=call_id, context=context, codec=str(codec).lower())


def _update_context(session: CallSession, msg: dict) -> None:
    payload = msg.get("data", {}) if isinstance(msg.get("data"), dict) else msg
    meta = payload.get("metadata", {})
    if "transaction_value_inr" in meta:
        session.context.transaction_value_inr = float(meta["transaction_value_inr"])
    if "is_off_hours" in meta:
        session.context.is_off_hours = bool(meta["is_off_hours"])
    if "call_channel" in payload:
        session.context.caller_channel = _CHANNEL_MAP.get(payload["call_channel"], session.context.caller_channel)
    codec = meta.get("codec") or payload.get("codec")
    if codec:
        session.codec = str(codec).lower()


async def _process_audio_chunk(
    session: CallSession,
    audio: np.ndarray,
    websocket: WebSocket,
):
    """
    Processes incoming PCM audio:
      1. Codec simulation (if active)
      2. VAD gate
      3. Ephemeral ring buffer accumulation
      4. Drains full 250ms hops through Tier-1 DSP
      5. Throttled async Tier-2 neural execution
    """
    # 1. Telephony codec degradation simulation
    if session.codec and session.codec != "raw":
        audio = TelephonySimulator.apply_codec(audio, session.codec, sr=settings.sample_rate)

    # 2. VAD gate: filter non-speech / line static
    if not session.vad.is_speech(audio):
        return session.risk_engine.current_event()

    # 3. Push to ephemeral ring buffer (DPDP zero-scrub on eviction)
    session.ring_buffer.push(audio)

    # 4. Accumulate pending samples
    session.pending_samples = np.concatenate([session.pending_samples, audio])

    latest_event = None
    loop = asyncio.get_running_loop()

    # Drain all complete 250ms hops from pending buffer
    while len(session.pending_samples) >= session.hop_samples:
        hop_audio = session.pending_samples[:session.hop_samples]
        session.pending_samples = session.pending_samples[session.hop_samples:]

        # Tier-1 DSP execution on CPU pool
        tier1_result = await loop.run_in_executor(
            _dsp_executor,
            lambda: session.dsp_engine.process(hop_audio),
        )
        session.latest_tier1_latency_ms = tier1_result.latency_ms
        session.tier2_tick_counter += 1

        # Tier-2 Neural Trigger (Throttled & Non-blocking)
        should_run_tier2 = (
            session.tier2_tick_counter >= session.tier2_interval_ticks or
            tier1_result.should_trigger_tier2
        )

        if should_run_tier2:
            session.tier2_tick_counter = 0
            window_audio = session.ring_buffer.get_audio(
                max_samples=int(settings.window_ms * settings.sample_rate / 1000)
            )
            # Only trigger if we have at least 1.0s and previous task is not still running
            if len(window_audio) >= settings.sample_rate:
                if session.tier2_task is None or session.tier2_task.done():
                    session.tier2_task = asyncio.create_task(
                        _run_tier2_background(session, window_audio, tier1_result.s_fast, websocket)
                    )

        # Update Risk Engine with Tier-1 metrics
        latest_event = session.risk_engine.update_tier1(
            s_fast=tier1_result.s_fast,
            phase_inconsistency=tier1_result.phase_inconsistency,
            bicoherence_deficit=tier1_result.bicoherence_deficit,
            pitch_jitter_anomaly=tier1_result.pitch_jitter_anomaly,
            respiration_cadence_score=tier1_result.respiration_cadence_score,
            spectral_rolloff_anomaly=tier1_result.spectral_rolloff_anomaly,
        )

    return latest_event or session.risk_engine.current_event()


async def _run_tier2_background(
    session: CallSession,
    window_audio: np.ndarray,
    s_fast: float,
    websocket: WebSocket,
) -> None:
    """Runs Tier-2 neural inference on GPU and pushes updated risk event to WebSocket."""
    try:
        tier2_result = await session.tier2_engine.evaluate(window_audio, s_fast=s_fast)
        if tier2_result is not None:
            session.latest_tier2_latency_ms = tier2_result.latency_ms
            risk_event = session.risk_engine.update_tier2(tier2_result.prob_fake)
            try:
                await websocket.send_json(_format_risk_event(risk_event, session).model_dump())
            except Exception:
                pass
    except asyncio.CancelledError:
        pass
    except Exception:
        pass


def _format_risk_event(event, session: CallSession) -> RiskUpdateEvent:
    """Maps internal RiskEvent dataclass to Pydantic RiskUpdateEvent."""
    m = event.metrics_breakdown
    return RiskUpdateEvent(
        data=RiskEventData(
            call_id=event.call_id,
            timestamp_ms=event.timestamp_ms,
            composite_risk_score=event.composite_risk_score,
            threat_level=ThreatLevel(event.threat_level),
            action_recommended=event.action_recommended,
            metrics_breakdown=MetricsBreakdown(
                s_fast=round(m.s_fast, 4),
                phase_inconsistency=round(m.phase_inconsistency, 4),
                bicoherence_deficit=round(m.bicoherence_deficit, 4),
                pitch_jitter_anomaly=round(m.pitch_jitter_anomaly, 4),
                respiration_cadence_score=round(m.respiration_cadence_score, 4),
                spectral_rolloff_anomaly=round(m.spectral_rolloff_anomaly, 4),
                s_deep=round(m.s_deep, 4) if m.s_deep is not None else None,
                context_boost=round(m.context_boost, 4),
            ),
            context_reasons=event.context_reasons,
            bayesian_log_odds=event.bayesian_log_odds,
            window_count=event.bayesian_window_count,
            tier1_latency_ms=round(session.latest_tier1_latency_ms, 2),
            tier2_latency_ms=round(session.latest_tier2_latency_ms, 2) if session.latest_tier2_latency_ms is not None else None,
        )
    )
