#!/usr/bin/env bash
# ==============================================================================
# start.sh — Launch Project Tensa Services Concurrently
#
# Services managed:
#   1. Model Preloader Daemon (PyTorch inference IPC server)   -> tcp://127.0.0.1:50000
#   2. FastAPI Backend (Voice cloning detection & telemetry)  -> http://localhost:8000
#   3. Dialer Backend (Gemini Live STT & call summarization) -> http://localhost:8001
#   4. React + Vite Frontend (SOC Cyber Dashboard & Call UI) -> http://localhost:5173
#
# Usage:
#   ./start.sh               # Foreground live logs (Ctrl+C to stop)
#   ./start.sh --detach      # Run in background with logs in logs/
#   ./start.sh --status      # Check health of all services
#   ./start.sh --stop        # Terminate all running services
#   ./start.sh --force       # Auto-kill/stop port conflicts without prompting
# ==============================================================================

set -eo pipefail

# ── ANSI Color Codes ──────────────────────────────────────────────────────────
COLOR_RESET=$'\033[0m'
COLOR_BOLD=$'\033[1m'
COLOR_RED=$'\033[1;31m'
COLOR_GREEN=$'\033[1;32m'
COLOR_YELLOW=$'\033[1;33m'
COLOR_BLUE=$'\033[1;34m'
COLOR_MAGENTA=$'\033[1;35m'
COLOR_CYAN=$'\033[1;36m'
COLOR_DIM=$'\033[2m'

# ── Logging Helpers ───────────────────────────────────────────────────────────
log_info()    { echo -e "${COLOR_BLUE}ℹ${COLOR_RESET}  $1"; }
log_success() { echo -e "${COLOR_GREEN}✔${COLOR_RESET}  $1"; }
log_warn()    { echo -e "${COLOR_YELLOW}⚠${COLOR_RESET}  $1"; }
log_error()   { echo -e "${COLOR_RED}✖${COLOR_RESET}  $1"; }
log_step()    { echo -e "${COLOR_BOLD}► $1${COLOR_RESET}"; }

# ── Resolve Repository Root ───────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/backend/run.py" ]; then
    REPO_ROOT="$SCRIPT_DIR"
elif [ -f "$SCRIPT_DIR/../backend/run.py" ]; then
    REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
else
    REPO_ROOT="$(pwd)"
fi

# ── Parse Command Line Options ────────────────────────────────────────────────
DETACH_MODE=false
SHOW_STATUS=false
DO_STOP=false
AUTO_FORCE=false
NO_RELOAD=false

print_help() {
    cat << 'EOF'
Project Tensa — Unified Service Launcher

Usage:
  ./start.sh [options]
  ./scripts/start.sh [options]

Options:
  -d, --detach, --background   Run all services in background (logs in logs/)
  -s, --status                 Show health status of all 4 services and exit
  --stop                       Stop all active Tensa services and exit
  -f, --force                  Automatically resolve port conflicts (kill conflicting processes/containers)
  --no-reload                  Disable dev hot-reloading for backend and dialer
  -h, --help                   Display this help message and exit

Services:
  • Model Preloader:       tcp://127.0.0.1:50000 (PyTorch CUDA warm daemon)
  • FastAPI Backend:       http://localhost:8000 (Docs: /docs, WS: /v1/stream/detect)
  • Dialer Backend:        http://localhost:8001 (Health: /health, WS: /ws/dialer-live)
  • Frontend (Vite):       http://localhost:5173
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -d|--detach|--background)
            DETACH_MODE=true
            shift
            ;;
        -s|--status)
            SHOW_STATUS=true
            shift
            ;;
        --stop)
            DO_STOP=true
            shift
            ;;
        -f|--force)
            AUTO_FORCE=true
            shift
            ;;
        --no-reload)
            NO_RELOAD=true
            shift
            ;;
        -h|--help)
            print_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            print_help
            exit 1
            ;;
    esac
done

# ── Port Check Helper ─────────────────────────────────────────────────────────
is_port_in_use() {
    local port="$1"
    python3 -c "import socket, sys; s = socket.socket(); sys.exit(0 if s.connect_ex(('127.0.0.1', int('$port'))) == 0 else 1)" 2>/dev/null
}

