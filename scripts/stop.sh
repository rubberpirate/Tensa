#!/usr/bin/env bash
# ==============================================================================
# stop.sh — Stop All Project Tensa Services
#
# Usage:
#   ./stop.sh
#   ./scripts/stop.sh
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/backend/run.py" ]; then
    REPO_ROOT="$SCRIPT_DIR"
elif [ -f "$SCRIPT_DIR/../backend/run.py" ]; then
    REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
else
    REPO_ROOT="$(pwd)"
fi

exec "$REPO_ROOT/scripts/start.sh" --stop "$@"
