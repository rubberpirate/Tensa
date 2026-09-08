#!/usr/bin/env bash
# Project Tensa — Root Stopper Wrapper
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$REPO_ROOT/scripts/stop.sh" "$@"