# ── Status Inspection ─────────────────────────────────────────────────────────
show_status() {
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "  🛡️  ${COLOR_BOLD}Project Tensa — Service Status${COLOR_RESET}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # 1. Preloader Daemon (50000)
    if is_port_in_use 50000; then
        echo -e "  ${COLOR_GREEN}●${COLOR_RESET} Model Preloader Daemon:${COLOR_GREEN} RUNNING${COLOR_RESET} (Port 50000)"
        echo -e "    ${COLOR_DIM}Endpoint: tcp://127.0.0.1:50000 (IPC daemon)${COLOR_RESET}"
    else
        echo -e "  ${COLOR_RED}○${COLOR_RESET} Model Preloader Daemon:${COLOR_RED} STOPPED${COLOR_RESET} (Port 50000)"
    fi
    
    # 2. Backend (8000)
    if is_port_in_use 8000; then
        echo -e "  ${COLOR_GREEN}●${COLOR_RESET} FastAPI Backend:       ${COLOR_GREEN}RUNNING${COLOR_RESET} (Port 8000)"
        echo -e "    ${COLOR_DIM}Docs: http://localhost:8000/docs${COLOR_RESET}"
        echo -e "    ${COLOR_DIM}WS:   ws://localhost:8000/v1/stream/detect${COLOR_RESET}"
    else
        echo -e "  ${COLOR_RED}○${COLOR_RESET} FastAPI Backend:       ${COLOR_RED}STOPPED${COLOR_RESET} (Port 8000)"
    fi

    # 3. Dialer Backend (8001)
    if is_port_in_use 8001; then
        echo -e "  ${COLOR_GREEN}●${COLOR_RESET} Dialer Backend:        ${COLOR_GREEN}RUNNING${COLOR_RESET} (Port 8001)"
        echo -e "    ${COLOR_DIM}API:  http://localhost:8001/health${COLOR_RESET}"
        echo -e "    ${COLOR_DIM}WS:   ws://localhost:8001/ws/dialer-live${COLOR_RESET}"
    else
        echo -e "  ${COLOR_RED}○${COLOR_RESET} Dialer Backend:        ${COLOR_RED}STOPPED${COLOR_RESET} (Port 8001)"
    fi

    # 4. Frontend (5173)
    if is_port_in_use 5173; then
        echo -e "  ${COLOR_GREEN}●${COLOR_RESET} Vite Frontend UI:      ${COLOR_GREEN}RUNNING${COLOR_RESET} (Port 5173)"
        echo -e "    ${COLOR_DIM}URL:  http://localhost:5173${COLOR_RESET}"
    else
        echo -e "  ${COLOR_RED}○${COLOR_RESET} Vite Frontend UI:      ${COLOR_RED}STOPPED${COLOR_RESET} (Port 5173)"
    fi

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

if [ "$SHOW_STATUS" = true ]; then
    show_status
    exit 0
fi

# ── Stop Operation ────────────────────────────────────────────────────────────
stop_services() {
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "  🛑 ${COLOR_BOLD}Stopping Project Tensa Services${COLOR_RESET}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    local stopped_any=false
    local pid_file="$REPO_ROOT/.tensa.pids"

    # 1. Stop saved PIDs from .tensa.pids
    if [ -f "$pid_file" ]; then
        while read -r pid; do
            if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
                log_info "Stopping tracked PID $pid..."
                kill -TERM "$pid" 2>/dev/null || true
                stopped_any=true
            fi
        done < "$pid_file"
        rm -f "$pid_file"
    fi

    # 2. Check and terminate remaining listeners on 50000, 8000, 8001, 5173
    for port in 50000 8000 8001 5173; do
        if is_port_in_use "$port"; then
            local pids=()
            if command -v lsof >/dev/null 2>&1; then
                pids=($(lsof -ti :"$port" 2>/dev/null || true))
            elif command -v fuser >/dev/null 2>&1; then
                pids=($(fuser "$port"/tcp 2>/dev/null | tr -d ' ' || true))
            fi
            if [ ${#pids[@]} -gt 0 ]; then
                for p in "${pids[@]}"; do
                    log_info "Stopping process $p on port $port..."
                    kill -TERM "$p" 2>/dev/null || true
                    stopped_any=true
                done
            fi
        fi
    done

    sleep 1

    # 3. Force kill lingering processes on these ports if still active
    for port in 50000 8000 8001 5173; do
        if is_port_in_use "$port"; then
            local pids=()
            if command -v lsof >/dev/null 2>&1; then
                pids=($(lsof -ti :"$port" 2>/dev/null || true))
            fi
            if [ ${#pids[@]} -gt 0 ]; then
                for p in "${pids[@]}"; do
                    kill -9 "$p" 2>/dev/null || true
                done
            fi
        fi
    done

    if [ "$stopped_any" = true ]; then
        log_success "All Tensa services stopped cleanly."
    else
        log_info "No active Tensa services found running."
    fi
}

if [ "$DO_STOP" = true ]; then
    stop_services
    exit 0
fi

# ── Banner ────────────────────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  🛡️  ${COLOR_BOLD}Project Tensa — Starting All Services${COLOR_RESET}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Port Conflict Check & Resolution ──────────────────────────────────────────
resolve_port_conflict() {
    local port="$1"
    local service="$2"
    
    if ! is_port_in_use "$port"; then
        return 0
    fi
    
    log_warn "Port $port ($service) is already in use!"

    # 1. Check for Docker container mapping this port
    if command -v docker >/dev/null 2>&1; then
        local docker_match
        docker_match=$(docker ps --filter "publish=$port" --format "{{.Names}} (ID: {{.ID}}, Image: {{.Image}})" 2>/dev/null || true)
        if [ -n "$docker_match" ]; then
            log_warn "Occupied by Docker container: $docker_match"
            local container_name
            container_name=$(docker ps --filter "publish=$port" --format "{{.Names}}" 2>/dev/null | head -n 1)
            
            if [ "$AUTO_FORCE" = true ]; then
                log_info "Stopping Docker container '$container_name' automatically (--force)..."
                docker stop "$container_name" >/dev/null 2>&1 || true
            elif [ -t 0 ]; then
                read -r -p "  Stop container '$container_name' to free port $port? [y/N]: " answer
                if [[ "$answer" =~ ^[Yy]$ ]]; then
                    docker stop "$container_name" >/dev/null 2>&1 || true
                    log_success "Stopped container '$container_name'."
                else
                    log_error "Cannot start $service while port $port is occupied."
                    exit 1
                fi
            else
                log_error "To free port $port, run: docker stop $container_name (or run ./start.sh --force)"
                exit 1
            fi
        fi
    fi

    # 2. Check for host processes
    if is_port_in_use "$port"; then
        local pids=()
        if command -v lsof >/dev/null 2>&1; then
            pids=($(lsof -ti :"$port" 2>/dev/null || true))
        elif command -v fuser >/dev/null 2>&1; then
            pids=($(fuser "$port"/tcp 2>/dev/null | tr -d ' ' || true))
        fi

        if [ ${#pids[@]} -gt 0 ]; then
            log_warn "Occupied by host PID(s): ${pids[*]}"
            if [ "$AUTO_FORCE" = true ]; then
                log_info "Terminating conflicting PID(s) ${pids[*]} automatically (--force)..."
                for p in "${pids[@]}"; do
                    kill -9 "$p" 2>/dev/null || true
                done
            elif [ -t 0 ]; then
                read -r -p "  Terminate process(es) ${pids[*]} to free port $port? [y/N]: " answer
                if [[ "$answer" =~ ^[Yy]$ ]]; then
                    for p in "${pids[@]}"; do
                        kill -9 "$p" 2>/dev/null || true
                    done
                    log_success "Terminated conflicting process(es)."
                else
                    log_error "Cannot start $service while port $port is occupied."
                    exit 1
                fi
            else
                log_error "To free port $port, run: kill -9 ${pids[*]} (or run ./start.sh --force)"
                exit 1
            fi
        fi
    fi

    # Brief pause to verify release
    sleep 0.5
    if is_port_in_use "$port"; then
        log_error "Port $port is still in use. Please free it and try again."
        exit 1
    fi
    log_success "Port $port is free."
}

log_step "Checking network ports..."
resolve_port_conflict 50000 "Model Preloader Daemon"
resolve_port_conflict 8000  "FastAPI Backend"
resolve_port_conflict 8001  "Dialer Backend"
resolve_port_conflict 5173  "Vite Frontend"

# ── Detect Python Interpreter ─────────────────────────────────────────────────
log_step "Detecting Python runtime..."
PYTHON_BIN=""
if [ -n "$VIRTUAL_ENV" ] && [ -x "$VIRTUAL_ENV/bin/python" ]; then
    PYTHON_BIN="$VIRTUAL_ENV/bin/python"
elif [ -x "$REPO_ROOT/.venv/bin/python" ]; then
    PYTHON_BIN="$REPO_ROOT/.venv/bin/python"
elif [ -x "$REPO_ROOT/detection-model/venv/bin/python" ]; then
    PYTHON_BIN="$REPO_ROOT/detection-model/venv/bin/python"
elif command -v uv >/dev/null 2>&1; then
    PYTHON_BIN="uv run python"
else
    PYTHON_BIN="$(command -v python3 || command -v python)"
fi
log_success "Using Python: $PYTHON_BIN"

# ── Detect Node / Bun Runtime for Dialer Backend ──────────────────────────────
log_step "Configuring Dialer Backend..."
DIALER_RUNNER=""
if command -v bun >/dev/null 2>&1; then
    DIALER_RUNNER="bun"
elif command -v node >/dev/null 2>&1; then
    DIALER_RUNNER="node"
else
    log_error "Neither bun nor node found in PATH. Please install Bun or Node.js."
    exit 1
fi
log_success "Using Dialer Runtime: $DIALER_RUNNER"

# Prepare dialer-backend dependencies
DIALER_DIR="$REPO_ROOT/dailer-backend"
if [ ! -d "$DIALER_DIR/node_modules/express" ]; then
    log_info "Installing dependencies in dailer-backend..."
    (
        cd "$DIALER_DIR"
        if [ "$DIALER_RUNNER" = "bun" ]; then
            bun install
        else
            npm install
        fi
    )
    log_success "Dialer dependencies ready."
fi

# Ensure dailer-backend .env exists
if [ ! -f "$DIALER_DIR/.env" ]; then
    if [ -f "$DIALER_DIR/.env.example" ]; then
        cp "$DIALER_DIR/.env.example" "$DIALER_DIR/.env"
        log_info "Created dailer-backend/.env from .env.example"
    else
        cat << 'EOF' > "$DIALER_DIR/.env"
PORT=8001
GEMINI_API_KEY=
GEMINI_LIVE_MODEL=gemini-3.5-transcribe-live
GEMINI_SUMMARY_MODEL=gemini-3.5-flash-lite
EOF
        log_info "Created default dailer-backend/.env"
    fi
fi

# ── Prepare Frontend Dependencies ─────────────────────────────────────────────
log_step "Configuring Frontend..."
FRONTEND_DIR="$REPO_ROOT/frontend"
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    log_info "Installing dependencies in frontend..."
    (
        cd "$FRONTEND_DIR"
        if command -v npm >/dev/null 2>&1; then
            npm install
        elif command -v bun >/dev/null 2>&1; then
            bun install
        fi
    )
    log_success "Frontend dependencies ready."
fi

# ── Prepare Commands ──────────────────────────────────────────────────────────
# 1. Model Preloader Daemon command
PRELOADER_CMD=($PYTHON_BIN "$REPO_ROOT/detection-model/preload_model.py")

# 2. Backend command
if [ "$NO_RELOAD" = true ]; then
    BACKEND_CMD=($PYTHON_BIN "$REPO_ROOT/backend/run.py" --host 0.0.0.0 --port 8000)
else
    BACKEND_CMD=($PYTHON_BIN "$REPO_ROOT/backend/run.py" --host 0.0.0.0 --port 8000 --reload)
fi

# 3. Dialer command
if [ "$DIALER_RUNNER" = "bun" ]; then
    if [ "$NO_RELOAD" = true ]; then
        DIALER_CMD=(bun run src/server.js)
    else
        DIALER_CMD=(bun run dev)
    fi
else
    if [ "$NO_RELOAD" = true ]; then
        DIALER_CMD=(node src/server.js)
    else
        DIALER_CMD=(node --watch src/server.js)
    fi
fi

# 4. Frontend command
if command -v npm >/dev/null 2>&1; then
    FRONTEND_CMD=(npm run dev)
else
    FRONTEND_CMD=(bun run dev)
fi

# ── Service Readiness Waiter ──────────────────────────────────────────────────
wait_for_services() {
    local max_retries=40
    local count=0
    local p_ready=false
    local b_ready=false
    local d_ready=false
    local f_ready=false

    echo -ne "  ⏳ Initializing services..."
    while [ $count -lt $max_retries ]; do
        if [ "$p_ready" = false ] && is_port_in_use 50000; then
            p_ready=true
        fi
        if [ "$b_ready" = false ] && curl -s -f http://localhost:8000/docs >/dev/null 2>&1; then
            b_ready=true
        fi
        if [ "$d_ready" = false ] && curl -s -f http://localhost:8001/health >/dev/null 2>&1; then
            d_ready=true
        fi
        if [ "$f_ready" = false ] && curl -s -f http://localhost:5173/ >/dev/null 2>&1; then
            f_ready=true
        fi

        if [ "$p_ready" = true ] && [ "$b_ready" = true ] && [ "$d_ready" = true ] && [ "$f_ready" = true ]; then
            echo -e "\r  ✅ All services initialized and responding!              "
            return 0
        fi

        sleep 0.5
        count=$((count + 1))
        echo -ne "."
    done
    echo ""
    log_warn "Services started, but some took longer than expected to report ready."
}

# ── Print Dashboard Banner ────────────────────────────────────────────────────
print_active_banner() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "  🛡️  ${COLOR_BOLD}PROJECT TENSA — ALL SERVICES ONLINE${COLOR_RESET}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "  🟢 ${COLOR_BOLD}Model Preloader Daemon:${COLOR_RESET}   tcp://127.0.0.1:50000 (IPC)"
    echo -e "  🟢 ${COLOR_BOLD}Frontend Dashboard:${COLOR_RESET}       http://localhost:5173"
    echo -e "  🟢 ${COLOR_BOLD}FastAPI Backend Docs:${COLOR_RESET}     http://localhost:8000/docs"
    echo -e "  🟢 ${COLOR_BOLD}Voice Stream WebSocket:${COLOR_RESET}   ws://localhost:8000/v1/stream/detect"
    echo -e "  🟢 ${COLOR_BOLD}Dialer Backend Health:${COLOR_RESET}    http://localhost:8001/health"
    echo -e "  🟢 ${COLOR_BOLD}Gemini Live WebSocket:${COLOR_RESET}    ws://localhost:8001/ws/dialer-live"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ── Cleanup Handler for Foreground Mode ───────────────────────────────────────
PRELOADER_PID=""
BACKEND_PID=""
DIALER_PID=""
FRONTEND_PID=""

cleanup_foreground() {
    trap - SIGINT SIGTERM EXIT
    echo ""
    log_warn "Shutting down all Project Tensa services..."

    # Terminate recorded PIDs
    for pid in "$PRELOADER_PID" "$BACKEND_PID" "$DIALER_PID" "$FRONTEND_PID"; do
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            kill -TERM "$pid" 2>/dev/null || true
        fi
    done

    # Kill any direct children of this script
    pkill -P $$ 2>/dev/null || true

    sleep 0.8

    # Force kill lingering PIDs
    for pid in "$PRELOADER_PID" "$BACKEND_PID" "$DIALER_PID" "$FRONTEND_PID"; do
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null || true
        fi
    done

    # Final cleanup of ports if needed
    for port in 50000 8000 8001 5173; do
        if command -v lsof >/dev/null 2>&1; then
            local pids=($(lsof -ti :"$port" 2>/dev/null || true))
            for p in "${pids[@]}"; do
                kill -9 "$p" 2>/dev/null || true
            done
        fi
    done

    rm -f "$REPO_ROOT/.tensa.pids"
    log_success "All services stopped cleanly."
    exit 0
}

# ── Launch Services ───────────────────────────────────────────────────────────
if [ "$DETACH_MODE" = true ]; then
    mkdir -p "$REPO_ROOT/logs"

    log_step "Starting services in background (daemon mode)..."
    echo "  Logs destination: $REPO_ROOT/logs/"
    echo ""

    # 1. Model Preloader Daemon
    (
        cd "$REPO_ROOT"
        nohup "${PRELOADER_CMD[@]}" </dev/null > "$REPO_ROOT/logs/preloader.log" 2>&1 &
        echo $! > "$REPO_ROOT/.preloader.pid"
    )
    PRELOADER_PID=$(cat "$REPO_ROOT/.preloader.pid" 2>/dev/null || true)
    rm -f "$REPO_ROOT/.preloader.pid"
    disown "$PRELOADER_PID" 2>/dev/null || true
    log_info "Model Preloader Daemon (PID: $PRELOADER_PID) -> logs/preloader.log"

    # 2. FastAPI Backend
    (
        cd "$REPO_ROOT"
        nohup "${BACKEND_CMD[@]}" </dev/null > "$REPO_ROOT/logs/backend.log" 2>&1 &
        echo $! > "$REPO_ROOT/.backend.pid"
    )
    BACKEND_PID=$(cat "$REPO_ROOT/.backend.pid" 2>/dev/null || true)
    rm -f "$REPO_ROOT/.backend.pid"
    disown "$BACKEND_PID" 2>/dev/null || true
    log_info "FastAPI Backend (PID: $BACKEND_PID) -> logs/backend.log"

    # 3. Dialer Backend
    (
        cd "$DIALER_DIR"
        nohup "${DIALER_CMD[@]}" </dev/null > "$REPO_ROOT/logs/dialer.log" 2>&1 &
        echo $! > "$REPO_ROOT/.dialer.pid"
    )
    DIALER_PID=$(cat "$REPO_ROOT/.dialer.pid" 2>/dev/null || true)
    rm -f "$REPO_ROOT/.dialer.pid"
    disown "$DIALER_PID" 2>/dev/null || true
    log_info "Dialer Backend (PID: $DIALER_PID) -> logs/dialer.log"

    # 4. Frontend
    (
        cd "$FRONTEND_DIR"
        nohup "${FRONTEND_CMD[@]}" </dev/null > "$REPO_ROOT/logs/frontend.log" 2>&1 &
        echo $! > "$REPO_ROOT/.frontend.pid"
    )
    FRONTEND_PID=$(cat "$REPO_ROOT/.frontend.pid" 2>/dev/null || true)
    rm -f "$REPO_ROOT/.frontend.pid"
    disown "$FRONTEND_PID" 2>/dev/null || true
    log_info "Frontend UI (PID: $FRONTEND_PID) -> logs/frontend.log"

    printf "%s\n%s\n%s\n%s\n" "$PRELOADER_PID" "$BACKEND_PID" "$DIALER_PID" "$FRONTEND_PID" > "$REPO_ROOT/.tensa.pids"

    wait_for_services
    print_active_banner

    echo ""
    echo "  💡 Tips:"
    echo "     • View live logs:     tail -f logs/*.log"
    echo "     • Check service state: ./start.sh --status"
    echo "     • Stop all services:  ./stop.sh (or ./start.sh --stop)"
    echo ""
else
    # Register cleanup trap for foreground mode
    trap cleanup_foreground SIGINT SIGTERM EXIT

    log_step "Launching services concurrently..."
    echo ""

    # 1. Model Preloader Daemon with yellow prefix
    (
        cd "$REPO_ROOT"
        "${PRELOADER_CMD[@]}"
    ) > >(sed -u "s/^/${COLOR_YELLOW}[preloader]${COLOR_RESET} /") 2>&1 &
    PRELOADER_PID=$!

    # 2. FastAPI Backend with blue prefix
    (
        cd "$REPO_ROOT"
        "${BACKEND_CMD[@]}"
    ) > >(sed -u "s/^/${COLOR_BLUE}[backend]${COLOR_RESET}   /") 2>&1 &
    BACKEND_PID=$!

    # 3. Dialer Backend with magenta prefix
    (
        cd "$DIALER_DIR"
        "${DIALER_CMD[@]}"
    ) > >(sed -u "s/^/${COLOR_MAGENTA}[dialer]${COLOR_RESET}    /") 2>&1 &
    DIALER_PID=$!

    # 4. Frontend with cyan prefix
    (
        cd "$FRONTEND_DIR"
        "${FRONTEND_CMD[@]}"
    ) > >(sed -u "s/^/${COLOR_CYAN}[frontend]${COLOR_RESET}  /") 2>&1 &
    FRONTEND_PID=$!

    printf "%s\n%s\n%s\n%s\n" "$PRELOADER_PID" "$BACKEND_PID" "$DIALER_PID" "$FRONTEND_PID" > "$REPO_ROOT/.tensa.pids"

    wait_for_services
    print_active_banner

    echo -e "  ${COLOR_DIM}Unified streaming logs below. Press Ctrl+C to stop all services.${COLOR_RESET}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # Keep script running and monitor child processes
    while true; do
        if ! kill -0 "$PRELOADER_PID" 2>/dev/null; then
            log_error "Model Preloader Daemon (PID $PRELOADER_PID) stopped unexpectedly."
            cleanup_foreground
            exit 1
        fi
        if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
            log_error "FastAPI Backend (PID $BACKEND_PID) stopped unexpectedly."
            cleanup_foreground
            exit 1
        fi
        if ! kill -0 "$DIALER_PID" 2>/dev/null; then
            log_error "Dialer Backend (PID $DIALER_PID) stopped unexpectedly."
            cleanup_foreground
            exit 1
        fi
        if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
            log_error "Frontend (PID $FRONTEND_PID) stopped unexpectedly."
            cleanup_foreground
            exit 1
        fi
        sleep 1
    done
fi
