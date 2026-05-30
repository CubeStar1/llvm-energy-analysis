// TC-06: Deep call chain — failure/inlining case.
// Expected WITHOUT inlining: f4 > f3 > f2 > f1 in raw energy (call-dominated).
// Expected WITH -O2 inlining: main has highest energy; f1-f4 may disappear.
// This is a deliberate "failure mode" demonstration: shows how -O2 inlining
// collapses the call hierarchy and changes which functions are visible in the report.
// Run this test with both -O0 and -O2 to see the difference.
int f1(int x) { return x + 1; }
int f2(int x) { return f1(x) + f1(x + 1); }
int f3(int x) { return f2(x) + f2(x + 2); }
int f4(int x) { return f3(x) + f3(x + 4); }

int main() {
    int result = 0;
    for (int i = 0; i < 16; ++i)
        result += f4(i);
    return result;
}
