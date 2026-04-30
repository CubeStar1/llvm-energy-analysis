Assignment 22 - Static Energy Estimation Pass
Description: An LLVM machine-level analysis pass that estimates per-function energy cost
by combining per-instruction energy models with loop/block frequency analysis.
Background: No production compiler provides energy feedback. Developers rely on
hardware profilers. Compilers already know the instruction mix and loop structure needed for
estimation.
Objective: Assign energy costs to instructions using published micro-architectural data,
weight by execution frequency, and emit results as compiler remarks tied to source locations.
Deliverables:

1. LLVM analysis pass computing per-block and per-function energy estimates
2. JSON energy model for one target architecture (AArch64 or x86-64)
3. Integration with LLVM's -Rpass-analysis=energy remark system
4. Visualization script producing annotated source/HTML report
5. Validation against published per-instruction energy data from academic papers (e.g.,
   ARM Cortex-A energy tables), not requiring physical measurement.
