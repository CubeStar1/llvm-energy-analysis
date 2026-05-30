#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS_DIR="$REPO_ROOT/llvm-pass"
BUILD_DIR="$PASS_DIR/build"

if ! command -v cmake &>/dev/null; then
  echo "ERROR: cmake not found. Install it with: sudo apt install cmake ninja-build" >&2
  exit 1
fi

if ! command -v llvm-config-18 &>/dev/null && ! command -v llvm-config &>/dev/null; then
  echo "ERROR: llvm-config not found. Install LLVM 18 dev packages:" >&2
  echo "  sudo apt install llvm-18 llvm-18-dev clang-18" >&2
  exit 1
fi

if command -v llvm-config-18 &>/dev/null; then
  LLVM_DIR="$(llvm-config-18 --cmakedir)"
else
  LLVM_DIR="$(llvm-config --cmakedir)"
fi

echo "==> Using LLVM CMake dir: $LLVM_DIR"

export CC="${CC:-clang-18}"
export CXX="${CXX:-clang++-18}"

echo "==> Configuring EnergyPass (build dir: $BUILD_DIR)"
cmake -S "$PASS_DIR" -B "$BUILD_DIR" \
  -G Ninja \
  -DLLVM_DIR="$LLVM_DIR" \
  -DCMAKE_BUILD_TYPE=RelWithDebInfo

echo "==> Building EnergyPass"
cmake --build "$BUILD_DIR"

if [[ -f "$BUILD_DIR/EnergyPass.so" ]]; then
  echo "==> Build succeeded: $BUILD_DIR/EnergyPass.so"
else
  echo "ERROR: EnergyPass.so not found after build" >&2
  exit 1
fi
