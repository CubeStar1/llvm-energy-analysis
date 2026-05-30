// TC-04: Branch-heavy — classify() is a chain of comparisons and conditional branches.
// Expected: classify() dominated by CMP32rr (cost 1.2) + JCC_1 (cost 1.6).
//           main() carries a CALL64pcrel32 (cost 3.0) per iteration.
// Hottest annotation in main: the classify(i) call line.
// Demonstrates: call site is attributed as the most expensive single line.
int classify(int x) {
    if (x < 0)   return -1;
    if (x == 0)  return 0;
    if (x < 10)  return 1;
    if (x < 100) return 2;
    return 3;
}

int main() {
    int total = 0;
    for (int i = -5; i < 200; ++i)
        total += classify(i);
    return total;
}
