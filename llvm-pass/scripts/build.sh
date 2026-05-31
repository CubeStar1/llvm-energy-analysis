#!/usr/bin/env bash
# Build EnergyPass.so. Run from the repo root in WSL/Linux.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PASS_DIR="$REPO_ROOT/llvm-pass"
BUILD_DIR="$PASS_DIR/build"

if command -v llvm-config-18 &>/dev/null; then
  LLVM_DIR="$(llvm-config-18 --cmakedir)"
else
  LLVM_DIR="$(llvm-config --cmakedir)"
fi

export CC="${CC:-clang-18}"
export CXX="${CXX:-clang++-18}"

cmake -S "$PASS_DIR" -B "$BUILD_DIR" \
  -G Ninja \
  -DLLVM_DIR="$LLVM_DIR" \
  -DCMAKE_BUILD_TYPE=RelWithDebInfo

cmake --build "$BUILD_DIR"
