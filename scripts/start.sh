#!/usr/bin/env bash
# start.sh — Launch Tensa backend and frontend concurrently
# Usage: ./scripts/start.sh

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🛡️  Project Tensa — Starting All Services"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Detect Python Interpreter ──────────────────────────────────────────
PYTHON_BIN=""
if [ -n "$VIRTUAL_ENV" ] && [ -x "$VIRTUAL_ENV/bin/python" ]; then
    PYTHON_BIN="$VIRTUAL_ENV/bin/python"
elif [ -x "$REPO_ROOT/.venv/bin/python" ]; then
    PYTHON_BIN="$REPO_ROOT/.venv/bin/python"
elif [ -x "$REPO_ROOT/detection-model/venv/bin/python" ]; then
    PYTHON_BIN="$REPO_ROOT/detection-model/venv/bin/python"
elif [ -x "$HOME/model-test/venv/bin/python" ]; then
    PYTHON_BIN="$HOME/model-test/venv/bin/python"
elif command -v uv >/dev/null 2>&1; then
    PYTHON_BIN="uv run python"
else
    PYTHON_BIN="$(command -v python3 || command -v python)"
fi

# ── Backend ────────────────────────────────────────────────────────────
echo ""
echo "► Starting FastAPI backend on http://localhost:8000 via $PYTHON_BIN ..."
$PYTHON_BIN "$REPO_ROOT/backend/run.py" --host 0.0.0.0 --port 8000 --reload &

BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"

# ── Frontend ───────────────────────────────────────────────────────────
if [ -d "$REPO_ROOT/frontend/node_modules" ]; then
    echo ""
    echo "► Starting Vite frontend on http://localhost:5173 ..."
    cd "$REPO_ROOT/frontend"
    npm run dev &
    FRONTEND_PID=$!
    echo "  Frontend PID: $FRONTEND_PID"
else
    echo ""
    echo "⚠ Frontend node_modules not detected. Run: cd frontend && npm install"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🟢 API Docs:       http://localhost:8000/docs"
echo "  🟢 WebSocket:      ws://localhost:8000/v1/stream/detect"
echo "  🟢 Dashboard:      http://localhost:5173"
echo "  Press Ctrl+C to stop all services."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Wait for Ctrl+C and clean up
trap "echo ''; echo 'Stopping services...'; kill $BACKEND_PID 2>/dev/null; kill $FRONTEND_PID 2>/dev/null; echo 'Done.'" SIGINT SIGTERM
wait
