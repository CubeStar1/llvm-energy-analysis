#!/usr/bin/env bash
# Run the energy pass over all testcases and print [energy] JSON output.
# Run from the repo root in WSL/Linux.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS_SO="$REPO_ROOT/llvm-pass/build/EnergyPass.so"
MODEL="$REPO_ROOT/llvm-pass/models/x86_64-energy-model.json"
TESTCASES_DIR="$REPO_ROOT/testcases"

if [[ ! -f "$PASS_SO" ]]; then
  echo "ERROR: EnergyPass.so not found. Run ./llvm-pass/scripts/build.sh first." >&2
  exit 1
fi

TMPDIR_LOCAL="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_LOCAL"' EXIT

PASS=0
FAIL=0

for SRC in "$TESTCASES_DIR"/*.cpp; do
  BASENAME="$(basename "$SRC" .cpp)"
  IR="$TMPDIR_LOCAL/$BASENAME.ll"
  MIR="$TMPDIR_LOCAL/$BASENAME.mir"

  echo "━━━ $BASENAME ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if clang++-18 -g -O2 -S -emit-llvm "$SRC" -o "$IR" 2>/dev/null \
     && llc-18 -O2 -stop-after=finalize-isel "$IR" -o "$MIR" 2>/dev/null \
     && llc-18 \
          -load "$PASS_SO" \
          -run-pass=energy \
          -energy-model="$MODEL" \
          "$MIR" -o /dev/null \
          2>&1 | grep '^\[energy\]'; then
    PASS=$((PASS + 1))
  else
    echo "  FAILED: $SRC" >&2
    FAIL=$((FAIL + 1))
  fi
done

echo ""
echo "Done: $PASS passed, $FAIL failed."
