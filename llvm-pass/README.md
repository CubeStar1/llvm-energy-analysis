# LLVM Pass

This directory contains the out-of-tree LLVM machine-level pass skeleton for the energy analyzer.

## Status

- Project layout is ready.
- The pass is intentionally a readable MVP skeleton.
- Real compilation and plugin integration should be done in WSL, as discussed.

## Recommended WSL setup

Use Ubuntu 24.04 in WSL and install one consistent LLVM version everywhere. LLVM 18 is a good default for this MVP.

```bash
sudo apt update
sudo apt install -y \
  build-essential \
  cmake \
  ninja-build \
  clang-18 \
  llvm-18 \
  llvm-18-dev \
  zlib1g-dev \
  libzstd-dev \
  libedit-dev \
  libcurl4-openssl-dev \
  lld-18
```

Do this inside WSL, not from Windows PowerShell. The pass uses LLVM's Linux CMake package and should be configured with Linux paths.

If you switch between Windows and WSL, delete the old build directory first so CMake does not reuse a cache created with a different path style.

```bash
cd llvm-pass
rm -rf build
```

If the generic `clang++` and `llvm-config` names do not point to LLVM 18, set them explicitly in your shell:

```bash
export CC=clang-18
export CXX=clang++-18
export LLVM_DIR="$(llvm-config-18 --cmakedir)"
```

If your distro does not provide `llvm-config-18`, use:

```bash
export LLVM_DIR="$(llvm-config --cmakedir)"
```

## Build

```bash
cd llvm-pass
cmake -S . -B build -G Ninja -DLLVM_DIR="$LLVM_DIR"
cmake --build build
```

## Common failure modes

- `check_compiler_flag: C: needs to be enabled before use.`
  - This was caused by the project enabling only `CXX` while `HandleLLVMOptions.cmake` checks both C and CXX flags. The project now enables both languages.
- `CMakeCache.txt directory ... is different than the directory ... where CMakeCache.txt was created`
  - This means the build directory was first configured in a different environment, such as WSL under `/mnt/...` and then reused from Windows as `C:\...`. Remove `build/` and configure again from one environment only.
- `LLVM_DIR=/usr/lib/llvm-18/lib/cmake/llvm` does not exist
  - Not every distro installs LLVM 18 in that exact location. Prefer `llvm-config --cmakedir` to discover the correct path on the current machine.
- `The link interface of target "LLVMSupport" contains: ZLIB::ZLIB but the target was not found`
  - Install the zlib development package in WSL, usually `zlib1g-dev`, then reconfigure from a clean build directory. This repo also resolves Zlib explicitly before loading LLVM's exported targets.

## Intended analysis flow

Later, once the pass is wired end-to-end:

1. Compile the user source with `-g -O2`.
2. Run the codegen pipeline with the energy pass enabled.
3. Emit optimization remarks to YAML.
4. Parse the YAML in the Python backend.

## Notes for the next implementation step

- The current pass file establishes the machine-function-level structure.
- The next real coding task in WSL is to load `models/x86_64-energy-model.json`, inspect `MachineInstr` opcodes, and emit analysis remarks with debug locations.
- Keep the energy model coarse and explicit rather than pretending to be physically exact.
