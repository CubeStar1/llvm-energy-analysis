// TC-01: Minimal baseline.
// Expected: lowest possible energy; only ABI prologue/epilogue instructions.
// Hottest function: main. Instruction mix: branch (RET64) + small integer ALU.
int main() {
    return 0;
}
