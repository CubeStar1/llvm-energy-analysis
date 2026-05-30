// TC-02: Compute-bound loop.
// Expected: main dominated by integer ALU (ADD64rr, IMUL64rr) and branch (JCC_1).
// Hottest source line: the accumulation inside the loop body.
// Average cost/instruction: ~1.0-1.3 (integer_alu + branch mix).
int main() {
    int total = 0;
    for (int i = 0; i < 1000; ++i) {
        total += i * 3;
    }
    return total;
}
