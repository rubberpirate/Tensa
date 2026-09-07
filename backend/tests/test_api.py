"""
test_api.py — Integration tests for FastAPI endpoints and WebSocket streaming
"""

from __future__ import annotations

import os
import sys
import numpy as np
import pytest
from starlette.testclient import TestClient

# Ensure detection-model and backend are in path
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ROOT_DIR = os.path.abspath(os.path.join(BACKEND_DIR, ".."))
MODEL_DIR = os.path.join(ROOT_DIR, "detection-model")

for p in (BACKEND_DIR, MODEL_DIR):
    if p not in sys.path:
        sys.path.insert(0, p)

from app.main import app
from app.models.tier2_engine import get_tier2_engine


@pytest.fixture(scope="module")
def client():
    # Warm up tier2 engine before running client tests
    engine = get_tier2_engine()
    engine._load_sync()
    with TestClient(app) as test_client:
        yield test_client


def test_root_endpoint(client):
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "Tensa Voice Integrity Engine"
    assert "version" in data
    assert "X-Process-Time" in response.headers


def test_health_endpoint(client):
    response = client.get("/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "cuda_available" in data
    assert "device" in data
    assert "timestamp" in data


def test_config_endpoint(client):
    response = client.get("/v1/config")
    assert response.status_code == 200
    data = response.json()
    assert "risk_thresholds" in data
    assert "latency_budgets_ms" in data
    assert data["sample_rate"] == 16000
    assert data["window_ms"] == 1000


def test_detect_file_wav(client):
    wav_path = os.path.join(MODEL_DIR, "output.wav")
    if not os.path.exists(wav_path):
        pytest.skip("output.wav sample not found")

    with open(wav_path, "rb") as f:
        response = client.post("/v1/detect/file", files={"file": ("output.wav", f, "audio/wav")})

    assert response.status_code == 200
    data = response.json()
    assert data["prediction"] in ("REAL", "FAKE")
    assert 0.0 <= data["prob_fake"] <= 1.0
    assert 0.0 <= data["prob_real"] <= 1.0
    assert data["latency_ms"] > 0
    assert data["audio_duration_s"] > 0
    assert "dpdp_note" in data


def test_detect_file_invalid(client):
    response = client.post(
        "/v1/detect/file",
        files={"file": ("corrupt.wav", b"not-a-valid-audio-file", "audio/wav")},
    )
    assert response.status_code == 422


def test_websocket_stream_lifecycle(client):
    with client.websocket_connect("/v1/stream/detect") as websocket:
        # 1. Session Init
        websocket.send_json({
            "event": "session_init",
            "data": {
                "call_id": "test-call-001",
                "call_channel": "enterprise_sip",
                "caller_number": "+919876543210",
                "metadata": {
                    "transaction_value_inr": 250000.0,
                    "is_off_hours": True,
                    "codec": "raw",
                },
            },
        })
        init_resp = websocket.receive_json()
        assert init_resp["event"] == "session_ready"
        assert init_resp["call_id"] == "test-call-001"

        # 2. Context Update
        websocket.send_json({
            "event": "context_update",
            "data": {
                "call_id": "test-call-001",
                "metadata": {
                    "transaction_value_inr": 500000.0,
                    "codec": "g711_ulaw",
                },
            },
        })
        context_resp = websocket.receive_json()
        assert context_resp["event"] == "context_updated"
        assert context_resp["codec"] == "g711_ulaw"

        # 3. Stream 250ms Audio Frame (4000 int16 samples = 8000 bytes)
        t = np.linspace(0, 0.25, 4000, endpoint=False)
        tone = (np.sin(2 * np.pi * 300 * t) * 16384).astype(np.int16)
        websocket.send_bytes(tone.tobytes())

        risk_resp = websocket.receive_json()
        assert risk_resp["event"] == "risk_update"
        assert "data" in risk_resp
        r_data = risk_resp["data"]
        assert r_data["call_id"] == "test-call-001"
        assert 0.0 <= r_data["composite_risk_score"] <= 1.0
        assert r_data["threat_level"] in ("GREEN", "AMBER", "RED")
        assert "metrics_breakdown" in r_data
        assert "phase_inconsistency" in r_data["metrics_breakdown"]

        # 4. Session End
        websocket.send_json({"event": "session_end"})
        end_resp = websocket.receive_json()
        assert end_resp["event"] == "session_closed"
