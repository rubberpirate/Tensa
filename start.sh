#!/usr/bin/env bash
# Project Tensa — Root Launcher Wrapper
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$REPO_ROOT/scripts/start.sh" "$@"
