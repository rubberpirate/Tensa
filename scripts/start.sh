#!/usr/bin/env bash
# start.sh — Launch Tensa backend and frontend concurrently
# Usage: ./scripts/start.sh

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$REPO_ROOT/.venv/bin"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🛡️  Project Tensa — Starting All Services"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Backend ────────────────────────────────────────────────────────────
echo ""
echo "► Starting FastAPI backend on http://localhost:8000 ..."
cd "$REPO_ROOT/backend"

# Add detection-model to PYTHONPATH for imports
export PYTHONPATH="$REPO_ROOT/detection-model:$REPO_ROOT/backend:$PYTHONPATH"

"$VENV/uvicorn" app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --reload \
    --log-level info &

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
    echo "⚠ Frontend not installed. Run: cd frontend && npm install"
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
