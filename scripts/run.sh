#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS_SO="$REPO_ROOT/llvm-pass/build/EnergyPass.so"

if [[ ! -f "$PASS_SO" ]]; then
  echo "ERROR: EnergyPass.so not found at $PASS_SO"
  echo "Run ./scripts/build.sh first." >&2
  exit 1
fi

# --- Backend ---
BACKEND_DIR="$REPO_ROOT/backend"

if ! command -v uv &>/dev/null; then
  echo "ERROR: uv not found. Install it with: pip install uv" >&2
  exit 1
fi

echo "==> Starting backend (http://localhost:8000) ..."
cd "$BACKEND_DIR"
uv run backend &
BACKEND_PID=$!

# Wait for backend to become ready
for i in $(seq 1 20); do
  if curl -sf http://localhost:8000/healthz &>/dev/null; then
    echo "==> Backend ready."
    break
  fi
  sleep 0.5
done

# --- Frontend ---
FRONTEND_DIR="$REPO_ROOT/frontend"

if ! command -v node &>/dev/null; then
  echo "WARNING: node not found — skipping frontend. Install Node 20+ to run the UI." >&2
else
  echo "==> Starting frontend (http://localhost:3000) ..."
  cd "$FRONTEND_DIR"
  npm run dev &
  FRONTEND_PID=$!
fi

echo ""
echo "==> Services running."
echo "    Backend:  http://localhost:8000"
echo "    Frontend: http://localhost:3000/analyze"
echo "    Press Ctrl+C to stop."

wait $BACKEND_PID
