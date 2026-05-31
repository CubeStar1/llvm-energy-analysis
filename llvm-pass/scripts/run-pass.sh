#!/usr/bin/env bash
# Run the energy pass on a C++ source file and print [energy] JSON records.
# Usage: ./llvm-pass/scripts/run-pass.sh [path/to/file.cpp]
# Defaults to testcases/03_memory_bound.cpp if no argument is given.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PASS_SO="$REPO_ROOT/llvm-pass/build/EnergyPass.so"
MODEL="$REPO_ROOT/llvm-pass/models/x86_64-energy-model.json"
INPUT="${1:-$REPO_ROOT/testcases/03_memory_bound.cpp}"

if [[ ! -f "$PASS_SO" ]]; then
  echo "ERROR: EnergyPass.so not found. Run ./scripts/build.sh first." >&2
  exit 1
fi

if [[ ! -f "$INPUT" ]]; then
  echo "ERROR: Input file not found: $INPUT" >&2
  exit 1
fi

TMPDIR_LOCAL="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_LOCAL"' EXIT

BASENAME="$(basename "$INPUT" .cpp)"
IR="$TMPDIR_LOCAL/$BASENAME.ll"
MIR="$TMPDIR_LOCAL/$BASENAME.mir"

echo "==> Compiling to LLVM IR: $INPUT"
clang++-18 -g -O2 -S -emit-llvm "$INPUT" -o "$IR"

echo "==> Lowering to Machine IR"
llc-18 -O2 -stop-after=finalize-isel "$IR" -o "$MIR"

echo "==> Running energy pass"
llc-18 \
  -load "$PASS_SO" \
  -run-pass=energy \
  -energy-model="$MODEL" \
  "$MIR" -o /dev/null \
  2>&1 | grep '^\[energy\]'
